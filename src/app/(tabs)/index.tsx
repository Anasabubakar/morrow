import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Wordmark } from '@/components/brand/wordmark';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Screen } from '@/components/ui/screen';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { listReceipts } from '@/lib/history';
import { createReserve, getActiveReserve } from '@/lib/reserve';
import type { ReserveState, SettlementReceipt } from '@/lib/types';

const SANDBOX_BALANCE_MINOR = 48200000;
const LIVE_MODE = process.env.EXPO_PUBLIC_BMONI_MODE === 'live';
const RESERVE_VALID_MS = 24 * 60 * 60 * 1000;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [recent, setRecent] = useState<SettlementReceipt[]>([]);
  const [bmoniUserId, setBmoniUserId] = useState<string | null>(null);
  const [reserve, setReserve] = useState<ReserveState | null>(null);
  const [showReserveForm, setShowReserveForm] = useState(false);
  const [reserveAmount, setReserveAmount] = useState('20000');
  const [reserveError, setReserveError] = useState('');
  const [creatingReserve, setCreatingReserve] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listReceipts().then(all => setRecent(all.slice(0, 3)));
      getActiveReserve().then(setReserve);
      if (LIVE_MODE) {
        import('@/lib/bmoniApi')
          .then(({ stablecoinFor }) => import('@/lib/bmoniIdentity').then(m => m.ensureLocalBmoniIdentity(stablecoinFor('NGN'))))
          .then(identity => setBmoniUserId(identity.bmoniUserId))
          .catch(() => setBmoniUserId(null));
      }
    }, [])
  );

  async function addToReserve() {
    setReserveError('');
    const number = Number(reserveAmount.replaceAll(',', ''));
    if (!Number.isFinite(number) || number <= 0) {
      setReserveError('Enter a valid amount greater than zero.');
      return;
    }
    setCreatingReserve(true);
    try {
      const next = await createReserve({ valueMinor: Math.round(number * 100), currency: 'NGN', validForMs: RESERVE_VALID_MS });
      setReserve(next);
      setShowReserveForm(false);
    } catch (cause) {
      setReserveError(cause instanceof Error ? cause.message : 'Could not create the reserve.');
    } finally {
      setCreatingReserve(false);
    }
  }

  const reserveRemaining = reserve ? reserve.allowance.valueMinor - reserve.spentMinor : 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Wordmark size={22} />
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">AN</ThemedText>
        </View>
      </View>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Sandbox balance
        </ThemedText>
        <ThemedText type="title" style={styles.balance}>
          {formatMoney(SANDBOX_BALANCE_MINOR, 'NGN')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          BMONI · CNGN
        </ThemedText>
      </Card>

      <Card>
        <View style={styles.reserveHeader}>
          <ThemedText type="smallBold">Morrow Reserve</ThemedText>
          {reserve && (
            <ThemedText type="small" themeColor="textSecondary">
              Expires {new Date(reserve.allowance.expiresAt).toLocaleString()}
            </ThemedText>
          )}
        </View>

        {reserve ? (
          <>
            <ThemedText type="title" style={styles.balance}>
              {formatMoney(reserveRemaining, reserve.allowance.currency)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Available offline of {formatMoney(reserve.allowance.valueMinor, reserve.allowance.currency)}
            </ThemedText>
          </>
        ) : (
          <ThemedText themeColor="textSecondary">
            Reserve spending power while you have signal, then pay device-to-device with no connection at all.
          </ThemedText>
        )}

        {showReserveForm ? (
          <>
            <View style={styles.amountRow}>
              <ThemedText type="title" style={styles.currencyPrefix}>
                ₦
              </ThemedText>
              <TextInput
                value={reserveAmount}
                onChangeText={setReserveAmount}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: theme.text }]}
                accessibilityLabel="Reserve amount"
                autoFocus
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Available offline for 24 hours
            </ThemedText>
            {reserveError ? (
              <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
                {reserveError}
              </ThemedText>
            ) : null}
            <Button label="Add to Morrow Reserve" onPress={addToReserve} loading={creatingReserve} />
          </>
        ) : (
          <Button label={reserve ? 'Add more to Reserve' : 'Add to Reserve'} variant="secondary" onPress={() => setShowReserveForm(true)} />
        )}
      </Card>

      {LIVE_MODE && (
        <Card>
          <ThemedText type="smallBold">Live mode: BMONI account</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" selectable>
            {bmoniUserId ?? 'Provisioning…'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Use this ID to submit KYC and request sandbox test tokens for this device — see docs/BMONI_INTEGRATION.md.
          </ThemedText>
        </Card>
      )}

      <View style={styles.actionsRow}>
        <View style={styles.actionSlot}>
          <Button label="Send" variant="secondary" onPress={() => router.push('/send')} />
        </View>
        <View style={styles.actionSlot}>
          <Button label="Receive" variant="secondary" onPress={() => router.push('/receive')} />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Recent activity
        </ThemedText>
      </View>

      {recent.length === 0 ? (
        <Card>
          <ThemedText themeColor="textSecondary">No transactions yet. Send or receive your first payment to see it here.</ThemedText>
        </Card>
      ) : (
        recent.map(item => (
          <Card key={item.id} style={styles.activityRow}>
            <View style={styles.activityInfo}>
              <ThemedText type="default">{item.merchantName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(item.settledAt).toLocaleString()} · {item.status === 'settled' ? 'Settled' : 'Pending'}
              </ThemedText>
            </View>
            <ThemedText type="smallBold">{formatMoney(item.amountMinor, item.currency)}</ThemedText>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.two },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  balance: { fontSize: 36, lineHeight: 40 },
  reserveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyPrefix: { fontSize: 24 },
  amountInput: { fontSize: 32, fontFamily: Fonts.sansSemiBold, flex: 1, padding: 0 },
  actionsRow: { flexDirection: 'row', gap: Spacing.three },
  actionSlot: { flex: 1 },
  sectionHeader: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 20, lineHeight: 26 },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activityInfo: { gap: 2 },
});
