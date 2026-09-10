import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useBalanceVisibility } from '@/hooks/use-balance-visibility';
import { useThemeMode } from '@/hooks/use-theme';

// How far the blur bleeds past the text's own bounds before it's fully
// faded out — without this, the fade has nowhere to happen and the mask
// just reproduces a hard-edged box again.
const BLEED = 16;

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
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          style={[StyleSheet.absoluteFill, styles.bleed]}
          pointerEvents="none">
          <MaskedView style={styles.fill} maskElement={<FadeMask />}>
            <BlurView
              intensity={55}
              tint={resolvedMode === 'dark' ? 'dark' : 'light'}
              // BlurView on Android defaults to blurMethod="none", which just
              // renders a flat semi-transparent tint instead of an actual
              // blur — this is the real native blur renderer.
              blurMethod="dimezisBlurView"
              style={styles.fill}
            />
          </MaskedView>
        </Animated.View>
      )}
    </View>
  );
}

// Radial gradient, fully opaque through the middle and dissolving to
// transparent at the edges. A hard-edged blur box reads as a UI sticker
// slapped over the number; this reads as the number fading into fog —
// no straight edges, no fixed rectangle, nothing "pointy".
function FadeMask() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="fade" cx="50%" cy="50%" r="62%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="45%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#fade)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  // Fully rounded (not just a small radius) so even in a worst-case where
  // masking doesn't render as expected on some device, the fallback is a
  // soft pill-shaped blur — never a hard-cornered rectangle.
  bleed: { margin: -BLEED, borderRadius: 999, overflow: 'hidden' },
  fill: { flex: 1 },
});
