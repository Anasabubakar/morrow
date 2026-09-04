import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

import { PressScale } from '@/components/ui/motion';
import { useTheme, useThemeMode, type ThemeMode } from '@/hooks/use-theme';

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const ICON: Record<ThemeMode, keyof typeof Ionicons.glyphMap> = {
  light: 'sunny',
  dark: 'moon',
  system: 'contrast',
};

/** Compact icon button cycling light → dark → system, persisted via useThemeMode. */
export function ThemeToggle() {
  const theme = useTheme();
  const { mode, setMode } = useThemeMode();

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${mode}. Tap to change.`}
      style={[styles.button, { backgroundColor: theme.backgroundElement }]}
      onPress={() => setMode(NEXT_MODE[mode])}>
      <Animated.View key={mode} entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
        <Ionicons name={ICON[mode]} size={18} color={theme.text} />
      </Animated.View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  button: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
