'use strict';

// #340: each Lambda ships its own directory. The contract test checks identical copies.
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash, randomUUID } = require('node:crypto');

const ERROR_CLASSES = new Set([
  'Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError',
  'DatabaseError', 'DatabaseErrorException', 'DatabaseUnavailableException',
  'StatementTimeoutException', 'TransactionNotFoundException', 'BadRequestException',
  'ServiceException', 'ServiceUnavailableException', 'ValidationException',
  'AccessDeniedException', 'ResourceNotFoundException', 'ThrottlingException',
]);
const CONFIG_CODES = new Set([
  'lookup_config_error', 'booking_config_error', 'redeem_config_error',
  'staff_auth_config_error', 'database_config_error',
]);
const RESPONSE_FAILURES = {
  roller_refresh_failed: { stage: 'roller_booking_detail', failureCategory: 'provider' },
  roller_refresh_invalid: { stage: 'booking_normalization', failureCategory: 'invalid_response' },
  booking_refresh_not_persisted: { stage: 'persist_booking', failureCategory: 'database' },
};
const PROVIDER_OPERATIONS = new Set([
  'oauth_token', 'get_booking_detail', 'search_bookings', 'get_products',
  'get_venue_detail', 'get_venue_identity', 'list_products', 'get_guest_detail', 'create_draft_costs', 'publish_draft_booking',
  'create_draft_booking', 'get_draft_booking', 'get_product_availability',
  'get_public_checkout_products', 'redeem_tickets', 'roller_post', 'roller_get',
]);

function createServerDiagnostics(handler, write = (entry) => console.error(JSON.stringify(entry)), writeWarning = write) {
  const storage = new AsyncLocalStorage();

  function ids() {
    const state = storage.getStore()?.state;
    return state ? {
      diagnosticId: state.diagnosticId,
      requestId: state.requestId,
      lambdaRequestId: state.lambdaRequestId,
    } : {};
  }

  function describe(error, stage) {
    const failureClass = ERROR_CLASSES.has(error?.name) ? error.name : 'unknown';
    let failureCategory = 'application';
    if (CONFIG_CODES.has(error?.code)) failureCategory = 'configuration';
    else if (failureClass === 'AbortError' || failureClass === 'TimeoutError' ||
      failureClass === 'StatementTimeoutException') failureCategory = 'timeout';
    else if (stage === 'database') failureCategory = 'database';
    else if (failureClass === 'SyntaxError') failureCategory = 'invalid_response';
    else if (stage.startsWith('roller_')) failureCategory = 'provider';
    else if (stage === 'configuration' || stage === 'staff_authorization') failureCategory = 'configuration';
    return { stage, failureCategory, failureClass };
  }

  // Only AWS-generated context ids are used. Caller-supplied correlation ids are hashed.
  function contextId(value, pattern) {
    return typeof value === 'string' && pattern.test(value) ? value : null;
  }

  function correlationHash(value) {
    return typeof value === 'string' && value.length <= 96
      ? createHash('sha256').update(value).digest('hex') : null;
  }

  function emit(entry, output = write) {
    try {
      output(entry);
    } catch {
      // Logging must never alter payment/redeem results or trigger another business operation.
    }
  }

  function failureFor(error) {
    const scope = storage.getStore();
    const known = error && (typeof error === 'object' || typeof error === 'function')
      ? scope?.state.errors.get(error) : null;
    return known || describe(error, scope?.stage || 'handler');
  }

  function report(state, statusCode) {
    if (!(statusCode >= 500 && statusCode <= 599)) return;
    const failure = state.failure || state.responseFailure || (state.responseIsProviderError ? {
      stage: state.providerFailure?.operation || 'roller_response',
      failureCategory: 'provider', failureClass: 'http_response',
    } : { stage: state.responseStage || 'handler', failureCategory: 'application', failureClass: 'http_response' });
    emit({
      eventType: 'cloud.server_error',
      handler,
      operation: state.operation,
      ...ids(),
      correlationIdHash: correlationHash(state.correlationId),
      statusCode,
      ...failure,
      ...(state.responseIsProviderError && state.providerFailure
        ? { providerStatusCode: state.providerFailure.status } : {}),
    });
  }

  return {
    ids,
    wrap(fn) {
      return function (event, context) {
        // Staff redeem re-enters the exported handler. It belongs to the same request.
        if (storage.getStore()) return fn(event, context);
        const state = {
          diagnosticId: randomUUID(),
          requestId: contextId(event?.requestContext?.requestId, /^[A-Za-z0-9_-]{8,64}={0,2}$/),
          lambdaRequestId: contextId(context?.awsRequestId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i),
          operation: handler,
          errors: new WeakMap(),
        };
        return storage.run({ state, stage: 'handler' }, async () => {
          try {
            const result = await fn(event, context);
            report(state, result?.statusCode);
            return result;
          } catch (error) {
            state.failure = failureFor(error);
            report(state, 500);
            throw error;
          }
        });
      };
    },
    // Stages are source-owned constants, never paths, SQL, identifiers or error strings.
    step(stage, fn, operation = null) {
      return function (...args) {
        const parent = storage.getStore();
        if (!parent) return fn.apply(this, args);
        if (operation) parent.state.operation = operation;
        const remember = (error) => {
          if (error && (typeof error === 'object' || typeof error === 'function') &&
              !parent.state.errors.has(error)) {
            parent.state.errors.set(error, describe(error, stage));
          }
          throw error;
        };
        return storage.run({ state: parent.state, stage }, () => {
          try {
            const result = fn.apply(this, args);
            return result && typeof result.then === 'function' ? result.catch(remember) : result;
          } catch (error) {
            return remember(error);
          }
        });
      };
    },
    capture(error) {
      const state = storage.getStore()?.state;
      if (state) state.failure = failureFor(error);
    },
    response(statusCode, correlationId, payload) {
      const scope = storage.getStore();
      const state = scope?.state;
      if (!state) return;
      state.correlationId = correlationId;
      state.responseStage = scope.stage;
      const code = payload?.error?.code;
      const known = Object.hasOwn(RESPONSE_FAILURES, code) ? RESPONSE_FAILURES[code] : null;
      state.responseFailure = known ? { ...known, failureClass: 'http_response' } : null;
      state.responseIsProviderError = payload?.status === 'roller_error' || known?.failureCategory === 'provider';
    },
    provider({ operation, status, ok }) {
      const state = storage.getStore()?.state;
      if (state && !ok) state.providerFailure = {
        operation: PROVIDER_OPERATIONS.has(operation) ? operation : 'roller_response',
        status: Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0,
      };
    },
    warn(eventType, error, correlationId) {
      emit({ eventType, handler, ...ids(), correlationIdHash: correlationHash(correlationId), ...failureFor(error) }, writeWarning);
    },
  };
}

module.exports = { createServerDiagnostics };
