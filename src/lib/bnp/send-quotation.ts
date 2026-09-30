// ============================================================
// "Send quotation" — the agent-initiated half of the BNP flow.
//
// Fetch the quotation from BNP (source of truth for price + PDF), then
// send it to the customer through the existing send core so both
// messages are stored in the conversation like any other send:
//
//   inside the 24h customer-service window:
//     1. the PDF as a document message
//     2. an interactive Accept / Reject reply-button message
//   outside the window:
//     one approved template (BNP_QUOTATION_TEMPLATE_NAME) whose two
//     QUICK_REPLY buttons carry the same `quote:<action>:<number>` ids
//
// then tell BNP it was sent (idempotent). Button ids encode the
// quotation number so the inbound webhook can route the tap without any
// server-side state.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';
import {
  BnpError,
  getQuotation,
  markQuotationSent,
  type BnpQuotation,
} from './client';
import { quotationBody } from './copy';
import { formatRupees, parseQuoteButtonId, quoteButtonId } from './format';

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Quotation states that can no longer be put in front of a customer. */
const UNSENDABLE_STATUSES = new Set(['expired', 'converted', 'cancelled']);

export interface SendQuotationResult {
  quotationNumber: string;
  mode: 'session' | 'template';
  messageIds: string[];
  /** False when delivery worked but BNP's /sent call failed. */
  markedSent: boolean;
  warning?: string;
}

/** True when the customer wrote to us in the last 24 hours. */
export async function isSessionWindowOpen(
  db: SupabaseClient,
  conversationId: string,
  now: number = Date.now()
): Promise<boolean> {
  const { data } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.created_at) return false;
  return now - new Date(data.created_at).getTime() < WINDOW_MS;
}

export function quotationTemplateConfig(): {
  name: string;
  language?: string;
} | null {
  const name = process.env.BNP_QUOTATION_TEMPLATE_NAME?.trim();
  if (!name) return null;
  return {
    name,
    language: process.env.BNP_QUOTATION_TEMPLATE_LANGUAGE?.trim() || undefined,
  };
}

export async function sendQuotationToConversation(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  numberInput: string
): Promise<SendQuotationResult> {
  // Account-scope the conversation before any external call.
  const { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!conversation) {
    throw new SendMessageError('not_found', 'Conversation not found', 404);
  }

  const quotation = await getQuotation(numberInput);
  assertSendable(quotation);
  const number = quotation.number;

  const windowOpen = await isSessionWindowOpen(db, conversationId);
  const messageIds: string[] = [];
  let mode: SendQuotationResult['mode'];

  if (windowOpen) {
    mode = 'session';
    const doc = await sendMessageToConversation(db, accountId, {
      conversationId,
      messageType: 'document',
      mediaUrl: quotation.pdf_download_url!,
      filename: `${number}.pdf`,
      contentText: `Quotation ${number}`,
      quotationNumber: number,
    });
    messageIds.push(doc.messageId);

    try {
      const buttons = await sendMessageToConversation(db, accountId, {
        conversationId,
        messageType: 'interactive',
        quotationNumber: number,
        interactivePayload: {
          kind: 'buttons',
          body: quotationBody({
            number,
            customerName: quotation.customer?.name,
            totalPaise: quotation.total_paise,
            validUntil: quotation.valid_until,
          }),
          buttons: [
            { id: quoteButtonId('accept', number), title: 'Accept' },
            { id: quoteButtonId('reject', number), title: 'Reject' },
          ],
        },
      });
      messageIds.push(buttons.messageId);
    } catch (err) {
      if (err instanceof SendMessageError) {
        throw new SendMessageError(
          err.code,
          `The PDF was sent but the Accept/Reject buttons failed: ${err.message}`,
          err.status
        );
      }
      throw err;
    }
  } else {
    mode = 'template';
    const sent = await sendViaTemplate(
      db,
      accountId,
      conversationId,
      quotation
    );
    messageIds.push(sent);
  }

  await recordSent(
    accountId,
    conversationId,
    number,
    messageIds[messageIds.length - 1]
  );

  // Delivery succeeded — a failure to tell BNP must not read as a failed
  // send (the agent would resend). Report it instead.
  let markedSent = true;
  let warning: string | undefined;
  try {
    await markQuotationSent(number);
  } catch (err) {
    markedSent = false;
    warning = `Quotation delivered, but BNP could not be updated to "sent": ${
      err instanceof BnpError ? err.message : 'unknown error'
    }`;
    console.error(
      '[bnp] markQuotationSent failed:',
      err instanceof Error ? err.message : err
    );
  }

  return { quotationNumber: number, mode, messageIds, markedSent, warning };
}

function assertSendable(q: BnpQuotation): void {
  if (!q.number || !parseQuoteButtonId(quoteButtonId('accept', q.number))) {
    throw new BnpError(
      'upstream',
      `Quotation number "${q.number}" contains characters that can't be used in a button id.`
    );
  }
  if (UNSENDABLE_STATUSES.has(q.status)) {
    throw new BnpError(
      'conflict',
      `Quotation ${q.number} is ${q.status} and can't be sent.`
    );
  }
  if (!q.pdf_download_url) {
    throw new BnpError(
      'upstream',
      `Quotation ${q.number} has no PDF to send yet.`
    );
  }
}

async function sendViaTemplate(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  q: BnpQuotation
): Promise<string> {
  const cfg = quotationTemplateConfig();
  if (!cfg) {
    throw new SendMessageError(
      'bnp_template_not_configured',
      "This chat is outside WhatsApp's 24-hour window, so the quotation must go as an approved template, but none is configured. Set BNP_QUOTATION_TEMPLATE_NAME (see docs/bnp-quotations.md).",
      409
    );
  }

  const resolved = await resolveTemplateRow(
    db,
    accountId,
    cfg.name,
    cfg.language
  );
  if (resolved.malformed) {
    throw new SendMessageError(
      'template_malformed',
      `Template "${cfg.name}" is malformed locally — run "Sync from Meta" in Settings.`,
      500
    );
  }
  const row = resolved.row;
  if (!row) {
    throw new SendMessageError(
      'bnp_template_not_configured',
      `Quotation template "${cfg.name}" was not found for this account. Create/sync it in Templates first (see docs/bnp-quotations.md).`,
      409
    );
  }
  if (row.status && row.status !== 'APPROVED') {
    throw new SendMessageError(
      'bnp_template_not_approved',
      `Quotation template "${cfg.name}" is ${row.status}, not APPROVED yet.`,
      409
    );
  }

  const quickReplyIdx = (row.buttons ?? []).flatMap((b, i) =>
    b.type === 'QUICK_REPLY' ? [i] : []
  );
  if (quickReplyIdx.length < 2) {
    throw new SendMessageError(
      'bnp_template_invalid',
      `Quotation template "${cfg.name}" needs two QUICK_REPLY buttons (Accept / Reject).`,
      409
    );
  }

  const result = await sendMessageToConversation(db, accountId, {
    conversationId,
    messageType: 'template',
    templateName: cfg.name,
    templateLanguage: cfg.language,
    quotationNumber: q.number,
    // Body variables in order: {{1}} customer name, {{2}} number,
    // {{3}} total. Extra values are dropped by the builder.
    templateMessageParams: {
      body: [
        q.customer?.name || 'there',
        q.number,
        `₹${formatRupees(q.total_paise)}`,
      ],
      ...(row.header_type === 'document'
        ? { headerMediaUrl: q.pdf_download_url! }
        : {}),
      buttonParams: {
        [quickReplyIdx[0]]: quoteButtonId('accept', q.number),
        [quickReplyIdx[1]]: quoteButtonId('reject', q.number),
      },
    },
  });
  return result.messageId;
}

/**
 * Remember which conversation a quotation went to, so BNP's payment
 * callback can find the right tenant + thread without guessing from a
 * phone number. Best-effort: the send already happened.
 */
async function recordSent(
  accountId: string,
  conversationId: string,
  number: string,
  wamidRowId: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('bnp_quotation_events')
    .upsert(
      {
        account_id: accountId,
        kind: 'sent',
        dedupe_key: `sent:${number}:${wamidRowId}`,
        quotation_number: number,
        conversation_id: conversationId,
      },
      { onConflict: 'account_id,dedupe_key', ignoreDuplicates: true }
    );
  if (error)
    console.error('[bnp] recording sent quotation failed:', error.message);
}
