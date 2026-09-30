import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const h = vi.hoisted(() => ({
  getQuotation: vi.fn(),
  markQuotationSent: vi.fn(),
  sendMessage: vi.fn(),
  resolveTemplateRow: vi.fn(),
  upserts: [] as Record<string, unknown>[],
}));

vi.mock('./client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getQuotation: h.getQuotation,
  markQuotationSent: h.markQuotationSent,
}));
vi.mock('@/lib/whatsapp/send-message', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendMessageToConversation: h.sendMessage,
}));
vi.mock('@/lib/whatsapp/template-body', () => ({
  resolveTemplateRow: h.resolveTemplateRow,
}));
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        h.upserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { BnpError } from './client';
import { SendMessageError } from '@/lib/whatsapp/send-message';
import {
  isSessionWindowOpen,
  sendQuotationToConversation,
} from './send-quotation';

const QUOTATION = {
  id: 'uuid-1',
  number: 'Q-2026-0001',
  status: 'draft',
  customer: { name: 'Asha', company: null, phone: '9876543210', email: null },
  total_paise: 1250000,
  valid_until: '2026-12-31',
  converted_order_id: null,
  pdf_url: 'https://bnp/view.pdf',
  pdf_download_url: 'https://bnp/download.pdf',
};

/** db fake: conversation exists (or not); last customer message at `lastCustomerAt`. */
function fakeDb(opts: {
  conversation?: boolean;
  lastCustomerAt?: string | null;
}): SupabaseClient {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          if (table === 'conversations') {
            return {
              data: opts.conversation === false ? null : { id: 'cv-1' },
            };
          }
          return {
            data: opts.lastCustomerAt
              ? { created_at: opts.lastCustomerAt }
              : null,
          };
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

const hoursAgo = (n: number) =>
  new Date(Date.now() - n * 3600_000).toISOString();

beforeEach(() => {
  h.upserts.length = 0;
  h.getQuotation.mockResolvedValue(QUOTATION);
  h.markQuotationSent.mockResolvedValue({});
  h.sendMessage.mockImplementation(
    async (_db, _acc, p: { messageType: string }) => ({
      messageId: `row-${p.messageType}`,
      whatsappMessageId: `wamid.${p.messageType}`,
    })
  );
  delete process.env.BNP_QUOTATION_TEMPLATE_NAME;
  delete process.env.BNP_QUOTATION_TEMPLATE_LANGUAGE;
});
afterEach(() => vi.clearAllMocks());

describe('isSessionWindowOpen', () => {
  it('is open within 24h, closed after, closed with no customer message', async () => {
    expect(
      await isSessionWindowOpen(fakeDb({ lastCustomerAt: hoursAgo(2) }), 'cv-1')
    ).toBe(true);
    expect(
      await isSessionWindowOpen(
        fakeDb({ lastCustomerAt: hoursAgo(25) }),
        'cv-1'
      )
    ).toBe(false);
    expect(
      await isSessionWindowOpen(fakeDb({ lastCustomerAt: null }), 'cv-1')
    ).toBe(false);
  });
});

describe('sendQuotationToConversation — inside the window', () => {
  it('sends the PDF, then Accept/Reject buttons, then marks sent', async () => {
    const res = await sendQuotationToConversation(
      fakeDb({ lastCustomerAt: hoursAgo(1) }),
      'acc-1',
      'cv-1',
      'Q-2026-0001'
    );
    expect(res).toMatchObject({
      mode: 'session',
      markedSent: true,
      quotationNumber: 'Q-2026-0001',
    });

    const [doc, buttons] = h.sendMessage.mock.calls.map((c) => c[2]);
    expect(doc).toMatchObject({
      messageType: 'document',
      mediaUrl: 'https://bnp/download.pdf',
      filename: 'Q-2026-0001.pdf',
      quotationNumber: 'Q-2026-0001',
    });
    expect(buttons.messageType).toBe('interactive');
    expect(buttons.interactivePayload.buttons).toEqual([
      { id: 'quote:accept:Q-2026-0001', title: 'Accept' },
      { id: 'quote:reject:Q-2026-0001', title: 'Reject' },
    ]);
    expect(buttons.interactivePayload.body).toContain('₹12,500');
    expect(h.markQuotationSent).toHaveBeenCalledWith('Q-2026-0001');
    // Routing record for the payment callback.
    expect(h.upserts[0]).toMatchObject({
      account_id: 'acc-1',
      kind: 'sent',
      quotation_number: 'Q-2026-0001',
      conversation_id: 'cv-1',
    });
  });

  it('does not mark sent when the buttons fail, and says the PDF went out', async () => {
    h.sendMessage
      .mockResolvedValueOnce({ messageId: 'r1', whatsappMessageId: 'w1' })
      .mockRejectedValueOnce(new SendMessageError('meta_error', 'boom', 502));
    await expect(
      sendQuotationToConversation(
        fakeDb({ lastCustomerAt: hoursAgo(1) }),
        'acc-1',
        'cv-1',
        'Q-1'
      )
    ).rejects.toThrow(/PDF was sent but the Accept\/Reject buttons failed/);
    expect(h.markQuotationSent).not.toHaveBeenCalled();
  });

  it('reports (not throws) when BNP /sent fails after delivery', async () => {
    h.markQuotationSent.mockRejectedValue(new BnpError('timeout', 'slow'));
    const res = await sendQuotationToConversation(
      fakeDb({ lastCustomerAt: hoursAgo(1) }),
      'acc-1',
      'cv-1',
      'Q-1'
    );
    expect(res.markedSent).toBe(false);
    expect(res.warning).toMatch(/could not be updated/);
  });
});

describe('sendQuotationToConversation — outside the window', () => {
  const row = {
    status: 'APPROVED',
    header_type: 'document',
    buttons: [
      { type: 'URL', text: 'Site', url: 'https://x' },
      { type: 'QUICK_REPLY', text: 'Accept' },
      { type: 'QUICK_REPLY', text: 'Reject' },
    ],
  };

  it('errors clearly when no template is configured, sending nothing', async () => {
    await expect(
      sendQuotationToConversation(
        fakeDb({ lastCustomerAt: hoursAgo(30) }),
        'acc-1',
        'cv-1',
        'Q-1'
      )
    ).rejects.toMatchObject({
      code: 'bnp_template_not_configured',
      status: 409,
    });
    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.markQuotationSent).not.toHaveBeenCalled();
  });

  it('errors when the configured template is missing / unapproved / lacks buttons', async () => {
    process.env.BNP_QUOTATION_TEMPLATE_NAME = 'quote_v1';
    const db = fakeDb({ lastCustomerAt: null });

    h.resolveTemplateRow.mockResolvedValueOnce({
      row: null,
      malformed: false,
      language: 'en_US',
    });
    await expect(
      sendQuotationToConversation(db, 'a', 'cv-1', 'Q-1')
    ).rejects.toMatchObject({
      code: 'bnp_template_not_configured',
    });

    h.resolveTemplateRow.mockResolvedValueOnce({
      row: { ...row, status: 'PENDING' },
      malformed: false,
      language: 'en_US',
    });
    await expect(
      sendQuotationToConversation(db, 'a', 'cv-1', 'Q-1')
    ).rejects.toMatchObject({
      code: 'bnp_template_not_approved',
    });

    h.resolveTemplateRow.mockResolvedValueOnce({
      row: { ...row, buttons: [{ type: 'QUICK_REPLY', text: 'Only' }] },
      malformed: false,
      language: 'en_US',
    });
    await expect(
      sendQuotationToConversation(db, 'a', 'cv-1', 'Q-1')
    ).rejects.toMatchObject({
      code: 'bnp_template_invalid',
    });
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('sends the template with the same quick-reply ids at the right button indexes', async () => {
    process.env.BNP_QUOTATION_TEMPLATE_NAME = 'quote_v1';
    process.env.BNP_QUOTATION_TEMPLATE_LANGUAGE = 'en';
    h.resolveTemplateRow.mockResolvedValue({
      row,
      malformed: false,
      language: 'en',
    });

    const res = await sendQuotationToConversation(
      fakeDb({ lastCustomerAt: hoursAgo(48) }),
      'acc-1',
      'cv-1',
      'Q-2026-0001'
    );
    expect(res.mode).toBe('template');
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    const params = h.sendMessage.mock.calls[0][2];
    expect(params).toMatchObject({
      messageType: 'template',
      templateName: 'quote_v1',
      templateLanguage: 'en',
      quotationNumber: 'Q-2026-0001',
    });
    expect(params.templateMessageParams).toEqual({
      body: ['Asha', 'Q-2026-0001', '₹12,500'],
      headerMediaUrl: 'https://bnp/download.pdf',
      buttonParams: {
        1: 'quote:accept:Q-2026-0001',
        2: 'quote:reject:Q-2026-0001',
      },
    });
    expect(h.markQuotationSent).toHaveBeenCalled();
  });
});

describe('sendQuotationToConversation — guards', () => {
  it('404s an unknown / foreign conversation before calling BNP', async () => {
    await expect(
      sendQuotationToConversation(
        fakeDb({ conversation: false }),
        'acc-1',
        'cv-x',
        'Q-1'
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(h.getQuotation).not.toHaveBeenCalled();
  });

  it.each(['expired', 'converted'])(
    'refuses a %s quotation',
    async (status) => {
      h.getQuotation.mockResolvedValue({ ...QUOTATION, status });
      await expect(
        sendQuotationToConversation(
          fakeDb({ lastCustomerAt: hoursAgo(1) }),
          'a',
          'cv-1',
          'Q-1'
        )
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(h.sendMessage).not.toHaveBeenCalled();
    }
  );

  it('refuses a quotation with no PDF', async () => {
    h.getQuotation.mockResolvedValue({ ...QUOTATION, pdf_download_url: null });
    await expect(
      sendQuotationToConversation(
        fakeDb({ lastCustomerAt: hoursAgo(1) }),
        'a',
        'cv-1',
        'Q-1'
      )
    ).rejects.toThrow(/no PDF/);
  });

  it('propagates BNP not_found', async () => {
    h.getQuotation.mockRejectedValue(new BnpError('not_found', 'nope', 404));
    await expect(
      sendQuotationToConversation(
        fakeDb({ lastCustomerAt: hoursAgo(1) }),
        'a',
        'cv-1',
        'Q-9'
      )
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
