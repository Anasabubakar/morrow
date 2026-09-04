import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { MorrowSymbol } from '@/components/brand/morrow-symbol';
import { useTheme } from '@/hooks/use-theme';

/**
 * Branded reveal shown once after the native splash screen (expo-splash-screen)
 * hides and fonts are ready — the native splash only exists to cover the
 * cold-start blank-screen gap, this is the deliberate animated beat.
 */
export function SplashIntro({ onFinish }: { onFinish: () => void }) {
  const theme = useTheme();

  const symbolOpacity = useSharedValue(0);
  const symbolScale = useSharedValue(0.7);
  const wordOpacity = useSharedValue(0);
  const wordTranslate = useSharedValue(8);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    symbolOpacity.value = withTiming(1, { duration: 350 });
    symbolScale.value = withSpring(1, { damping: 11, stiffness: 140 });
    wordOpacity.value = withDelay(250, withTiming(1, { duration: 300 }));
    wordTranslate.value = withDelay(250, withTiming(0, { duration: 300 }));
    containerOpacity.value = withDelay(
      900,
      withTiming(0, { duration: 250 }, finished => {
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
