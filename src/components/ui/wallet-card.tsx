import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { MorrowSymbol } from '@/components/brand/morrow-symbol';
import { ThemedText } from '@/components/themed-text';
import { BalanceVisibilityToggle } from '@/components/ui/balance-visibility-toggle';
import { PressScale } from '@/components/ui/motion';
import { PrivateValue } from '@/components/ui/private-value';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { fitFontSize, formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

export type WalletCardProps = {
  label: string;
  balanceMinor: number | null;
  currency: Currency;
  mark?: string;
  details?: ReactNode;
};

const DARK_GRADIENT = ['#1C1C1E', '#000000'] as const;
const LIGHT_GRADIENT = ['#FFFFFF', '#EFEFF1'] as const;

/** Home balance display styled as an actual card, not a plain stat block. */
export function WalletCard({ label, balanceMinor, currency, mark = 'Morrow Wallet', details }: WalletCardProps) {
  const theme = useTheme();
  const { resolvedMode } = useThemeMode();
  const [showDetails, setShowDetails] = useState(false);
  const [displayMinor, setDisplayMinor] = useState(0);
  const previousBalanceRef = useRef(0);

  // setInterval rather than requestAnimationFrame: rAF is fully suspended in
  // backgrounded/hidden tabs in most browsers, which would leave the balance
  // stuck. setInterval keeps firing (just throttled), and since each tick
  // recomputes from wall-clock elapsed time, it self-corrects to the right
  // value even if ticks are dropped.
  useEffect(() => {
    if (balanceMinor === null) return;
    const from = previousBalanceRef.current;
    const to = balanceMinor;
    const durationMs = 700;
    const startedAt = Date.now();

    const interval = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplayMinor(from + (to - from) * eased);
      if (t >= 1) {
        previousBalanceRef.current = to;
        clearInterval(interval);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [balanceMinor]);

  const Container = details ? PressScale : View;
  const containerProps = details ? { onPress: () => setShowDetails(v => !v), haptic: true } : {};

  return (
    <Container style={styles.card} {...containerProps}>
      <LinearGradient
        colors={resolvedMode === 'dark' ? DARK_GRADIENT : LIGHT_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.gradient]}
      />
      <View style={styles.watermark} pointerEvents="none">
        <MorrowSymbol size={120} color={theme.text} />
      </View>

      {showDetails && details ? (
        <Animated.View key="details" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.face}>
          {details}
        </Animated.View>
      ) : (
        <Animated.View key="front" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.face}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {label}
          </ThemedText>
          {balanceMinor !== null ? (
            <View style={styles.balanceRow}>
              <View style={styles.balanceTextSlot}>
                <PrivateValue
                  type="title"
                  style={[styles.balance, { fontSize: fitFontSize(formatMoney(Math.round(displayMinor), currency), 34, 8, 16) }]}
                  numberOfLines={1}
                  value={formatMoney(Math.round(displayMinor), currency)}
                />
              </View>
              <BalanceVisibilityToggle />
            </View>
          ) : (
            <Skeleton width={150} height={32} borderRadius={8} style={{ backgroundColor: resolvedMode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(10,10,10,0.08)' }} />
          )}
          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {mark}
            </ThemedText>
          </View>
        </Animated.View>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 1.7,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  gradient: { opacity: 1 },
  watermark: { position: 'absolute', right: -20, bottom: -20, opacity: 0.06 },
  face: { flex: 1, padding: Spacing.four, justifyContent: 'space-between' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  balanceTextSlot: { flex: 1, minWidth: 0 },
  balance: { lineHeight: 40 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
});
