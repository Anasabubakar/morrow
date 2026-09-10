import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { useBalanceVisibility } from '@/hooks/use-balance-visibility';

export type PrivateValueProps = ThemedTextProps & { value: string };

// Keep only the leading sign/currency symbol (e.g. "−₦", "+₦", "₦") and
// collapse everything else to a fixed run of 5 bullets — no digits, commas,
// or decimal point leak through. Bullets over asterisks: asterisks sit high
// in most fonts (built for superscript use) and look like they're floating
// above the baseline; bullets sit centered like real masked amounts.
function maskDigits(value: string) {
  const prefix = value.match(/^\D*/)?.[0] ?? '';
  return `${prefix}•••••`;
}

/** Renders `value`, or a digit-masked version of it while the global eye toggle is off. No blur — plain text swap. */
export function PrivateValue({ value, ...rest }: PrivateValueProps) {
  const { visible } = useBalanceVisibility();
  return <ThemedText {...rest}>{visible ? value : maskDigits(value)}</ThemedText>;
}
