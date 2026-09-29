import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Claim an idempotency key in `bnp_quotation_events`. Returns true for
 * the first caller and false for any replay (Meta or BNP retrying).
 * The unique (account_id, dedupe_key) index is the single arbiter, so
 * two concurrent deliveries can't both win.
 *
 * On an unexpected DB error we return `true`: dropping a genuine tap or
 * payment confirmation is worse than the (BNP-deduped) risk of doing the
 * work twice.
 */
export async function claimEvent(
  db: SupabaseClient,
  claim: {
    accountId: string;
    kind: 'button' | 'payment_request' | 'payment_paid';
    dedupeKey: string;
    quotationNumber?: string | null;
    conversationId?: string | null;
  }
): Promise<boolean> {
  const { error } = await db.from('bnp_quotation_events').insert({
    account_id: claim.accountId,
    kind: claim.kind,
    dedupe_key: claim.dedupeKey,
    quotation_number: claim.quotationNumber ?? null,
    conversation_id: claim.conversationId ?? null,
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('[bnp] idempotency claim failed, proceeding:', error.message);
  return true;
}

/**
 * Leave an internal note on the contact (shown in the inbox sidebar).
 * Best-effort — a failed note must never fail the flow.
 */
export async function addContactNote(
  db: SupabaseClient,
  contactId: string,
  userId: string,
  text: string
): Promise<void> {
  const { error } = await db
    .from('contact_notes')
    .insert({ contact_id: contactId, user_id: userId, note_text: text });
  if (error) console.error('[bnp] adding contact note failed:', error.message);
}

/** Give a claim back so a failed attempt can be retried. Best-effort. */
export async function releaseEvent(
  db: SupabaseClient,
  accountId: string,
  dedupeKey: string
): Promise<void> {
  const { error } = await db
    .from('bnp_quotation_events')
    .delete()
    .eq('account_id', accountId)
    .eq('dedupe_key', dedupeKey);
  if (error)
    console.error('[bnp] releasing idempotency claim failed:', error.message);
}
