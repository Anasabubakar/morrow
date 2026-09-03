import * as Crypto from 'expo-crypto';
import { Base64 } from 'js-base64';
import type { PaymentRequest } from './types';

export async function digest(value: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export function randomId(prefix: string) {
  return `${prefix}_${Crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
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
    merchant: { id: 'mer_morrow_demo', name: 'North & Pine', account: 'BMONI • 2048', bmoniUserId: input.merchantBmoniUserId },
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
