import { describe, expect, it } from 'vitest';

import { createPaymentConfirmation, deserializeConfirmation, markConfirmationRedeemed, serializeConfirmation, verifyPaymentConfirmation } from './confirmation';
import type { PaymentRequest } from './types';

const request: PaymentRequest = {
  version: 1,
  type: 'payment.request',
  id: 'req_test_1',
  merchant: { id: 'mer_1', name: 'Café Neo', account: 'BMONI • 1234', bmoniUserId: 'usr_1' },
  amountMinor: 350000,
  currency: 'NGN',
  note: 'Invoice',
  nonce: 'n_1',
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  checksum: 'irrelevant-for-this-test',
};

async function confirmFor(req: PaymentRequest) {
  return createPaymentConfirmation({
    requestId: req.id,
    amountMinor: req.amountMinor,
    currency: req.currency,
    payerLabel: 'Test payer',
    settlementReference: 'MRW-TEST',
  });
}

describe('Payment confirmation', () => {
  it('verifies a genuine confirmation against the matching request', async () => {
    const confirmation = await confirmFor(request);
    const verdict = await verifyPaymentConfirmation(confirmation, request);
    expect(verdict.valid).toBe(true);
  });

  it('round-trips through optical serialization', async () => {
    const confirmation = await confirmFor(request);
    const restored = deserializeConfirmation(serializeConfirmation(confirmation));
    expect(restored).toEqual(confirmation);
    expect((await verifyPaymentConfirmation(restored, request)).valid).toBe(true);
  });

  it('rejects a confirmation for a different request', async () => {
    const confirmation = await confirmFor(request);
    const otherRequest = { ...request, id: 'req_other' };
    const verdict = await verifyPaymentConfirmation(confirmation, otherRequest);
    expect(verdict.valid).toBe(false);
  });

  it('rejects a confirmation with a tampered amount', async () => {
    const confirmation = await confirmFor(request);
    const tampered = { ...confirmation, amountMinor: 1 };
    const verdict = await verifyPaymentConfirmation(tampered, request);
    expect(verdict.valid).toBe(false);
  });

  it('rejects a confirmation with a mismatched amount against the request', async () => {
    const confirmation = await confirmFor(request);
    const differentAmountRequest = { ...request, amountMinor: 999 };
    const verdict = await verifyPaymentConfirmation(confirmation, differentAmountRequest);
    expect(verdict.valid).toBe(false);
  });

  it('rejects a confirmation already marked redeemed for that request', async () => {
    const uniqueRequest = { ...request, id: 'req_redeem_test' };
    const confirmation = await confirmFor(uniqueRequest);
    await markConfirmationRedeemed(uniqueRequest.id);
    const verdict = await verifyPaymentConfirmation(confirmation, uniqueRequest);
    expect(verdict.valid).toBe(false);
  });
});
