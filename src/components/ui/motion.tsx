import * as Haptics from 'expo-haptics';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressScaleProps = PressableProps & {
  scaleTo?: number;
  haptic?: boolean;
};

/** Pressable wrapper that spring-scales down on press, with an optional light haptic tap. */
export function PressScale({ scaleTo = 0.96, haptic = true, style, onPressIn, onPressOut, ...rest }: PressScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={[animatedStyle, style as object]}
      onPressIn={event => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated via `.value` by design.
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 300 });
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPressIn?.(event);
      }}
      onPressOut={event => {
        // eslint-disable-next-line react-hooks/immutability -- see onPressIn above.
        scale.value = withSpring(1, { damping: 18, stiffness: 300 });
        onPressOut?.(event);
      }}
      {...rest}
    />
  );
}

/** Stagger delay (ms) for the i-th item in an entrance animation sequence. */
export function staggerDelay(index: number, stepMs = 50) {
  return index * stepMs;
}
