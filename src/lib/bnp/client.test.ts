import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BnpError,
  createPaymentRequest,
  getBnpConfig,
  getQuotation,
  markQuotationSent,
  respondToQuotation,
} from './client';

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.BNP_API_URL = 'https://bnp.example.com/';
  process.env.BNP_API_KEY = 'secret-key';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BNP_API_URL;
  delete process.env.BNP_API_KEY;
});

describe('getBnpConfig', () => {
  it('trims the trailing slash', () => {
    expect(getBnpConfig().baseUrl).toBe('https://bnp.example.com');
  });
  it('throws not_configured when env is missing', () => {
    delete process.env.BNP_API_KEY;
    expect(() => getBnpConfig()).toThrowError(BnpError);
    try {
      getBnpConfig();
    } catch (e) {
      expect((e as BnpError).code).toBe('not_configured');
    }
  });
});

describe('getQuotation', () => {
  it('GETs with the bearer header and returns the body', async () => {
    fetchMock.mockResolvedValue(json({ id: 'u1', number: 'Q-2026-0001' }));
    const q = await getQuotation('Q-2026-0001');
    expect(q.number).toBe('Q-2026-0001');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://bnp.example.com/api/connect/quotations/Q-2026-0001'
    );
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('url-encodes the id', async () => {
    fetchMock.mockResolvedValue(json({}));
    await getQuotation('a/b c');
    expect(fetchMock.mock.calls[0][0]).toContain('/quotations/a%2Fb%20c');
  });

  it('rejects an empty id without calling BNP', async () => {
    await expect(getQuotation('  ')).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'not_found'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [409, 'conflict'],
    [422, 'bad_request'],
    [500, 'upstream'],
  ])('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(json({ error: 'nope' }, status));
    await expect(getQuotation('Q-1')).rejects.toMatchObject({ code, status });
  });

  it('never puts the api key in an error message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'bad' }, 401));
    await expect(getQuotation('Q-1')).rejects.toSatisfy(
      (e: Error) => !e.message.includes('secret-key')
    );
  });

  it('maps a timeout', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('t'), { name: 'TimeoutError' })
    );
    await expect(getQuotation('Q-1')).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('maps a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getQuotation('Q-1')).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('maps a non-JSON 200', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(getQuotation('Q-1')).rejects.toMatchObject({
      code: 'upstream',
    });
  });
});

describe('markQuotationSent / respondToQuotation', () => {
  it('POSTs /sent with no body', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await markQuotationSent('Q-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/quotations\/Q-1\/sent$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('POSTs the action to /respond', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await respondToQuotation('Q-1', 'accept');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/quotations\/Q-1\/respond$/);
    expect(JSON.parse(init.body)).toEqual({ action: 'accept' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('surfaces a 409 as conflict', async () => {
    fetchMock.mockResolvedValue(json({ error: 'expired' }, 409));
    await expect(respondToQuotation('Q-1', 'reject')).rejects.toMatchObject({
      code: 'conflict',
      status: 409,
    });
  });
});

describe('createPaymentRequest', () => {
  it('omits advance_percent unless provided', async () => {
    fetchMock.mockResolvedValue(json({ reference: 'r1' }));
    await createPaymentRequest('Q-1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it('passes advance_percent when provided', async () => {
    fetchMock.mockResolvedValue(json({ reference: 'r1' }));
    await createPaymentRequest('Q-1', { advancePercent: 50 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      advance_percent: 50,
    });
  });
});
