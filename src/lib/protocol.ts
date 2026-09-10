import * as Crypto from 'expo-crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { Base64 } from 'js-base64';
import type { PaymentRequest } from './types';

export async function digest(value: string) {
  // Expo Web delegates digestStringAsync to WebCrypto, which browsers block
  // on LAN HTTP origins. Noble is the same audited SHA-256 primitive in pure
  // JavaScript, so optical integrity works offline and on every Expo target.
  return bytesToHex(sha256(utf8ToBytes(value)));
}

export function randomId(prefix: string) {
  // `crypto.randomUUID()` is absent in some Expo Web/embedded-browser
  // environments even though secure random bytes are available. Generate the
  // identifier directly from Expo Crypto so the same code works on web, iOS,
  // Android and Expo Go without falling back to Math.random.
  const randomBytes = Crypto.getRandomBytes(10);
  const randomHex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${randomHex}`;
}

export async function createPaymentRequest(input: {
  amountMinor: number;
  currency: PaymentRequest['currency'];
  note: string;
  merchantBmoniUserId: string;
}): Promise<PaymentRequest> {
  const now = Date.now();
  const base = {
    version: 1 as const,
    type: 'payment.request' as const,
    id: randomId('req'),
    merchant: { id: 'mer_morrow_demo', name: 'North & Pine', account: '•••• 2048', bmoniUserId: input.merchantBmoniUserId },
    amountMinor: input.amountMinor,
    currency: input.currency,
    note: input.note.trim() || 'Payment',
    nonce: randomId('n'),
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
  };
  return { ...base, checksum: await digest(JSON.stringify(base)) };
}

export async function verifyPaymentRequest(request: PaymentRequest) {
  const { checksum, ...base } = request;
  if (request.version !== 1 || request.type !== 'payment.request') return false;
  if (request.expiresAt <= Date.now()) return false;
  return checksum === await digest(JSON.stringify(base));
}

export function serializeRequest(request: PaymentRequest) {
  return Base64.encode(JSON.stringify(request));
}

export function deserializeRequest(payload: string): PaymentRequest {
  return JSON.parse(Base64.decode(payload)) as PaymentRequest;
}
