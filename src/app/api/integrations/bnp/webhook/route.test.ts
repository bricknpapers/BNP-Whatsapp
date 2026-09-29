import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  after: [] as (() => Promise<void> | void)[],
  processPaymentPaid: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (cb: () => Promise<void> | void) => {
    h.after.push(cb);
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/bnp/payment-callback', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processPaymentPaid: h.processPaymentPaid,
}));

import { POST } from './route';
import { signBnpPayload } from '@/lib/bnp/signature';

const KEY = 'shared-secret';
const payload = {
  event: 'payment.paid',
  reference: 'ref-1',
  quotation_id: 'u1',
  quotation_number: 'Q-2026-0001',
  order_id: 'BNP-1',
  amount_paise: 100,
  payment_id: 'pay_1',
};

function req(raw: string, signature: string | null) {
  return {
    text: async () => raw,
    headers: {
      get: (n: string) => (n === 'x-bnp-signature' ? signature : null),
    },
  } as unknown as Request;
}

async function call(raw: string, signature: string | null) {
  const res = (await POST(req(raw, signature))) as unknown as {
    body: unknown;
    status: number;
  };
  for (const cb of h.after) await cb();
  return res;
}

beforeEach(() => {
  process.env.BNP_API_KEY = KEY;
  h.after.length = 0;
  h.processPaymentPaid.mockResolvedValue('confirmed');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('BNP webhook route', () => {
  it('rejects a bad / missing signature with 401 and does no work', async () => {
    const raw = JSON.stringify(payload);
    expect((await call(raw, 'deadbeef')).status).toBe(401);
    expect((await call(raw, null)).status).toBe(401);
    expect((await call(raw, signBnpPayload(raw, 'other-key'))).status).toBe(
      401
    );
    expect(h.processPaymentPaid).not.toHaveBeenCalled();
  });

  it('rejects a body altered after signing', async () => {
    const raw = JSON.stringify(payload);
    const sig = signBnpPayload(raw, KEY);
    expect((await call(raw.replace('100', '999'), sig)).status).toBe(401);
  });

  it('fails closed when BNP_API_KEY is unset', async () => {
    const raw = JSON.stringify(payload);
    const sig = signBnpPayload(raw, KEY);
    delete process.env.BNP_API_KEY;
    expect((await call(raw, sig)).status).toBe(401);
  });

  it('acks a valid callback with 200 and processes after the response', async () => {
    const raw = JSON.stringify(payload);
    const res = await POST(req(raw, signBnpPayload(raw, KEY)));
    expect((res as unknown as { status: number }).status).toBe(200);
    expect(h.processPaymentPaid).not.toHaveBeenCalled(); // deferred to after()
    for (const cb of h.after) await cb();
    expect(h.processPaymentPaid).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ reference: 'ref-1' })
    );
  });

  it('400s invalid JSON and malformed payloads (signed)', async () => {
    const bad = '{nope';
    expect((await call(bad, signBnpPayload(bad, KEY))).status).toBe(400);
    const missing = JSON.stringify({ event: 'payment.paid' });
    expect((await call(missing, signBnpPayload(missing, KEY))).status).toBe(
      400
    );
    expect(h.processPaymentPaid).not.toHaveBeenCalled();
  });

  it('acks unknown events without processing', async () => {
    const raw = JSON.stringify({ event: 'quotation.viewed' });
    const res = await call(raw, signBnpPayload(raw, KEY));
    expect(res.status).toBe(200);
    expect(h.processPaymentPaid).not.toHaveBeenCalled();
  });

  it('a processing crash never surfaces', async () => {
    h.processPaymentPaid.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = JSON.stringify(payload);
    await expect(call(raw, signBnpPayload(raw, KEY))).resolves.toMatchObject({
      status: 200,
    });
  });
});
