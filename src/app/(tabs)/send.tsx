import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bmoniAdapter } from '@/lib/bmoni';
import { createPaymentConfirmation, serializeConfirmation } from '@/lib/confirmation';
import { formatMoney } from '@/lib/format';
import { saveReceipt } from '@/lib/history';
import { decodeFrame, encodeFrame, encodeFrames, OpticalReceiver } from '@/lib/optical';
import { deserializeRequest, randomId, verifyPaymentRequest } from '@/lib/protocol';
import { markProcessed, wasProcessed } from '@/lib/replay';
import { getActiveReserve, spendFromReserve, verifyOfflineAuthorization } from '@/lib/reserve';
import { deduct, getBalance } from '@/lib/wallet';
import type { PaymentConfirmation, PaymentRequest, ReserveState, SettlementReceipt } from '@/lib/types';

type Stage = 'scan' | 'review' | 'auth' | 'settling' | 'confirming' | 'done';
const CONFIRM_FRAME_INTERVAL_MS = 120;

export default function SendScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('scan');
  const [progress, setProgress] = useState(0);
  const [received, setReceived] = useState<PaymentRequest | null>(null);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(null);
  const [confirmFrameIndex, setConfirmFrameIndex] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(true);
  const [reserve, setReserve] = useState<ReserveState | null>(null);

  const receiverRef = useRef<OpticalReceiver | null>(null);
  const settledRef = useRef(false);

  const receiver = useMemo(() => {
    if (!receiverRef.current) receiverRef.current = new OpticalReceiver();
    return receiverRef.current;
  }, []);

  const confirmationFrames = useMemo(
    () => (confirmation ? encodeFrames(serializeConfirmation(confirmation), confirmation.requestId) : []),
    [confirmation]
  );

  useEffect(() => {
    if (!confirmationFrames.length) return;
    const timer = setInterval(() => setConfirmFrameIndex(i => (i + 1) % confirmationFrames.length), CONFIRM_FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [confirmationFrames]);

  useFocusEffect(
    useCallback(() => {
      setCameraActive(true);
      getActiveReserve().then(setReserve);
      getBalance().then(setBalance);
      return () => setCameraActive(false);
    }, [])
  );

  function resetScan() {
    receiverRef.current = new OpticalReceiver();
    settledRef.current = false;
    setStage('scan');
    setProgress(0);
    setReceived(null);
    setReceipt(null);
    setConfirmation(null);
    setConfirmFrameIndex(0);
    setError('');
    getBalance().then(setBalance);
  }

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (stage !== 'scan' || settledRef.current) return;
    try {
      const frame = decodeFrame(result.data);
      const status = receiver.add(frame);
      setProgress(status.total > 0 ? Math.min(1, status.received / status.total) : 0);
      if (!status.complete) return;

      settledRef.current = true;
      const parsed = deserializeRequest(receiver.result());
      if (!(await verifyPaymentRequest(parsed))) throw new Error('This request is expired or failed its integrity check.');
      if (await wasProcessed(parsed.id)) throw new Error('This payment request has already been processed.');

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReceived(parsed);
      setStage('review');
    } catch (cause) {
      // A completed OpticalReceiver ignores every further frame (correct for
      // a successful decode, wrong here) — without a fresh instance, every
      // subsequent camera frame just re-triggers this same stale failure.
      receiverRef.current = new OpticalReceiver();
      settledRef.current = false;
      setProgress(0);
      setError(cause instanceof Error ? cause.message : 'Could not reconstruct the request.');
    }
  }

  async function afterSettlement(nextReceipt: SettlementReceipt, request: PaymentRequest, options: { deductWallet: boolean }) {
    if (options.deductWallet) {
      await deduct(request.amountMinor);
      setBalance(await getBalance());
    }
    const nextConfirmation = await createPaymentConfirmation({
      requestId: request.id,
      amountMinor: request.amountMinor,
      currency: request.currency,
      payerLabel: 'Morrow customer',
      settlementReference: nextReceipt.reference,
    });
    await markProcessed(request.id);
    await saveReceipt(nextReceipt);
    setReceipt(nextReceipt);
    setConfirmation(nextConfirmation);
    setConfirmFrameIndex(0);
    setStage('confirming');
  }

  async function confirm() {
    if (!received) return;
    setError('');
    if (balance !== null && received.amountMinor > balance) {
      setError('Insufficient balance for this payment.');
      return;
    }
    setStage('auth');
    try {
      await bmoniAdapter.authenticate();
      setStage('settling');
      const nextReceipt = await bmoniAdapter.settle(received);
      await afterSettlement({ ...nextReceipt, status: 'settled', direction: 'sent' }, received, { deductWallet: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settlement could not be completed. Your account was not charged.');
      setStage('review');
    }
  }

  async function payFromReserve() {
    if (!received) return;
    setError('');
    try {
      const auth = await spendFromReserve({
        recipientRequestId: received.id,
        recipientName: received.merchant.name,
        amountMinor: received.amountMinor,
      });
      // Self-verify the authorization we just produced — proves the signing
      // and recipient-binding checks a merchant device would run actually
      // hold, rather than trusting our own output blindly.
      const verdict = await verifyOfflineAuthorization(auth, received.id);
      if (!verdict.valid) throw new Error(verdict.reason ?? 'Could not verify the offline authorization.');

      const nextReceipt: SettlementReceipt = {
        id: randomId('rcpt'),
        requestId: received.id,
        status: 'pending',
        direction: 'sent',
        amountMinor: received.amountMinor,
        currency: received.currency,
        merchantName: received.merchant.name,
        customerName: 'This device (Morrow Reserve)',
        settledAt: Date.now(),
        reference: `${auth.allowanceId}:${auth.sequence}`,
      };
      // Already deducted from the wallet when this Reserve was created —
      // spending from it now only decrements the Reserve's own bookkeeping.
      await afterSettlement(nextReceipt, received, { deductWallet: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not pay from Morrow Reserve.');
    }
  }

  if (stage === 'scan') {
    if (!permission) return <Screen scroll={false} />;
    if (!permission.granted) {
      return (
        <Screen>
          <ThemedText type="title" style={styles.title}>
            Send
          </ThemedText>
          <Card>
            <ThemedText>Morrow needs camera access to receive payment requests optically.</ThemedText>
            <Button label="Grant camera access" onPress={requestPermission} />
          </Card>
        </Screen>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        {cameraActive && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.scanOverlay]} pointerEvents="none">
          <View style={styles.scanFrame} />
        </View>
        <View style={styles.scanFooter}>
          <ThemedText style={styles.scanHint}>Point your camera at the merchant's screen</ThemedText>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
          </View>
          {error ? (
            <ThemedText style={styles.scanError} accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }

  if ((stage === 'review' || stage === 'auth' || stage === 'settling') && received) {
    return (
      <Screen>
        <Button label="‹ Back to camera" variant="ghost" onPress={resetScan} disabled={stage !== 'review'} />
        <ThemedText type="small" themeColor="textSecondary">
          Paying
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          {received.merchant.name}
        </ThemedText>
        <ThemedText type="title" style={styles.amount}>
          {formatMoney(received.amountMinor, received.currency)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{received.note}</ThemedText>

        <Card>
          <ThemedText type="smallBold">Request verified</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            SHA-256 integrity · fresh nonce · expires in {Math.max(0, Math.round((received.expiresAt - Date.now()) / 60000))} min
          </ThemedText>
        </Card>

        <View style={styles.balanceRow}>
          <ThemedText themeColor="textSecondary">Pay from</ThemedText>
          <ThemedText type="smallBold">{balance !== null ? formatMoney(balance, received.currency) : '…'} available</ThemedText>
        </View>

        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

        {stage === 'review' && <Button label="Confirm payment" onPress={confirm} />}
        {stage === 'review' && reserve && reserve.allowance.valueMinor - reserve.spentMinor >= received.amountMinor && (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.orDivider}>
              or, with no connection at all
            </ThemedText>
            <Button label={`Pay ${formatMoney(received.amountMinor, received.currency)} from Reserve (offline)`} variant="secondary" onPress={payFromReserve} />
          </>
        )}
        {stage === 'auth' && (
          <Card style={styles.processingRow}>
            <ThemedText>Authenticating your device-held signing key…</ThemedText>
          </Card>
        )}
        {stage === 'settling' && (
          <Card style={styles.processingRow}>
            <ThemedText>Settling with BMONI. This step requires connectivity.</ThemedText>
          </Card>
        )}
      </Screen>
    );
  }

  if (stage === 'confirming' && confirmation && received) {
    const currentFrame = confirmationFrames[confirmFrameIndex];
    return (
      <Screen>
        <ThemedText type="small" themeColor="textSecondary">
          Last step — proving it to {received.merchant.name}
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          One more scan
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          Your balance is already debited. Morrow has no server in between, so {received.merchant.name}'s balance only updates once they scan this proof — hand them your screen.
        </ThemedText>

        <Card style={styles.qrCard}>
          {currentFrame && <QRCode value={encodeFrame(currentFrame)} size={240} backgroundColor={theme.surface} color={theme.text} />}
        </Card>

        <Button label="Done" onPress={() => setStage('done')} />
      </Screen>
    );
  }

  if (stage === 'done' && receipt) {
    const isPending = receipt.status === 'pending';
    return (
      <Screen>
        <ThemedText type="small" themeColor={isPending ? 'textSecondary' : 'positive'}>
          {isPending ? 'Payment verified — settlement pending' : 'Payment settled'}
        </ThemedText>
        <ThemedText type="title" style={styles.amount}>
          {formatMoney(receipt.amountMinor, receipt.currency)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">to {receipt.merchantName}</ThemedText>

        {balance !== null && (
          <View style={styles.balanceRow}>
            <ThemedText themeColor="textSecondary">New balance</ThemedText>
            <ThemedText type="smallBold">{formatMoney(balance, receipt.currency)}</ThemedText>
          </View>
        )}

        {isPending && (
          <Card>
            <ThemedText type="smallBold">Paid from Morrow Reserve, offline</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This device signed the authorization with no network connection. It will settle through BMONI once either device is back online — see docs/RESERVE.md.
            </ThemedText>
          </Card>
        )}

        <Card>
          <View style={styles.receiptRow}>
            <ThemedText themeColor="textSecondary">Reference</ThemedText>
            <ThemedText type="smallBold">{receipt.reference}</ThemedText>
          </View>
          <View style={styles.receiptRow}>
            <ThemedText themeColor="textSecondary">{isPending ? 'Signed' : 'Settled'}</ThemedText>
            <ThemedText type="smallBold">{new Date(receipt.settledAt).toLocaleString()}</ThemedText>
          </View>
        </Card>

        <Button label="Send another payment" onPress={resetScan} />
      </Screen>
    );
  }

  return <Screen scroll={false} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34 },
  amount: { fontSize: 40, lineHeight: 46 },
  cameraContainer: { flex: 1, backgroundColor: '#000000' },
  scanOverlay: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 260, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  scanFooter: { position: 'absolute', left: 0, right: 0, bottom: 48, paddingHorizontal: Spacing.four, gap: Spacing.two },
  scanHint: { color: '#FFFFFF', textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  scanError: { color: '#FF8A73', textAlign: 'center' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  processingRow: { alignItems: 'center' },
  qrCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between' },
  orDivider: { textAlign: 'center' },
});
