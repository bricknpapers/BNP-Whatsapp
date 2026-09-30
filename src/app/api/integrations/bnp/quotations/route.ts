import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { getQuotation, isBnpConfigured } from '@/lib/bnp/client';
import { quotationErrorResponse } from '@/lib/bnp/http';
import {
  isSessionWindowOpen,
  quotationTemplateConfig,
  sendQuotationToConversation,
} from '@/lib/bnp/send-quotation';

// Dashboard endpoints behind the inbox composer's "Quotation" action.
// Auth + rate limit mirror /api/whatsapp/send: the 'agent' role (the
// same gate as sending) and the per-user send budget. BNP is the source
// of truth — nothing here computes a price.

/**
 * GET ?number=Q-2026-0001[&conversation_id=…]
 * Preview: what BNP has for this number, plus how it would be delivered
 * (inside the 24h window as PDF + buttons, or as a template).
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`bnp-quote:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const { searchParams } = new URL(request.url);
    const number = searchParams.get('number')?.trim();
    if (!number) {
      return NextResponse.json(
        { error: 'number is required' },
        { status: 400 }
      );
    }
    if (!isBnpConfigured()) {
      return NextResponse.json(
        {
          error: 'BNP integration is not configured.',
          code: 'bnp_not_configured',
        },
        { status: 503 }
      );
    }

    const quotation = await getQuotation(number);

    let mode: 'session' | 'template' | null = null;
    const conversationId = searchParams.get('conversation_id');
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (conv) {
        mode = (await isSessionWindowOpen(supabase, conv.id))
          ? 'session'
          : 'template';
      }
    }

    return NextResponse.json({
      quotation: {
        number: quotation.number,
        status: quotation.status,
        customer_name: quotation.customer?.name ?? null,
        customer_company: quotation.customer?.company ?? null,
        total_paise: quotation.total_paise,
        valid_until: quotation.valid_until,
        has_pdf: Boolean(quotation.pdf_download_url),
      },
      delivery: {
        mode,
        template_configured: quotationTemplateConfig() !== null,
      },
    });
  } catch (error) {
    const mapped = quotationErrorResponse(error);
    if (mapped) return mapped;
    console.error('Error in BNP quotation preview:', error);
    return toErrorResponse(error);
  }
}

/** POST { conversation_id | contact_id, number } → send the quotation. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`bnp-quote:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const number = typeof body?.number === 'string' ? body.number.trim() : '';
    const conversationInput =
      typeof body?.conversation_id === 'string' ? body.conversation_id : null;
    const contactId =
      typeof body?.contact_id === 'string' ? body.contact_id : null;

    if (!number || (!conversationInput && !contactId)) {
      return NextResponse.json(
        { error: 'number plus conversation_id or contact_id is required' },
        { status: 400 }
      );
    }
    if (!isBnpConfigured()) {
      return NextResponse.json(
        {
          error: 'BNP integration is not configured.',
          code: 'bnp_not_configured',
        },
        { status: 503 }
      );
    }

    let conversationId = conversationInput;
    if (!conversationId && contactId) {
      // Same find-or-create as /api/whatsapp/send's contact_id path.
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', contactId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (!contact) {
        return NextResponse.json(
          { error: 'Contact not found' },
          { status: 404 }
        );
      }
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle();
      if (existing) {
        conversationId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: userId,
            contact_id: contactId,
          })
          .select('id')
          .single();
        if (error || !created) {
          return NextResponse.json(
            { error: 'Failed to open a conversation for this contact' },
            { status: 500 }
          );
        }
        conversationId = created.id;
      }
    }

    const result = await sendQuotationToConversation(
      supabase,
      accountId,
      conversationId!,
      number
    );
    return NextResponse.json({
      success: true,
      quotation_number: result.quotationNumber,
      mode: result.mode,
      message_ids: result.messageIds,
      marked_sent: result.markedSent,
      warning: result.warning ?? null,
    });
  } catch (error) {
    const mapped = quotationErrorResponse(error);
    if (mapped) return mapped;
    console.error('Error in BNP quotation send:', error);
    return toErrorResponse(error);
  }
}
