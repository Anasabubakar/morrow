import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { staggerDelay } from '@/components/ui/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { listReceipts } from '@/lib/history';
import type { SettlementReceipt } from '@/lib/types';

export default function ActivityScreen() {
  const theme = useTheme();
  const [receipts, setReceipts] = useState<SettlementReceipt[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listReceipts().then(setReceipts);
    }, [])
  );

  return (
    <Screen>
      <ThemedText type="title" style={styles.title}>
        Activity
      </ThemedText>

      {receipts === null ? (
        <>
          <Skeleton height={68} borderRadius={20} />
          <Skeleton height={68} borderRadius={20} />
          <Skeleton height={68} borderRadius={20} />
        </>
      ) : receipts.length === 0 ? (
        <Card style={styles.empty}>
          <Ionicons name="receipt-outline" size={32} color={theme.textSecondary} />
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            Nothing here yet. Completed payments will appear in this list.
          </ThemedText>
        </Card>
      ) : (
        receipts.map((item, index) => {
          const sent = item.direction === 'sent';
          const counterparty = sent ? item.merchantName : item.customerName;
          return (
            <Animated.View key={item.id} entering={FadeInDown.delay(staggerDelay(index)).duration(300)}>
              <Card style={styles.row}>
                <View style={styles.info}>
                  <ThemedText type="default">{counterparty}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {new Date(item.settledAt).toLocaleString()} · {item.reference}
                  </ThemedText>
                </View>
                <View style={styles.amountBlock}>
                  <ThemedText type="smallBold" themeColor={sent ? 'text' : 'positive'}>
                    {sent ? '−' : '+'}
                    {formatMoney(item.amountMinor, item.currency)}
                  </ThemedText>
                  <ThemedText type="small" themeColor={item.status === 'settled' ? 'positive' : 'textSecondary'}>
                    {item.status === 'settled' ? 'Settled' : 'Pending settlement'}
                  </ThemedText>
                </View>
              </Card>
            </Animated.View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 32, lineHeight: 38, paddingTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { gap: 2 },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  emptyText: { textAlign: 'center' },
});
