import { describe, it, expect } from 'vitest';
import {
  formatRupees,
  normalizeBnpPhone,
  parseQuoteButtonId,
  quoteButtonId,
} from './format';

describe('formatRupees', () => {
  it('uses Indian grouping', () => {
    expect(formatRupees(12345600)).toBe('1,23,456');
  });
  it('shows paise only when present', () => {
    expect(formatRupees(150050)).toBe('1,500.50');
  });
});

describe('normalizeBnpPhone', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['09876543210', '919876543210'],
    ['+91 98765 43210', '919876543210'],
    ['919876543210', '919876543210'],
    ['+1 (415) 555-1212', '14155551212'],
    ['0091 98765 43210', '919876543210'],
  ])('%s → %s', (input, out) => {
    expect(normalizeBnpPhone(input)).toBe(out);
  });
  it.each([null, undefined, '', 'abc', '123'])('rejects %s', (input) => {
    expect(normalizeBnpPhone(input)).toBeNull();
  });
});

describe('quote button ids', () => {
  it('round-trips', () => {
    const id = quoteButtonId('accept', 'Q-2026-0001');
    expect(id).toBe('quote:accept:Q-2026-0001');
    expect(parseQuoteButtonId(id)).toEqual({
      action: 'accept',
      number: 'Q-2026-0001',
    });
  });
  it.each([
    'quote:maybe:Q-1',
    'quote:accept:',
    'accept:Q-1',
    'quote:accept:Q 1',
    '',
    null,
    undefined,
  ])('ignores %s', (id) => {
    expect(parseQuoteButtonId(id as string)).toBeNull();
  });
});
