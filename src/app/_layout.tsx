import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Michroma_400Regular } from '@expo-google-fonts/michroma';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';

import { SplashIntro } from '@/components/brand/splash-intro';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider, useThemeMode } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

const SPLASH_INTRO_MAX_MS = 1400;

function AppShell() {
  const { resolvedMode } = useThemeMode();
  const [showIntro, setShowIntro] = useState(true);

  // Belt-and-suspenders: the intro also unmounts itself via a reanimated
  // callback, but that callback isn't guaranteed to fire on every platform —
  // this fallback timer ensures the overlay (and its touch-blocking surface)
  // never lingers even if it doesn't.
  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), SPLASH_INTRO_MAX_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <NavigationThemeProvider value={resolvedMode === 'dark' ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        {showIntro && <SplashIntro onFinish={() => setShowIntro(false)} />}
      </ToastProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Michroma_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
