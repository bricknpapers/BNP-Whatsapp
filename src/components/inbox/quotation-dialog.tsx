'use client';

import { useCallback, useState } from 'react';
import { Loader2, Search, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRupees } from '@/lib/bnp/format';

interface QuotationPreview {
  quotation: {
    number: string;
    status: string;
    customer_name: string | null;
    customer_company: string | null;
    total_paise: number;
    valid_until: string | null;
    has_pdf: boolean;
  };
  delivery: {
    mode: 'session' | 'template' | null;
    template_configured: boolean;
  };
}

interface QuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

/**
 * "Send quotation" — enter a BrickNPapers quotation number, review what
 * BNP has for it, and send it (PDF + Accept/Reject buttons, or an
 * approved template outside the 24h window). BNP owns the price; this
 * only displays it.
 */
export function QuotationDialog({
  open,
  onOpenChange,
  conversationId,
}: QuotationDialogProps) {
  const t = useTranslations('Inbox.quotation');
  const [number, setNumber] = useState('');
  const [preview, setPreview] = useState<QuotationPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setNumber('');
    setPreview(null);
    setError(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const lookup = useCallback(async () => {
    const trimmed = number.trim();
    if (!trimmed || looking) return;
    setLooking(true);
    setError(null);
    setPreview(null);
    try {
      const params = new URLSearchParams({
        number: trimmed,
        conversation_id: conversationId,
      });
      const res = await fetch(`/api/integrations/bnp/quotations?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.code === 'bnp_not_configured'
            ? t('notConfigured')
            : (data.error ?? t('lookupFailed'))
        );
        return;
      }
      setPreview(data as QuotationPreview);
    } catch {
      setError(t('lookupFailed'));
    } finally {
      setLooking(false);
    }
  }, [number, looking, conversationId, t]);

  const send = useCallback(async () => {
    if (!preview || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/integrations/bnp/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          number: preview.quotation.number,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('sendFailed'));
        return;
      }
      if (data.warning) {
        toast.warning(t('sentWarning', { warning: data.warning }));
      } else {
        toast.success(t('sent', { number: data.quotation_number }));
      }
      handleOpenChange(false);
    } catch {
      toast.error(t('sendFailed'));
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, sending, conversationId, t]);

  const q = preview?.quotation;
  const blocked =
    !q ||
    !q.has_pdf ||
    (preview.delivery.mode === 'template' &&
      !preview.delivery.template_configured);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quotation-number">{t('numberLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="quotation-number"
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setPreview(null);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void lookup();
                  }
                }}
                placeholder={t('numberPlaceholder')}
                autoComplete="off"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void lookup()}
                disabled={!number.trim() || looking}
              >
                {looking ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-1 h-4 w-4" />
                )}
                {t('lookup')}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>

          {q && preview && (
            <div className="border-border bg-card space-y-3 rounded-xl border p-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">{t('customer')}</dt>
                <dd className="text-right">
                  {[q.customer_name, q.customer_company]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </dd>
                <dt className="text-muted-foreground">{t('total')}</dt>
                <dd className="text-right font-semibold tabular-nums">
                  ₹{formatRupees(q.total_paise)}
                </dd>
                {q.valid_until && (
                  <>
                    <dt className="text-muted-foreground">{t('validUntil')}</dt>
                    <dd className="text-right">
                      {new Date(q.valid_until).toLocaleDateString()}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t('status')}</dt>
                <dd className="text-right capitalize">{q.status}</dd>
              </dl>
              <p className="text-muted-foreground text-xs">
                {!q.has_pdf
                  ? t('noPdf')
                  : preview.delivery.mode === 'template'
                    ? preview.delivery.template_configured
                      ? t('deliveryTemplate')
                      : t('deliveryTemplateMissing')
                    : t('deliverySession')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void send()} disabled={blocked || sending}>
            {sending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
