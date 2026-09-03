import { StyleSheet, Text, View } from 'react-native';

import { MorrowSymbol } from '@/components/brand/morrow-symbol';
import { useTheme } from '@/hooks/use-theme';

// Proportions match Figma's Primary Lockup (node 3:86): symbol height is
// 120/92 of the wordmark font size, tracking is 6.44/92 (~7%) of it.
export function Wordmark({ size = 20 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <MorrowSymbol size={size * 1.304} color={theme.accent} />
      <Text style={[styles.text, { fontSize: size, letterSpacing: size * 0.07, color: theme.text }]}>morrow</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: 'Michroma_400Regular', fontWeight: '400' },
});
