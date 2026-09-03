import { BmoniEmbeddedSdk, BmoniSignerError, BmoniSignerErrorCode } from '@bkey-inc/bmoni_embedded_sdk';

export { BmoniSignerError, BmoniSignerErrorCode };

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  BmoniEmbeddedSdk.initialize({ pinLength: 6, requirePin: true });
  initialized = true;
}

/** Returns this device's wallet address, provisioning a new wallet on first use. */
export async function ensureWallet(): Promise<string> {
  ensureInitialized();
  const existing = await BmoniEmbeddedSdk.walletAddress();
  if (existing) return existing;
  return BmoniEmbeddedSdk.initWallet();
}

/** Sets the device PIN if one isn't already set. No-op otherwise. */
export async function ensurePin(pin: string): Promise<void> {
  ensureInitialized();
  if (await BmoniEmbeddedSdk.hasPin()) return;
  await BmoniEmbeddedSdk.setPin(pin);
}

export function signMessage(message: string, pin: string): Promise<string> {
  ensureInitialized();
  return BmoniEmbeddedSdk.signMessage(message, pin);
}

export function signTransactionHash(hashHex: string, pin: string): Promise<string> {
  ensureInitialized();
  return BmoniEmbeddedSdk.signTransactionHash(hashHex, pin);
}
