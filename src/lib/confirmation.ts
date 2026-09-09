import { Base64 } from 'js-base64';

import { getDevicePublicKey, signCanonical, verifyCanonical } from './deviceKeys';
import { randomId } from './protocol';
import { markProcessed, wasProcessed } from './replay';
import { markRedeemed, verifyOfflineAuthorization } from './reserve';
import type { Currency, OfflineAuthorization, PaymentConfirmation, PaymentRequest } from './types';

export function serializeConfirmation(confirmation: PaymentConfirmation) {
  return Base64.encode(JSON.stringify(confirmation));
}

export function deserializeConfirmation(payload: string): PaymentConfirmation {
  return JSON.parse(Base64.decode(payload)) as PaymentConfirmation;
}

// Canonical field order — used identically when signing and when verifying.
function confirmationFields(c: Omit<PaymentConfirmation, 'signature'>) {
  return {
    version: c.version,
    type: c.type,
    requestId: c.requestId,
    amountMinor: c.amountMinor,
    currency: c.currency,
    payerLabel: c.payerLabel,
    settlementReference: c.settlementReference,
    confirmedAt: c.confirmedAt,
    nonce: c.nonce,
    signerPublicKey: c.signerPublicKey,
  };
}

export async function createPaymentConfirmation(input: {
  requestId: string;
  amountMinor: number;
  currency: Currency;
  payerLabel: string;
  settlementReference: string;
  offlineAuthorization?: OfflineAuthorization;
}): Promise<PaymentConfirmation> {
  const base = {
    version: 1 as const,
    type: 'payment.confirmation' as const,
    requestId: input.requestId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    payerLabel: input.payerLabel,
    settlementReference: input.settlementReference,
    confirmedAt: Date.now(),
    nonce: randomId('n'),
    signerPublicKey: await getDevicePublicKey(),
  };
  const { signature } = await signCanonical(confirmationFields(base));
  return { ...base, signature, offlineAuthorization: input.offlineAuthorization };
}

export type ConfirmationVerdict = { valid: boolean; reason?: string };

/**
 * Verifies a PaymentConfirmation against the specific request it should be
 * settling: right request, right amount, genuine signature, not already
 * credited on this device. For BMONI-settled payments that's the full
 * story — settlement truth lives with BMONI, not something this device can
 * independently confirm. For Reserve-funded payments (offlineAuthorization
 * present), this additionally verifies the embedded OfflineAuthorization
 * itself — its own signature, its binding to this request, and that this
 * exact (allowanceId, sequence) hasn't been redeemed on this device before —
 * so the receiver is verifying the actual signed spend, not just trusting a
 * same-shaped confirmation wrapping it.
 */
export async function verifyPaymentConfirmation(
  confirmation: PaymentConfirmation,
  expectedRequest: PaymentRequest
): Promise<ConfirmationVerdict> {
  if (confirmation.version !== 1 || confirmation.type !== 'payment.confirmation') {
    return { valid: false, reason: 'Unrecognized confirmation format.' };
  }
  if (confirmation.requestId !== expectedRequest.id) {
    return { valid: false, reason: 'This confirmation is for a different request.' };
  }
  if (confirmation.amountMinor !== expectedRequest.amountMinor || confirmation.currency !== expectedRequest.currency) {
    return { valid: false, reason: 'The confirmed amount does not match this request.' };
  }
  if (!verifyCanonical(confirmationFields(confirmation), confirmation.signature, confirmation.signerPublicKey)) {
    return { valid: false, reason: 'Signature does not match — the confirmation was altered or forged.' };
  }
  if (await wasProcessed(`confirmation:${confirmation.requestId}`)) {
    return { valid: false, reason: 'A confirmation for this request has already been credited.' };
  }
  const auth = confirmation.offlineAuthorization;
  if (auth) {
    if (auth.amountMinor !== confirmation.amountMinor || auth.currency !== confirmation.currency) {
      return { valid: false, reason: 'The offline authorization amount does not match the confirmation.' };
    }
    const authVerdict = await verifyOfflineAuthorization(auth, expectedRequest.id);
    if (!authVerdict.valid) return authVerdict;
  }
  return { valid: true };
}

export async function markConfirmationRedeemed(confirmation: PaymentConfirmation) {
  await markProcessed(`confirmation:${confirmation.requestId}`);
  if (confirmation.offlineAuthorization) {
    await markRedeemed(confirmation.offlineAuthorization.allowanceId, confirmation.offlineAuthorization.sequence);
  }
}
