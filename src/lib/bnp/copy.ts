// Customer-facing WhatsApp copy for the quotation flow. English only:
// these are messages to the business's customers, not dashboard UI, so
// they don't go through the next-intl catalogues.

import { formatRupees } from './format';

export function quotationBody(q: {
  number: string;
  customerName?: string | null;
  totalPaise: number;
  validUntil?: string | null;
}): string {
  const greeting = q.customerName ? `Hi ${q.customerName},` : 'Hello,';
  const valid = q.validUntil ? formatDate(q.validUntil) : null;
  const lines = [
    `${greeting} please find quotation ${q.number} attached.`,
    `Total: ₹${formatRupees(q.totalPaise)}${valid ? ` · valid until ${valid}` : ''}`,
    'Would you like to go ahead?',
  ];
  return lines.join('\n');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export const COPY = {
  rejectAck: (n: string) =>
    `Thanks for letting us know — quotation ${n} has been marked as declined. If anything changes, just message us here.`,
  expired: (n: string) =>
    `Sorry, quotation ${n} has expired or can no longer be accepted. Please message us here and we'll share an updated one.`,
  unavailable: (n: string) =>
    `Sorry, quotation ${n} is no longer available to respond to. Please message us here and we'll help.`,
  alreadyHandled: (n: string) =>
    `Quotation ${n} is already accepted — the payment request is above in this chat.`,
  error: (n: string) =>
    `Sorry, we couldn't process your response to quotation ${n} right now. Our team has been notified and will get back to you shortly.`,
  paymentReceived: (
    amountPaise: number,
    quotation: string,
    order: string | null
  ) =>
    order
      ? `Payment of ₹${formatRupees(amountPaise)} received for ${quotation}. Thank you! Your order ${order} is confirmed.`
      : `Payment of ₹${formatRupees(amountPaise)} received for ${quotation}. Thank you! Your order is confirmed.`,
};
