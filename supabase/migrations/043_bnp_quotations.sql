-- ============================================================
-- 043_bnp_quotations
--
-- BrickNPapers (BNP) quotation flow. Connect sends a quotation on
-- WhatsApp, the customer taps Accept / Reject, and on Accept BNP hands
-- back a Razorpay `order_details` payload that Connect sends as a
-- payment request. See docs/bnp-quotations.md.
--
-- Three changes:
--
--   1. `messages.content_type` also allows 'order_details' — the
--      outbound WhatsApp payment-request message.
--
--   2. `messages.payment_status` / `payment_reference` /
--      `payment_amount_paise` / `quotation_number`. WhatsApp reports a
--      payment's progress (pending / captured / failed) as a `payment`
--      status on the order_details message; we record it so the inbox
--      bubble can show it. It is informational only — BNP's
--      `payment.paid` callback is the source of truth for the order.
--
--   3. `bnp_quotation_events` — an idempotency + routing table, written
--      only by server code (service role). Every row is a claim on a
--      `dedupe_key`, so a retried Meta webhook or BNP callback can't
--      send a second payment request / confirmation. `quotation_number`
--      + `conversation_id` also let the BNP callback find the right
--      tenant without guessing from a phone number.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. content_type ------------------------------------------------
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive', 'order_details'
  ));

-- 2. payment columns ---------------------------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS quotation_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount_paise BIGINT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_payment_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN (
    'pending', 'captured', 'failed'
  ));

COMMENT ON COLUMN messages.payment_status IS
  'Latest WhatsApp `payment` status for an order_details message '
  '(pending / captured / failed). Informational — BNP''s payment.paid '
  'callback is the source of truth for the order.';
COMMENT ON COLUMN messages.payment_reference IS
  'BNP payment-request reference (order_details reference_id).';

CREATE INDEX IF NOT EXISTS messages_payment_reference_idx
  ON messages (payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_quotation_number_idx
  ON messages (conversation_id, quotation_number)
  WHERE quotation_number IS NOT NULL;

-- 3. bnp_quotation_events ----------------------------------------
CREATE TABLE IF NOT EXISTS bnp_quotation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- What this row is a claim for: 'sent' (quotation delivered),
  -- 'button' (a tap, keyed on its wamid), 'payment_paid' (BNP callback,
  -- keyed on the payment reference).
  kind TEXT NOT NULL CHECK (kind IN ('sent', 'button', 'payment_request', 'payment_paid')),
  -- Globally unique per account, e.g. `button:<wamid>`,
  -- `paid:<reference>`, `sent:<number>`.
  dedupe_key TEXT NOT NULL,
  quotation_number TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS bnp_quotation_events_number_idx
  ON bnp_quotation_events (quotation_number, created_at DESC)
  WHERE quotation_number IS NOT NULL;

-- RLS on with NO policies: only the service role (webhooks, the send
-- action's admin client) touches this table; no dashboard user should.
ALTER TABLE bnp_quotation_events ENABLE ROW LEVEL SECURITY;
