import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/screen';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { stablecoinFor } from '@/lib/bmoniApi';
import { deserializeConfirmation, markConfirmationRedeemed, verifyPaymentConfirmation } from '@/lib/confirmation';
import { formatMoney } from '@/lib/format';
import { saveReceipt } from '@/lib/history';
import { decodeFrame, encodeFrame, encodeFrames, OpticalReceiver } from '@/lib/optical';
import { createPaymentRequest, randomId, serializeRequest } from '@/lib/protocol';
import { credit, getBalance } from '@/lib/wallet';
import type { PaymentConfirmation, PaymentRequest, SettlementReceipt } from '@/lib/types';

const FRAME_INTERVAL_MS = 120;
const LOCAL_MERCHANT_BMONI_ID = 'usr_morrow_demo_local';

type Stage = 'form' | 'broadcasting' | 'scanning' | 'received';

// Dynamically imported only when live mode is on — see the comment on
// RealBmoniAdapter in src/lib/bmoni.ts for why this can't be a static import.
async function resolveMerchantBmoniUserId() {
  if (process.env.EXPO_PUBLIC_BMONI_MODE !== 'live') return LOCAL_MERCHANT_BMONI_ID;
  const { ensureLocalBmoniIdentity } = await import('@/lib/bmoniIdentity');
  const identity = await ensureLocalBmoniIdentity(stablecoinFor('NGN'));
  return identity.bmoniUserId;
}

export default function ReceiveScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('form');
  const [amount, setAmount] = useState('12500');
  const [note, setNote] = useState('Market order #184');
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [receivedReceipt, setReceivedReceipt] = useState<SettlementReceipt | null>(null);
  const [error, setError] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const confirmReceiverRef = useRef<OpticalReceiver | null>(null);
  const confirmSettledRef = useRef(false);

  const frames = useMemo(() => (request ? encodeFrames(serializeRequest(request), request.id) : []), [request]);

  useEffect(() => {
    if (!frames.length) return;
    const timer = setInterval(() => setFrameIndex(i => (i + 1) % frames.length), FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [frames]);

  useEffect(() => {
    if (!request) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((request.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [request]);

  async function createRequest() {
    setError('');
    const number = Number(amount.replaceAll(',', ''));
    if (!Number.isFinite(number) || number <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    setPreparing(true);
    let merchantBmoniUserId: string;
    try {
      merchantBmoniUserId = await resolveMerchantBmoniUserId();
    } catch (cause) {
      setPreparing(false);
      setError(cause instanceof Error ? cause.message : 'Could not prepare a BMONI wallet for this request.');
      return;
    }
    const next = await createPaymentRequest({ amountMinor: Math.round(number * 100), currency: 'NGN', note, merchantBmoniUserId });
    setPreparing(false);
    setRequest(next);
    setFrameIndex(0);
    setStage('broadcasting');
  }

  function startScanningForConfirmation() {
    confirmReceiverRef.current = new OpticalReceiver();
    confirmSettledRef.current = false;
    setScanError('');
    setScanProgress(0);
    setStage('scanning');
  }

  async function handleConfirmationScanned(result: BarcodeScanningResult) {
    if (stage !== 'scanning' || confirmSettledRef.current || !request) return;
    if (!confirmReceiverRef.current) confirmReceiverRef.current = new OpticalReceiver();
    try {
      const frame = decodeFrame(result.data);
      const status = confirmReceiverRef.current.add(frame);
      setScanProgress(status.total > 0 ? Math.min(1, status.received / status.total) : 0);
      if (!status.complete) return;

      confirmSettledRef.current = true;
      const confirmation: PaymentConfirmation = deserializeConfirmation(confirmReceiverRef.current.result());
      const verdict = await verifyPaymentConfirmation(confirmation, request);
      if (!verdict.valid) throw new Error(verdict.reason ?? 'Could not verify this confirmation.');

      await credit(confirmation.amountMinor);
      await markConfirmationRedeemed(confirmation.requestId);

      const receipt: SettlementReceipt = {
        id: randomId('rcpt'),
        requestId: request.id,
        status: 'settled',
        direction: 'received',
        amountMinor: confirmation.amountMinor,
        currency: confirmation.currency,
        merchantName: request.merchant.name,
        customerName: confirmation.payerLabel,
        settledAt: Date.now(),
        reference: confirmation.settlementReference,
      };
      await saveReceipt(receipt);
      setBalance(await getBalance());
      setReceivedReceipt(receipt);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStage('received');
    } catch (cause) {
      // A completed OpticalReceiver ignores every further frame (correct for
      // a successful decode, wrong here) — without a fresh instance, every
      // subsequent camera frame just re-triggers this same stale failure.
      confirmReceiverRef.current = new OpticalReceiver();
      confirmSettledRef.current = false;
      setScanProgress(0);
      setScanError(cause instanceof Error ? cause.message : 'Could not verify this confirmation.');
    }
  }

  function reset() {
    setRequest(null);
    setReceivedReceipt(null);
    setError('');
    setScanError('');
    setStage('form');
  }

  if (stage === 'scanning') {
    if (!permission?.granted) {
      return (
        <Screen>
          <ThemedText type="small" themeColor="textSecondary">
            Last step for this request
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            Confirming payment
          </ThemedText>
          <Card>
            <ThemedText>Morrow needs camera access, just for this one scan, to verify the payer's proof and credit your balance.</ThemedText>
            <Button label="Grant camera access" onPress={requestPermission} />
          </Card>
        </Screen>
      );
    }
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleConfirmationScanned}
        />
        <View style={[StyleSheet.absoluteFill, styles.scanOverlay]} pointerEvents="none">
          <View style={styles.scanFrame} />
        </View>
        <View style={styles.scanFooter}>
          <ThemedText style={styles.scanHint}>Point your camera at the payer's "One more scan" screen</ThemedText>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${scanProgress * 100}%`, backgroundColor: theme.accent }]} />
          </View>
          {scanError ? (
            <ThemedText style={styles.scanError} accessibilityLiveRegion="polite">
              {scanError}
            </ThemedText>
          ) : null}
          <Button label="Back to broadcast" variant="ghost" onPress={() => setStage('broadcasting')} />
        </View>
      </View>
    );
  }

  if (stage === 'received' && receivedReceipt) {
    return (
      <Screen>
        <ThemedText type="small" themeColor="positive">
          Payment received
        </ThemedText>
        <ThemedText type="title" style={styles.amount}>
          +{formatMoney(receivedReceipt.amountMinor, receivedReceipt.currency)}
        </ThemedText>
        <ThemedText themeColor="textSecondary">from {receivedReceipt.customerName}</ThemedText>

        {balance !== null && (
          <View style={styles.detailRow}>
            <ThemedText themeColor="textSecondary">New balance</ThemedText>
            <ThemedText type="smallBold">{formatMoney(balance, receivedReceipt.currency)}</ThemedText>
          </View>
        )}

        <Card>
          <View style={styles.detailRow}>
            <ThemedText themeColor="textSecondary">Reference</ThemedText>
            <ThemedText type="smallBold">{receivedReceipt.reference}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText themeColor="textSecondary">Received</ThemedText>
            <ThemedText type="smallBold">{new Date(receivedReceipt.settledAt).toLocaleString()}</ThemedText>
          </View>
        </Card>

        <Button label="New request" onPress={reset} />
      </Screen>
    );
  }

  if (stage === 'broadcasting' && request) {
    const currentFrame = frames[frameIndex];
    const expired = secondsLeft <= 0;
    return (
      <Screen>
        <ThemedText type="title" style={styles.title}>
          Broadcasting
        </ThemedText>
        <ThemedText themeColor="textSecondary">Hold this screen up to the payer's camera. No pairing or connection required.</ThemedText>

        <Card style={styles.qrCard}>
          {currentFrame && !expired ? (
            <QRCode value={encodeFrame(currentFrame)} size={240} backgroundColor={theme.surface} color={theme.text} />
          ) : (
            <View style={styles.expiredBox}>
              <ThemedText themeColor="danger">This request has expired.</ThemedText>
            </View>
          )}
        </Card>

        <View style={styles.detailRow}>
          <ThemedText type="smallBold">{formatMoney(request.amountMinor, request.currency)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {expired ? 'Expired' : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
          </ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">{request.note}</ThemedText>

        <Card style={styles.truthNote}>
          <ThemedText type="small">Networkless handoff</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            This device and the payer's camera negotiate directly — there's no server watching for the payment to land. Once the payer shows their "One more scan" screen, use the button below to scan it and credit your own balance.
          </ThemedText>
        </Card>

        <Button label="Scan payer's proof to get credited" onPress={startScanningForConfirmation} />
        <Button label={expired ? 'Create a new request' : 'Cancel request'} variant="ghost" onPress={reset} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Receive
      </ThemedText>
      <ThemedText themeColor="textSecondary">Create a payment request and broadcast it optically to the payer's camera.</ThemedText>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Amount
        </ThemedText>
        <View style={styles.amountRow}>
          <ThemedText type="title" style={styles.currencyPrefix}>
            ₦
          </ThemedText>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            style={[styles.amountInput, { color: theme.text }]}
            accessibilityLabel="Payment amount"
          />
        </View>
      </Card>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Note
        </ThemedText>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={80}
          style={[styles.noteInput, { color: theme.text }]}
          accessibilityLabel="Payment note"
        />
      </Card>

      {error ? (
        <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}

      <Button label="Create payment request" onPress={createRequest} loading={preparing} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, lineHeight: 38, paddingTop: Spacing.two },
  amount: { fontSize: 40, lineHeight: 46 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyPrefix: { fontSize: 28 },
  amountInput: { fontFamily: Fonts.sansSemiBold, fontSize: 36, flex: 1, padding: 0 },
  noteInput: { fontFamily: Fonts.sansMedium, fontSize: 16, padding: 0 },
  qrCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five },
  expiredBox: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  truthNote: { gap: Spacing.one },
  cameraContainer: { flex: 1, backgroundColor: '#000000' },
  scanOverlay: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 260, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  scanFooter: { position: 'absolute', left: 0, right: 0, bottom: 48, paddingHorizontal: Spacing.four, gap: Spacing.two },
  scanHint: { color: '#FFFFFF', textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  scanError: { color: '#FF8A73', textAlign: 'center' },
});
