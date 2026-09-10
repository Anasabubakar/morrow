import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useBalanceVisibility } from '@/hooks/use-balance-visibility';
import { useThemeMode } from '@/hooks/use-theme';

/** Wraps a money amount so the global eye toggle can blur it — the real value still renders underneath, just obscured. */
export function PrivateValue({ children }: { children: ReactNode }) {
  const { visible } = useBalanceVisibility();
  const { resolvedMode } = useThemeMode();

  return (
    <View style={styles.wrap}>
      {children}
      {!visible && (
        // A glass surface should materialize, not pop — fades in/out rather
        // than an instant intensity snap.
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill} pointerEvents="none">
          <BlurView
            intensity={60}
            tint={resolvedMode === 'dark' ? 'dark' : 'light'}
            // BlurView on Android defaults to blurMethod="none", which just
            // renders a flat semi-transparent tint instead of an actual
            // blur — this is the real native blur renderer. Costs some
            // performance on SDK 30 and below, worth it for a genuine glass
            // effect instead of a solid grey block.
            blurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 6 },
});
