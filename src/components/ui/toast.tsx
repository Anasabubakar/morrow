import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ToastVariant = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; variant: ToastVariant; durationMs: number };
type ShowToastOptions = { message: string; variant?: ToastVariant; durationMs?: number };

type ToastContextValue = { showToast: (options: ShowToastOptions) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = queue[0] ?? null;

  const showToast = useCallback(({ message, variant = 'info', durationMs = 3000 }: ShowToastOptions) => {
    setQueue(q => [...q, { id: nextToastId++, message, variant, durationMs }]);
  }, []);

  const dismissCurrent = useCallback(() => setQueue(q => q.slice(1)), []);

  useEffect(() => {
    if (!current) return;
    dismissTimer.current = setTimeout(dismissCurrent, current.durationMs);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [current, dismissCurrent]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {current && <ToastBanner key={current.id} toast={current} onDismiss={dismissCurrent} />}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const ICONS: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

function ToastBanner({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const iconColor = toast.variant === 'success' ? theme.positive : toast.variant === 'error' ? theme.danger : theme.text;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.wrapper, { top: insets.top + Spacing.two }]}
      pointerEvents="box-none">
      <Pressable
        onPress={onDismiss}
        style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityRole="alert">
        <Ionicons name={ICONS[toast.variant]} size={20} color={iconColor} />
        <ThemedText type="smallBold" style={styles.message}>
          {toast.message}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 420,
    width: '92%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  message: { flex: 1 },
});
