import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBalanceVisibility } from '@/hooks/use-balance-visibility';
import { useThemeMode } from '@/hooks/use-theme';

/** Wraps a money amount so the global eye toggle can blur it — the real value still renders underneath, just obscured. */
export function PrivateValue({ children }: { children: ReactNode }) {
  const { visible } = useBalanceVisibility();
  const { resolvedMode } = useThemeMode();

  return (
    <View style={styles.wrap}>
      {children}
      {!visible && (
        <BlurView intensity={60} tint={resolvedMode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 6 },
});
