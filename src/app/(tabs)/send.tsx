import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Card, Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
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
import type { OfflineAuthorization, PaymentConfirmation, PaymentRequest, ReserveState, SettlementReceipt } from '@/lib/types';

type Stage = 'scan' | 'review' | 'auth' | 'settling' | 'confirming' | 'done';
const CONFIRM_FRAME_INTERVAL_MS = 120;

export default function SendScreen() {
  const theme = useTheme();
  const { showToast } = useToast();
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
  const [expiresInMin, setExpiresInMin] = useState(0);
  const [payingFromReserve, setPayingFromReserve] = useState(false);

  const receiverRef = useRef<OpticalReceiver | null>(null);
  const settledRef = useRef(false);

  if (receiverRef.current === null) receiverRef.current = new OpticalReceiver();
  const receiver = receiverRef.current;

  const confirmationFrames = useMemo(
    () => (confirmation ? encodeFrames(serializeConfirmation(confirmation), confirmation.requestId) : []),
    [confirmation]
  );

  useEffect(() => {
    if (!confirmationFrames.length) return;
    const timer = setInterval(() => setConfirmFrameIndex(i => (i + 1) % confirmationFrames.length), CONFIRM_FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [confirmationFrames]);

  useEffect(() => {
    if (!received) return;
    const tick = () => setExpiresInMin(Math.max(0, Math.round((received.expiresAt - Date.now()) / 60000)));
    tick();
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, [received]);

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

  async function afterSettlement(
    nextReceipt: SettlementReceipt,
    request: PaymentRequest,
    options: { deductWallet: boolean; offlineAuthorization?: OfflineAuthorization }
  ) {
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
      offlineAuthorization: options.offlineAuthorization,
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
      showToast({ message: `Sent ${formatMoney(received.amountMinor, received.currency)} — hand over your screen to confirm`, variant: 'success' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Settlement could not be completed. Your account was not charged.';
      setError(message);
      setStage('review');
      showToast({ message, variant: 'error' });
    }
  }

  async function payFromReserve() {
    if (!received || payingFromReserve) return;
    setError('');
    setPayingFromReserve(true);
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
      // The receiver independently re-verifies `auth` itself, not just this
      // receipt — see verifyPaymentConfirmation in confirmation.ts.
      await afterSettlement(nextReceipt, received, { deductWallet: false, offlineAuthorization: auth });
      showToast({ message: 'Signed offline — hand over your screen to confirm', variant: 'success' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not pay from Morrow Reserve.';
      setError(message);
      showToast({ message, variant: 'error' });
    } finally {
      setPayingFromReserve(false);
    }
  }

  if (stage === 'scan') {
    if (!permission) return <Screen scroll={false} />;
    if (!permission.granted) {
      return (
        <Animated.View key="scan-permission" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
          <Screen>
            <ThemedText type="title" style={styles.title}>
              Send
            </ThemedText>
            <Card>
              <ThemedText>Morrow needs camera access to receive payment requests optically.</ThemedText>
              {permission.canAskAgain ? (
                <Button label="Grant camera access" onPress={requestPermission} />
              ) : (
                <Button label="Open settings to enable camera" onPress={() => Linking.openSettings()} />
              )}
            </Card>
          </Screen>
        </Animated.View>
      );
    }

    return (
      <Animated.View key="scan" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.cameraContainer}>
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
          <ThemedText style={styles.scanHint}>Point your camera at the merchant&apos;s screen</ThemedText>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
          </View>
          {error ? <ErrorState message={error} /> : null}
        </View>
      </Animated.View>
    );
  }

  if ((stage === 'review' || stage === 'auth' || stage === 'settling') && received) {
    return (
      <Animated.View key="review" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
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
              SHA-256 integrity · fresh nonce · expires in {expiresInMin} min
            </ThemedText>
          </Card>

          <View style={styles.balanceRow}>
            <ThemedText themeColor="textSecondary">Pay from</ThemedText>
            <ThemedText type="smallBold">{balance !== null ? formatMoney(balance, received.currency) : '…'} available</ThemedText>
          </View>

          {error ? <ErrorState message={error} /> : null}

          {stage === 'review' && <Button label="Confirm payment" onPress={confirm} />}
          {stage === 'review' && reserve && reserve.allowance.valueMinor - reserve.spentMinor >= received.amountMinor && (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.orDivider}>
                or, with no connection at all
              </ThemedText>
              <Button
                label={`Pay ${formatMoney(received.amountMinor, received.currency)} from Reserve (offline)`}
                variant="secondary"
                onPress={payFromReserve}
                loading={payingFromReserve}
              />
            </>
          )}
          {stage === 'auth' && (
            <Card style={styles.processingRow}>
              <ActivityIndicator color={theme.text} />
              <ThemedText>Authenticating your device-held signing key…</ThemedText>
            </Card>
          )}
          {stage === 'settling' && (
            <Card style={styles.processingRow}>
              <ActivityIndicator color={theme.text} />
              <ThemedText>Settling with BMONI. This step requires connectivity.</ThemedText>
            </Card>
          )}
        </Screen>
      </Animated.View>
    );
  }

  if (stage === 'confirming' && confirmation && received) {
    const currentFrame = confirmationFrames[confirmFrameIndex];
    return (
      <Animated.View key="confirming" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
        <Screen>
          <ThemedText type="small" themeColor="textSecondary">
            Last step — proving it to {received.merchant.name}
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            One more scan
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Your balance is already debited. Morrow has no server in between, so {received.merchant.name}&apos;s balance only updates once they
            scan this proof — hand them your screen.
          </ThemedText>

          <Card style={styles.qrCard}>
            {currentFrame && <QRCode value={encodeFrame(currentFrame)} size={240} backgroundColor={theme.surface} color={theme.text} />}
          </Card>

          <Button label="Done" onPress={() => setStage('done')} />
        </Screen>
      </Animated.View>
    );
  }

  if (stage === 'done' && receipt) {
    const isPending = receipt.status === 'pending';
    return (
      <Animated.View key="done" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
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
                This device signed the authorization with no network connection. It will settle through BMONI once either device is back online —
                see docs/RESERVE.md.
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
      </Animated.View>
    );
  }

  return <Screen scroll={false} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 28, lineHeight: 34 },
  amount: { fontSize: 40, lineHeight: 46 },
  cameraContainer: { flex: 1, backgroundColor: '#000000' },
  scanOverlay: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 260, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  scanFooter: { position: 'absolute', left: 0, right: 0, bottom: 48, paddingHorizontal: Spacing.four, gap: Spacing.two },
  scanHint: { color: '#FFFFFF', textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  processingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  qrCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between' },
  orDivider: { textAlign: 'center' },
});
