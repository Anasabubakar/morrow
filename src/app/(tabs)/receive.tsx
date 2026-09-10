import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Card, Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
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
const QR_MAX_SIZE = 240;
const QR_SIDE_MARGIN = Spacing.four * 2 + Spacing.four * 2; // Screen padding + Card padding, both sides

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
  const { showToast } = useToast();
  const { width: windowWidth } = useWindowDimensions();
  const qrSize = Math.min(QR_MAX_SIZE, windowWidth - QR_SIDE_MARGIN);
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

  const glowPulse = useSharedValue(0.4);
  useEffect(() => {
    glowPulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [glowPulse]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowPulse.value }));

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
      setError(cause instanceof Error ? cause.message : 'Could not prepare a settlement account for this request.');
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
      await markConfirmationRedeemed(confirmation);

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
      showToast({ message: `Received ${formatMoney(confirmation.amountMinor, confirmation.currency)}`, variant: 'success' });
    } catch (cause) {
      // A completed OpticalReceiver ignores every further frame (correct for
      // a successful decode, wrong here) — without a fresh instance, every
      // subsequent camera frame just re-triggers this same stale failure.
      confirmReceiverRef.current = new OpticalReceiver();
      confirmSettledRef.current = false;
      setScanProgress(0);
      const message = cause instanceof Error ? cause.message : 'Could not verify this confirmation.';
      setScanError(message);
      showToast({ message, variant: 'error' });
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
        <Animated.View key="scanning-permission" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
          <Screen>
            <ThemedText type="small" themeColor="textSecondary">
              Last step for this request
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Confirming payment
            </ThemedText>
            <Card>
              <ThemedText>Morrow needs camera access, just for this one scan, to verify the payer&apos;s proof and credit your balance.</ThemedText>
              {permission?.canAskAgain !== false ? (
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
      <Animated.View key="scanning" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.cameraContainer}>
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
          <ThemedText style={styles.scanHint}>Point your camera at the payer&apos;s &quot;One more scan&quot; screen</ThemedText>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${scanProgress * 100}%`, backgroundColor: theme.accent }]} />
          </View>
          {scanError ? <ErrorState message={scanError} /> : null}
          <Button label="Back to broadcast" variant="ghost" onPress={() => setStage('broadcasting')} />
        </View>
      </Animated.View>
    );
  }

  if (stage === 'received' && receivedReceipt) {
    return (
      <Animated.View key="received" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
        <Screen>
          <ThemedText type="small" themeColor="positive">
            Payment received
          </ThemedText>
          <ThemedText type="title" themeColor="positive" style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            +{formatMoney(receivedReceipt.amountMinor, receivedReceipt.currency)}
          </ThemedText>
          <ThemedText themeColor="textSecondary" numberOfLines={1}>
            from {receivedReceipt.customerName}
          </ThemedText>

          {balance !== null && (
            <View style={styles.detailRow}>
              <ThemedText themeColor="textSecondary">New balance</ThemedText>
              <ThemedText type="smallBold" numberOfLines={1}>
                {formatMoney(balance, receivedReceipt.currency)}
              </ThemedText>
            </View>
          )}

          <Card>
            <View style={styles.detailRow}>
              <ThemedText themeColor="textSecondary">Reference</ThemedText>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.detailValue}>
                {receivedReceipt.reference}
              </ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText themeColor="textSecondary">Received</ThemedText>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.detailValue}>
                {new Date(receivedReceipt.settledAt).toLocaleString()}
              </ThemedText>
            </View>
          </Card>

          <Button label="New request" onPress={reset} />
        </Screen>
      </Animated.View>
    );
  }

  if (stage === 'broadcasting' && request) {
    const currentFrame = frames[frameIndex];
    const expired = secondsLeft <= 0;
    return (
      <Animated.View key="broadcasting" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
        <Screen>
          <ThemedText type="title" style={styles.title}>
            Broadcasting
          </ThemedText>
          <ThemedText themeColor="textSecondary">Hold this screen up to the payer&apos;s camera. No pairing or connection required.</ThemedText>

          <View style={styles.qrWrap}>
            {!expired && (
              <Animated.View style={[styles.glow, { backgroundColor: theme.accent }, glowStyle]} pointerEvents="none" />
            )}
            <Card style={styles.qrCard}>
              {currentFrame && !expired ? (
                <QRCode value={encodeFrame(currentFrame)} size={qrSize} backgroundColor={theme.surface} color={theme.text} />
              ) : (
                <View style={[styles.expiredBox, { width: qrSize, height: qrSize }]}>
                  <ThemedText themeColor="danger">This request has expired.</ThemedText>
                </View>
              )}
            </Card>
          </View>

          <View style={styles.detailRow}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {formatMoney(request.amountMinor, request.currency)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {expired ? 'Expired' : `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
            </ThemedText>
          </View>
          <ThemedText themeColor="textSecondary" numberOfLines={2}>
            {request.note}
          </ThemedText>

          <Card style={styles.truthNote}>
            <ThemedText type="small">Networkless handoff</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This device and the payer&apos;s camera negotiate directly — there&apos;s no server watching for the payment to land. Once the payer
              shows their &quot;One more scan&quot; screen, use the button below to scan it and credit your own balance.
            </ThemedText>
          </Card>

          <Button label="Scan payer&apos;s proof to get credited" onPress={startScanningForConfirmation} />
          <Button label={expired ? 'Create a new request' : 'Cancel request'} variant="ghost" onPress={reset} />
        </Screen>
      </Animated.View>
    );
  }

  return (
    <Animated.View key="form" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.flex}>
      <Screen>
        <ThemedText type="title" style={styles.title}>
          Receive
        </ThemedText>
        <ThemedText themeColor="textSecondary">Create a payment request and broadcast it optically to the payer&apos;s camera.</ThemedText>

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

        {error ? <ErrorState message={error} /> : null}

        <Button label="Create payment request" onPress={createRequest} loading={preparing} />
      </Screen>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 32, lineHeight: 38, paddingTop: Spacing.two },
  amount: { fontSize: 40, lineHeight: 46 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyPrefix: { fontSize: 28 },
  amountInput: { fontFamily: Fonts.sansSemiBold, fontSize: 36, flex: 1, padding: 0, minWidth: 0 },
  noteInput: { fontFamily: Fonts.sansMedium, fontSize: 16, padding: 0 },
  qrWrap: { padding: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 36 },
  qrCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five, width: '100%' },
  expiredBox: { alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  detailValue: { flexShrink: 1, textAlign: 'right' },
  truthNote: { gap: Spacing.one },
  cameraContainer: { flex: 1, backgroundColor: '#000000' },
  scanOverlay: { alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 260, height: 260, borderRadius: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  scanFooter: { position: 'absolute', left: 0, right: 0, bottom: 48, paddingHorizontal: Spacing.four, gap: Spacing.two },
  scanHint: { color: '#FFFFFF', textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});
