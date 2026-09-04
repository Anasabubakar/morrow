import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Rounded, floating tab bar with an animated pill sliding behind the active tab. */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const containerWidth = useSharedValue(0);
  const count = state.routes.length;

  const pillStyle = useAnimatedStyle(() => {
    const tabWidth = containerWidth.value / count;
    return {
      width: tabWidth,
      transform: [{ translateX: withSpring(tabWidth * state.index, { damping: 20, stiffness: 220 }) }],
    };
  });

  function handleLayout(event: LayoutChangeEvent) {
    containerWidth.value = event.nativeEvent.layout.width;
  }

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + Spacing.two }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]} onLayout={handleLayout}>
        <Animated.View style={[styles.pill, pillStyle, { backgroundColor: theme.backgroundElement }]} />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? theme.text : theme.textSecondary;

          function onPress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}>
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <ThemedText type="small" style={[styles.label, { color }]}>
                {typeof options.title === 'string' ? options.title : route.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: 1,
    width: '90%',
    maxWidth: 420,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pill: { position: 'absolute', top: Spacing.two, bottom: Spacing.two, borderRadius: 20 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },
});
