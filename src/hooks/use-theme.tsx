import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { DarkColors, LightColors } from '@/constants/theme';

const STORAGE_KEY = 'morrow.theme-mode.v1';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedMode = 'light' | 'dark';

type ThemeModeContextValue = {
  mode: ThemeMode;
  resolvedMode: ResolvedMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') setModeState(stored);
    });
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }

  const resolvedMode: ResolvedMode = mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;

  const value = useMemo(() => ({ mode, resolvedMode, setMode }), [mode, resolvedMode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeProvider');
  return ctx;
}

export function useTheme() {
  const { resolvedMode } = useThemeMode();
  return resolvedMode === 'light' ? LightColors : DarkColors;
}
