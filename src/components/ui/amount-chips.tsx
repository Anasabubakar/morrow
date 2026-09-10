import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressScale } from '@/components/ui/motion';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AmountChipsProps = {
  presetsMajor: number[];
  onSelect: (major: number) => void;
};

function compactLabel(major: number) {
  if (major >= 1000 && major % 1000 === 0) return `₦${major / 1000}K`;
  return `₦${major.toLocaleString('en-NG')}`;
}

/** Row of quick-pick amount chips (₦1K / ₦5K / …) so common amounts don't need typing out. */
export function AmountChips({ presetsMajor, onSelect }: AmountChipsProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {presetsMajor.map(major => (
        <PressScale
          key={major}
          accessibilityRole="button"
          style={[styles.chip, { backgroundColor: theme.backgroundElement }]}
          onPress={() => onSelect(major)}>
          <ThemedText type="small" style={styles.label} numberOfLines={1}>
            {compactLabel(major)}
          </ThemedText>
        </PressScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  chip: { flex: 1, minWidth: 0, paddingVertical: Spacing.two, borderRadius: 12, alignItems: 'center' },
  label: { fontWeight: '600' },
});
