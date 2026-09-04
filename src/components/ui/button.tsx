import { ActivityIndicator, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressScale } from '@/components/ui/motion';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

export function Button({ label, variant = 'primary', loading, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const background = variant === 'primary' ? theme.accent : variant === 'secondary' ? theme.backgroundElement : 'transparent';
  const textColor = variant === 'primary' ? theme.accentText : theme.text;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      haptic={!isDisabled}
      style={[
        styles.base,
        { backgroundColor: background, opacity: isDisabled ? 0.5 : 1 },
        variant === 'ghost' && styles.ghostBorder,
        variant === 'ghost' && { borderColor: theme.border },
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={textColor} /> : <ThemedText style={[styles.label, { color: textColor }]}>{label}</ThemedText>}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  ghostBorder: {
    borderWidth: 1,
  },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
  },
});
