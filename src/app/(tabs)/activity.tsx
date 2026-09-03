import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/format';
import { listReceipts } from '@/lib/history';
import type { SettlementReceipt } from '@/lib/types';

export default function ActivityScreen() {
  const [receipts, setReceipts] = useState<SettlementReceipt[]>([]);

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

      {receipts.length === 0 ? (
        <Card>
          <ThemedText themeColor="textSecondary">Nothing here yet. Completed payments will appear in this list.</ThemedText>
        </Card>
      ) : (
        receipts.map(item => {
          const sent = item.direction === 'sent';
          const counterparty = sent ? item.merchantName : item.customerName;
          return (
            <Card key={item.id} style={styles.row}>
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
});
