import { describe, expect, it } from 'vitest';
import { createPaymentRequest, deserializeRequest, serializeRequest, verifyPaymentRequest } from './protocol';
import { encodeFrames, OpticalReceiver } from './optical';

describe('Morrow Protocol', () => {
  it('round-trips and verifies a request', async () => {
    const request = await createPaymentRequest({ amountMinor: 250000, currency: 'NGN', note: 'Invoice 1', merchantBmoniUserId: 'usr_test' });
    const restored = deserializeRequest(serializeRequest(request));
    expect(restored).toEqual(request);
    expect(await verifyPaymentRequest(restored)).toBe(true);
  });

  it('rejects a modified request', async () => {
    const request = await createPaymentRequest({ amountMinor: 250000, currency: 'NGN', note: 'Invoice 1', merchantBmoniUserId: 'usr_test' });
    expect(await verifyPaymentRequest({ ...request, amountMinor: 1 })).toBe(false);
  });

  it('reconstructs optical frames out of order and ignores duplicates', async () => {
    const request = await createPaymentRequest({ amountMinor: 250000, currency: 'NGN', note: 'A long optical request', merchantBmoniUserId: 'usr_test' });
    const payload = serializeRequest(request);
    const frames = encodeFrames(payload, request.id);
    const receiver = new OpticalReceiver();
    [...frames].reverse().concat(frames[0]).forEach(frame => receiver.add(frame));
    expect(receiver.result()).toBe(payload);
  });
});
