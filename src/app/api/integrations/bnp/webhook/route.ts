import { NextResponse, after } from 'next/server';

import { verifyBnpSignature } from '@/lib/bnp/signature';
import {
  parsePaymentPaid,
  processPaymentPaid,
} from '@/lib/bnp/payment-callback';
import { supabaseAdmin } from '@/lib/flows/admin-client';

// Send + DB work runs after the response, like the Meta webhook.
export const maxDuration = 60;

/**
 * BNP → Connect callback (BNP's CONNECT_WEBHOOK_URL points here).
 *
 * Auth is the `x-bnp-signature` header: hex HMAC-SHA256 of the RAW body
 * keyed with the shared BNP_API_KEY, verified in constant time before the
 * body is parsed. Returns 200 immediately and does the work in `after()`;
 * idempotent on the payment `reference`, so BNP retries are harmless.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyBnpSignature(rawBody, request.headers.get('x-bnp-signature'))) {
    console.warn('[bnp-webhook] rejected request with invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parsePaymentPaid(body);
  if (parsed.ok === 'ignored') {
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }

  after(async () => {
    try {
      await processPaymentPaid(supabaseAdmin(), parsed.payload);
    } catch (error) {
      console.error('[bnp-webhook] processing failed:', error);
    }
  });

  return NextResponse.json({ status: 'received' }, { status: 200 });
}
