import { Base64 } from 'js-base64';
import type { OpticalFrame } from './types';
import { LTDecoder, LTEncoder } from '../vendor/decimen/fountain';

const BLOCK_SIZE = 120;

function checksum(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function numericSessionId(value: string) {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) result = (Math.imul(result, 31) + value.charCodeAt(i)) & 0xffff;
  return result;
}

// `serialized` is always a base64 string (protocol.ts), so it is pure ASCII —
// a direct char-code mapping is a correct, dependency-free byte view of it.
function asciiToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i);
  return bytes;
}

function bytesToAscii(bytes: Uint8Array) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]!);
  return out;
}

/** Builds a rolling demo window; a physical sender can continue encode(seq) indefinitely. */
export function encodeFrames(serialized: string, requestId: string): OpticalFrame[] {
  const bytes = asciiToBytes(serialized);
  const sessionId = numericSessionId(requestId);
  const encoder = new LTEncoder(bytes, BLOCK_SIZE, sessionId);
  const count = Math.max(encoder.k * 3, 12);
  return Array.from({ length: count }, (_, seq) => {
    const payload = Base64.fromUint8Array(encoder.encode(seq));
    return { v: 1 as const, sessionId, seq, k: encoder.k, blockLen: BLOCK_SIZE, totalLen: bytes.length, payload, checksum: checksum(payload) };
  });
}

export function encodeFrame(frame: OpticalFrame) {
  return `morrow:${Base64.encode(JSON.stringify(frame))}`;
}

export function decodeFrame(raw: string): OpticalFrame {
  if (!raw.startsWith('morrow:')) throw new Error('Not a Morrow optical frame.');
  const frame = JSON.parse(Base64.decode(raw.slice(7))) as OpticalFrame;
  if (frame.v !== 1 || checksum(frame.payload) !== frame.checksum) throw new Error('Frame integrity check failed.');
  return frame;
}

export class OpticalReceiver {
  private decoder: LTDecoder | null = null;
  private identity = '';

  add(frame: OpticalFrame) {
    const identity = `${frame.sessionId}:${frame.k}:${frame.blockLen}:${frame.totalLen}`;
    if (this.identity && identity !== this.identity) throw new Error('A different optical session was detected.');
    if (!this.decoder) {
      this.identity = identity;
      this.decoder = new LTDecoder(frame.k, frame.blockLen, frame.sessionId, frame.totalLen);
    }
    this.decoder.addFrame(frame.seq, Base64.toUint8Array(frame.payload));
    return { received: this.decoder.framesNew, total: Math.ceil(frame.k * 1.15), complete: this.decoder.isComplete };
  }

  result() {
    const result = this.decoder?.assemble();
    if (!result) throw new Error('The fountain payload is incomplete.');
    return bytesToAscii(result);
  }
}
