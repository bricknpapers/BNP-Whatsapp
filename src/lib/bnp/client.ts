// ============================================================
// BrickNPapers (BNP) API client — server-side only.
//
// BNP owns quotations and prices; Connect never computes them. This is
// a thin typed wrapper over BNP's bearer-authenticated Connect API:
//
//   GET  /api/connect/quotations/:id
//   POST /api/connect/quotations/:id/sent
//   POST /api/connect/quotations/:id/respond
//   POST /api/connect/quotations/:id/payment-request
//
// `:id` is the quotation uuid or its number (e.g. Q-2026-0001).
// Config comes from BNP_API_URL + BNP_API_KEY; the same key signs BNP's
// payment.paid callback (see ./signature.ts). Never log the key.
// ============================================================

export const BNP_TIMEOUT_MS = 10_000;

export type BnpErrorCode =
  | 'not_configured'
  | 'not_found'
  | 'unauthorized'
  | 'conflict'
  | 'bad_request'
  | 'timeout'
  | 'network'
  | 'upstream';

/**
 * Typed failure. `status` is BNP's HTTP status (0 when we never got a
 * response); `code` is the coarse category callers branch on. `message`
 * is safe to show to an agent — it never contains the API key.
 */
export class BnpError extends Error {
  readonly code: BnpErrorCode;
  readonly status: number;
  constructor(code: BnpErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'BnpError';
    this.code = code;
    this.status = status;
  }
}

export interface BnpCustomer {
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * `status` is deliberately a plain string: BNP owns the state machine
 * (draft / sent / accepted / rejected / expired / converted …) and may
 * add states without breaking Connect.
 */
export interface BnpQuotation {
  id: string;
  number: string;
  status: string;
  customer: BnpCustomer;
  total_paise: number;
  valid_until: string | null;
  converted_order_id: string | null;
  pdf_url: string | null;
  pdf_download_url: string | null;
}

/** A complete WhatsApp Cloud API `messages` body (order_details). */
export type BnpOrderDetailsMessage = Record<string, unknown>;

export interface BnpPaymentRequest {
  reference: string;
  amount_paise: number;
  quotation: BnpQuotation | Record<string, unknown>;
  message: BnpOrderDetailsMessage;
}

export interface BnpConfig {
  baseUrl: string;
  apiKey: string;
}

/** Read + validate env. Throws `not_configured` so callers can say so. */
export function getBnpConfig(): BnpConfig {
  const baseUrl = process.env.BNP_API_URL?.trim();
  const apiKey = process.env.BNP_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new BnpError(
      'not_configured',
      'BNP integration is not configured. Set BNP_API_URL and BNP_API_KEY.'
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
}

export function isBnpConfigured(): boolean {
  return Boolean(
    process.env.BNP_API_URL?.trim() && process.env.BNP_API_KEY?.trim()
  );
}

async function bnpRequest<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown }
): Promise<T> {
  const { baseUrl, apiKey } = getBnpConfig();
  const url = `${baseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(BNP_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new BnpError(
        'timeout',
        `BNP did not respond within ${BNP_TIMEOUT_MS / 1000}s.`
      );
    }
    throw new BnpError('network', 'Could not reach BNP.');
  }

  if (!response.ok) {
    throw await toHttpError(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new BnpError(
      'upstream',
      'BNP returned an invalid response.',
      response.status
    );
  }
}

async function toHttpError(response: Response): Promise<BnpError> {
  let detail = '';
  try {
    const data = (await response.json()) as {
      error?: unknown;
      message?: unknown;
    };
    const raw = data?.error ?? data?.message;
    if (typeof raw === 'string') detail = raw.slice(0, 200);
  } catch {
    // Non-JSON error body — the status is enough.
  }
  const suffix = detail ? `: ${detail}` : '';
  const { status } = response;
  if (status === 404)
    return new BnpError('not_found', `Quotation not found${suffix}`, status);
  if (status === 401 || status === 403) {
    return new BnpError(
      'unauthorized',
      `BNP rejected the API key (${status})${suffix}`,
      status
    );
  }
  if (status === 409)
    return new BnpError('conflict', `Quotation conflict${suffix}`, status);
  if (status >= 400 && status < 500) {
    return new BnpError(
      'bad_request',
      `BNP rejected the request (${status})${suffix}`,
      status
    );
  }
  return new BnpError('upstream', `BNP error (${status})${suffix}`, status);
}

function idPath(id: string): string {
  const trimmed = id.trim();
  if (!trimmed)
    throw new BnpError('bad_request', 'Quotation number is required.');
  return encodeURIComponent(trimmed);
}

export async function getQuotation(id: string): Promise<BnpQuotation> {
  return bnpRequest<BnpQuotation>(`/api/connect/quotations/${idPath(id)}`, {
    method: 'GET',
  });
}

/** draft → sent. Idempotent on BNP's side. */
export async function markQuotationSent(id: string): Promise<unknown> {
  return bnpRequest<unknown>(`/api/connect/quotations/${idPath(id)}/sent`, {
    method: 'POST',
  });
}

/** 409 (`conflict`) if the quotation is expired or in another state. */
export async function respondToQuotation(
  id: string,
  action: 'accept' | 'reject'
): Promise<unknown> {
  return bnpRequest<unknown>(`/api/connect/quotations/${idPath(id)}/respond`, {
    method: 'POST',
    body: { action },
  });
}

/**
 * `advancePercent` is passed only when given — BNP has its own default.
 * Returns the ready-to-send `order_details` message.
 */
export async function createPaymentRequest(
  id: string,
  opts: { advancePercent?: number } = {}
): Promise<BnpPaymentRequest> {
  const body =
    opts.advancePercent !== undefined
      ? { advance_percent: opts.advancePercent }
      : {};
  return bnpRequest<BnpPaymentRequest>(
    `/api/connect/quotations/${idPath(id)}/payment-request`,
    { method: 'POST', body }
  );
}
