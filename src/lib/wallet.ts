import AsyncStorage from '@react-native-async-storage/async-storage';

// A real, persisted, per-device balance — this is what makes Send/Receive a
// genuine two-device simulation rather than a scripted animation. It is not
// connected to BMONI or any shared backend: each device's balance only moves
// when that device's own code calls deduct()/credit(), driven by the signed
// PaymentConfirmation exchanged over Morrow Optical. See docs/ARCHITECTURE.md.
const STORAGE_KEY = 'morrow.wallet-balance.v1';
const STARTING_BALANCE_MINOR = 48200000; // ₦482,000.00, matches the original demo balance

export async function getBalance(): Promise<number> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    await AsyncStorage.setItem(STORAGE_KEY, String(STARTING_BALANCE_MINOR));
    return STARTING_BALANCE_MINOR;
  }
  return Number(stored);
}

export async function deduct(amountMinor: number): Promise<number> {
  const current = await getBalance();
  if (amountMinor > current) throw new Error('Insufficient balance for this payment.');
  const next = current - amountMinor;
  await AsyncStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

export async function credit(amountMinor: number): Promise<number> {
  const current = await getBalance();
  const next = current + amountMinor;
  await AsyncStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

/** Test/demo only — resets this device's balance back to the starting amount. */
export async function resetBalance(): Promise<number> {
  await AsyncStorage.setItem(STORAGE_KEY, String(STARTING_BALANCE_MINOR));
  return STARTING_BALANCE_MINOR;
}
