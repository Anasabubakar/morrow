import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SettlementReceipt } from './types';

const STORAGE_KEY = 'morrow.receipt-history.v1';

export async function listReceipts(): Promise<SettlementReceipt[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return JSON.parse(raw ?? '[]') as SettlementReceipt[];
  } catch {
    return [];
  }
}

export async function saveReceipt(receipt: SettlementReceipt) {
  const current = await listReceipts();
  const next = [receipt, ...current.filter(item => item.id !== receipt.id)].slice(0, 50);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
