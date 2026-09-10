import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Wordmark } from '@/components/brand/wordmark';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { PressScale, staggerDelay } from '@/components/ui/motion';
import { PrivateValue } from '@/components/ui/private-value';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useToast } from '@/components/ui/toast';
import { WalletCard } from '@/components/ui/wallet-card';
import { Card, Screen } from '@/components/ui/screen';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resetDemoState } from '@/lib/demo';
import { fitFontSize, formatMoney } from '@/lib/format';
import { listReceipts } from '@/lib/history';
import { createReserve, getActiveReserve } from '@/lib/reserve';
import { credit, deduct, getBalance } from '@/lib/wallet';
import type { ReserveState, SettlementReceipt } from '@/lib/types';

const LIVE_MODE = process.env.EXPO_PUBLIC_BMONI_MODE === 'live';
const RESERVE_VALID_MS = 24 * 60 * 60 * 1000;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const [recent, setRecent] = useState<SettlementReceipt[] | null>(null);
  const [bmoniUserId, setBmoniUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [reserve, setReserve] = useState<ReserveState | null>(null);
  const [showReserveForm, setShowReserveForm] = useState(false);
  const [reserveAmount, setReserveAmount] = useState('20000');
  const [reserveError, setReserveError] = useState('');
  const [creatingReserve, setCreatingReserve] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listReceipts().then(all => setRecent(all.slice(0, 3)));
      getActiveReserve().then(setReserve);
      getBalance().then(setBalance);
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
    const valueMinor = Math.round(number * 100);
    setCreatingReserve(true);
    try {
      const currentBalance = await getBalance();
      if (valueMinor > currentBalance) throw new Error('Insufficient balance to reserve that amount.');
      // Moves the amount out of the spendable balance into the reserve —
      // spending from the reserve later does not touch the wallet again.
      await deduct(valueMinor);
      let next: ReserveState;
      try {
        next = await createReserve({ valueMinor, currency: 'NGN', validForMs: RESERVE_VALID_MS });
      } catch (createFailure) {
        // deduct() already succeeded — without this the money vanishes with
        // no reserve to show for it.
        await credit(valueMinor);
        throw createFailure;
      }
      setBalance(await getBalance());
      setReserve(next);
      setShowReserveForm(false);
      showToast({ message: `Reserved ${formatMoney(valueMinor, 'NGN')} for offline spending`, variant: 'success' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not create the reserve.';
      setReserveError(message);
      showToast({ message, variant: 'error' });
    } finally {
      setCreatingReserve(false);
    }
  }

  const reserveRemaining = reserve ? reserve.allowance.valueMinor - reserve.spentMinor : 0;

  async function handleResetDemo() {
    await resetDemoState();
    setRecent([]);
    setReserve(null);
    setBalance(await getBalance());
    setShowReserveForm(false);
    showToast({ message: 'Demo reset — balance, Reserve, and history cleared', variant: 'info' });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Wordmark size={22} />
        <View style={styles.headerActions}>
          <ThemeToggle />
          <PressScale
            onLongPress={handleResetDemo}
            delayLongPress={900}
            accessibilityRole="button"
            accessibilityLabel="Reset demo data. Hold to reset balance, Reserve, and history.">
            <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">AN</ThemedText>
            </View>
          </PressScale>
        </View>
      </View>

      <WalletCard
        label="Sandbox balance"
        balanceMinor={balance}
        currency="NGN"
        details={
          <View style={styles.cardDetails}>
            <ThemedText type="smallBold">Details</ThemedText>
            {LIVE_MODE && bmoniUserId ? (
              <ThemedText type="small" themeColor="textSecondary" selectable numberOfLines={1}>
                Settlement account · {bmoniUserId}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Local sandbox wallet — not backed by real funds.
              </ThemedText>
            )}
            {reserve && (
              <PrivateValue>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatMoney(reserveRemaining, reserve.allowance.currency)} held in Morrow Reserve
                </ThemedText>
              </PrivateValue>
            )}
          </View>
        }
      />

      <Card>
        <View style={styles.reserveHeader}>
          <ThemedText type="smallBold" numberOfLines={1}>
            Morrow Reserve
          </ThemedText>
          {reserve && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.reserveExpiry}>
              Expires {new Date(reserve.allowance.expiresAt).toLocaleString()}
            </ThemedText>
          )}
        </View>

        {reserve ? (
          <>
            <PrivateValue>
              <ThemedText
                type="title"
                style={[styles.balance, { fontSize: fitFontSize(formatMoney(reserveRemaining, reserve.allowance.currency), 36, 13, 20) }]}
                numberOfLines={1}>
                {formatMoney(reserveRemaining, reserve.allowance.currency)}
              </ThemedText>
            </PrivateValue>
            <PrivateValue>
              <ThemedText type="small" themeColor="textSecondary">
                Available offline of {formatMoney(reserve.allowance.valueMinor, reserve.allowance.currency)}
              </ThemedText>
            </PrivateValue>
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
            {reserveError ? <ErrorState message={reserveError} /> : null}
            <Button label="Add to Morrow Reserve" onPress={addToReserve} loading={creatingReserve} />
          </>
        ) : (
          <Button label={reserve ? 'Add more to Reserve' : 'Add to Reserve'} variant="secondary" onPress={() => setShowReserveForm(true)} />
        )}
      </Card>

      {LIVE_MODE && (
        <Card>
          <ThemedText type="smallBold">Live mode: settlement account</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" selectable numberOfLines={1}>
            {bmoniUserId ?? 'Provisioning…'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Use this ID to complete KYC and request sandbox funding for this device.
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

      {recent === null ? (
        <>
          <Skeleton height={64} borderRadius={20} />
          <Skeleton height={64} borderRadius={20} />
        </>
      ) : recent.length === 0 ? (
        <Card>
          <ThemedText themeColor="textSecondary">No transactions yet. Send or receive your first payment to see it here.</ThemedText>
        </Card>
      ) : (
        recent.map((item, index) => {
          const sent = item.direction === 'sent';
          const counterparty = sent ? item.merchantName : item.customerName;
          return (
            <Animated.View key={item.id} entering={FadeInDown.delay(staggerDelay(index)).duration(300)}>
              <Card style={styles.activityRow}>
                <View style={styles.activityInfo}>
                  <ThemedText type="default" numberOfLines={1}>
                    {counterparty}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {new Date(item.settledAt).toLocaleString()} · {item.status === 'settled' ? 'Settled' : 'Pending'}
                  </ThemedText>
                </View>
                <PrivateValue>
                  <ThemedText type="smallBold" themeColor={sent ? 'danger' : 'positive'} numberOfLines={1} style={styles.activityAmount}>
                    {sent ? '−' : '+'}
                    {formatMoney(item.amountMinor, item.currency)}
                  </ThemedText>
                </PrivateValue>
              </Card>
            </Animated.View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.two },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  balance: { fontSize: 36, lineHeight: 40 },
  cardDetails: { gap: Spacing.one },
  reserveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  reserveExpiry: { flexShrink: 1, textAlign: 'right' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyPrefix: { fontSize: 24 },
  amountInput: { fontSize: 32, fontFamily: Fonts.sansSemiBold, flex: 1, padding: 0, minWidth: 0 },
  actionsRow: { flexDirection: 'row', gap: Spacing.three },
  actionSlot: { flex: 1 },
  sectionHeader: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 20, lineHeight: 26 },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  activityInfo: { flex: 1, minWidth: 0, gap: 2 },
  activityAmount: { flexShrink: 0 },
});
