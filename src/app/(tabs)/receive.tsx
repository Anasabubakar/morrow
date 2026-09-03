import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/screen';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { stablecoinFor } from '@/lib/bmoniApi';
import { formatMoney } from '@/lib/format';
import { encodeFrame, encodeFrames } from '@/lib/optical';
import { createPaymentRequest, serializeRequest } from '@/lib/protocol';
import type { PaymentRequest } from '@/lib/types';

const FRAME_INTERVAL_MS = 120;
const LOCAL_MERCHANT_BMONI_ID = 'usr_morrow_demo_local';

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
  const [amount, setAmount] = useState('12500');
  const [note, setNote] = useState('Market order #184');
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [preparing, setPreparing] = useState(false);

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
  }

  function reset() {
    setRequest(null);
    setError('');
  }

  if (request) {
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
            This device and the payer's camera negotiate directly. Funds settle online through BMONI once the payer confirms.
          </ThemedText>
        </Card>

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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyPrefix: { fontSize: 28 },
  amountInput: { fontFamily: Fonts.sansSemiBold, fontSize: 36, flex: 1, padding: 0 },
  noteInput: { fontFamily: Fonts.sansMedium, fontSize: 16, padding: 0 },
  qrCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.five },
  expiredBox: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  truthNote: { gap: Spacing.one },
});
