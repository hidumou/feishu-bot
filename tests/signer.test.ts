import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { currentTimestamp, genSign } from '../src/signer.js';

describe('genSign', () => {
  it('matches pre-computed fixed vector (key=stringToSign, data="")', () => {
    // 预计算：
    //   createHmac('sha256', '1609459200\ntest-secret').update('').digest('base64')
    //   => 'IJ7Pt6eu2c5vM3gkse4crVb6MwgNFSqbEX+fqcT5kX8='
    expect(genSign(1609459200, 'test-secret')).toBe(
      'IJ7Pt6eu2c5vM3gkse4crVb6MwgNFSqbEX+fqcT5kX8=',
    );
  });

  it('accepts timestamp as string (same result as number)', () => {
    expect(genSign('1609459200', 'test-secret')).toBe(
      genSign(1609459200, 'test-secret'),
    );
  });

  it('uses stringToSign as HMAC key and empty string as data', () => {
    // 独立复现飞书文档算法作为对照
    const timestamp = 1700000000;
    const secret = 'another-secret';
    const stringToSign = `${timestamp}\n${secret}`;
    const reference = createHmac('sha256', stringToSign)
      .update('')
      .digest('base64');

    expect(genSign(timestamp, secret)).toBe(reference);
  });

  it('produces different output for different secrets', () => {
    const ts = 1609459200;
    expect(genSign(ts, 'a')).not.toBe(genSign(ts, 'b'));
  });

  it('produces different output for different timestamps', () => {
    expect(genSign(1609459200, 'k')).not.toBe(genSign(1609459201, 'k'));
  });

  it('outputs base64 (A-Z a-z 0-9 + / =)', () => {
    const sig = genSign(1609459200, 'test-secret');
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('currentTimestamp', () => {
  it('returns an integer (Unix seconds)', () => {
    const ts = currentTimestamp();
    expect(Number.isInteger(ts)).toBe(true);
  });

  it('roughly matches Date.now()/1000', () => {
    const ts = currentTimestamp();
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(now - ts)).toBeLessThanOrEqual(1);
  });
});
