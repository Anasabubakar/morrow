import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { MorrowSymbol } from '@/components/brand/morrow-symbol';
import { useTheme } from '@/hooks/use-theme';

/**
 * Branded reveal that takes over from the native splash screen
 * (expo-splash-screen) — the native splash only exists to cover the
 * cold-start blank-screen gap before any JS has run, this is the deliberate
 * animated beat.
 *
 * The native splash is hidden from THIS component's own mount effect, not
 * from the fonts-loaded effect one level up — hiding it as soon as fonts
 * resolve raced this component's first paint on a release build (fonts are
 * bundled locally there, so they resolve almost instantly, sometimes before
 * this component ever gets a frame), producing a visible gap or skipping
 * the animation's opening beat entirely. Hiding it here guarantees the JS
 * splash is already painted before the native one disappears.
 */
export function SplashIntro({ onFinish }: { onFinish: () => void }) {
  const theme = useTheme();

  const symbolOpacity = useSharedValue(0);
  const symbolScale = useSharedValue(0.7);
  const wordOpacity = useSharedValue(0);
  const wordTranslate = useSharedValue(8);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync();
    symbolOpacity.value = withTiming(1, { duration: 500 });
    symbolScale.value = withSpring(1, { damping: 12, stiffness: 120 });
    wordOpacity.value = withDelay(350, withTiming(1, { duration: 450 }));
    wordTranslate.value = withDelay(350, withTiming(0, { duration: 450 }));
    containerOpacity.value = withDelay(
      1450,
      withTiming(0, { duration: 350 }, finished => {
        if (finished) runOnJS(onFinish)();
      })
    );
  }, [containerOpacity, symbolOpacity, symbolScale, wordOpacity, wordTranslate, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const symbolStyle = useAnimatedStyle(() => ({
    opacity: symbolOpacity.value,
    transform: [{ scale: symbolScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordTranslate.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: theme.background }, containerStyle]}
      pointerEvents="none">
      <Animated.View style={symbolStyle}>
        <MorrowSymbol size={72} color={theme.text} />
      </Animated.View>
      <Animated.View style={wordStyle}>
        <Text style={[styles.wordmark, { color: theme.text }]}>morrow</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 999 },
  wordmark: { fontFamily: 'Michroma_400Regular', fontSize: 20, letterSpacing: 20 * 0.07 },
});
