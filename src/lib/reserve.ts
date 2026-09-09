import AsyncStorage from '@react-native-async-storage/async-storage';

import { digest, randomId } from './protocol';
import { getDevicePublicKey, signCanonical, verifyCanonical } from './deviceKeys';
import { credit } from './wallet';
import type { Currency, OfflineAuthorization, ReserveAllowance, ReserveState } from './types';

const STORAGE_KEY = 'morrow.reserve-state.v1';
const REDEEMED_KEY = 'morrow.reserve-redeemed.v1';

// Canonical field order — used identically when signing and when verifying.
// Must not change without a protocol version bump (`version` field).
function allowanceFields(a: Omit<ReserveAllowance, 'issuerSignature'>) {
  return { version: a.version, allowanceId: a.allowanceId, currency: a.currency, valueMinor: a.valueMinor, issuerPublicKey: a.issuerPublicKey, expiresAt: a.expiresAt, createdAt: a.createdAt };
}

function authFields(a: Omit<OfflineAuthorization, 'signature'>) {
  return {
    version: a.version,
    type: a.type,
    allowanceId: a.allowanceId,
    sequence: a.sequence,
    recipientRequestId: a.recipientRequestId,
    recipientName: a.recipientName,
    amountMinor: a.amountMinor,
    currency: a.currency,
    remainingMinor: a.remainingMinor,
    previousStateHash: a.previousStateHash,
    nonce: a.nonce,
    timestamp: a.timestamp,
    issuerPublicKey: a.issuerPublicKey,
  };
}

export async function getActiveReserve(): Promise<ReserveState | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  const state = JSON.parse(stored) as ReserveState;
  if (state.allowance.expiresAt <= Date.now()) {
    // An expired reserve otherwise just forfeits whatever was never spent —
    // release it back to the wallet before clearing the allowance.
    const unspent = state.allowance.valueMinor - state.spentMinor;
    if (unspent > 0) await credit(unspent);
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return state;
}

export async function createReserve(input: { valueMinor: number; currency: Currency; validForMs: number }): Promise<ReserveState> {
  const now = Date.now();
  const base = {
    version: 1 as const,
    allowanceId: randomId('rsv'),
    currency: input.currency,
    valueMinor: input.valueMinor,
    issuerPublicKey: '',
    expiresAt: now + input.validForMs,
    createdAt: now,
  };
  // issuerPublicKey is part of what gets signed, so resolve it first.
  base.issuerPublicKey = await getDevicePublicKey();
  const { signature } = await signCanonical(allowanceFields(base));

  const allowance: ReserveAllowance = { ...base, issuerSignature: signature };
  const stateHash = await digest(JSON.stringify(allowanceFields(base)));
  const state: ReserveState = { allowance, spentMinor: 0, counter: 0, lastStateHash: stateHash };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export async function clearReserve() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function clearRedemptionGuard() {
  await AsyncStorage.removeItem(REDEEMED_KEY);
}

// getActiveReserve() + setItem() is a read-modify-write on the same counter
// and spentMinor fields — two concurrent calls (a double-tap on "pay from
// Reserve") would both read the same sequence number and race the write,
// producing two validly-signed authorizations sharing one sequence. This
// queue serializes spends so that can't happen.
let spendQueue: Promise<unknown> = Promise.resolve();

export function spendFromReserve(input: {
  recipientRequestId: string;
  recipientName: string;
  amountMinor: number;
}): Promise<OfflineAuthorization> {
  const run = async () => {
    const state = await getActiveReserve();
    if (!state) throw new Error('No active Morrow Reserve on this device.');
    const remaining = state.allowance.valueMinor - state.spentMinor;
    if (input.amountMinor > remaining) throw new Error('This payment exceeds what remains in your Morrow Reserve.');

    const sequence = state.counter + 1;
    const remainingMinor = remaining - input.amountMinor;
    const base = {
      version: 1 as const,
      type: 'reserve.authorization' as const,
      allowanceId: state.allowance.allowanceId,
      sequence,
      recipientRequestId: input.recipientRequestId,
      recipientName: input.recipientName,
      amountMinor: input.amountMinor,
      currency: state.allowance.currency,
      remainingMinor,
      previousStateHash: state.lastStateHash,
      nonce: randomId('n'),
      timestamp: Date.now(),
      issuerPublicKey: state.allowance.issuerPublicKey,
    };
    const { signature } = await signCanonical(authFields(base));
    const authorization: OfflineAuthorization = { ...base, signature };

    const nextState: ReserveState = {
      allowance: state.allowance,
      spentMinor: state.spentMinor + input.amountMinor,
      counter: sequence,
      lastStateHash: await digest(JSON.stringify(authFields(base))),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return authorization;
  };
  const next = spendQueue.then(run, run);
  spendQueue = next.catch(() => {});
  return next;
}

export type AuthorizationVerdict = { valid: boolean; reason?: string };

/**
 * Verifies an OfflineAuthorization independent of any shared secret — only
 * the signature, the embedded issuer public key, and the recipient binding.
 * Does NOT check double-spend against the issuer's live allowance state
 * (impossible while offline by construction); the replay guard below only
 * catches a given (allowanceId, sequence) being redeemed twice on THIS
 * device. Full double-spend prevention requires online reconciliation at
 * redemption time — see docs/RESERVE.md.
 */
export async function verifyOfflineAuthorization(
  auth: OfflineAuthorization,
  expectedRequestId: string
): Promise<AuthorizationVerdict> {
  if (auth.version !== 1 || auth.type !== 'reserve.authorization') return { valid: false, reason: 'Unrecognized authorization format.' };
  if (auth.recipientRequestId !== expectedRequestId) return { valid: false, reason: 'This authorization was not issued for this request.' };
  if (!verifyCanonical(authFields(auth), auth.signature, auth.issuerPublicKey)) {
    return { valid: false, reason: 'Signature does not match — the authorization was altered or forged.' };
  }
  if (await wasRedeemed(auth.allowanceId, auth.sequence)) {
    return { valid: false, reason: 'This authorization has already been redeemed on this device.' };
  }
  return { valid: true };
}

async function wasRedeemed(allowanceId: string, sequence: number) {
  const key = `${allowanceId}:${sequence}`;
  const raw = await AsyncStorage.getItem(REDEEMED_KEY);
  const seen: string[] = raw ? JSON.parse(raw) : [];
  return seen.includes(key);
}

export async function markRedeemed(allowanceId: string, sequence: number) {
  const key = `${allowanceId}:${sequence}`;
  const raw = await AsyncStorage.getItem(REDEEMED_KEY);
  const seen: string[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(REDEEMED_KEY, JSON.stringify([key, ...seen.filter(k => k !== key)].slice(0, 200)));
}
