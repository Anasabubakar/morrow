import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';

/** Checkmark-in-a-glow seal for a completed payment — the "it worked" moment a receipt screen shouldn't skip. */
export function SuccessSeal({ size = 88 }: { size?: number }) {
  const theme = useTheme();
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    // A little overshoot here is earned — this is a momentum-carrying
    // "it worked" moment, not a passive UI reveal.
    scale.value = withSpring(1, { damping: 9, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 150 });
    glowOpacity.value = withDelay(80, withTiming(1, { duration: 400 }));
  }, [scale, opacity, glowOpacity]);

  const sealStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value * 0.35 }));

  return (
    <View style={[styles.wrap, { width: size * 1.6, height: size * 1.6 }]}>
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          { width: size * 1.6, height: size * 1.6, borderRadius: size * 0.8, backgroundColor: theme.positive },
        ]}
      />
      <Animated.View style={[styles.seal, sealStyle, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.positive }]}>
        <Ionicons name="checkmark" size={size * 0.52} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  glow: { position: 'absolute' },
  seal: { alignItems: 'center', justifyContent: 'center' },
});
