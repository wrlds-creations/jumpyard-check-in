'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import type { NewBookingDraftResult } from '@/flow/cloudClient';
import { isEcommercePaymentNavigationLocked, type EcommercePaymentStatus } from '@/flow/exitFlowPolicy';
import {
  acquirePaymentRecoveryOwnership, beginPaymentRecovery, bindPaymentRecoverySession, claimPaymentRedirect, clearPaymentRecovery,
  classifyPaymentResult, consumePaymentRedirect, getPaymentRedirect, hasPaymentRedirect,
  failUnsubmittedPaymentRecovery, initializePaymentRecoverySubmission, markPaymentRecoverySubmitted,
  matchesPaymentRedirect, readPaymentRecovery, setPaymentRecoveryOutcome,
  type PaymentRecoveryOwnership, type PaymentRecoveryRecord,
} from '@/flow/paymentRecovery';

type PaymentStatus = EcommercePaymentStatus | 'unknown';

export interface RollerPaymentResultSummary {
  message: string | null;
  provider: string | null;
  status: 'approved' | 'failed' | 'unknown';
}

interface RollerPaymentDropInProps {
  amountLabel: string;
  attemptId: string;
  bookingIdentifier: string;
  kind?: 'new_booking' | 'add_product';
  returnAttempt?: PaymentRecoveryRecord;
  onApproved: (result: RollerPaymentResultSummary) => void;
  onFailed: (result: RollerPaymentResultSummary) => void;
  onNavigationLockChange?: (locked: boolean) => void;
  paymentSession: NewBookingDraftResult['paymentSession'];
}

const PAYMENT_CONTAINER_ID = 'roller-payment-container';
const RESULT_WAIT_MS = 30_000;

export const RollerPaymentDropIn = ({
  amountLabel, attemptId, bookingIdentifier, kind = 'new_booking', returnAttempt,
  onApproved, onFailed, onNavigationLockChange, paymentSession,
}: RollerPaymentDropInProps) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PaymentStatus>('bootstrapping');
  const [message, setMessage] = useState<string | null>(null);
  const callbacks = useRef({ onApproved, onFailed, onNavigationLockChange });
  const labels = useRef(t.buy);

  useEffect(() => {
    callbacks.current = { onApproved, onFailed, onNavigationLockChange };
    labels.current = t.buy;
  }, [onApproved, onFailed, onNavigationLockChange, t.buy]);

  useEffect(() => {
    callbacks.current.onNavigationLockChange?.(
      isEcommercePaymentNavigationLocked(status === 'unknown' ? 'received' : status)
    );
  }, [status]);

  const configAvailable = paymentSession.config?.available;
  const configApiUrl = paymentSession.config?.apiUrl;
  const configConfigurationId = paymentSession.config?.configurationId;
  const configIntegrationId = paymentSession.config?.integrationId;
  const returnId = returnAttempt?.attemptId;
  useEffect(() => {
    const config = {
      available: configAvailable,
      apiUrl: configApiUrl,
      configurationId: configConfigurationId,
      integrationId: configIntegrationId,
    };
    let cancelled = false;
    let terminal = false;
    let uncertain = false;
    let submissionStarted = Boolean(returnId);
    let documentLeaving = false;
    let ownership: PaymentRecoveryOwnership | null = null;
    let ownedAttempt: PaymentRecoveryRecord | null = null;
    let unsubmittedRecordCreatedAt: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const ownsCurrentRecord = () => {
      const record = readPaymentRecovery();
      return Boolean(ownedAttempt && record?.attemptId === attemptId && record.createdAt === ownedAttempt.createdAt
        && record.bookingIdentifier === bookingIdentifier && record.kind === kind);
    };
    const current = () => !cancelled && !terminal && ownership !== null && ownsCurrentRecord();
    const canInitialize = () => !uncertain && current();
    const stopTimer = () => { if (timeout) clearTimeout(timeout); };
    const lockNavigation = (locked: boolean) => callbacks.current.onNavigationLockChange?.(locked);
    const unknown = () => {
      if (cancelled || terminal || uncertain) return;
      uncertain = true;
      stopTimer();
      if (ownership && ownsCurrentRecord()) setPaymentRecoveryOutcome(attemptId, 'unknown');
      lockNavigation(true);
      setStatus('unknown');
      setMessage(null);
      callbacks.current.onFailed({ status: 'unknown', message: null, provider: null });
    };
    const waitForResult = () => {
      stopTimer();
      timeout = setTimeout(unknown, RESULT_WAIT_MS);
    };
    // A restored document can still report its outstanding wallet error, but its old
    // submit promise must never start payment after browser navigation.
    const leavingDocument = () => { documentLeaving = true; };
    const returningDocument = () => {
      if (documentLeaving && !cancelled && !terminal && !ownsCurrentRecord()) unknown();
    };
    window.addEventListener('pagehide', leavingDocument);
    window.addEventListener('beforeunload', leavingDocument);
    window.addEventListener('pageshow', returningDocument);
    window.addEventListener('popstate', leavingDocument);

    async function setupPayment() {
      if (!config?.available || !config.apiUrl || !config.configurationId || !config.integrationId) {
        setStatus('blocked');
        setMessage(labels.current.paymentMissingConfig);
        return;
      }
      // A fresh checkout never consumes an old return on behalf of its new draft.
      if (!returnId && hasPaymentRedirect()) {
        unknown();
        return;
      }
      if (!returnId && (!paymentSession.jwtPresent || !paymentSession.jwt?.trim())) {
        setStatus('blocked');
        setMessage(labels.current.paymentMissingJwt);
        return;
      }
      ownership = await acquirePaymentRecoveryOwnership();
      if (cancelled) { ownership?.release(); ownership = null; return; }
      if (!ownership) { unknown(); return; }
      const previous = readPaymentRecovery();
      if (!returnId && previous && previous.outcome !== 'failed') {
        if (previous.attemptId === attemptId && previous.bookingIdentifier === bookingIdentifier && previous.kind === kind) {
          ownedAttempt = previous;
        }
        unknown();
        return;
      }
      const record = returnId ? previous : beginPaymentRecovery({
        attemptId, bookingIdentifier, kind, config,
      });
      if (!record || record.attemptId !== attemptId || (returnId && returnId !== attemptId)) {
        unknown();
        return;
      }
      if (record.outcome === 'approved' || record.outcome === 'failed') {
        unknown();
        return;
      }
      ownedAttempt = record;
      if (!returnId && (!previous || previous.outcome === 'failed')) {
        unsubmittedRecordCreatedAt = record.createdAt;
        if (!initializePaymentRecoverySubmission(record, ownership)) { unknown(); return; }
      }
      setStatus('bootstrapping');
      setMessage(null);
      waitForResult();
      try {
        const { EcomPaymentService, PaymentResult } = await import('@roller/ecom-payments');
        if (!canInitialize()) return;
        const service = new EcomPaymentService();
        const handlers = {
          onReady: () => {
            if (canInitialize() && !submissionStarted) {
              stopTimer();
              lockNavigation(false);
              setStatus('ready');
            }
          },
          onBeforeSubmit: (): Promise<void> => {
            submissionStarted = true;
            if (!canInitialize() || documentLeaving || !ownedAttempt || !ownership
              || !markPaymentRecoverySubmitted(ownedAttempt, ownership) || !canInitialize()) {
              unknown();
              // SDK 1.0.217 resolves Adyen's action even after a rejected hook.
              // A disposed/uncertain attempt must never release that action.
              return new Promise<void>(() => undefined);
            }
            lockNavigation(true);
            setStatus('received');
            waitForResult();
            return Promise.resolve();
          },
          onPaymentReceived: () => {
            if (current()) {
              submissionStarted = true;
              setPaymentRecoveryOutcome(attemptId, 'unknown');
              lockNavigation(true);
              if (!uncertain) { setStatus('received'); waitForResult(); }
            }
          },
          onPaymentCompleted: (result: unknown) => {
            if (!current()) return;
            const summary = normalizePaymentResult(result, PaymentResult);
            // Require definitive evidence for returns and failure recovery. #329 owns
            // the normal checkout's broader Pending/Received classification.
            if (returnId || summary.status !== 'approved') {
              summary.status = classifyPaymentResult(result, PaymentResult);
            }
            if (summary.status === 'unknown' && !returnId && !submissionStarted && !uncertain
              && ownedAttempt && ownership && isExplicitPaymentError(result, PaymentResult.failed)
              && failUnsubmittedPaymentRecovery(ownedAttempt, ownership)) {
              summary.status = 'failed';
            }
            if (summary.status === 'unknown') { unknown(); return; }
            if (!setPaymentRecoveryOutcome(attemptId, summary.status)) return;
            terminal = true;
            stopTimer();
            // Retire this instance before exposing retry; delayed wallet promises
            // and SDK callbacks can no longer release or update this attempt.
            ownership?.release();
            ownership = null;
            lockNavigation(summary.status === 'approved');
            setStatus(summary.status);
            setMessage(null);
            if (summary.status === 'approved') callbacks.current.onApproved(summary);
            else callbacks.current.onFailed({ ...summary, message: null });
          },
        };
        const bootstrapConfig = {
          apiUrl: config!.apiUrl!, configurationId: config!.configurationId!, integrationId: config!.integrationId!,
        };
        const paymentConfiguration = await service.bootstrap(bootstrapConfig, {
          http: {
            get: (url: string, params?: Record<string, unknown>, options?: PaymentHttpOptions) =>
              paymentGet(url, params, { ...options, signal: abort.signal }),
            post: async (url: string, data?: unknown, options?: PaymentHttpOptions) => {
              const createsSession = new URL(url).pathname.endsWith('/payment/session');
              if (!current() || (createsSession && !canInitialize())) throw new Error('Payment attempt no longer active');
              const response = await paymentPost(url, data, { ...options, signal: abort.signal });
              if (createsSession && !canInitialize()) throw new Error('Payment attempt no longer active');
              if (createsSession && response?.session?.id) {
                if (!await bindPaymentRecoverySession(attemptId, String(response.session.id))) {
                  throw new Error('Payment recovery unavailable');
                }
              }
              return response;
            },
          },
          log: { error: () => undefined, info: () => undefined, warn: () => undefined },
          translate: (key: string) => key,
        });
        if (!canInitialize()) return;
        if (!paymentConfiguration) { unknown(); return; }

        if (returnId) {
          const redirect = getPaymentRedirect();
          const latest = readPaymentRecovery();
          if (!redirect || !latest || !await matchesPaymentRedirect(latest, redirect) || !canInitialize()) {
            unknown();
            return;
          }
          if (!claimPaymentRedirect(attemptId)) { unknown(); return; }
          lockNavigation(true);
          setStatus('received');
          // SDK 1.0.217 captures URL fields synchronously, before its first await.
          // Reload retains only bounded identity/status, never the return payload.
          const handling = service.handleRedirect(handlers);
          consumePaymentRedirect();
          await handling;
          return;
        }
        const result = await service.setup({
          hasRecurringBilling: false,
          jwt: paymentSession.jwt!.trim(),
          paymentContainerDivId: PAYMENT_CONTAINER_ID,
          redirectUrl: window.location.origin + window.location.pathname,
          handlers,
        });
        if (current() && typeof result === 'string' && result.trim()) unknown();
      } catch {
        if (!cancelled) unknown();
      }
    }
    void setupPayment();
    return () => {
      cancelled = true;
      stopTimer();
      abort.abort();
      window.removeEventListener('pagehide', leavingDocument);
      window.removeEventListener('beforeunload', leavingDocument);
      window.removeEventListener('pageshow', returningDocument);
      window.removeEventListener('popstate', leavingDocument);
      const record = readPaymentRecovery();
      // Only a clean in-app exit before submission may discard a fresh attempt.
      // A browser/provider departure or any uncertainty retains its recovery.
      if (!returnId && !documentLeaving && !submissionStarted && !uncertain && !hasPaymentRedirect()
        && unsubmittedRecordCreatedAt !== null && record?.attemptId === attemptId
        && record.createdAt === unsubmittedRecordCreatedAt && record.outcome === 'pending' && !record.returnConsumed) {
        clearPaymentRecovery(attemptId);
      }
      ownership?.release();
      ownership = null;
    };
  }, [attemptId, bookingIdentifier, kind, returnId, configAvailable, configApiUrl,
    configConfigurationId, configIntegrationId, paymentSession.jwt, paymentSession.jwtPresent]);

  const description = status === 'unknown' ? t.buy.paymentRecoveryDescription
    : status === 'failed' ? t.buy.paymentFailedDesc
    : getStatusDescription(status, amountLabel, message, t.buy);
  return (
    <div className="bg-white border border-border rounded-xl p-4 text-left" data-roller-payment-status={status}>
      <p className="mb-4 text-sm font-bold italic text-foreground" role="status">{description}</p>
      {(status === 'bootstrapping' || status === 'received') && (
        <div className="flex items-center gap-2 text-xs font-bold italic uppercase text-muted">
          <Loader2 size={14} className="animate-spin" />
          {status === 'received' ? t.buy.paymentReceived : t.buy.paymentStarting}
        </div>
      )}
      <div id={PAYMENT_CONTAINER_ID} className="min-h-16" hidden={status === 'failed' || status === 'unknown'} />
    </div>
  );
};

function isExplicitPaymentError(result: unknown, failed: number): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = result as { result?: unknown; rawResult?: { resultCode?: unknown } };
  return value.result === failed && value.rawResult?.resultCode === 'Error';
}

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
    signal: options?.signal,
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
  signal?: AbortSignal;
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
