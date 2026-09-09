import { describe, expect, it } from 'vitest';
import { createPaymentRequest, deserializeRequest, randomId, serializeRequest, verifyPaymentRequest } from './protocol';
import { createOpticalStream, decodeFrame, encodeFrame, encodeFrames, OpticalReceiver } from './optical';

describe('Morrow Protocol', () => {
  it('creates portable cryptographically random identifiers', () => {
    const first = randomId('req');
    const second = randomId('req');

    expect(first).toMatch(/^req_[0-9a-f]{20}$/);
    expect(second).not.toBe(first);
  });

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

  it('emits an unbounded sequence of dense, independently valid frames', async () => {
    const request = await createPaymentRequest({ amountMinor: 250000, currency: 'NGN', note: 'Unlimited stream', merchantBmoniUserId: 'usr_test' });
    const stream = createOpticalStream(serializeRequest(request), request.id);
    const firstFrame = stream.frame(0);
    const secondFrame = stream.frame(1);
    const farFutureFrame = stream.frame(10000);

    expect(secondFrame.payload).not.toBe(firstFrame.payload);
    expect(farFutureFrame.seq).toBe(10000);
    expect(farFutureFrame.blockLen).toBe(2100);
    expect(decodeFrame(encodeFrame(farFutureFrame))).toEqual(farFutureFrame);
  });
});
