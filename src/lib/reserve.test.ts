import { beforeEach, describe, expect, it } from 'vitest';

import { clearReserve, createReserve, getActiveReserve, spendFromReserve, verifyOfflineAuthorization } from './reserve';

describe('Morrow Reserve', () => {
  beforeEach(async () => {
    await clearReserve();
  });

  it('provisions a signed allowance', async () => {
    const state = await createReserve({ valueMinor: 2000000, currency: 'NGN', validForMs: 60_000 });
    expect(state.allowance.valueMinor).toBe(2000000);
    expect(state.spentMinor).toBe(0);
    expect(state.allowance.issuerSignature.length).toBeGreaterThan(0);
    expect(await getActiveReserve()).not.toBeNull();
  });

  it('spends from the reserve and decrements the remaining balance', async () => {
    await createReserve({ valueMinor: 2000000, currency: 'NGN', validForMs: 60_000 });
    const auth = await spendFromReserve({ recipientRequestId: 'req_1', recipientName: 'Café Neo', amountMinor: 350000 });
    expect(auth.sequence).toBe(1);
    expect(auth.remainingMinor).toBe(1650000);

    const state = await getActiveReserve();
    expect(state?.spentMinor).toBe(350000);
    expect(state?.counter).toBe(1);
  });

  it('rejects spending more than what remains', async () => {
    await createReserve({ valueMinor: 100000, currency: 'NGN', validForMs: 60_000 });
    await expect(spendFromReserve({ recipientRequestId: 'req_1', recipientName: 'Café Neo', amountMinor: 200000 })).rejects.toThrow();
  });

  it('verifies a genuine authorization against its embedded public key', async () => {
    await createReserve({ valueMinor: 2000000, currency: 'NGN', validForMs: 60_000 });
    const auth = await spendFromReserve({ recipientRequestId: 'req_1', recipientName: 'Café Neo', amountMinor: 350000 });
    const verdict = await verifyOfflineAuthorization(auth, 'req_1');
    expect(verdict.valid).toBe(true);
  });

  it('rejects a tampered authorization', async () => {
    await createReserve({ valueMinor: 2000000, currency: 'NGN', validForMs: 60_000 });
    const auth = await spendFromReserve({ recipientRequestId: 'req_1', recipientName: 'Café Neo', amountMinor: 350000 });
    const tampered = { ...auth, amountMinor: 999999 };
    const verdict = await verifyOfflineAuthorization(tampered, 'req_1');
    expect(verdict.valid).toBe(false);
  });

  it('rejects an authorization bound to a different request', async () => {
    await createReserve({ valueMinor: 2000000, currency: 'NGN', validForMs: 60_000 });
    const auth = await spendFromReserve({ recipientRequestId: 'req_1', recipientName: 'Café Neo', amountMinor: 350000 });
    const verdict = await verifyOfflineAuthorization(auth, 'req_2');
    expect(verdict.valid).toBe(false);
  });

  it('rejects an expired allowance', async () => {
    await createReserve({ valueMinor: 2000000, currency: 'NGN', validForMs: -1 });
    expect(await getActiveReserve()).toBeNull();
  });
});
