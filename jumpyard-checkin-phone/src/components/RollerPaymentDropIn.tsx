'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import type { NewBookingDraftResult } from '@/flow/cloudClient';

type PaymentStatus = 'bootstrapping' | 'ready' | 'received' | 'approved' | 'failed' | 'blocked';

export interface RollerPaymentResultSummary {
  message: string | null;
  provider: string | null;
  status: 'approved' | 'failed' | 'unknown';
}

interface RollerPaymentDropInProps {
  amountLabel: string;
  onApproved: (result: RollerPaymentResultSummary) => void;
  onFailed: (result: RollerPaymentResultSummary) => void;
  paymentSession: NewBookingDraftResult['paymentSession'];
}

const PAYMENT_CONTAINER_ID = 'roller-payment-container';

export const RollerPaymentDropIn = ({
  amountLabel,
  onApproved,
  onFailed,
  paymentSession,
}: RollerPaymentDropInProps) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PaymentStatus>('bootstrapping');
  const [message, setMessage] = useState<string | null>(null);
  const startedRef = useRef(false);
  const onApprovedRef = useRef(onApproved);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onApprovedRef.current = onApproved;
    onFailedRef.current = onFailed;
  }, [onApproved, onFailed]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function setupPayment() {
      const jwt = paymentSession.jwt?.trim();
      const config = paymentSession.config;

      if (!jwt || !paymentSession.jwtPresent) {
        setStatus('blocked');
        setMessage(t.buy.paymentMissingJwt);
        return;
      }

      if (!config?.available || !config.apiUrl || !config.configurationId || !config.integrationId) {
        setStatus('blocked');
        setMessage(t.buy.paymentMissingConfig);
        return;
      }

      try {
        const { EcomPaymentService, PaymentResult } = await import('@roller/ecom-payments');
        if (cancelled) return;

        const paymentService = new EcomPaymentService();
        const handlers = {
          onReady: () => {
            if (!cancelled) setStatus('ready');
          },
          onPaymentReceived: () => {
            if (!cancelled) setStatus('received');
          },
          onPaymentCompleted: (result: unknown) => {
            const summary = normalizePaymentResult(result, PaymentResult);
            if (summary.status === 'approved') {
              setStatus('approved');
              setMessage(summary.message);
              onApprovedRef.current(summary);
              return;
            }

            setStatus(summary.status === 'failed' ? 'failed' : 'received');
            setMessage(summary.message ?? t.buy.paymentUnknownResult);
            onFailedRef.current(summary);
          },
        };

        const paymentConfiguration = await paymentService.bootstrap(
          {
            apiUrl: config.apiUrl,
            configurationId: config.configurationId,
            integrationId: config.integrationId,
          },
          {
            http: {
              get: paymentGet,
              post: paymentPost,
            },
            log: {
              error: () => undefined,
              info: () => undefined,
              warn: () => undefined,
            },
            translate: (key: string) => key,
          }
        );

        if (cancelled) return;

        if (!paymentConfiguration) {
          setStatus('blocked');
          setMessage(t.buy.paymentBlockedDesc);
          return;
        }

        if (paymentService.hasRedirectResult()) {
          setStatus('received');
          await paymentService.handleRedirect(handlers);
          return;
        }

        const setupResult = await paymentService.setup({
          hasRecurringBilling: false,
          jwt,
          paymentContainerDivId: PAYMENT_CONTAINER_ID,
          redirectUrl: `${window.location.origin}${window.location.pathname}`,
          handlers,
        });

        if (!cancelled && typeof setupResult === 'string' && setupResult.trim()) {
          setStatus('failed');
          setMessage(setupResult);
        }
      } catch (error) {
        if (cancelled) return;
        setStatus('failed');
        setMessage(error instanceof Error ? error.message : t.buy.paymentFailedDesc);
      }
    }

    void setupPayment();

    return () => {
      cancelled = true;
    };
  }, [
    paymentSession.config,
    paymentSession.jwt,
    paymentSession.jwtPresent,
    t.buy.paymentFailedDesc,
    t.buy.paymentBlockedDesc,
    t.buy.paymentMissingConfig,
    t.buy.paymentMissingJwt,
    t.buy.paymentUnknownResult,
  ]);

  return (
    <div className="bg-white border border-border rounded-xl p-4 text-left" data-roller-payment-status={status}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0">
          {status === 'approved' ? (
            <CheckCircle2 size={22} className="text-success" />
          ) : status === 'failed' || status === 'blocked' ? (
            <AlertCircle size={22} className="text-danger" />
          ) : (
            <CreditCard size={22} className="text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black italic uppercase text-foreground">{getStatusTitle(status, t.buy)}</p>
          <p className="text-xs text-muted mt-0.5">{getStatusDescription(status, amountLabel, message, t.buy)}</p>
        </div>
      </div>

      {(status === 'bootstrapping' || status === 'received') && (
        <div className="flex items-center gap-2 text-xs font-bold italic uppercase text-muted">
          <Loader2 size={14} className="animate-spin" />
          {status === 'received' ? t.buy.paymentReceived : t.buy.paymentStarting}
        </div>
      )}

      <div id={PAYMENT_CONTAINER_ID} className="min-h-16" />
    </div>
  );
};

async function paymentGet(url: string, params?: Record<string, unknown>, options?: PaymentHttpOptions) {
  const target = new URL(url);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  });
  return paymentFetch(target.toString(), 'GET', undefined, options);
}

async function paymentPost(url: string, data?: unknown, options?: PaymentHttpOptions) {
  return paymentFetch(url, 'POST', data, options);
}

async function paymentFetch(url: string, method: 'GET' | 'POST', data?: unknown, options?: PaymentHttpOptions) {
  const headers = normalizeHeaders(options?.headers);
  if (method === 'POST' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(url, {
    body: method === 'POST' ? JSON.stringify(data ?? {}) : undefined,
    headers,
    method,
  });
  const text = await response.text();
  const body = parsePaymentResponse(text);

  if (!response.ok) {
    throw new Error(`Payment request failed with HTTP ${response.status}.`);
  }

  return body;
}

function parsePaymentResponse(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface PaymentHttpOptions {
  headers?: Record<string, string | string[]>;
}

function normalizeHeaders(input?: Record<string, string | string[]>) {
  const headers = new Headers();

  Object.entries(input ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) headers.set(key, value.join(','));
    else if (value !== undefined) headers.set(key, value);
  });

  return headers;
}

function normalizePaymentResult(
  result: unknown,
  paymentResultEnum: { approved?: number; failed?: number } | undefined
): RollerPaymentResultSummary {
  const value = isPaymentResult(result) ? result.result : 0;
  const approved = paymentResultEnum?.approved ?? 1;
  const failed = paymentResultEnum?.failed ?? 2;

  return {
    message: isPaymentResult(result) && typeof result.message === 'string' ? result.message : null,
    provider: isPaymentResult(result) && result.provider !== undefined ? String(result.provider) : null,
    status: value === approved ? 'approved' : value === failed ? 'failed' : 'unknown',
  };
}

function isPaymentResult(value: unknown): value is { message?: unknown; provider?: unknown; result?: unknown } {
  return typeof value === 'object' && value !== null;
}

function getStatusTitle(status: PaymentStatus, labels: ReturnType<typeof useTranslation>['t']['buy']) {
  if (status === 'approved') return labels.paymentApprovedTitle;
  if (status === 'failed') return labels.paymentFailedTitle;
  if (status === 'blocked') return labels.paymentBlockedTitle;
  return labels.paymentTitle;
}

function getStatusDescription(
  status: PaymentStatus,
  amountLabel: string,
  message: string | null,
  labels: ReturnType<typeof useTranslation>['t']['buy']
) {
  if (status === 'approved') return labels.paymentApprovedDesc;
  if (status === 'failed') return message ?? labels.paymentFailedDesc;
  if (status === 'blocked') return message ?? labels.paymentBlockedDesc;
  if (status === 'received') return labels.paymentReceivedDesc;
  return `${labels.paymentReadyDesc} ${amountLabel}`;
}
