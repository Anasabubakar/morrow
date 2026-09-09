import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ViewProps & { scroll?: boolean; backgroundColor?: string };

export function Screen({ scroll = true, backgroundColor, style, children, ...rest }: ScreenProps) {
  const theme = useTheme();
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll ? { contentContainerStyle: styles.content } : { style: styles.content };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundColor ?? theme.background }]} edges={['top', 'left', 'right']}>
      <Container {...containerProps} {...rest}>
        <View style={[styles.inner, style]}>{children}</View>
      </Container>
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: BottomTabInset + Spacing.four },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  card: { borderRadius: 20, borderWidth: 1, padding: Spacing.four, gap: Spacing.three },
});
