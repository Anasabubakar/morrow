import type { Currency } from './types';

export function formatMoney(amountMinor: number, currency: Currency) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amountMinor / 100);
}
