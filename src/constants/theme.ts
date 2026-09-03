/**
 * Morrow is single-themed (always dark) — colors and typography sourced
 * from the Figma brand file (Vq8iNQa3bS4dFyGuYiVjJh), node 3:2 "Cover / Hero"
 * and node 3:86 "Logo/Primary Lockup".
 */

import { Platform } from 'react-native';

export const Colors = {
  text: '#F2F4F7',
  background: '#0B0D12',
  surface: '#14161D',
  backgroundElement: '#1A1D26',
  backgroundSelected: '#232733',
  border: 'rgba(166, 173, 186, 0.25)',
  textSecondary: '#A6ADBA',
  accent: '#5A5FF7',
  positive: '#3FBE87',
  danger: '#E2604D',
} as const;

export type ThemeColor = keyof typeof Colors;

export const Fonts = {
  display: 'Michroma_400Regular',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }),
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
