import { describe, it, expect } from 'vitest';
import { parseOrderDetailsMessage } from './order-details';

const good = {
  interactive: {
    type: 'order_details',
    body: { text: 'Pay advance' },
    action: {
      name: 'review_and_pay',
      parameters: {
        reference_id: 'ref-1',
        total_amount: { value: 50000, offset: 100 },
      },
    },
  },
};

describe('parseOrderDetailsMessage', () => {
  it('extracts reference, amount and body', () => {
    const r = parseOrderDetailsMessage(good);
    expect(r).toMatchObject({
      ok: true,
      info: { reference: 'ref-1', amountPaise: 50000, bodyText: 'Pay advance' },
    });
  });

  it('normalises a non-100 offset to paise', () => {
    const m = structuredClone(good);
    m.interactive.action.parameters.total_amount = { value: 5000, offset: 10 };
    expect(parseOrderDetailsMessage(m)).toMatchObject({
      ok: true,
      info: { amountPaise: 50000 },
    });
  });

  it.each([
    [null],
    [{}],
    [{ interactive: { type: 'button' } }],
    [{ interactive: { type: 'order_details', body: { text: '' } } }],
    [{ interactive: { type: 'order_details', body: { text: 'x' } } }],
    [
      {
        interactive: {
          type: 'order_details',
          body: { text: 'x' },
          action: { parameters: { total_amount: { value: 1 } } },
        },
      },
    ],
    [
      {
        interactive: {
          type: 'order_details',
          body: { text: 'x' },
          action: { parameters: { reference_id: 'r' } },
        },
      },
    ],
  ])('rejects malformed input %#', (input) => {
    expect(parseOrderDetailsMessage(input).ok).toBe(false);
  });
});
