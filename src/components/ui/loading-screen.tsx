import { ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Screen } from '@/components/ui/screen';
import { useTheme } from '@/hooks/use-theme';

/** Centered spinner for a brief indeterminate wait (e.g. permission status not yet resolved) — never a blank screen. */
export function LoadingScreen() {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.flex}>
      <Screen scroll={false} style={styles.center}>
        <ActivityIndicator color={theme.textSecondary} />
      </Screen>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
