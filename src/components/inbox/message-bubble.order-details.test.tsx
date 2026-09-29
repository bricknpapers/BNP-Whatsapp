import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

import en from '../../../messages/en.json';
import type { Message } from '@/types';
import { MessageBubble } from './message-bubble';

function render(overrides: Partial<Message>) {
  const message: Message = {
    id: 'm1',
    conversation_id: 'c1',
    sender_type: 'bot',
    content_type: 'order_details',
    content_text: 'Advance for Q-2026-0001',
    status: 'sent',
    created_at: '2026-01-01T10:00:00.000Z',
    quotation_number: 'Q-2026-0001',
    payment_amount_paise: 1250000,
    payment_status: 'pending',
    ...overrides,
  };
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, {
      locale: 'en',
      messages: en,
      children: React.createElement(MessageBubble, { message }),
    })
  );
}

describe('MessageBubble — order_details (payment request)', () => {
  it('shows the amount, quotation and a pending status', () => {
    const html = render({});
    expect(html).toContain('Payment request');
    expect(html).toContain('₹12,500');
    expect(html).toContain('Quotation Q-2026-0001');
    expect(html).toContain('Payment pending');
    expect(html).toContain('data-payment-status="pending"');
  });

  it.each([
    ['captured', 'Paid'],
    ['failed', 'Payment failed'],
  ] as const)('renders %s as "%s"', (status, label) => {
    const html = render({ payment_status: status });
    expect(html).toContain(label);
    expect(html).toContain(`data-payment-status="${status}"`);
  });

  it('defaults a missing status to pending (rows without WhatsApp updates)', () => {
    expect(render({ payment_status: null })).toContain('Payment pending');
  });

  it('omits the amount when unknown', () => {
    expect(render({ payment_amount_paise: null })).not.toContain('₹');
  });
});
