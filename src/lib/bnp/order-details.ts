// Validation for the `order_details` WhatsApp message BNP returns from
// /payment-request. BNP builds it (Razorpay deep-integration mode);
// Connect only sanity-checks the shape before spending a Meta call, and
// extracts the fields it persists. We forward ONLY `interactive` —
// recipient, messaging_product and type are always ours.

export interface OrderDetailsInfo {
  interactive: Record<string, unknown>;
  /** `action.parameters.reference_id` — ties the message to the BNP payment. */
  reference: string;
  /** total_amount.value / offset, in paise; null when not derivable. */
  amountPaise: number | null;
  bodyText: string;
}

export type OrderDetailsParse =
  { ok: true; info: OrderDetailsInfo } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseOrderDetailsMessage(message: unknown): OrderDetailsParse {
  if (!isRecord(message) || !isRecord(message.interactive)) {
    return { ok: false, error: 'BNP payment message has no interactive body.' };
  }
  const interactive = message.interactive;
  if (interactive.type !== 'order_details') {
    return {
      ok: false,
      error: 'BNP payment message is not an order_details message.',
    };
  }
  const body = interactive.body;
  const bodyText =
    isRecord(body) && typeof body.text === 'string' ? body.text : '';
  if (!bodyText.trim()) {
    return { ok: false, error: 'BNP payment message has no body text.' };
  }
  const action = interactive.action;
  const params =
    isRecord(action) && isRecord(action.parameters) ? action.parameters : null;
  if (!params) {
    return {
      ok: false,
      error: 'BNP payment message has no action parameters.',
    };
  }
  const reference = params.reference_id;
  if (typeof reference !== 'string' || !reference.trim()) {
    return { ok: false, error: 'BNP payment message has no reference_id.' };
  }
  const total = params.total_amount;
  if (!isRecord(total) || typeof total.value !== 'number') {
    return { ok: false, error: 'BNP payment message has no total_amount.' };
  }
  const offset =
    typeof total.offset === 'number' && total.offset > 0 ? total.offset : 100;
  // value is in the smallest unit / offset; INR offset 100 ⇒ value is paise.
  const amountPaise = Math.round((total.value / offset) * 100);
  return { ok: true, info: { interactive, reference, amountPaise, bodyText } };
}
