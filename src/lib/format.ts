import type { Currency } from './types';

export function formatMoney(amountMinor: number, currency: Currency) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amountMinor / 100);
}

/**
 * Font size for a money string that must always show in full — never an
 * ellipsis, the way a real banking app never truncates your balance.
 * `adjustsFontSizeToFit` alone isn't reliable across platforms (notably
 * unsupported on web), so this computes the shrink directly from string
 * length as the primary mechanism; `numberOfLines`/`adjustsFontSizeToFit`
 * stay on the text as a defensive fallback, not the main guarantee.
 */
export function fitFontSize(text: string, base: number, comfortableChars: number, min: number) {
  if (text.length <= comfortableChars) return base;
  return Math.max(min, Math.round(base * (comfortableChars / text.length)));
}
