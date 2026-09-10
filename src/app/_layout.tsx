import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Michroma_400Regular } from '@expo-google-fonts/michroma';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';

import { SplashIntro } from '@/components/brand/splash-intro';
import { ToastProvider } from '@/components/ui/toast';
import { BalanceVisibilityProvider } from '@/hooks/use-balance-visibility';
import { ThemeProvider, useThemeMode } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

// Comfortably past SplashIntro's own ~1.8s animation — this is a fallback
// only, in case its reanimated completion callback doesn't fire.
const SPLASH_INTRO_MAX_MS = 2400;

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

  // The native splash is hidden from SplashIntro's own mount effect below,
  // not here — see the comment on SplashIntro for why.
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <BalanceVisibilityProvider>
        <AppShell />
      </BalanceVisibilityProvider>
    </ThemeProvider>
  );
}
