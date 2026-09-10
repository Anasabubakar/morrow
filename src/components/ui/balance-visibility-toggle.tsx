import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

import { PressScale } from '@/components/ui/motion';
import { useBalanceVisibility } from '@/hooks/use-balance-visibility';
import { useTheme } from '@/hooks/use-theme';

/** Compact icon button toggling whether balances and transaction amounts are blurred. */
export function BalanceVisibilityToggle() {
  const theme = useTheme();
  const { visible, toggle } = useBalanceVisibility();

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide balance' : 'Show balance'}
      style={[styles.button, { backgroundColor: theme.backgroundElement }]}
      onPress={toggle}>
      <Animated.View key={visible ? 'open' : 'closed'} entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
        <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.text} />
      </Animated.View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  button: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
