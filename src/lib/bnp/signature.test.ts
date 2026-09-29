import { describe, it, expect } from 'vitest';
import { signBnpPayload, verifyBnpSignature } from './signature';

const body = '{"event":"payment.paid","reference":"r1"}';

describe('verifyBnpSignature', () => {
  it('accepts a correct signature', () => {
    expect(verifyBnpSignature(body, signBnpPayload(body, 'k'), 'k')).toBe(true);
  });
  it('accepts uppercase hex', () => {
    expect(
      verifyBnpSignature(body, signBnpPayload(body, 'k').toUpperCase(), 'k')
    ).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifyBnpSignature(body + ' ', signBnpPayload(body, 'k'), 'k')).toBe(
      false
    );
  });
  it('rejects a different key', () => {
    expect(verifyBnpSignature(body, signBnpPayload(body, 'other'), 'k')).toBe(
      false
    );
  });
  it('rejects missing / malformed signatures', () => {
    expect(verifyBnpSignature(body, null, 'k')).toBe(false);
    expect(verifyBnpSignature(body, '', 'k')).toBe(false);
    expect(verifyBnpSignature(body, 'abc', 'k')).toBe(false);
    expect(
      verifyBnpSignature(body, 'sha256=' + signBnpPayload(body, 'k'), 'k')
    ).toBe(false);
  });
  it('fails closed with no secret', () => {
    expect(verifyBnpSignature(body, signBnpPayload(body, 'k'), '')).toBe(false);
    expect(verifyBnpSignature(body, signBnpPayload(body, 'k'), undefined)).toBe(
      false
    );
  });
});
