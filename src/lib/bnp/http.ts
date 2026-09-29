import { NextResponse } from 'next/server';

import { SendMessageError } from '@/lib/whatsapp/send-message';
import { BnpError, type BnpErrorCode } from './client';

const BNP_STATUS: Record<BnpErrorCode, number> = {
  not_configured: 503,
  not_found: 404,
  unauthorized: 502, // BNP rejected OUR key — an upstream/config fault, not the caller's
  conflict: 409,
  bad_request: 400,
  timeout: 504,
  network: 502,
  upstream: 502,
};

/**
 * Map the errors the quotation routes can raise onto the dashboard's
 * internal `{ error, code }` shape. Returns null for anything else so
 * the caller falls through to its generic handler.
 */
export function quotationErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof BnpError) {
    return NextResponse.json(
      { error: err.message, code: `bnp_${err.code}` },
      { status: BNP_STATUS[err.code] }
    );
  }
  if (err instanceof SendMessageError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status }
    );
  }
  return null;
}
