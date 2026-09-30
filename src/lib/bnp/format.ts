/** Paise → "1,23,456.78" style rupee string (en-IN grouping). */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Normalise a customer phone from BNP to digits-only E.164 (no `+`).
 * A bare 10-digit number is Indian (91 default); a leading 0 trunk
 * prefix on such a number is dropped. Anything else must already carry
 * its country code. Returns null when it can't be a valid number.
 */
export function normalizeBnpPhone(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('00')) digits = digits.replace(/^00/, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

export const QUOTE_BUTTON_RE = /^quote:(accept|reject):([A-Za-z0-9._-]{1,64})$/;

export function quoteButtonId(
  action: 'accept' | 'reject',
  number: string
): string {
  return `quote:${action}:${number}`;
}

export function parseQuoteButtonId(
  id: string | null | undefined
): { action: 'accept' | 'reject'; number: string } | null {
  const m = id ? QUOTE_BUTTON_RE.exec(id) : null;
  return m ? { action: m[1] as 'accept' | 'reject', number: m[2] } : null;
}
