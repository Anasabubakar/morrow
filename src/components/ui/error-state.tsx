import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

/** Consistent inline error banner — replaces bare danger-colored text across screens. */
export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}
      accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Ionicons name="alert-circle" size={20} color={theme.danger} />
        <ThemedText type="small" style={styles.message}>
          {message}
        </ThemedText>
      </View>
      {onRetry && <Button label={retryLabel} variant="ghost" onPress={onRetry} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  message: { flex: 1 },
});
