// ============================================================
// BNP → Connect `payment.paid` callback processing.
//
// BNP's callback is the source of truth for the order (WhatsApp's own
// `payment` status is only informational). We:
//   1. find the conversation — by the payment reference we stored on the
//      order_details message, else by the quotation link recorded at send
//      time, else (last resort) by the customer's phone from BNP;
//   2. claim `paid:<reference>` so a BNP retry / duplicate is a no-op;
//   3. send the customer a confirmation and leave a note.
// Never throws.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { getQuotation } from './client';
import { COPY } from './copy';
import { addContactNote, claimEvent } from './events';
import { formatRupees, normalizeBnpPhone } from './format';

export interface PaymentPaidPayload {
  event: 'payment.paid';
  reference: string;
  quotation_id?: string;
  quotation_number: string;
  order_id?: string | null;
  amount_paise: number;
  payment_id?: string | null;
}

export type PaymentPaidParse =
  { ok: true; payload: PaymentPaidPayload } | { ok: false; reason: string };

/** Shape-check BNP's JSON. Unknown events are `ignored`, not errors. */
export function parsePaymentPaid(
  raw: unknown
): PaymentPaidParse | { ok: 'ignored' } {
  if (typeof raw !== 'object' || raw === null)
    return { ok: false, reason: 'body must be an object' };
  const b = raw as Record<string, unknown>;
  if (b.event !== 'payment.paid') return { ok: 'ignored' };
  const str = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const reference = str(b.reference);
  const number = str(b.quotation_number);
  if (!reference) return { ok: false, reason: 'reference is required' };
  if (!number) return { ok: false, reason: 'quotation_number is required' };
  if (
    typeof b.amount_paise !== 'number' ||
    !Number.isFinite(b.amount_paise) ||
    b.amount_paise < 0
  ) {
    return { ok: false, reason: 'amount_paise must be a non-negative number' };
  }
  return {
    ok: true,
    payload: {
      event: 'payment.paid',
      reference,
      quotation_id: str(b.quotation_id) ?? undefined,
      quotation_number: number,
      order_id: str(b.order_id),
      amount_paise: b.amount_paise,
      payment_id: str(b.payment_id),
    },
  };
}

interface Target {
  accountId: string;
  conversationId: string;
  contactId: string;
}

export type PaymentPaidOutcome =
  'confirmed' | 'duplicate' | 'no_conversation' | 'error';

export async function processPaymentPaid(
  db: SupabaseClient,
  p: PaymentPaidPayload
): Promise<PaymentPaidOutcome> {
  try {
    const target = await resolveTarget(db, p);
    if (!target) {
      console.error(
        '[bnp] payment.paid: no conversation found for',
        p.quotation_number,
        '(reference',
        p.reference + ')'
      );
      return 'no_conversation';
    }

    const first = await claimEvent(db, {
      accountId: target.accountId,
      kind: 'payment_paid',
      dedupeKey: `paid:${p.reference}`,
      quotationNumber: p.quotation_number,
      conversationId: target.conversationId,
    });
    if (!first) {
      console.info('[bnp] duplicate payment.paid ignored:', p.reference);
      return 'duplicate';
    }

    // BNP is authoritative: mark the order_details bubble captured even if
    // WhatsApp's own payment status never arrives. Best-effort.
    const { error: markErr } = await db
      .from('messages')
      .update({ payment_status: 'captured' })
      .eq('payment_reference', p.reference);
    if (markErr)
      console.error('[bnp] marking payment captured failed:', markErr.message);

    const { data: config } = await db
      .from('whatsapp_config')
      .select('user_id')
      .eq('account_id', target.accountId)
      .maybeSingle();
    const ownerUserId: string | undefined = config?.user_id;

    const noteText = `Payment of ₹${formatRupees(p.amount_paise)} received for ${p.quotation_number}${
      p.order_id ? ` — order ${p.order_id}` : ''
    }${p.payment_id ? ` (payment ${p.payment_id})` : ''}.`;

    let sent = true;
    try {
      await sendMessageToConversation(db, target.accountId, {
        conversationId: target.conversationId,
        messageType: 'text',
        contentText: COPY.paymentReceived(
          p.amount_paise,
          p.quotation_number,
          p.order_id ?? null
        ),
        quotationNumber: p.quotation_number,
        automated: true,
      });
    } catch (err) {
      sent = false;
      console.error(
        '[bnp] payment confirmation send failed:',
        err instanceof Error ? err.message : err
      );
    }

    if (ownerUserId) {
      await addContactNote(
        db,
        target.contactId,
        ownerUserId,
        sent
          ? noteText
          : `${noteText} The WhatsApp confirmation could not be sent — please tell the customer.`
      );
    }
    return 'confirmed';
  } catch (err) {
    console.error(
      '[bnp] payment.paid processing failed:',
      err instanceof Error ? err.message : err
    );
    return 'error';
  }
}

async function resolveTarget(
  db: SupabaseClient,
  p: PaymentPaidPayload
): Promise<Target | null> {
  // 1. The order_details message we sent carries the payment reference.
  const { data: byRef } = await db
    .from('messages')
    .select('conversation_id, conversations!inner(account_id, contact_id)')
    .eq('payment_reference', p.reference)
    .limit(1)
    .maybeSingle();
  const fromRef = toTarget(byRef?.conversation_id, byRef?.conversations);
  if (fromRef) return fromRef;

  // 2. The conversation the quotation was sent to / accepted in.
  const { data: link } = await db
    .from('bnp_quotation_events')
    .select('account_id, conversation_id, conversations!inner(contact_id)')
    .eq('quotation_number', p.quotation_number)
    .in('kind', ['payment_request', 'sent'])
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (link?.conversation_id) {
    const conv = one(link.conversations) as { contact_id?: string } | null;
    if (conv?.contact_id) {
      return {
        accountId: link.account_id,
        conversationId: link.conversation_id,
        contactId: conv.contact_id,
      };
    }
  }

  // 3. Fall back to the customer's phone as BNP knows it.
  return resolveByPhone(db, p.quotation_number);
}

async function resolveByPhone(
  db: SupabaseClient,
  number: string
): Promise<Target | null> {
  let phone: string | null;
  try {
    phone = normalizeBnpPhone((await getQuotation(number)).customer?.phone);
  } catch {
    return null;
  }
  if (!phone) return null;

  const { data: contacts } = await db
    .from('contacts')
    .select('id, account_id')
    .in('phone', [phone, `+${phone}`]);
  if (!contacts?.length) return null;

  const { data: convs } = await db
    .from('conversations')
    .select('id, account_id, contact_id, last_message_at')
    .in(
      'contact_id',
      contacts.map((c: { id: string }) => c.id)
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);
  const conv = convs?.[0];
  return conv
    ? {
        accountId: conv.account_id,
        conversationId: conv.id,
        contactId: conv.contact_id,
      }
    : null;
}

/** PostgREST returns an embedded to-one relation as an object (or a 1-array in some typings). */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function toTarget(
  conversationId: string | undefined,
  rel: unknown
): Target | null {
  const c = one(rel as { account_id?: string; contact_id?: string } | null);
  if (!conversationId || !c?.account_id || !c.contact_id) return null;
  return { accountId: c.account_id, conversationId, contactId: c.contact_id };
}
