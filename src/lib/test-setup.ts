import { vi } from 'vitest';

const memoryStore = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => memoryStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: async (key: string) => {
      memoryStore.delete(key);
    },
  },
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, data: string) => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  },
  randomUUID: () => crypto.randomUUID(),
  getRandomBytesAsync: async (length: number) => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  },
}));
