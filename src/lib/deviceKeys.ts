import AsyncStorage from '@react-native-async-storage/async-storage';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as Crypto from 'expo-crypto';
import { Base64 } from 'js-base64';

// Morrow's own device keypair — separate from BMONI's wallet key. Used to
// sign both Reserve allowances/authorizations and payment confirmations.
// Ed25519 via @noble/curves, a pure-JS implementation with no native module
// dependency, so it works in Expo Go and doesn't need the BMONI dev client.
// Key generation needs a real random seed; noble's own randomPrivateKey()
// pulls from `crypto.getRandomValues`, which isn't guaranteed present in
// Hermes, so the seed is sourced directly from expo-crypto instead — signing
// itself is deterministic and needs no randomness at call time.
const STORAGE_KEY = 'morrow.device-key.v1';

let cached: { privateKey: Uint8Array; publicKey: Uint8Array } | null = null;

export async function getDeviceKeypair() {
  if (cached) return cached;

  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    const privateKey = Base64.toUint8Array(stored);
    cached = { privateKey, publicKey: ed25519.getPublicKey(privateKey) };
    return cached;
  }

  const seed = await Crypto.getRandomBytesAsync(32);
  const privateKey = new Uint8Array(seed);
  await AsyncStorage.setItem(STORAGE_KEY, Base64.fromUint8Array(privateKey));
  cached = { privateKey, publicKey: ed25519.getPublicKey(privateKey) };
  return cached;
}

export async function getDevicePublicKey(): Promise<string> {
  const { publicKey } = await getDeviceKeypair();
  return Base64.fromUint8Array(publicKey);
}

export async function signCanonical(value: unknown): Promise<{ signature: string; publicKey: string }> {
  const { privateKey, publicKey } = await getDeviceKeypair();
  const message = new TextEncoder().encode(JSON.stringify(value));
  const signature = ed25519.sign(message, privateKey);
  return { signature: Base64.fromUint8Array(signature), publicKey: Base64.fromUint8Array(publicKey) };
}

export function verifyCanonical(value: unknown, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const message = new TextEncoder().encode(JSON.stringify(value));
    return ed25519.verify(Base64.toUint8Array(signatureB64), message, Base64.toUint8Array(publicKeyB64));
  } catch {
    return false;
  }
}
