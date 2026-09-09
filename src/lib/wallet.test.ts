import { beforeEach, describe, expect, it } from 'vitest';

import { credit, deduct, getBalance, resetBalance } from './wallet';

describe('Wallet', () => {
  beforeEach(async () => {
    await resetBalance();
  });

  it('starts with a seeded balance', async () => {
    expect(await getBalance()).toBe(48200000);
  });

  it('deducts and persists the new balance', async () => {
    const next = await deduct(350000);
    expect(next).toBe(48200000 - 350000);
    expect(await getBalance()).toBe(48200000 - 350000);
  });

  it('credits and persists the new balance', async () => {
    const next = await credit(500000);
    expect(next).toBe(48200000 + 500000);
    expect(await getBalance()).toBe(48200000 + 500000);
  });

  it('rejects a deduction larger than the current balance', async () => {
    await expect(deduct(999999999)).rejects.toThrow('Insufficient balance');
    expect(await getBalance()).toBe(48200000);
  });

  it('serializes concurrent deductions instead of losing one to a race', async () => {
    await Promise.all([deduct(100000), deduct(100000), deduct(100000)]);
    expect(await getBalance()).toBe(48200000 - 300000);
  });

  it('serializes a concurrent mix of deducts and credits', async () => {
    await Promise.all([deduct(200000), credit(50000), deduct(200000)]);
    expect(await getBalance()).toBe(48200000 - 200000 + 50000 - 200000);
  });
});
