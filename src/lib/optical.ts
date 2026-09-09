import { Base64 } from 'js-base64';
import type { OpticalFrame } from './types';
import { LTDecoder, LTEncoder } from '../vendor/decimen/fountain';

// Sized to produce a dense, high-capacity QR while leaving headroom for the
// JSON envelope and its outer base64 encoding. Decimen can push larger binary
// frames in the browser; Morrow's React Native QR renderer accepts text, so
// 2100 bytes keeps the complete compact wire frame just under QR version 40's
// byte-mode capacity at error-correction L. That gives Morrow the same dense,
// alive optical texture as Decimen without producing an invalid matrix.
const BLOCK_SIZE = 2100;

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

/**
 * XORs a frame with a deterministic byte stream keyed by its session and
 * sequence. Applying it twice restores the original bytes. This is visual
 * whitening, not encryption: it makes even a one-block payment payload produce
 * a completely fresh optical matrix on every frame, like Decimen's file stream.
 */
function whiten(bytes: Uint8Array, sessionId: number, sequence: number) {
  const result = new Uint8Array(bytes.length);
  let state = (sessionId ^ Math.imul(sequence + 1, 0x9e3779b1)) >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result[index] = bytes[index]! ^ (state & 0xff);
  }
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
  const stream = createOpticalStream(serialized, requestId);
  const count = Math.max(stream.requiredFrames * 3, 12);
  return Array.from({ length: count }, (_, seq) => stream.frame(seq));
}

/**
 * Creates an unbounded fountain stream. Unlike encodeFrames' finite test
 * window, the UI can request monotonically increasing sequence numbers for as
 * long as the broadcast remains open—dropped frames never require a restart.
 */
export function createOpticalStream(serialized: string, requestId: string) {
  const bytes = asciiToBytes(serialized);
  const sessionId = numericSessionId(requestId);
  const encoder = new LTEncoder(bytes, BLOCK_SIZE, sessionId);
  const frame = (seq: number): OpticalFrame => {
    const payload = Base64.fromUint8Array(whiten(encoder.encode(seq), sessionId, seq));
    return { v: 1 as const, w: 1 as const, sessionId, seq, k: encoder.k, blockLen: BLOCK_SIZE, totalLen: bytes.length, payload, checksum: checksum(payload) };
  };
  return { frame, requiredFrames: encoder.k, blockSize: BLOCK_SIZE };
}

export function encodeFrame(frame: OpticalFrame) {
  // v2 removes the redundant outer base64 layer. The payload itself remains
  // base64-safe; sending the JSON envelope directly buys ~25% more useful QR
  // capacity and produces the dense matrix seen in Decimen's live stream.
  return `morrow:2:${JSON.stringify(frame)}`;
}

export function decodeFrame(raw: string): OpticalFrame {
  if (!raw.startsWith('morrow:')) throw new Error('Not a Morrow optical frame.');
  const frame = raw.startsWith('morrow:2:')
    ? (JSON.parse(raw.slice(9)) as OpticalFrame)
    : (JSON.parse(Base64.decode(raw.slice(7))) as OpticalFrame);
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
    const payload = Base64.toUint8Array(frame.payload);
    this.decoder.addFrame(frame.seq, frame.w === 1 ? whiten(payload, frame.sessionId, frame.seq) : payload);
    return { received: this.decoder.framesNew, total: Math.ceil(frame.k * 1.15), complete: this.decoder.isComplete };
  }

  result() {
    const result = this.decoder?.assemble();
    if (!result) throw new Error('The fountain payload is incomplete.');
    return bytesToAscii(result);
  }
}
