/**
 * Morrow's brand mark and typography are sourced from the Figma brand file
 * (Vq8iNQa3bS4dFyGuYiVjJh), node 3:2 "Cover / Hero" and node 3:86 "Logo/
 * Primary Lockup". The brand color itself is monochrome by design — no hue,
 * just black/white "ink" that inverts between light and dark mode.
 */

import { Platform } from 'react-native';

export const DarkColors = {
  text: '#F5F5F7',
  background: '#000000',
  surface: '#121212',
  backgroundElement: '#1C1C1E',
  backgroundSelected: '#2C2C2E',
  border: 'rgba(255, 255, 255, 0.12)',
  textSecondary: '#8E8E93',
  accent: '#FFFFFF',
  accentText: '#000000',
  positive: '#3FBE87',
  danger: '#E2604D',
} as const;

export const LightColors = {
  text: '#0A0A0A',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  backgroundElement: '#F0F0F2',
  backgroundSelected: '#E4E4E7',
  border: 'rgba(10, 10, 10, 0.10)',
  textSecondary: '#6B6B70',
  accent: '#0A0A0A',
  accentText: '#FFFFFF',
  positive: '#2E9B6D',
  danger: '#C7402F',
} as const;

export type ThemeColor = keyof typeof DarkColors;

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
