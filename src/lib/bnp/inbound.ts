// ============================================================
// Inbound half of the quotation flow: a customer taps Accept / Reject
// on the quotation message (button id `quote:<action>:<number>`).
//
// Called from the WhatsApp webhook AFTER the inbound message is stored,
// alongside (never instead of) flows / automations, so a quote tap can't
// break either. Contract:
//   - returns false, touching nothing, for any id that isn't a quote id
//     (or when BNP isn't configured) so other button flows are unaffected;
//   - never throws — a BNP/Meta failure must not fail the webhook;
//   - idempotent: the wamid is claimed first (Meta retries), and an
//     existing payment request for the quotation is never re-sent
//     (BNP dedupes /payment-request on its side too).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import {
  BnpError,
  createPaymentRequest,
  getQuotation,
  isBnpConfigured,
  respondToQuotation,
} from './client';
import { COPY } from './copy';
import { addContactNote, claimEvent, releaseEvent } from './events';
import { formatRupees, parseQuoteButtonId } from './format';

export interface QuoteTapContext {
  /** Service-role client. */
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  /** Sender-of-record for the note (the WhatsApp config owner). */
  ownerUserId: string;
  /** wamid of the inbound tap. */
  wamid: string;
  /** The tapped button/row id. */
  replyId: string | null;
}

const ACCEPTED_STATES = new Set(['accepted', 'converted']);

/** QUOTATION_ADVANCE_PERCENT: only passed to BNP when set and in (0, 100]. */
export function advancePercentFromEnv(): number | undefined {
  const raw = process.env.QUOTATION_ADVANCE_PERCENT?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
}

/** @returns true when the id was a quotation button (handled or deduped). */
export async function handleQuotationButtonReply(
  ctx: QuoteTapContext
): Promise<boolean> {
  const parsed = parseQuoteButtonId(ctx.replyId);
  if (!parsed || !isBnpConfigured()) return false;
  const { action, number } = parsed;

  try {
    const first = await claimEvent(ctx.db, {
      accountId: ctx.accountId,
      kind: 'button',
      dedupeKey: `button:${ctx.wamid}`,
      quotationNumber: number,
      conversationId: ctx.conversationId,
    });
    if (!first) {
      console.info(
        '[bnp] duplicate quotation button delivery ignored:',
        ctx.wamid
      );
      return true;
    }

    if (action === 'reject') await onReject(ctx, number);
    else await onAccept(ctx, number);
  } catch (err) {
    // Last-resort net: anything unexpected is logged, never propagated.
    console.error(
      '[bnp] quotation button handling failed:',
      err instanceof Error ? err.message : err
    );
  }
  return true;
}

async function reply(ctx: QuoteTapContext, text: string): Promise<void> {
  try {
    await sendMessageToConversation(ctx.db, ctx.accountId, {
      conversationId: ctx.conversationId,
      messageType: 'text',
      contentText: text,
      automated: true,
    });
  } catch (err) {
    console.error(
      '[bnp] reply to quotation tap failed:',
      err instanceof Error ? err.message : err
    );
  }
}

const note = (ctx: QuoteTapContext, text: string) =>
  addContactNote(ctx.db, ctx.contactId, ctx.ownerUserId, text);

/** Refetch after a 409 to tell "already accepted" from "expired"/other. */
async function currentStatus(number: string): Promise<string | null> {
  try {
    return (await getQuotation(number)).status;
  } catch {
    return null;
  }
}

async function onReject(ctx: QuoteTapContext, number: string): Promise<void> {
  try {
    await respondToQuotation(number, 'reject');
  } catch (err) {
    if (err instanceof BnpError && err.code === 'conflict') {
      const status = await currentStatus(number);
      if (status === 'rejected') {
        // A second tap after a successful reject — already handled.
        return;
      }
      await reply(
        ctx,
        status === 'expired' ? COPY.expired(number) : COPY.unavailable(number)
      );
      await note(
        ctx,
        `Customer tapped Reject on quotation ${number} via WhatsApp, but BNP could not record it (status: ${status ?? 'unknown'}).`
      );
      return;
    }
    console.error(
      '[bnp] respond(reject) failed:',
      err instanceof Error ? err.message : err
    );
    await reply(ctx, COPY.error(number));
    await note(
      ctx,
      `Customer tapped Reject on quotation ${number}, but recording it in BNP failed. Please follow up.`
    );
    return;
  }
  await reply(ctx, COPY.rejectAck(number));
  await note(ctx, `Customer rejected quotation ${number} via WhatsApp.`);
}

async function onAccept(ctx: QuoteTapContext, number: string): Promise<void> {
  try {
    await respondToQuotation(number, 'accept');
  } catch (err) {
    if (err instanceof BnpError && err.code === 'conflict') {
      const status = await currentStatus(number);
      if (!status || !ACCEPTED_STATES.has(status)) {
        await reply(
          ctx,
          status === 'expired' ? COPY.expired(number) : COPY.unavailable(number)
        );
        await note(
          ctx,
          `Customer tapped Accept on quotation ${number} via WhatsApp, but BNP reports it as ${status ?? 'unavailable'}.`
        );
        return;
      }
      // Already accepted (an earlier tap won the race) — fall through to
      // the payment step, which is itself deduped.
    } else {
      console.error(
        '[bnp] respond(accept) failed:',
        err instanceof Error ? err.message : err
      );
      await reply(ctx, COPY.error(number));
      await note(
        ctx,
        `Customer tapped Accept on quotation ${number}, but recording it in BNP failed. Please follow up.`
      );
      return;
    }
  }

  // A payment request for this quotation already in the thread → never a second one.
  const { data: existing } = await ctx.db
    .from('messages')
    .select('id')
    .eq('conversation_id', ctx.conversationId)
    .eq('quotation_number', number)
    .eq('content_type', 'order_details')
    .neq('status', 'failed')
    .limit(1)
    .maybeSingle();
  if (existing) {
    console.info('[bnp] payment request already sent for', number);
    return;
  }

  // Serialise concurrent Accept taps (distinct wamids) so only one builds
  // and sends the payment request. Released on failure so a retap can retry.
  const payKey = `payreq:${number}:${ctx.conversationId}`;
  const won = await claimEvent(ctx.db, {
    accountId: ctx.accountId,
    kind: 'payment_request',
    dedupeKey: payKey,
    quotationNumber: number,
    conversationId: ctx.conversationId,
  });
  if (!won) {
    console.info('[bnp] payment request already in flight/sent for', number);
    return;
  }

  try {
    const advance = advancePercentFromEnv();
    const payment = await createPaymentRequest(
      number,
      advance !== undefined ? { advancePercent: advance } : {}
    );
    await sendMessageToConversation(ctx.db, ctx.accountId, {
      conversationId: ctx.conversationId,
      messageType: 'order_details',
      orderDetailsMessage: payment.message,
      quotationNumber: number,
      automated: true,
    });
    await note(
      ctx,
      `Customer accepted quotation ${number}. Payment request for ₹${formatRupees(payment.amount_paise)} sent (ref ${payment.reference}).`
    );
  } catch (err) {
    console.error(
      '[bnp] payment request failed:',
      err instanceof Error ? err.message : err
    );
    await releaseEvent(ctx.db, ctx.accountId, payKey);
    await reply(ctx, COPY.error(number));
    await note(
      ctx,
      `Customer accepted quotation ${number}, but the payment request could not be sent (${
        err instanceof Error ? err.message : 'unknown error'
      }). Please send it manually.`
    );
  }
}
