import crypto from 'node:crypto';

/**
 * Verify BNP's `x-bnp-signature` header: hex HMAC-SHA256 of the RAW
 * request body, keyed with the shared BNP_API_KEY. Constant-time, and
 * fails closed when the key is unset or the header is malformed.
 */
export function verifyBnpSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined = process.env.BNP_API_KEY
): boolean {
  const key = secret?.trim();
  if (!key || !signature) return false;
  const provided = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;

  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), expected);
}

/** Test/helper: produce the signature BNP would send. */
export function signBnpPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}
