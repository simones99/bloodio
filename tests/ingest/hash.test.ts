import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/ingest/hash';

describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex', async () => {
    const abc = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    expect(await sha256Hex(abc)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('gives different hashes to different files', async () => {
    const a = await sha256Hex(new Uint8Array([1]).buffer);
    const b = await sha256Hex(new Uint8Array([2]).buffer);
    expect(a).not.toBe(b);
  });
});
