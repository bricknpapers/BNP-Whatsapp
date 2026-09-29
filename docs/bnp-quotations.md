# BrickNPapers quotations on WhatsApp

Connect can send a **BrickNPapers (BNP)** quotation to a customer on
WhatsApp, let them **Accept / Reject** with buttons, and — on Accept —
send a **Razorpay payment request** inside the chat. BNP is the source of
truth: Connect never computes a price, it only relays BNP's numbers.

## The flow

```mermaid
sequenceDiagram
    autonumber
    participant A as Agent (Inbox)
    participant C as Connect
    participant B as BNP API
    participant W as WhatsApp / Meta
    participant U as Customer

    A->>C: "Send quotation" Q-2026-0001
    C->>B: GET /api/connect/quotations/Q-2026-0001
    C->>W: PDF (document) + Accept / Reject buttons<br/>(or approved template outside 24h)
    C->>B: POST …/sent
    W->>U: quotation
    U->>W: taps Accept  (button id quote:accept:Q-2026-0001)
    W->>C: webhook (interactive button_reply)
    C->>B: POST …/respond {action: accept}
    C->>B: POST …/payment-request {advance_percent?}
    B-->>C: { reference, amount_paise, message: order_details }
    C->>W: order_details message
    W->>U: "Review and pay" (Razorpay)
    U->>W: pays
    W->>C: webhook: statuses[type=payment] (captured/failed/pending) — informational
    B->>C: POST /api/integrations/bnp/webhook payment.paid (HMAC signed)
    C->>W: "Payment of ₹X received for Q-…; your order … is confirmed"
```

Reject: Connect calls `/respond {action: reject}`, sends a short
acknowledgement and leaves a note on the contact. If BNP answers **409**
(expired, or already in another state) the customer gets a polite message
and the thread gets a note — the webhook never errors.

## Setup

### 1. Environment variables

| Variable                          | Required | Purpose                                                                                                                                      |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `BNP_API_URL`                     | yes      | BNP base URL, e.g. `https://bnp.example.com` (no trailing slash needed).                                                                     |
| `BNP_API_KEY`                     | yes      | Bearer token for BNP's Connect API **and** the shared secret for the `x-bnp-signature` HMAC on BNP's callback. Same value on both sides.     |
| `QUOTATION_ADVANCE_PERCENT`       | no       | Advance % sent to BNP's `/payment-request`. Unset = BNP's own default. Only values in (0, 100] are used.                                     |
| `BNP_QUOTATION_TEMPLATE_NAME`     | for >24h | Approved template used when the chat is outside the 24-hour window (see below). Unset = sending outside the window fails with a clear error. |
| `BNP_QUOTATION_TEMPLATE_LANGUAGE` | no       | Template language code, e.g. `en` or `en_US`. Unset = the synced row's language.                                                             |

On the BNP side, point `CONNECT_WEBHOOK_URL` at
`https://<your connect host>/api/integrations/bnp/webhook`.

### 2. Database

Apply `supabase/migrations/043_bnp_quotations.sql` (adds the
`order_details` message type, payment columns on `messages`, and the
service-role-only `bnp_quotation_events` table used for idempotency and for
routing BNP's callback to the right account).

### 3. Meta / WhatsApp payments (India, Razorpay)

Payment requests are WhatsApp `order_details` messages in **Razorpay
deep-integration mode**, which Meta must have enabled for your WABA:

1. In **WhatsApp Manager → Payment settings** (India), add a
   **Razorpay** payment configuration and complete the account linking
   (Razorpay login/consent). Note the **configuration name** — BNP puts it in
   the `order_details` payload (`payment_settings`).
2. Confirm your WABA/business is eligible for WhatsApp Payments in India and
   that the phone number connected in Connect is the one the configuration
   is attached to.
3. Make sure your Meta App's webhook is subscribed to **`messages`** — the
   `payment` status updates arrive on the same field/webhook as other
   statuses (`/api/whatsapp/webhook`).

Connect does not build the payload; it forwards BNP's
`message.interactive` object as-is (recipient, `messaging_product` and
`type` are always set by Connect, never taken from BNP).

### 4. Quotation template (only for chats outside 24 hours)

Free-form messages and interactive buttons only work within 24 hours of the
customer's last message. Outside that window Connect sends an approved
**template** instead. Create one in Templates (and get it approved) with:

- Category **Utility**, name = `BNP_QUOTATION_TEMPLATE_NAME`.
- Optional **Document** header — Connect fills it with the quotation PDF.
- Body variables in this order: `{{1}}` customer name, `{{2}}` quotation
  number, `{{3}}` total (e.g. `₹12,500`). Fewer variables are fine.
- **Two Quick-reply buttons**, first = Accept, second = Reject. Connect sets
  their payloads to the same ids as the in-window buttons
  (`quote:accept:<number>` / `quote:reject:<number>`), so a tap is handled
  identically.

Example body: `Hi {{1}}, quotation {{2}} for {{3}} is ready. Please review the attached PDF and let us know.`

## Using it

Open a conversation → the **receipt** icon in the composer → enter the
quotation number → **Look up** → check the summary → **Send quotation**.
The summary tells you whether it will go as PDF + buttons (inside 24h) or as
the template (outside), and blocks the send with an explanation if no
template is configured. Both messages appear in the thread like any other
send, then Connect calls BNP's `/sent`.

Customers' Accept/Reject taps, the payment request, WhatsApp's payment
status (pending / paid / failed on the bubble) and BNP's final confirmation
all show up in the same thread. Notes ("Customer rejected quotation …",
"Payment of ₹… received …") are added to the contact's notes.

## Security & idempotency

- `POST /api/integrations/bnp/webhook` verifies `x-bnp-signature`
  (hex HMAC-SHA256 of the raw body, key = `BNP_API_KEY`) with
  `timingSafeEqual`, and fails closed if the key is unset. It answers 200
  immediately and works in the background.
- Meta retries are absorbed by the existing `(conversation_id, message_id)`
  insert **and** an explicit claim on the wamid; concurrent Accept taps are
  serialised by a per-quotation claim, and an existing `order_details`
  message in the thread is never duplicated. BNP additionally dedupes
  `/payment-request`.
- BNP's `payment.paid` is deduped on `reference`.
- Secrets come only from env and are never logged; phone numbers are not
  logged by this feature.
- WhatsApp's own `payment` status is recorded on the message **only for
  display**. The order is confirmed by BNP's callback.

## Multi-WABA

Nothing special is needed. Sends go through the same core as the inbox send,
which uses the account's own `whatsapp_config` (phone number id + token).
Inbound taps are routed by `phone_number_id` exactly like other messages.
BNP's callback is routed by the payment `reference` (stored on the
`order_details` message), then by the quotation number recorded when it was
sent, and only as a last resort by the customer's phone (normalised to
E.164, `91` assumed for 10-digit numbers; when several accounts know the
number, the most recently active conversation wins).

## Troubleshooting

| Symptom                                                        | Likely cause / fix                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialog says _BrickNPapers isn't connected_                     | `BNP_API_URL` / `BNP_API_KEY` missing on the Connect server (restart after setting).                                                                    |
| _BNP rejected the API key (401/403)_                           | Key differs from the one BNP expects.                                                                                                                   |
| Send fails outside 24h with _no quotation template configured_ | Set `BNP_QUOTATION_TEMPLATE_NAME`, sync/approve the template (step 4).                                                                                  |
| _Template … needs two QUICK_REPLY buttons_                     | The template must have Accept and Reject as its first two quick-reply buttons.                                                                          |
| Tapping Accept does nothing                                    | Check server logs for `[bnp]` lines. 409 from BNP means the quotation is expired/in another state (the customer gets a message + a note).               |
| Payment request never arrives after Accept                     | `/payment-request` failed — the contact gets an apology and a note says "send it manually". Check BNP logs and that the Razorpay config is active.      |
| BNP callback returns 401                                       | Signature mismatch: `BNP_API_KEY` differs, or a proxy re-encodes the body (the HMAC is over the raw bytes).                                             |
| Callback returns 200 but no confirmation message               | No conversation could be matched (`[bnp] payment.paid: no conversation found` in logs), or the 24h window closed (a note tells the agent to follow up). |
| Bubble stays "Payment pending"                                 | WhatsApp's payment status webhook didn't arrive; BNP's callback flips it to paid when it lands.                                                         |

## Not verified against live services

Built and unit-tested against the contract only. Not exercised with live
Meta, Razorpay or BNP: the exact `order_details` shape BNP returns and Meta
accepting it, template quick-reply payload delivery, the `payment` status
field names, and BNP's behaviour on repeated `/respond` calls. See the pull
request description for the full list.
