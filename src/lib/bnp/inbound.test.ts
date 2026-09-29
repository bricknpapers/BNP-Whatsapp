import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const h = vi.hoisted(() => ({
  respond: vi.fn(),
  getQuotation: vi.fn(),
  createPaymentRequest: vi.fn(),
  sendMessage: vi.fn(),
  claims: new Set<string>(),
  released: [] as string[],
  notes: [] as string[],
  existingPayment: null as { id: string } | null,
}));

vi.mock('./client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  respondToQuotation: h.respond,
  getQuotation: h.getQuotation,
  createPaymentRequest: h.createPaymentRequest,
}));
vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: h.sendMessage,
}));
vi.mock('./events', () => ({
  claimEvent: async (_db: unknown, c: { dedupeKey: string }) => {
    if (h.claims.has(c.dedupeKey)) return false;
    h.claims.add(c.dedupeKey);
    return true;
  },
  releaseEvent: async (_db: unknown, _acc: string, key: string) => {
    h.released.push(key);
    h.claims.delete(key);
  },
  addContactNote: async (
    _db: unknown,
    _c: string,
    _u: string,
    text: string
  ) => {
    h.notes.push(text);
  },
}));

import { BnpError } from './client';
import { advancePercentFromEnv, handleQuotationButtonReply } from './inbound';

const db = {
  from: () => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      neq: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: h.existingPayment }),
    };
    return b;
  },
} as unknown as SupabaseClient;

const ctx = (replyId: string | null, wamid = 'wamid.1') => ({
  db,
  accountId: 'acc-1',
  conversationId: 'cv-1',
  contactId: 'ct-1',
  ownerUserId: 'u-1',
  wamid,
  replyId,
});

const ORDER = {
  reference: 'ref-1',
  amount_paise: 500000,
  quotation: {},
  message: { interactive: { type: 'order_details' } },
};

const sentTypes = () => h.sendMessage.mock.calls.map((c) => c[2].messageType);
const sentTexts = () =>
  h.sendMessage.mock.calls
    .filter((c) => c[2].messageType === 'text')
    .map((c) => c[2].contentText);

beforeEach(() => {
  process.env.BNP_API_URL = 'https://bnp.example.com';
  process.env.BNP_API_KEY = 'k';
  delete process.env.QUOTATION_ADVANCE_PERCENT;
  h.claims.clear();
  h.released.length = 0;
  h.notes.length = 0;
  h.existingPayment = null;
  h.respond.mockResolvedValue({});
  h.getQuotation.mockResolvedValue({ status: 'accepted' });
  h.createPaymentRequest.mockResolvedValue(ORDER);
  h.sendMessage.mockResolvedValue({ messageId: 'r', whatsappMessageId: 'w' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('non-quote taps are left alone', () => {
  it.each([null, 'menu:sales', 'quote:maybe:Q-1'])(
    '%s → false, no side effects',
    async (id) => {
      expect(await handleQuotationButtonReply(ctx(id))).toBe(false);
      expect(h.respond).not.toHaveBeenCalled();
      expect(h.sendMessage).not.toHaveBeenCalled();
      expect(h.claims.size).toBe(0);
    }
  );

  it('does nothing when BNP is not configured', async () => {
    delete process.env.BNP_API_KEY;
    expect(await handleQuotationButtonReply(ctx('quote:accept:Q-1'))).toBe(
      false
    );
    expect(h.respond).not.toHaveBeenCalled();
  });
});

describe('accept', () => {
  it('responds, requests payment (no advance by default) and sends order_details', async () => {
    expect(
      await handleQuotationButtonReply(ctx('quote:accept:Q-2026-0001'))
    ).toBe(true);
    expect(h.respond).toHaveBeenCalledWith('Q-2026-0001', 'accept');
    expect(h.createPaymentRequest).toHaveBeenCalledWith('Q-2026-0001', {});
    const [, , params] = h.sendMessage.mock.calls[0];
    expect(params).toMatchObject({
      messageType: 'order_details',
      orderDetailsMessage: ORDER.message,
      quotationNumber: 'Q-2026-0001',
      automated: true,
    });
    expect(h.notes[0]).toMatch(/accepted quotation Q-2026-0001.*₹5,000.*ref-1/);
  });

  it('passes QUOTATION_ADVANCE_PERCENT through when set', async () => {
    process.env.QUOTATION_ADVANCE_PERCENT = '30';
    await handleQuotationButtonReply(ctx('quote:accept:Q-1'));
    expect(h.createPaymentRequest).toHaveBeenCalledWith('Q-1', {
      advancePercent: 30,
    });
  });

  it('is idempotent on the wamid: a replay does nothing', async () => {
    await handleQuotationButtonReply(ctx('quote:accept:Q-1', 'wamid.A'));
    h.respond.mockClear();
    h.createPaymentRequest.mockClear();
    h.sendMessage.mockClear();
    expect(
      await handleQuotationButtonReply(ctx('quote:accept:Q-1', 'wamid.A'))
    ).toBe(true);
    expect(h.respond).not.toHaveBeenCalled();
    expect(h.createPaymentRequest).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('a second tap (new wamid) after success sends no second payment request', async () => {
    await handleQuotationButtonReply(ctx('quote:accept:Q-1', 'wamid.A'));
    h.createPaymentRequest.mockClear();
    h.sendMessage.mockClear();
    await handleQuotationButtonReply(ctx('quote:accept:Q-1', 'wamid.B'));
    expect(h.createPaymentRequest).not.toHaveBeenCalled();
    expect(sentTypes()).toEqual([]);
  });

  it('does not resend when an order_details message already exists in the thread', async () => {
    h.existingPayment = { id: 'm-1' };
    await handleQuotationButtonReply(ctx('quote:accept:Q-1'));
    expect(h.createPaymentRequest).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('409 but already accepted → still proceeds to the (deduped) payment request', async () => {
    h.respond.mockRejectedValue(new BnpError('conflict', 'already', 409));
    h.getQuotation.mockResolvedValue({ status: 'accepted' });
    await handleQuotationButtonReply(ctx('quote:accept:Q-1'));
    expect(sentTypes()).toEqual(['order_details']);
  });

  it('409 expired → polite message + note, no payment request', async () => {
    h.respond.mockRejectedValue(new BnpError('conflict', 'expired', 409));
    h.getQuotation.mockResolvedValue({ status: 'expired' });
    await handleQuotationButtonReply(ctx('quote:accept:Q-1'));
    expect(h.createPaymentRequest).not.toHaveBeenCalled();
    expect(sentTexts()[0]).toMatch(/expired/);
    expect(h.notes[0]).toMatch(/expired/);
  });

  it('409 in another state → generic unavailable message', async () => {
    h.respond.mockRejectedValue(new BnpError('conflict', 'x', 409));
    h.getQuotation.mockResolvedValue({ status: 'rejected' });
    await handleQuotationButtonReply(ctx('quote:accept:Q-1'));
    expect(sentTexts()[0]).toMatch(/no longer available/);
    expect(h.createPaymentRequest).not.toHaveBeenCalled();
  });

  it('BNP down on respond → apology + note, never throws', async () => {
    h.respond.mockRejectedValue(new BnpError('timeout', 'slow'));
    await expect(
      handleQuotationButtonReply(ctx('quote:accept:Q-1'))
    ).resolves.toBe(true);
    expect(sentTexts()[0]).toMatch(/couldn't process/);
    expect(h.notes[0]).toMatch(/follow up/);
  });

  it('payment-request failure → apology, note, and the claim is released for a retap', async () => {
    h.createPaymentRequest.mockRejectedValue(
      new BnpError('upstream', 'boom', 500)
    );
    await handleQuotationButtonReply(ctx('quote:accept:Q-1'));
    expect(sentTexts()[0]).toMatch(/couldn't process/);
    expect(h.notes[0]).toMatch(/send it manually/);
    expect(h.released).toEqual(['payreq:Q-1:cv-1']);
  });

  it('a Meta send failure never escapes', async () => {
    h.sendMessage.mockRejectedValue(new Error('meta down'));
    await expect(
      handleQuotationButtonReply(ctx('quote:accept:Q-1'))
    ).resolves.toBe(true);
  });
});

describe('reject', () => {
  it('responds, acknowledges and notes — no payment request', async () => {
    await handleQuotationButtonReply(ctx('quote:reject:Q-2026-0001'));
    expect(h.respond).toHaveBeenCalledWith('Q-2026-0001', 'reject');
    expect(h.createPaymentRequest).not.toHaveBeenCalled();
    expect(sentTexts()[0]).toMatch(/declined/);
    expect(h.notes[0]).toBe(
      'Customer rejected quotation Q-2026-0001 via WhatsApp.'
    );
    expect(h.sendMessage.mock.calls[0][2].automated).toBe(true);
  });

  it('409 expired → expired message', async () => {
    h.respond.mockRejectedValue(new BnpError('conflict', 'x', 409));
    h.getQuotation.mockResolvedValue({ status: 'expired' });
    await handleQuotationButtonReply(ctx('quote:reject:Q-1'));
    expect(sentTexts()[0]).toMatch(/expired/);
  });

  it('409 because it was already rejected → silent', async () => {
    h.respond.mockRejectedValue(new BnpError('conflict', 'x', 409));
    h.getQuotation.mockResolvedValue({ status: 'rejected' });
    await handleQuotationButtonReply(ctx('quote:reject:Q-1'));
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});

describe('advancePercentFromEnv', () => {
  it.each([
    ['30', 30],
    ['12.5', 12.5],
    ['', undefined],
    ['abc', undefined],
    ['0', undefined],
    ['150', undefined],
    ['-5', undefined],
  ])('%j → %s', (raw, out) => {
    process.env.QUOTATION_ADVANCE_PERCENT = raw;
    expect(advancePercentFromEnv()).toBe(out);
  });
});
