import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const h = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getQuotation: vi.fn(),
  claims: new Set<string>(),
  notes: [] as { contactId: string; text: string }[],
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  tables: {} as Record<string, unknown>,
}));

vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: h.sendMessage,
}));
vi.mock('./client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getQuotation: h.getQuotation,
}));
vi.mock('./events', () => ({
  claimEvent: async (_db: unknown, c: { dedupeKey: string }) => {
    if (h.claims.has(c.dedupeKey)) return false;
    h.claims.add(c.dedupeKey);
    return true;
  },
  addContactNote: async (
    _db: unknown,
    contactId: string,
    _u: string,
    text: string
  ) => {
    h.notes.push({ contactId, text });
  },
}));

import {
  parsePaymentPaid,
  processPaymentPaid,
  type PaymentPaidPayload,
} from './payment-callback';

/** Chainable fake: each table resolves to `h.tables[name]` (an object or a function of the call). */
const db = {
  from(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit'])
      b[m] = () => b;
    b.update = (patch: Record<string, unknown>) => {
      h.updates.push({ table, patch });
      return { eq: async () => ({ error: null }) };
    };
    const result = () => ({ data: h.tables[table] ?? null, error: null });
    b.maybeSingle = async () => {
      const r = result();
      return {
        ...r,
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
      };
    };
    b.then = (resolve: (v: unknown) => unknown) => resolve(result());
    return b;
  },
} as unknown as SupabaseClient;

const PAYLOAD: PaymentPaidPayload = {
  event: 'payment.paid',
  reference: 'ref-1',
  quotation_id: 'uuid-1',
  quotation_number: 'Q-2026-0001',
  order_id: 'BNP-1001',
  amount_paise: 500000,
  payment_id: 'pay_123',
};

beforeEach(() => {
  h.claims.clear();
  h.notes.length = 0;
  h.updates.length = 0;
  h.tables = {
    messages: {
      conversation_id: 'cv-1',
      conversations: { account_id: 'acc-1', contact_id: 'ct-1' },
    },
    whatsapp_config: { user_id: 'owner-1' },
  };
  h.sendMessage.mockResolvedValue({ messageId: 'm', whatsappMessageId: 'w' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('parsePaymentPaid', () => {
  it('accepts a valid payload', () => {
    expect(parsePaymentPaid({ ...PAYLOAD })).toMatchObject({
      ok: true,
      payload: {
        reference: 'ref-1',
        amount_paise: 500000,
        order_id: 'BNP-1001',
      },
    });
  });
  it('ignores other events', () => {
    expect(parsePaymentPaid({ event: 'quotation.viewed' })).toEqual({
      ok: 'ignored',
    });
  });
  it.each([
    [null],
    [{ event: 'payment.paid', quotation_number: 'Q', amount_paise: 1 }],
    [{ event: 'payment.paid', reference: 'r', amount_paise: 1 }],
    [
      {
        event: 'payment.paid',
        reference: 'r',
        quotation_number: 'Q',
        amount_paise: '1',
      },
    ],
    [
      {
        event: 'payment.paid',
        reference: 'r',
        quotation_number: 'Q',
        amount_paise: -1,
      },
    ],
  ])('rejects malformed %#', (body) => {
    expect(parsePaymentPaid(body)).toMatchObject({ ok: false });
  });
});

describe('processPaymentPaid', () => {
  it('confirms in the conversation found by payment reference and notes it', async () => {
    expect(await processPaymentPaid(db, PAYLOAD)).toBe('confirmed');
    const [, accountId, params] = h.sendMessage.mock.calls[0];
    expect(accountId).toBe('acc-1');
    expect(params).toMatchObject({
      conversationId: 'cv-1',
      messageType: 'text',
      automated: true,
      contentText:
        'Payment of ₹5,000 received for Q-2026-0001. Thank you! Your order BNP-1001 is confirmed.',
    });
    expect(h.notes[0]).toMatchObject({ contactId: 'ct-1' });
    expect(h.notes[0].text).toContain('pay_123');
    // BNP is authoritative → bubble flips to captured.
    expect(h.updates).toContainEqual({
      table: 'messages',
      patch: { payment_status: 'captured' },
    });
  });

  it('is idempotent on reference', async () => {
    await processPaymentPaid(db, PAYLOAD);
    h.sendMessage.mockClear();
    h.notes.length = 0;
    expect(await processPaymentPaid(db, PAYLOAD)).toBe('duplicate');
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.notes).toHaveLength(0);
  });

  it('falls back to the quotation link recorded when it was sent', async () => {
    h.tables.messages = null;
    h.tables.bnp_quotation_events = {
      account_id: 'acc-2',
      conversation_id: 'cv-2',
      conversations: [{ contact_id: 'ct-2' }],
    };
    expect(await processPaymentPaid(db, PAYLOAD)).toBe('confirmed');
    expect(h.sendMessage.mock.calls[0][1]).toBe('acc-2');
    expect(h.notes[0].contactId).toBe('ct-2');
  });

  it('falls back to the customer phone (91 default) as a last resort', async () => {
    h.tables.messages = null;
    h.tables.bnp_quotation_events = null;
    h.getQuotation.mockResolvedValue({ customer: { phone: '98765 43210' } });
    h.tables.contacts = [{ id: 'ct-3', account_id: 'acc-3' }];
    h.tables.conversations = [
      { id: 'cv-3', account_id: 'acc-3', contact_id: 'ct-3' },
    ];
    expect(await processPaymentPaid(db, PAYLOAD)).toBe('confirmed');
    expect(h.sendMessage.mock.calls[0][2].conversationId).toBe('cv-3');
  });

  it('returns no_conversation (without claiming) when nothing matches', async () => {
    h.tables.messages = null;
    h.tables.bnp_quotation_events = null;
    h.getQuotation.mockResolvedValue({ customer: { phone: null } });
    expect(await processPaymentPaid(db, PAYLOAD)).toBe('no_conversation');
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.claims.size).toBe(0);
  });

  it('a failed confirmation send is noted for a human, and does not throw', async () => {
    h.sendMessage.mockRejectedValue(new Error('outside window'));
    expect(await processPaymentPaid(db, PAYLOAD)).toBe('confirmed');
    expect(h.notes[0].text).toMatch(/could not be sent/);
  });
});
