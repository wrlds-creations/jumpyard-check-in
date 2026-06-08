const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const { PublishCommand, SNSClient } = require('@aws-sdk/client-sns');
const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const ACTIVE_SESSION_STATUSES = ['guest_in_progress', 'ready_for_staff', 'staff_in_progress'];
const CHECKIN_LINK_DEV_TOKEN_HEADERS = ['x-jumpyard-link-token', 'authorization'];
const CHECKIN_LINK_CHANNELS = new Set(['sms', 'email', 'manual', 'dev']);
const STAFF_AUTH_HEADERS = ['x-jumpyard-staff-token', 'authorization'];
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_CHECKIN_LINK_TTL_MINUTES = 72 * 60;
const DEFAULT_STAFF_AUTH_TTL_MINUTES = 12 * 60;
const STAFF_AUTH_CONFIG_CACHE_MS = 30 * 1000;
const MAX_CHECKIN_LINK_TTL_MINUTES = 7 * 24 * 60;
const MAX_SELECTED_TICKETS = 10;
const REDEEMABLE_PRODUCT_KEYS = new Set([
  'membership',
  'partypackage',
  'pass',
  'recurringpass',
  'recurringsession',
  'recurringsessions',
  'sessionpass',
  'standardpass',
]);
const NON_REDEEMABLE_PRODUCT_KEYS = new Set([
  'addon',
  'addproduct',
  'beverage',
  'fee',
  'food',
  'foodbeverage',
  'giftcard',
  'merchandise',
  'retail',
  'stock',
  'stockproduct',
]);
const CHECKIN_SMS_TEMPLATE = 'checkin_link_v1';
const CHECKIN_EMAIL_TEMPLATE = 'checkin_email_v1';
const DEFAULT_SMS_BASE_URL = process.env.CHECKIN_SMS_BASE_URL || null;
const DEFAULT_EMAIL_BASE_URL = process.env.CHECKIN_EMAIL_BASE_URL || DEFAULT_SMS_BASE_URL;
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'aws_sns';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || '';
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'aws_ses';
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || '';
const EMAIL_REPLY_TO_ADDRESSES = parseEmailAddressList(process.env.EMAIL_REPLY_TO_ADDRESSES);
const SMS_TRIGGER_TIME_ZONE = 'Europe/Stockholm';
const DEFAULT_SMS_TRIGGER_LEAD_MINUTES = 30;
const DEFAULT_SMS_TRIGGER_WINDOW_MINUTES = 10;
const MAX_SMS_TRIGGER_WINDOW_MINUTES = 180;
const MAX_SMS_TRIGGER_LIMIT = 10;
const SCHEDULED_SMS_CONFIRMED_SEND_APPROVAL = 'I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS';
const BOOKING_TIME_MESSAGE_CHANNELS = new Set(['sms', 'email']);
const TOKEN_BYTES = 32;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const snsClient = new SNSClient({});

let cachedCheckinLinkDevToken = null;
let cachedStaffAuthConfig = null;
let cachedStaffAuthConfigExpiresAt = 0;
let cachedSesClient = null;
let cachedSendEmailCommand = null;

exports.handler = async (event) => {
  let correlationId = getHeader(event, 'x-correlation-id') || createCorrelationId();

  try {
    const routeKey = event?.routeKey || `${event?.requestContext?.http?.method ?? ''} ${event?.rawPath ?? ''}`.trim();
    const body = parseBody(event);
    correlationId = stringOrNull(body.correlationId) || correlationId;

    if (isScheduledDueSessionLinkMessagingEvent(event)) {
      const scheduledBody = normalizeScheduledDueSessionLinkMessagingBody(event);
      const scheduledCorrelationId = stringOrNull(scheduledBody.correlationId) || correlationId;
      return handleSendDueSessionLinkMessages(event, scheduledBody, scheduledCorrelationId, { trustedScheduler: true });
    }

    if (isStaffAuthLoginRoute(routeKey, event)) {
      return handleStaffAuthLogin(body, correlationId);
    }

    if (isStaffSessionListRoute(routeKey, event)) {
      return handleStaffSessionList(event, correlationId);
    }

    if (isStaffSessionDetailRoute(routeKey, event)) {
      return handleStaffSessionDetail(event, correlationId);
    }

    if (isCreateSessionLinkRoute(routeKey, event)) {
      return handleCreateSessionLink(event, body, correlationId);
    }

    if (isSendSessionLinkSmsRoute(routeKey, event)) {
      return handleSendSessionLinkSms(event, body, correlationId);
    }

    if (isSendSessionLinkEmailRoute(routeKey, event)) {
      return handleSendSessionLinkEmail(event, body, correlationId);
    }

    if (isSendDueSessionLinkSmsRoute(routeKey, event)) {
      return handleSendDueSessionLinkSms(event, body, correlationId);
    }

    if (isSendDueSessionLinkMessagesRoute(routeKey, event)) {
      return handleSendDueSessionLinkMessages(event, body, correlationId);
    }

    if (isResolveSessionLinkRoute(routeKey, event)) {
      return handleResolveSessionLink(event, body, correlationId);
    }

    if (isStartSessionRoute(routeKey, event)) {
      return handleStartSession(event, body, correlationId);
    }

    if (isReadyForStaffRoute(routeKey, event)) {
      return handleReadyForStaff(event, body, correlationId);
    }

    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'route_not_found',
        message: 'No JumpYard Cloud check-in session route matched the request.',
      },
    });
  } catch (error) {
    const safeError = classifyError(error);
    return jsonResponse(safeError.statusCode, correlationId, {
      status: safeError.status,
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    });
  }
};

async function handleStartSession(event, body, correlationId) {
  const request = normalizeStartRequest(event, body);
  const validationError = validateStartRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const context = await getBookingContext(request.identifier);
  if (!context) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'booking_not_found',
        message: 'No local JumpYard Cloud booking snapshot was found for the supplied identifier.',
      },
    });
  }

  const decision = evaluateStartContext(context, request);
  if (!decision.canStart) {
    const bookingResponse = request.includeBooking ? await buildPhoneSessionBookingResponse(context) : null;
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.session_blocked',
      payload: {
        reason: decision.reason,
        ticketCount: decision.selectedTicketIds.length,
      },
      summary: `Check-in session blocked: ${decision.reason}`,
    });

    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: decision.reason,
        message: decision.message,
      },
      sessionPlan: buildSessionPlan(context, decision),
      ...(bookingResponse ? bookingResponse : {}),
    });
  }

  const requestHash = hashJson({
    bookingReference: context.booking.bookingReference,
    operation: 'checkin_session_start',
    selectedTicketIds: decision.selectedTicketIds,
    visitDate: decision.visitDate,
  });
  const idempotency = await reserveIdempotencyKey('checkin_session_start', request.idempotencyKey, requestHash);
  if (!idempotency.ok) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'idempotency_key_reused',
        message: 'The supplied idempotency key has already been used for a different session request.',
      },
    });
  }

  await expireOldSessions(context.booking.rollerUniqueId, decision.visitDate);
  const existingSession = await findActiveSession(context.booking.rollerUniqueId, decision.visitDate);
  if (existingSession) {
    const bookingResponse = request.includeBooking ? await buildPhoneSessionBookingResponse(context) : null;
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.session_resumed',
      payload: {
        checkinSessionId: existingSession.checkinSessionId,
        ticketCount: existingSession.selectedTicketIds.length,
      },
      summary: 'Check-in session resumed.',
    });

    return jsonResponse(200, correlationId, {
      status: 'session_resumed',
      session: existingSession,
      ...(bookingResponse ? bookingResponse : {}),
    });
  }

  const session = await createSession({
    booking: context.booking,
    idempotencyKey: request.idempotencyKey,
    selectedTicketIds: decision.selectedTicketIds,
    sourceLookupRef: request.sourceLookupRef,
    visitDate: decision.visitDate,
  });
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `checkin_session:${session.checkinSessionId}`);
  await writeEventLog({
    booking: context.booking,
    correlationId,
    eventType: 'checkin.session_started',
    payload: {
      checkinSessionId: session.checkinSessionId,
      ticketCount: session.selectedTicketIds.length,
    },
    summary: 'Check-in session started.',
  });

  const bookingResponse = request.includeBooking ? await buildPhoneSessionBookingResponse(context) : null;

  return jsonResponse(201, correlationId, {
    status: 'session_started',
    session,
    ...(bookingResponse ? bookingResponse : {}),
  });
}

async function handleReadyForStaff(event, body, correlationId) {
  const request = normalizeReadyRequest(event, body);
  const validationError = validateReadyRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const session = await findSessionById(request.checkinSessionId);
  if (!session) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'session_not_found',
        message: 'No JumpYard Cloud check-in session was found for the supplied id.',
      },
    });
  }

  if (isExpired(session.expiresAt)) {
    await markSessionExpired(session.checkinSessionId);
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'session_expired',
        message: 'The session has expired and cannot be marked ready for staff.',
      },
      session: {
        ...session,
        handoffStatus: 'expired',
        status: 'expired',
      },
    });
  }

  if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'session_not_active',
        message: 'The session is not active and cannot be marked ready for staff.',
      },
      session,
    });
  }

  const requestHash = hashJson({
    checkinSessionId: request.checkinSessionId,
    operation: 'checkin_session_ready_for_staff',
    safetyStatus: request.safetyStatus,
  });
  const idempotency = await reserveIdempotencyKey('checkin_session_ready_for_staff', request.idempotencyKey, requestHash);
  if (!idempotency.ok) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'idempotency_key_reused',
        message: 'The supplied idempotency key has already been used for a different ready-for-staff request.',
      },
    });
  }

  const handoffCode = session.handoffCode || (await generateUnusedHandoffCode());
  const updatedSession = await markSessionReadyForStaff(session.checkinSessionId, {
    handoffCode,
    safetyStatus: request.safetyStatus,
  });
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `ready_for_staff:${updatedSession.checkinSessionId}`);
  await writeEventLog({
    booking: updatedSession,
    correlationId,
    eventType: 'checkin.session_ready_for_staff',
    payload: {
      checkinSessionId: updatedSession.checkinSessionId,
      handoffCode: updatedSession.handoffCode,
      ticketCount: updatedSession.selectedTicketIds.length,
    },
    summary: 'Check-in session marked ready for staff.',
  });

  return jsonResponse(200, correlationId, {
    status: 'ready_for_staff',
    session: updatedSession,
  });
}

async function handleStaffSessionList(event, correlationId) {
  const auth = await verifyStaffAuthToken(event);
  if (!auth.ok) {
    return staffAuthErrorResponse(correlationId, auth);
  }

  const request = normalizeStaffListRequest(event);
  const sessions = await findReadyStaffSessions(request);

  return jsonResponse(200, correlationId, {
    status: 'found',
    sessions,
    meta: {
      count: sessions.length,
      includeExpired: request.includeExpired,
      limit: request.limit,
    },
  });
}

async function handleStaffSessionDetail(event, correlationId) {
  const auth = await verifyStaffAuthToken(event);
  if (!auth.ok) {
    return staffAuthErrorResponse(correlationId, auth);
  }

  const checkinSessionId =
    stringOrNull(event?.pathParameters?.checkinSessionId) || extractStaffSessionIdFromPath(event?.rawPath);

  if (!checkinSessionId) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: {
        code: 'session_id_required',
        message: 'checkinSessionId is required.',
      },
    });
  }

  const session = await findStaffSessionDetail(checkinSessionId);
  if (!session) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'session_not_found',
        message: 'No JumpYard Cloud check-in session was found for the supplied id.',
      },
    });
  }

  return jsonResponse(200, correlationId, {
    status: 'found',
    session,
  });
}

async function handleStaffAuthLogin(body, correlationId) {
  const request = normalizeStaffAuthLoginRequest(body);
  if (!request.passcode) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: {
        code: 'staff_passcode_required',
        message: 'Staff passcode is required.',
      },
    });
  }

  const config = await getStaffAuthConfig();
  if (!safeEquals(request.passcode, config.passcode)) {
    return jsonResponse(403, correlationId, {
      status: 'forbidden',
      error: {
        code: 'staff_passcode_invalid',
        message: 'Staff passcode is invalid.',
      },
    });
  }

  const issued = createStaffAuthToken(config);

  return jsonResponse(200, correlationId, {
    status: 'authenticated',
    auth: {
      expiresAt: issued.expiresAt,
      token: issued.token,
      tokenType: 'Bearer',
    },
    staff: {
      displayName: config.displayName,
    },
  });
}

async function handleCreateSessionLink(event, body, correlationId) {
  const auth = await verifyCheckinLinkDevToken(event);
  if (!auth.ok) {
    return jsonResponse(401, correlationId, {
      status: 'unauthorized',
      error: {
        code: auth.code,
        message: 'Check-in link creation requires the JumpYard Cloud development token.',
      },
    });
  }

  const request = normalizeSessionLinkCreateRequest(body);
  const validationError = validateSessionLinkCreateRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const context = await getBookingContext(request.identifier);
  if (!context) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'booking_not_found',
        message: 'No local JumpYard Cloud booking snapshot was found for the supplied identifier.',
      },
    });
  }

  const link = await createSessionLinkToken({
    channel: request.channel,
    context,
    ttlMinutes: request.ttlMinutes,
  });
  await writeEventLog({
    booking: context.booking,
    correlationId,
    eventType: 'checkin.link_created',
    payload: {
      channel: request.channel,
      expiresAt: link.expiresAt,
      tokenHashPrefix: link.tokenHash.slice(0, 12),
    },
    summary: 'Check-in session link created.',
  });

  return jsonResponse(201, correlationId, {
    status: 'link_created',
    link: {
      bookingReference: context.booking.bookingReference,
      channel: request.channel,
      checkinUrl: buildCheckinUrl(request.baseUrl, link.token),
      expiresAt: link.expiresAt,
      rollerUniqueId: context.booking.rollerUniqueId,
      token: link.token,
    },
  });
}

async function handleSendSessionLinkSms(event, body, correlationId, options = {}) {
  if (!options.trustedScheduler) {
    const auth = await verifyCheckinLinkDevToken(event);
    if (!auth.ok) {
      return jsonResponse(401, correlationId, {
        status: 'unauthorized',
        error: {
          code: auth.code,
          message: 'Check-in SMS sending requires the JumpYard Cloud development token.',
        },
      });
    }
  }

  const request = normalizeSessionLinkSmsRequest(event, body);
  const validationError = validateSessionLinkSmsRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const context = await getBookingContext(request.identifier);
  if (!context) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'booking_not_found',
        message: 'No local JumpYard Cloud booking snapshot was found for the supplied identifier.',
      },
    });
  }

  const destination = request.phoneNumber
    ? buildSmsDestination(request.phoneNumber, 'request')
    : await findSmsDestinationForBooking(context.booking.rollerUniqueId);
  if (!destination) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'sms_destination_missing',
        message: 'No SMS-ready phone number was found for this booking. Provide phoneNumber for dev testing.',
      },
    });
  }

  const requestHash = hashJson({
    baseUrl: request.baseUrl,
    bookingReference: context.booking.bookingReference,
    destinationHash: destination.hash,
    dryRun: request.dryRun,
    operation: 'checkin_sms_send',
    ttlMinutes: request.ttlMinutes,
  });
  const idempotency = await reserveIdempotencyKey('checkin_sms_send', request.idempotencyKey, requestHash);
  if (!idempotency.ok || idempotency.replayed) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: idempotency.ok ? 'idempotency_key_replayed' : 'idempotency_key_reused',
        message: idempotency.ok
          ? 'The supplied idempotency key has already been used for this SMS request.'
          : 'The supplied idempotency key has already been used for a different SMS request.',
      },
    });
  }

  const link = await createSessionLinkToken({
    channel: 'sms',
    context,
    ttlMinutes: request.ttlMinutes,
  });
  const checkinUrl = buildCheckinUrl(request.baseUrl, link.token);
  const message = buildCheckinSmsMessage({ booking: context.booking, checkinUrl });
  const deliveryId = createSmsDeliveryId();
  const providerDiagnostics = getSmsProviderDiagnostics();

  if (request.dryRun) {
    await recordSmsDelivery({
      booking: context.booking,
      deliveryId,
      destination,
      dryRun: true,
      provider: SMS_PROVIDER,
      status: 'planned',
      tokenHash: link.tokenHash,
    });
    await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `sms_delivery:${deliveryId}`);
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.sms_planned',
      payload: {
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: true,
        provider: SMS_PROVIDER,
        senderIdConfigured: providerDiagnostics.senderIdConfigured,
        senderIdRequested: providerDiagnostics.senderIdRequested,
        tokenHashPrefix: link.tokenHash.slice(0, 12),
      },
      summary: 'Check-in SMS planned in dry-run mode.',
    });

    return jsonResponse(201, correlationId, {
      status: 'sms_planned',
      sms: {
        bookingReference: context.booking.bookingReference,
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: true,
        expiresAt: link.expiresAt,
        provider: SMS_PROVIDER,
        senderIdConfigured: providerDiagnostics.senderIdConfigured,
        senderIdRequested: providerDiagnostics.senderIdRequested,
        rollerUniqueId: context.booking.rollerUniqueId,
      },
    });
  }

  try {
    const providerMessageId = await sendSmsWithSns({
      message,
      phoneNumber: destination.phoneNumber,
    });
    await recordSmsDelivery({
      booking: context.booking,
      deliveryId,
      destination,
      dryRun: false,
      provider: SMS_PROVIDER,
      providerMessageId,
      status: 'sent',
      tokenHash: link.tokenHash,
    });
    await markSessionLinkSent(link.tokenHash);
    await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `sms_delivery:${deliveryId}`);
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.sms_sent',
      payload: {
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        provider: SMS_PROVIDER,
        providerMessageId,
        senderIdConfigured: providerDiagnostics.senderIdConfigured,
        senderIdRequested: providerDiagnostics.senderIdRequested,
        tokenHashPrefix: link.tokenHash.slice(0, 12),
      },
      summary: 'Check-in SMS sent.',
    });

    return jsonResponse(200, correlationId, {
      status: 'sms_sent',
      sms: {
        bookingReference: context.booking.bookingReference,
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        expiresAt: link.expiresAt,
        provider: SMS_PROVIDER,
        providerMessageId,
        senderIdConfigured: providerDiagnostics.senderIdConfigured,
        senderIdRequested: providerDiagnostics.senderIdRequested,
        rollerUniqueId: context.booking.rollerUniqueId,
      },
    });
  } catch (error) {
    const safeError = safeSmsProviderError(error, destination.phoneNumber);
    await recordSmsDelivery({
      booking: context.booking,
      deliveryId,
      destination,
      dryRun: false,
      errorCode: safeError.code,
      errorSummary: safeError.message,
      provider: SMS_PROVIDER,
      status: 'failed',
      tokenHash: link.tokenHash,
    });
    await completeIdempotencyKey(request.idempotencyKey, 'failed', `sms_delivery:${deliveryId}`);
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.sms_failed',
      payload: {
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        errorCode: safeError.code,
        provider: SMS_PROVIDER,
        senderIdConfigured: providerDiagnostics.senderIdConfigured,
        senderIdRequested: providerDiagnostics.senderIdRequested,
        tokenHashPrefix: link.tokenHash.slice(0, 12),
      },
      summary: 'Check-in SMS failed before provider confirmation.',
    });

    return jsonResponse(502, correlationId, {
      status: 'sms_failed',
      error: {
        code: safeError.code,
        message: 'The SMS provider did not confirm delivery acceptance.',
      },
      sms: {
        bookingReference: context.booking.bookingReference,
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        provider: SMS_PROVIDER,
        senderIdConfigured: providerDiagnostics.senderIdConfigured,
        senderIdRequested: providerDiagnostics.senderIdRequested,
        rollerUniqueId: context.booking.rollerUniqueId,
      },
    });
  }
}

async function handleSendSessionLinkEmail(event, body, correlationId) {
  const auth = await verifyCheckinLinkDevToken(event);
  if (!auth.ok) {
    return jsonResponse(401, correlationId, {
      status: 'unauthorized',
      error: {
        code: auth.code,
        message: 'Check-in email sending requires the JumpYard Cloud development token.',
      },
    });
  }

  const request = normalizeSessionLinkEmailRequest(event, body);
  const validationError = validateSessionLinkEmailRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const context = await getBookingContext(request.identifier);
  if (!context) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'booking_not_found',
        message: 'No local JumpYard Cloud booking snapshot was found for the supplied identifier.',
      },
    });
  }

  const destination = request.email
    ? buildEmailDestination(request.email, 'request')
    : await findEmailDestinationForBooking(context.booking.rollerUniqueId);
  if (!destination) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'email_destination_missing',
        message: 'No email address was found for this booking. Provide email for dev testing.',
      },
    });
  }

  const requestHash = hashJson({
    baseUrl: request.baseUrl,
    bookingReference: context.booking.bookingReference,
    destinationHash: destination.hash,
    dryRun: request.dryRun,
    operation: 'checkin_email_send',
    ttlMinutes: request.ttlMinutes,
  });
  const idempotency = await reserveIdempotencyKey('checkin_email_send', request.idempotencyKey, requestHash);
  if (!idempotency.ok || idempotency.replayed) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: idempotency.ok ? 'idempotency_key_replayed' : 'idempotency_key_reused',
        message: idempotency.ok
          ? 'The supplied idempotency key has already been used for this email request.'
          : 'The supplied idempotency key has already been used for a different email request.',
      },
    });
  }

  const link = await createSessionLinkToken({
    channel: 'email',
    context,
    ttlMinutes: request.ttlMinutes,
  });
  const checkinUrl = buildCheckinUrl(request.baseUrl, link.token);
  const providerDiagnostics = getEmailProviderDiagnostics();
  const emailMessage = buildCheckinEmailMessage({
    booking: context.booking,
    checkinUrl,
  });
  const deliveryId = createEmailDeliveryId();

  if (request.dryRun) {
    await recordEmailDelivery({
      booking: context.booking,
      deliveryId,
      destination,
      dryRun: true,
      provider: EMAIL_PROVIDER,
      status: 'planned',
      subject: emailMessage.subject,
      tokenHash: link.tokenHash,
    });
    await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `email_delivery:${deliveryId}`);
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.email_planned',
      payload: {
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: true,
        fromAddressConfigured: providerDiagnostics.fromAddressConfigured,
        provider: EMAIL_PROVIDER,
        replyToConfigured: providerDiagnostics.replyToConfigured,
        tokenHashPrefix: link.tokenHash.slice(0, 12),
      },
      summary: 'Check-in email planned in dry-run mode.',
    });

    return jsonResponse(201, correlationId, {
      status: 'email_planned',
      email: {
        bookingReference: context.booking.bookingReference,
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: true,
        expiresAt: link.expiresAt,
        preview: request.includePreview ? buildCheckinEmailPreview(context.booking) : null,
        provider: EMAIL_PROVIDER,
        fromAddressConfigured: providerDiagnostics.fromAddressConfigured,
        replyToConfigured: providerDiagnostics.replyToConfigured,
        rollerUniqueId: context.booking.rollerUniqueId,
      },
    });
  }

  try {
    const providerMessageId = await sendEmailWithSes({
      destinationEmail: destination.email,
      html: emailMessage.html,
      subject: emailMessage.subject,
      text: emailMessage.text,
    });
    await recordEmailDelivery({
      booking: context.booking,
      deliveryId,
      destination,
      dryRun: false,
      provider: EMAIL_PROVIDER,
      providerMessageId,
      status: 'sent',
      subject: emailMessage.subject,
      tokenHash: link.tokenHash,
    });
    await markSessionLinkSent(link.tokenHash);
    await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `email_delivery:${deliveryId}`);
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.email_sent',
      payload: {
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        fromAddressConfigured: providerDiagnostics.fromAddressConfigured,
        provider: EMAIL_PROVIDER,
        providerMessageId,
        replyToConfigured: providerDiagnostics.replyToConfigured,
        tokenHashPrefix: link.tokenHash.slice(0, 12),
      },
      summary: 'Check-in email sent.',
    });

    return jsonResponse(200, correlationId, {
      status: 'email_sent',
      email: {
        bookingReference: context.booking.bookingReference,
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        expiresAt: link.expiresAt,
        provider: EMAIL_PROVIDER,
        fromAddressConfigured: providerDiagnostics.fromAddressConfigured,
        providerMessageId,
        replyToConfigured: providerDiagnostics.replyToConfigured,
        rollerUniqueId: context.booking.rollerUniqueId,
      },
    });
  } catch (error) {
    const safeError = safeEmailProviderError(error, destination.email);
    await recordEmailDelivery({
      booking: context.booking,
      deliveryId,
      destination,
      dryRun: false,
      errorCode: safeError.code,
      errorSummary: safeError.message,
      provider: EMAIL_PROVIDER,
      status: 'failed',
      subject: emailMessage.subject,
      tokenHash: link.tokenHash,
    });
    await completeIdempotencyKey(request.idempotencyKey, 'failed', `email_delivery:${deliveryId}`);
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.email_failed',
      payload: {
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        errorCode: safeError.code,
        fromAddressConfigured: providerDiagnostics.fromAddressConfigured,
        provider: EMAIL_PROVIDER,
        replyToConfigured: providerDiagnostics.replyToConfigured,
        tokenHashPrefix: link.tokenHash.slice(0, 12),
      },
      summary: 'Check-in email failed before provider confirmation.',
    });

    return jsonResponse(502, correlationId, {
      status: 'email_failed',
      error: {
        code: safeError.code,
        message: 'The email provider did not confirm delivery acceptance.',
      },
      email: {
        bookingReference: context.booking.bookingReference,
        deliveryId,
        destinationMasked: destination.masked,
        dryRun: false,
        fromAddressConfigured: providerDiagnostics.fromAddressConfigured,
        provider: EMAIL_PROVIDER,
        replyToConfigured: providerDiagnostics.replyToConfigured,
        rollerUniqueId: context.booking.rollerUniqueId,
      },
    });
  }
}

async function handleSendDueSessionLinkSms(event, body, correlationId, options = {}) {
  return handleSendDueSessionLinkMessages(event, body, correlationId, {
    ...options,
    channels: ['sms'],
    legacySmsResponse: true,
  });
}

async function handleSendDueSessionLinkMessages(event, body, correlationId, options = {}) {
  if (!options.trustedScheduler) {
    const auth = await verifyCheckinLinkDevToken(event);
    if (!auth.ok) {
      return jsonResponse(401, correlationId, {
        status: 'unauthorized',
        error: {
          code: auth.code,
          message: 'Booking-time guest messaging requires the JumpYard Cloud development token.',
        },
      });
    }
  }

  const request = normalizeDueSessionLinkMessagingRequest(body, options.channels || null);
  const window = buildDueSmsWindow(request);
  const validationError = validateDueSessionLinkMessagingRequest(request, window);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  if (options.trustedScheduler && request.confirmSend) {
    const confirmationError = validateConfirmedScheduledDueMessagingRequest(request);
    if (confirmationError) {
      return jsonResponse(409, correlationId, {
        status: options.legacySmsResponse ? 'booking_time_sms_blocked' : 'booking_time_messages_blocked',
        error: confirmationError,
        trigger: buildDueSmsTriggerSummary(request, window, true),
      });
    }
  }

  const candidates = await findDueMessagingBookings({
    limit: request.limit,
    recentSinceAt: new Date(window.start.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    windowEndAt: window.end.toISOString(),
    windowStartAt: window.start.toISOString(),
  });

  const items = [];
  for (const candidate of candidates) {
    const context = await getBookingContext(candidate.bookingReference);
    const decision = context
      ? evaluateStartContext(context, {
          expectedDate: candidate.bookingDate,
          ticketIds: [],
        })
      : null;

    for (const channel of request.channels) {
      const item = planDueMessageCandidate({ candidate, channel, context, decision, request, window });

      if (request.confirmSend && item.action === 'send_ready') {
        const sendResponse = await sendDueMessageChannel(event, {
          candidate,
          channel,
          correlationId,
          options,
          request,
          window,
        });
        items.push(mapDueMessageSendResponse(channel, candidate, sendResponse, item));
        continue;
      }

      items.push(item);
    }
  }

  const summary = summarizeDueMessageItems(items);
  const status = options.legacySmsResponse
    ? request.confirmSend
      ? 'booking_time_sms_processed'
      : 'booking_time_sms_planned'
    : request.confirmSend
      ? 'booking_time_messages_processed'
      : 'booking_time_messages_planned';

  return jsonResponse(200, correlationId, {
    status,
    summary,
    trigger: buildDueSmsTriggerSummary(request, window, false),
    items,
  });
}

async function handleResolveSessionLink(event, body, correlationId) {
  const request = normalizeSessionLinkResolveRequest(event, body);
  const validationError = validateSessionLinkResolveRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const tokenHash = hashString(request.token);
  const tokenRecord = await findSessionLinkToken(tokenHash);
  if (!tokenRecord) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'checkin_link_not_found',
        message: 'No active JumpYard Cloud check-in link was found for the supplied token.',
      },
    });
  }

  if (tokenRecord.consumedAt) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'checkin_link_consumed',
        message: 'The supplied check-in link has already been consumed.',
      },
    });
  }

  if (isExpired(tokenRecord.expiresAt)) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'checkin_link_expired',
        message: 'The supplied check-in link has expired.',
      },
    });
  }

  await markSessionLinkOpened(tokenHash);
  await writeEventLog({
    booking: {
      bookingReference: tokenRecord.bookingReference,
      rollerUniqueId: tokenRecord.rollerUniqueId,
    },
    correlationId,
    eventType: 'checkin.link_opened',
    payload: {
      channel: tokenRecord.channel,
      tokenHashPrefix: tokenHash.slice(0, 12),
    },
    summary: 'Check-in session link opened.',
  });

  return handleStartSession(
    event,
    {
      expectedDate: request.expectedDate,
      includeBooking: true,
      idempotencyKey: request.idempotencyKey || `checkin-link:${tokenHash}`,
      rollerUniqueId: tokenRecord.rollerUniqueId,
      sourceLookupRef: `checkin_token:${tokenHash.slice(0, 12)}`,
    },
    correlationId,
  );
}

async function expireOldSessions(rollerUniqueId, visitDate) {
  await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET status = 'expired',
         handoff_status = 'expired',
         updated_at = now()
     WHERE roller_unique_id = :rollerUniqueId
       AND COALESCE(visit_date, DATE '1900-01-01') = COALESCE(CAST(:visitDate AS date), DATE '1900-01-01')
       AND status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       AND expires_at <= now()`,
    [stringParameter('rollerUniqueId', rollerUniqueId), stringParameter('visitDate', visitDate)],
  );
}

function normalizeStartRequest(event, body) {
  const bookingReference = stringOrNull(body.bookingReference);
  const rollerUniqueId = stringOrNull(body.rollerUniqueId);
  const identifier = stringOrNull(body.identifier) || bookingReference || rollerUniqueId;
  const rawTicketIds = Array.isArray(body.ticketIds) ? body.ticketIds.map(stringOrNull).filter(Boolean) : [];

  return {
    bookingReference,
    expectedDate: stringOrNull(body.expectedDate) || stringOrNull(body.visitDate),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    identifier,
    includeBooking: body.includeBooking === true,
    rollerUniqueId,
    sourceLookupRef: stringOrNull(body.sourceLookupId) || stringOrNull(body.sourceLookupRef),
    ticketIds: rawTicketIds,
    ticketIdsContainDuplicates: new Set(rawTicketIds).size !== rawTicketIds.length,
  };
}

function normalizeReadyRequest(event, body) {
  return {
    checkinSessionId:
      stringOrNull(event?.pathParameters?.checkinSessionId) ||
      extractSessionIdFromPath(event?.rawPath) ||
      stringOrNull(body.checkinSessionId),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    safetyStatus: normalizeSafetyStatus(body.safetyStatus),
  };
}

function normalizeSessionLinkCreateRequest(body) {
  return {
    baseUrl: stringOrNull(body.baseUrl) || stringOrNull(body.checkinBaseUrl),
    channel: normalizeSessionLinkChannel(body.channel),
    identifier: stringOrNull(body.identifier) || stringOrNull(body.bookingReference) || stringOrNull(body.rollerUniqueId),
    ttlMinutes: normalizeTtlMinutes(body.ttlMinutes, body.ttlHours),
  };
}

function normalizeSessionLinkSmsRequest(event, body) {
  const confirmSend = booleanFromValue(body.confirmSend);
  const explicitDryRun = body.dryRun === undefined ? null : booleanFromValue(body.dryRun);

  return {
    baseUrl: stringOrNull(body.baseUrl) || stringOrNull(body.checkinBaseUrl) || DEFAULT_SMS_BASE_URL,
    confirmSend,
    dryRun: confirmSend ? (explicitDryRun ?? false) : true,
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    identifier: stringOrNull(body.identifier) || stringOrNull(body.bookingReference) || stringOrNull(body.rollerUniqueId),
    phoneNumber: stringOrNull(body.phoneNumber) || stringOrNull(body.to),
    ttlMinutes: normalizeTtlMinutes(body.ttlMinutes, body.ttlHours),
  };
}

function normalizeSessionLinkEmailRequest(event, body) {
  const confirmSend = booleanFromValue(body.confirmSend);
  const explicitDryRun = body.dryRun === undefined ? null : booleanFromValue(body.dryRun);

  return {
    baseUrl: stringOrNull(body.baseUrl) || stringOrNull(body.checkinBaseUrl) || DEFAULT_EMAIL_BASE_URL,
    confirmSend,
    dryRun: confirmSend ? (explicitDryRun ?? false) : true,
    email: stringOrNull(body.email) || stringOrNull(body.to) || stringOrNull(body.toEmail),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    identifier: stringOrNull(body.identifier) || stringOrNull(body.bookingReference) || stringOrNull(body.rollerUniqueId),
    includePreview: body.includePreview === true,
    ttlMinutes: normalizeTtlMinutes(body.ttlMinutes, body.ttlHours),
  };
}

function normalizeDueSessionLinkSmsRequest(body) {
  return normalizeDueSessionLinkMessagingRequest(body, ['sms']);
}

function normalizeDueSessionLinkMessagingRequest(body, forcedChannels = null) {
  const baseUrl = stringOrNull(body.baseUrl) || stringOrNull(body.checkinBaseUrl);

  return {
    baseUrl: baseUrl || DEFAULT_SMS_BASE_URL,
    channels: forcedChannels || normalizeDueMessageChannels(body.channels),
    confirmedSendApproval: stringOrNull(body.confirmedSendApproval),
    confirmSend: booleanFromValue(body.confirmSend),
    emailBaseUrl: stringOrNull(body.emailBaseUrl) || baseUrl || DEFAULT_EMAIL_BASE_URL,
    leadMinutes: clampInteger(body.leadMinutes, 0, 24 * 60, DEFAULT_SMS_TRIGGER_LEAD_MINUTES),
    limit: clampInteger(body.limit, 1, MAX_SMS_TRIGGER_LIMIT, MAX_SMS_TRIGGER_LIMIT),
    now: stringOrNull(body.now),
    smsBaseUrl: stringOrNull(body.smsBaseUrl) || baseUrl || DEFAULT_SMS_BASE_URL,
    ttlMinutes: normalizeTtlMinutes(body.ttlMinutes, body.ttlHours),
    windowEndAt: stringOrNull(body.windowEndAt),
    windowMinutes: clampInteger(body.windowMinutes, 1, MAX_SMS_TRIGGER_WINDOW_MINUTES, DEFAULT_SMS_TRIGGER_WINDOW_MINUTES),
    windowStartAt: stringOrNull(body.windowStartAt),
  };
}

function normalizeSessionLinkResolveRequest(event, body) {
  return {
    expectedDate: stringOrNull(body.expectedDate) || stringOrNull(body.visitDate),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    token: stringOrNull(body.token) || stringOrNull(getHeader(event, 'x-jumpyard-checkin-token')),
  };
}

function normalizeStaffListRequest(event) {
  const query = event?.queryStringParameters ?? {};
  const limit = Math.min(Math.max(numberOrNull(query.limit) ?? 25, 1), 50);
  const includeExpired = ['1', 'true', 'yes'].includes(String(query.includeExpired ?? '').toLowerCase());
  const searchQuery = normalizeStaffSearchQuery(query.q ?? query.query ?? query.search);

  return {
    includeExpired,
    limit,
    searchQuery,
  };
}

function normalizeStaffSearchQuery(value) {
  const query = stringOrNull(value);
  if (!query) return null;

  return query.toLowerCase().slice(0, 96);
}

function normalizeStaffAuthLoginRequest(body) {
  return {
    passcode: stringOrNull(body.passcode),
  };
}

function validateSessionLinkCreateRequest(request) {
  if (!request.identifier) {
    return {
      code: 'identifier_required',
      message: 'bookingReference, rollerUniqueId, or identifier is required.',
    };
  }

  if (!CHECKIN_LINK_CHANNELS.has(request.channel)) {
    return {
      code: 'channel_invalid',
      message: 'channel must be sms, email, manual, or dev.',
    };
  }

  if (request.baseUrl && !isSafeCheckinBaseUrl(request.baseUrl)) {
    return {
      code: 'base_url_invalid',
      message: 'baseUrl must be a valid http or https URL.',
    };
  }

  return null;
}

function validateSessionLinkSmsRequest(request) {
  if (!request.identifier) {
    return {
      code: 'identifier_required',
      message: 'bookingReference, rollerUniqueId, or identifier is required.',
    };
  }

  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  if (!request.baseUrl || !isSafeCheckinBaseUrl(request.baseUrl)) {
    return {
      code: 'base_url_invalid',
      message: 'baseUrl must be a valid http or https URL for the check-in app.',
    };
  }

  if (request.phoneNumber && !normalizePhoneForSms(request.phoneNumber)) {
    return {
      code: 'phone_number_invalid',
      message: 'phoneNumber must be E.164 or a Swedish mobile number such as 0700000000.',
    };
  }

  return null;
}

function validateSessionLinkEmailRequest(request) {
  if (!request.identifier) {
    return {
      code: 'identifier_required',
      message: 'bookingReference, rollerUniqueId, or identifier is required.',
    };
  }

  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  if (!request.baseUrl || !isSafeCheckinBaseUrl(request.baseUrl)) {
    return {
      code: 'base_url_invalid',
      message: 'baseUrl must be a valid http or https URL for the check-in app.',
    };
  }

  if (request.email && !normalizeEmailAddress(request.email)) {
    return {
      code: 'email_invalid',
      message: 'email must be a valid email address.',
    };
  }

  if (request.confirmSend) {
    if (!normalizeEmailAddress(EMAIL_FROM_ADDRESS)) {
      return {
        code: 'email_sender_not_configured',
        message: 'EMAIL_FROM_ADDRESS must be configured with a verified SES sender before confirmed email sends.',
      };
    }

    if (!isPublicHttpsCheckinBaseUrl(request.baseUrl)) {
      return {
        code: 'public_https_base_url_required',
        message: 'Confirmed email sends require a public HTTPS baseUrl for the check-in app.',
      };
    }
  }

  return null;
}

function validateDueSessionLinkSmsRequest(request, window) {
  return validateDueSessionLinkMessagingRequest(request, window);
}

function validateDueSessionLinkMessagingRequest(request, window) {
  if (!request.channels.length) {
    return {
      code: 'channels_required',
      message: 'At least one channel is required.',
    };
  }

  const invalidChannels = request.channels.filter((channel) => !BOOKING_TIME_MESSAGE_CHANNELS.has(channel));
  if (invalidChannels.length) {
    return {
      code: 'channels_invalid',
      message: 'channels may only contain sms and email.',
    };
  }

  if (request.channels.includes('sms') && (!request.smsBaseUrl || !isSafeCheckinBaseUrl(request.smsBaseUrl))) {
    return {
      code: 'base_url_invalid',
      message: 'smsBaseUrl or baseUrl must be a valid http or https URL for the check-in app.',
    };
  }

  if (request.channels.includes('email') && (!request.emailBaseUrl || !isSafeCheckinBaseUrl(request.emailBaseUrl))) {
    return {
      code: 'base_url_invalid',
      message: 'emailBaseUrl or baseUrl must be a valid http or https URL for the check-in app.',
    };
  }

  if (window.error) {
    return window.error;
  }

  return null;
}

function validateConfirmedScheduledDueSmsRequest(request) {
  return validateConfirmedScheduledDueMessagingRequest(request);
}

function validateConfirmedScheduledDueMessagingRequest(request) {
  if (request.confirmedSendApproval !== SCHEDULED_SMS_CONFIRMED_SEND_APPROVAL) {
    return {
      code: 'scheduled_messaging_confirmation_required',
      message: 'Scheduled confirmed guest messaging requires the explicit confirmedSendApproval safety phrase.',
    };
  }

  if (request.channels.includes('sms') && !isPublicHttpsCheckinBaseUrl(request.smsBaseUrl)) {
    return {
      code: 'public_https_base_url_required',
      message: 'Scheduled confirmed SMS sends require a public HTTPS smsBaseUrl or baseUrl for the check-in app.',
    };
  }

  if (request.channels.includes('email') && !isPublicHttpsCheckinBaseUrl(request.emailBaseUrl)) {
    return {
      code: 'public_https_base_url_required',
      message: 'Scheduled confirmed email sends require a public HTTPS emailBaseUrl or baseUrl for the check-in app.',
    };
  }

  if (request.channels.includes('email') && !normalizeEmailAddress(EMAIL_FROM_ADDRESS)) {
    return {
      code: 'email_sender_not_configured',
      message: 'Scheduled confirmed email sends require EMAIL_FROM_ADDRESS to be configured with a verified SES sender.',
    };
  }

  return null;
}

function validateSessionLinkResolveRequest(request) {
  if (!request.token) {
    return {
      code: 'token_required',
      message: 'token or x-jumpyard-checkin-token is required.',
    };
  }

  return null;
}

function validateStartRequest(request) {
  if (!request.identifier) {
    return {
      code: 'identifier_required',
      message: 'bookingReference, rollerUniqueId, or identifier is required.',
    };
  }

  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  if (request.ticketIdsContainDuplicates) {
    return {
      code: 'duplicate_ticket_ids',
      message: 'ticketIds must be unique per session request.',
    };
  }

  if (request.ticketIds.length > MAX_SELECTED_TICKETS) {
    return {
      code: 'too_many_tickets',
      message: `At most ${MAX_SELECTED_TICKETS} tickets can be selected for a check-in session.`,
    };
  }

  return null;
}

function validateReadyRequest(request) {
  if (!request.checkinSessionId) {
    return {
      code: 'session_id_required',
      message: 'checkinSessionId is required.',
    };
  }

  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  return null;
}

async function getBookingContext(identifier) {
  const result = await executeStatement(
    `SELECT
       b.roller_unique_id,
       b.booking_reference,
       b.roller_env,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date::text AS booking_date,
       b.start_time::text AS start_time,
       b.end_time::text AS end_time,
       b.freshness_status,
       b.is_tombstoned,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'ticketId', t.ticket_id,
             'bookingItemId', t.booking_item_id,
             'productId', t.product_id,
             'bookingDate', t.booking_date::text,
             'redeemStatusLastSeen', t.redeem_status_last_seen,
             'lastSeenFromRollerAt', t.last_seen_from_roller_at::text,
             'ticketProductType', t.ticket_summary ->> 'productType',
             'ticketProductSubType', t.ticket_summary ->> 'productSubType',
             'ticketSource', t.ticket_summary ->> 'source',
             'itemProductType', item.item_summary ->> 'productType',
             'itemProductSubType', item.item_summary ->> 'productSubType',
             'itemParentType', item.item_summary ->> 'parentType',
             'productCatalogType', product.summary ->> 'productType',
             'productCatalogSubType', product.summary ->> 'productSubType',
             'productCatalogParentType', product.summary ->> 'parentType',
             'productName', COALESCE(item.product_name, product.summary ->> 'name'),
             'parentProductName', COALESCE(item.parent_product_name, product.summary ->> 'parentProductName')
           )
           ORDER BY t.ticket_id
         ) FILTER (WHERE t.ticket_id IS NOT NULL),
         '[]'::jsonb
       )::text AS tickets_json
     FROM jumpyard.roller_bookings AS b
     LEFT JOIN jumpyard.roller_booking_tickets AS t
       ON t.roller_unique_id = b.roller_unique_id
     LEFT JOIN jumpyard.roller_booking_items AS item
       ON item.roller_unique_id = b.roller_unique_id
      AND (
        item.booking_item_key = t.booking_item_key
        OR (t.booking_item_id IS NOT NULL AND item.booking_item_id = t.booking_item_id)
        OR (
          t.booking_item_key IS NULL
          AND t.booking_item_id IS NULL
          AND t.product_id IS NOT NULL
          AND item.product_id = t.product_id
        )
      )
     LEFT JOIN LATERAL (
       SELECT pc.summary
       FROM jumpyard.product_catalog_cache AS pc
       WHERE pc.roller_env = b.roller_env
         AND pc.summary ->> 'id' = COALESCE(NULLIF(t.product_id, ''), NULLIF(item.product_id, ''))
       ORDER BY pc.fetched_at DESC
       LIMIT 1
     ) AS product ON true
     WHERE b.booking_reference = :identifier
        OR b.roller_unique_id = :identifier
        OR EXISTS (
          SELECT 1
          FROM jumpyard.roller_booking_tickets AS lookup_ticket
          WHERE lookup_ticket.roller_unique_id = b.roller_unique_id
            AND lookup_ticket.ticket_id = :identifier
        )
     GROUP BY
       b.roller_unique_id,
       b.booking_reference,
       b.roller_env,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.freshness_status,
       b.is_tombstoned
     ORDER BY b.source_last_updated_at DESC
     LIMIT 1`,
    [stringParameter('identifier', identifier)],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  return {
    booking: {
      amountOwingCents: numberOrNull(row.amount_owing_cents),
      bookingDate: stringOrNull(row.booking_date),
      bookingReference: stringOrNull(row.booking_reference),
      bookingStatus: stringOrNull(row.booking_status),
      endTime: stringOrNull(row.end_time),
      freshnessStatus: stringOrNull(row.freshness_status),
      isTombstoned: Boolean(row.is_tombstoned),
      paymentStatus: stringOrNull(row.payment_status),
      rollerEnv: stringOrNull(row.roller_env),
      rollerUniqueId: stringOrNull(row.roller_unique_id),
      startTime: stringOrNull(row.start_time),
      totalCents: numberOrNull(row.total_cents),
    },
    tickets: parseJsonArray(row.tickets_json).map((ticket) => ({
      bookingDate: stringOrNull(ticket.bookingDate),
      bookingItemId: stringOrNull(ticket.bookingItemId),
      itemParentType: stringOrNull(ticket.itemParentType),
      itemProductSubType: stringOrNull(ticket.itemProductSubType),
      itemProductType: stringOrNull(ticket.itemProductType),
      lastSeenFromRollerAt: stringOrNull(ticket.lastSeenFromRollerAt),
      parentProductName: stringOrNull(ticket.parentProductName),
      productId: stringOrNull(ticket.productId),
      productCatalogParentType: stringOrNull(ticket.productCatalogParentType),
      productCatalogSubType: stringOrNull(ticket.productCatalogSubType),
      productCatalogType: stringOrNull(ticket.productCatalogType),
      productName: stringOrNull(ticket.productName),
      redeemStatusLastSeen: stringOrNull(ticket.redeemStatusLastSeen),
      ticketId: stringOrNull(ticket.ticketId),
      ticketProductSubType: stringOrNull(ticket.ticketProductSubType),
      ticketProductType: stringOrNull(ticket.ticketProductType),
      ticketSource: stringOrNull(ticket.ticketSource),
    })),
  };
}

async function findSmsDestinationForBooking(rollerUniqueId) {
  if (!rollerUniqueId) return null;

  const result = await executeStatement(
     `SELECT
       gp.contact_number,
       gp.contact_number_hash,
       gp.contact_number_masked
     FROM (
       SELECT
         1 AS priority,
         ticket.roller_customer_id
       FROM jumpyard.roller_booking_tickets AS ticket
       WHERE ticket.roller_unique_id = :rollerUniqueId
         AND ticket.roller_customer_id IS NOT NULL
       UNION ALL
       SELECT
         2 AS priority,
         booking.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
       FROM jumpyard.roller_bookings AS booking
       WHERE booking.roller_unique_id = :rollerUniqueId
         AND booking.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
     ) AS contact_candidate
     INNER JOIN jumpyard.guest_profiles AS gp
       ON gp.roller_customer_id = contact_candidate.roller_customer_id
     WHERE gp.sms_ready IS TRUE
       AND gp.contact_number IS NOT NULL
     ORDER BY contact_candidate.priority ASC, gp.updated_at DESC
     LIMIT 1`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  const destination = buildSmsDestination(row.contact_number, 'guest_profile');
  if (!destination) return null;

  return {
    ...destination,
    hash: stringOrNull(row.contact_number_hash) || destination.hash,
    masked: stringOrNull(row.contact_number_masked) || destination.masked,
  };
}

async function findEmailDestinationForBooking(rollerUniqueId) {
  if (!rollerUniqueId) return null;

  const result = await executeStatement(
    `SELECT
       gp.email,
       gp.email_hash,
       gp.email_masked
     FROM (
       SELECT
         1 AS priority,
         ticket.roller_customer_id
       FROM jumpyard.roller_booking_tickets AS ticket
       WHERE ticket.roller_unique_id = :rollerUniqueId
         AND ticket.roller_customer_id IS NOT NULL
       UNION ALL
       SELECT
         2 AS priority,
         booking.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
       FROM jumpyard.roller_bookings AS booking
       WHERE booking.roller_unique_id = :rollerUniqueId
         AND booking.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
     ) AS contact_candidate
     INNER JOIN jumpyard.guest_profiles AS gp
       ON gp.roller_customer_id = contact_candidate.roller_customer_id
     WHERE gp.email IS NOT NULL
     ORDER BY contact_candidate.priority ASC, gp.updated_at DESC
     LIMIT 1`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  const destination = buildEmailDestination(row.email, 'guest_profile');
  if (!destination) return null;

  return {
    ...destination,
    hash: stringOrNull(row.email_hash) || destination.hash,
    masked: stringOrNull(row.email_masked) || destination.masked,
  };
}

async function findDueMessagingBookings({ limit, recentSinceAt, windowEndAt, windowStartAt }) {
  const result = await executeStatement(
    `WITH due_bookings AS (
       SELECT
         b.roller_unique_id,
         b.booking_reference,
         b.booking_status,
         b.payment_status,
         b.amount_owing_cents,
         b.booking_date::text AS booking_date,
         b.start_time::text AS start_time,
         (((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm')::text) AS booking_start_at
       FROM jumpyard.roller_bookings AS b
       WHERE b.booking_date IS NOT NULL
         AND b.start_time IS NOT NULL
         AND b.freshness_status = 'fresh'
         AND b.is_tombstoned IS FALSE
         AND COALESCE(lower(b.booking_status), '') NOT IN ('cancelled', 'deleted', 'draft')
         AND ((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm') >= CAST(:windowStartAt AS timestamptz)
         AND ((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm') < CAST(:windowEndAt AS timestamptz)
       ORDER BY ((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm') ASC, b.booking_reference ASC
       LIMIT ${limit}
     )
     SELECT
       due_bookings.*,
       sms_destination.contact_number AS sms_contact_number,
       sms_destination.contact_number_hash AS sms_contact_number_hash,
       sms_destination.contact_number_masked AS sms_contact_number_masked,
       email_destination.email AS email,
       email_destination.email_hash AS email_hash,
       email_destination.email_masked AS email_masked,
       EXISTS (
         SELECT 1
         FROM jumpyard.sms_deliveries AS sent
         WHERE sent.roller_unique_id = due_bookings.roller_unique_id
           AND sent.message_template = :messageTemplate
           AND sent.status = 'sent'
           AND sent.dry_run IS FALSE
           AND sent.created_at >= CAST(:recentSinceAt AS timestamptz)
         LIMIT 1
       ) AS sms_already_sent_recently,
       EXISTS (
         SELECT 1
         FROM jumpyard.email_deliveries AS sent
         WHERE sent.roller_unique_id = due_bookings.roller_unique_id
           AND sent.message_template = :emailMessageTemplate
           AND sent.status = 'sent'
           AND sent.dry_run IS FALSE
           AND sent.created_at >= CAST(:recentSinceAt AS timestamptz)
         LIMIT 1
       ) AS email_already_sent_recently
     FROM due_bookings
     LEFT JOIN LATERAL (
       SELECT
         gp.contact_number,
         gp.contact_number_hash,
         gp.contact_number_masked
       FROM (
         SELECT
           1 AS priority,
           ticket.roller_customer_id
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = due_bookings.roller_unique_id
           AND ticket.roller_customer_id IS NOT NULL
         UNION ALL
         SELECT
           2 AS priority,
           booking.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
         FROM jumpyard.roller_bookings AS booking
         WHERE booking.roller_unique_id = due_bookings.roller_unique_id
           AND booking.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
       ) AS contact_candidate
       INNER JOIN jumpyard.guest_profiles AS gp
         ON gp.roller_customer_id = contact_candidate.roller_customer_id
       WHERE gp.sms_ready IS TRUE
         AND gp.contact_number IS NOT NULL
       ORDER BY contact_candidate.priority ASC, gp.updated_at DESC NULLS LAST
       LIMIT 1
     ) AS sms_destination ON true
     LEFT JOIN LATERAL (
       SELECT
         gp.email,
         gp.email_hash,
         gp.email_masked
       FROM (
         SELECT
           1 AS priority,
           ticket.roller_customer_id
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = due_bookings.roller_unique_id
           AND ticket.roller_customer_id IS NOT NULL
         UNION ALL
         SELECT
           2 AS priority,
           booking.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
         FROM jumpyard.roller_bookings AS booking
         WHERE booking.roller_unique_id = due_bookings.roller_unique_id
           AND booking.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
       ) AS contact_candidate
       INNER JOIN jumpyard.guest_profiles AS gp
         ON gp.roller_customer_id = contact_candidate.roller_customer_id
       WHERE gp.email IS NOT NULL
       ORDER BY contact_candidate.priority ASC, gp.updated_at DESC NULLS LAST
       LIMIT 1
     ) AS email_destination ON true
     ORDER BY due_bookings.booking_start_at ASC, due_bookings.booking_reference ASC`,
    [
      stringParameter('windowStartAt', windowStartAt),
      stringParameter('windowEndAt', windowEndAt),
      stringParameter('recentSinceAt', recentSinceAt),
      stringParameter('messageTemplate', CHECKIN_SMS_TEMPLATE),
      stringParameter('emailMessageTemplate', CHECKIN_EMAIL_TEMPLATE),
    ],
  );

  return mappedRows(result).map(mapDueMessagingBookingRow);
}

function planDueMessageCandidate({ candidate, channel, context, decision, request, window }) {
  const destination = candidate.destinations[channel] ?? null;
  const alreadySentRecently = candidate.alreadySentRecently[channel] === true;
  const base = {
    action: request.confirmSend ? 'send_ready' : 'planned',
    bookingDate: candidate.bookingDate,
    bookingReference: candidate.bookingReference,
    bookingStartAt: candidate.bookingStartAt,
    channel,
    destinationMasked: destination?.masked ?? null,
    rollerUniqueId: candidate.rollerUniqueId,
    startTime: candidate.startTime,
  };

  if (!destination) {
    return {
      ...base,
      action: 'skipped',
      reason: `${channel}_destination_missing`,
    };
  }

  if (alreadySentRecently) {
    return {
      ...base,
      action: 'skipped',
      reason: `${channel}_already_sent_recently`,
    };
  }

  if (!context) {
    return {
      ...base,
      action: 'skipped',
      reason: 'booking_not_found',
    };
  }

  if (!decision.canStart) {
    return {
      ...base,
      action: 'skipped',
      reason: decision.reason,
    };
  }

  return {
    ...base,
    idempotencyKeyPrefix: createDueMessageIdempotencyKey(window, candidate, channel).slice(0, 32),
    reason: request.confirmSend ? 'ready_to_send' : 'ready_to_plan',
    ticketCount: decision.selectedTicketIds.length,
  };
}

async function sendDueMessageChannel(event, { candidate, channel, correlationId, options, request, window }) {
  const baseRequest = {
    bookingReference: candidate.bookingReference,
    confirmSend: true,
    dryRun: false,
    idempotencyKey: createDueMessageIdempotencyKey(window, candidate, channel),
    ttlMinutes: request.ttlMinutes,
  };

  if (channel === 'sms') {
    return handleSendSessionLinkSms(
      event,
      {
        ...baseRequest,
        baseUrl: request.smsBaseUrl,
      },
      correlationId,
      options,
    );
  }

  return handleSendSessionLinkEmail(
    event,
    {
      ...baseRequest,
      baseUrl: request.emailBaseUrl,
    },
    correlationId,
    options,
  );
}

async function findReadyStaffSessions(request) {
  const expiryClause = request.includeExpired ? '' : 'AND cs.expires_at > now()';

  const result = await executeStatement(
    `WITH session_base AS (
       SELECT
         cs.checkin_session_id,
         cs.roller_unique_id,
         cs.booking_reference,
         cs.visit_date::text AS visit_date,
         cs.status,
         cs.safety_status,
         cs.handoff_code,
         cs.handoff_status,
         cs.selected_ticket_ids::text AS selected_ticket_ids,
         cs.expires_at::text AS expires_at,
         cs.ready_for_staff_at::text AS ready_for_staff_at,
         cs.completed_at::text AS completed_at,
         cs.created_at::text AS created_at,
         cs.updated_at::text AS updated_at,
         b.booking_status,
         b.payment_status,
         b.amount_owing_cents,
         b.total_cents,
         b.booking_date::text AS booking_date,
         b.start_time::text AS start_time,
         b.end_time::text AS end_time,
         b.freshness_status,
         COALESCE(
           NULLIF(b.normalized_summary ->> 'bookingName', ''),
           NULLIF(b.normalized_summary ->> 'name', ''),
           NULLIF(trim(concat_ws(' ', guest_identity.first_name, guest_identity.last_name)), '')
         ) AS guest_name,
         guest_identity.email_masked AS guest_email_masked,
         guest_identity.phone_masked AS guest_phone_masked,
         lower(
           concat_ws(
             ' ',
             cs.checkin_session_id,
             cs.handoff_code,
             cs.booking_reference,
             cs.roller_unique_id,
             b.booking_reference,
             COALESCE(b.normalized_summary ->> 'bookingName', ''),
             COALESCE(b.normalized_summary ->> 'name', ''),
             COALESCE(guest_identity.first_name, ''),
             COALESCE(guest_identity.last_name, ''),
             COALESCE(guest_identity.email, ''),
             COALESCE(guest_identity.email_masked, ''),
             COALESCE(guest_identity.phone, ''),
             COALESCE(guest_identity.phone_masked, '')
           )
         ) AS staff_search_text
       FROM jumpyard.checkin_sessions AS cs
       LEFT JOIN jumpyard.roller_bookings AS b
         ON b.roller_unique_id = cs.roller_unique_id
       LEFT JOIN LATERAL (
         SELECT
           contact_source.email,
           contact_source.email_masked,
           contact_source.first_name,
           contact_source.last_name,
           contact_source.phone,
           contact_source.phone_masked
         FROM (
           SELECT
             0 AS priority,
             draft.customer_email AS email,
             draft.customer_email_masked AS email_masked,
             COALESCE(NULLIF(draft.customer_first_name, ''), profile.first_name) AS first_name,
             COALESCE(NULLIF(draft.customer_last_name, ''), profile.last_name) AS last_name,
             draft.customer_phone AS phone,
             draft.customer_phone_masked AS phone_masked,
             draft.updated_at
           FROM jumpyard.prepayment_booking_drafts AS draft
           LEFT JOIN LATERAL (
             SELECT
               gp.latest_booking_context ->> 'firstName' AS first_name,
               gp.latest_booking_context ->> 'lastName' AS last_name
             FROM jumpyard.guest_profiles AS gp
             WHERE (
                 draft.customer_email_hash IS NOT NULL
                 AND gp.email_hash = draft.customer_email_hash
               )
                OR (
                  draft.customer_phone_hash IS NOT NULL
                  AND gp.contact_number_hash = draft.customer_phone_hash
                )
             ORDER BY gp.updated_at DESC NULLS LAST
             LIMIT 1
           ) AS profile ON true
           WHERE draft.roller_draft_unique_id = cs.roller_unique_id
             AND (
               draft.customer_email IS NOT NULL
               OR draft.customer_email_masked IS NOT NULL
               OR draft.customer_first_name IS NOT NULL
               OR draft.customer_last_name IS NOT NULL
               OR profile.first_name IS NOT NULL
               OR profile.last_name IS NOT NULL
               OR draft.customer_phone IS NOT NULL
               OR draft.customer_phone_masked IS NOT NULL
             )
           UNION ALL
           SELECT
             contact_candidate.priority + 1 AS priority,
             gp.email,
             gp.email_masked,
             gp.latest_booking_context ->> 'firstName' AS first_name,
             gp.latest_booking_context ->> 'lastName' AS last_name,
             gp.contact_number AS phone,
             gp.contact_number_masked AS phone_masked,
             gp.updated_at
           FROM (
             SELECT
               1 AS priority,
               ticket.roller_customer_id
             FROM jumpyard.roller_booking_tickets AS ticket
             WHERE ticket.roller_unique_id = cs.roller_unique_id
               AND ticket.roller_customer_id IS NOT NULL
             UNION ALL
             SELECT
               2 AS priority,
               b.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
             WHERE b.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
           ) AS contact_candidate
           INNER JOIN jumpyard.guest_profiles AS gp
             ON gp.roller_customer_id = contact_candidate.roller_customer_id
         WHERE gp.email IS NOT NULL
            OR gp.email_masked IS NOT NULL
            OR (gp.latest_booking_context ->> 'firstName') IS NOT NULL
            OR (gp.latest_booking_context ->> 'lastName') IS NOT NULL
            OR gp.contact_number IS NOT NULL
            OR gp.contact_number_masked IS NOT NULL
         ) AS contact_source
         ORDER BY contact_source.priority ASC, contact_source.updated_at DESC NULLS LAST
         LIMIT 1
       ) AS guest_identity ON true
       WHERE cs.handoff_status = 'ready_for_staff'
         AND cs.status = 'ready_for_staff'
         ${expiryClause}
     ),
     session_rows AS (
       SELECT *
       FROM session_base
       WHERE CAST(:searchQuery AS text) IS NULL
          OR position(CAST(:searchQuery AS text) in staff_search_text) > 0
       ORDER BY ready_for_staff_at DESC NULLS LAST, updated_at DESC
       LIMIT ${request.limit}
     )
     SELECT
       session_rows.*,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_items AS item
         WHERE item.roller_unique_id = session_rows.roller_unique_id
            OR item.roller_unique_id IN (
              SELECT link.linked_roller_unique_id
              FROM jumpyard.booking_links AS link
              LEFT JOIN jumpyard.roller_bookings AS linked_booking
                ON linked_booking.roller_unique_id = link.linked_roller_unique_id
              LEFT JOIN jumpyard.prepayment_booking_drafts AS linked_draft
                ON linked_draft.roller_draft_unique_id = link.linked_roller_unique_id
              WHERE link.original_roller_unique_id = session_rows.roller_unique_id
                AND link.link_type = 'add_product_draft'
                AND (
                  linked_draft.status = 'published'
                  OR linked_booking.amount_owing_cents = 0
                  OR lower(replace(COALESCE(linked_booking.payment_status, linked_booking.booking_status, ''), ' ', '')) IN ('paid', 'paidinfull', 'nopaymentrequired')
                )
            )
       )::int AS item_count,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = session_rows.roller_unique_id
       )::int AS ticket_count
     FROM session_rows
     ORDER BY session_rows.ready_for_staff_at DESC NULLS LAST, session_rows.updated_at DESC`,
    [stringParameter('searchQuery', request.searchQuery)],
  );

  return mappedRows(result).map(mapStaffSessionSummaryRow);
}

async function findStaffSessionDetail(checkinSessionId) {
  const result = await executeStatement(
    `SELECT
       cs.checkin_session_id,
       cs.roller_unique_id,
       cs.booking_reference,
       cs.visit_date::text AS visit_date,
       cs.status,
       cs.safety_status,
       cs.handoff_code,
       cs.handoff_status,
       cs.selected_ticket_ids::text AS selected_ticket_ids,
       cs.expires_at::text AS expires_at,
       cs.ready_for_staff_at::text AS ready_for_staff_at,
       cs.completed_at::text AS completed_at,
       cs.created_at::text AS created_at,
       cs.updated_at::text AS updated_at,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date::text AS booking_date,
       b.start_time::text AS start_time,
       b.end_time::text AS end_time,
       b.freshness_status,
       COALESCE(
         NULLIF(b.normalized_summary ->> 'bookingName', ''),
         NULLIF(b.normalized_summary ->> 'name', ''),
         NULLIF(trim(concat_ws(' ', guest_identity.first_name, guest_identity.last_name)), '')
       ) AS guest_name,
       guest_identity.email_masked AS guest_email_masked,
       guest_identity.phone_masked AS guest_phone_masked,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_items AS item
         WHERE item.roller_unique_id = cs.roller_unique_id
            OR item.roller_unique_id IN (
              SELECT link.linked_roller_unique_id
              FROM jumpyard.booking_links AS link
              LEFT JOIN jumpyard.roller_bookings AS linked_booking
                ON linked_booking.roller_unique_id = link.linked_roller_unique_id
              LEFT JOIN jumpyard.prepayment_booking_drafts AS linked_draft
                ON linked_draft.roller_draft_unique_id = link.linked_roller_unique_id
              WHERE link.original_roller_unique_id = cs.roller_unique_id
                AND link.link_type = 'add_product_draft'
                AND (
                  linked_draft.status = 'published'
                  OR linked_booking.amount_owing_cents = 0
                  OR lower(replace(COALESCE(linked_booking.payment_status, linked_booking.booking_status, ''), ' ', '')) IN ('paid', 'paidinfull', 'nopaymentrequired')
                )
            )
       )::int AS item_count,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = cs.roller_unique_id
       )::int AS ticket_count
     FROM jumpyard.checkin_sessions AS cs
     LEFT JOIN jumpyard.roller_bookings AS b
       ON b.roller_unique_id = cs.roller_unique_id
     LEFT JOIN LATERAL (
       SELECT
         contact_source.email_masked,
         contact_source.first_name,
         contact_source.last_name,
         contact_source.phone_masked
       FROM (
         SELECT
           0 AS priority,
           draft.customer_email_masked AS email_masked,
           COALESCE(NULLIF(draft.customer_first_name, ''), profile.first_name) AS first_name,
           COALESCE(NULLIF(draft.customer_last_name, ''), profile.last_name) AS last_name,
           draft.customer_phone_masked AS phone_masked,
           draft.updated_at
         FROM jumpyard.prepayment_booking_drafts AS draft
         LEFT JOIN LATERAL (
           SELECT
             gp.latest_booking_context ->> 'firstName' AS first_name,
             gp.latest_booking_context ->> 'lastName' AS last_name
           FROM jumpyard.guest_profiles AS gp
           WHERE (
               draft.customer_email_hash IS NOT NULL
               AND gp.email_hash = draft.customer_email_hash
             )
              OR (
                draft.customer_phone_hash IS NOT NULL
                AND gp.contact_number_hash = draft.customer_phone_hash
              )
           ORDER BY gp.updated_at DESC NULLS LAST
           LIMIT 1
         ) AS profile ON true
         WHERE draft.roller_draft_unique_id = cs.roller_unique_id
           AND (
             draft.customer_email_masked IS NOT NULL
             OR draft.customer_first_name IS NOT NULL
             OR draft.customer_last_name IS NOT NULL
             OR profile.first_name IS NOT NULL
             OR profile.last_name IS NOT NULL
             OR draft.customer_phone_masked IS NOT NULL
           )
         UNION ALL
         SELECT
           contact_candidate.priority + 1 AS priority,
           gp.email_masked,
           gp.latest_booking_context ->> 'firstName' AS first_name,
           gp.latest_booking_context ->> 'lastName' AS last_name,
           gp.contact_number_masked AS phone_masked,
           gp.updated_at
         FROM (
           SELECT
             1 AS priority,
             ticket.roller_customer_id
           FROM jumpyard.roller_booking_tickets AS ticket
           WHERE ticket.roller_unique_id = cs.roller_unique_id
             AND ticket.roller_customer_id IS NOT NULL
           UNION ALL
           SELECT
             2 AS priority,
             b.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
           WHERE b.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
         ) AS contact_candidate
         INNER JOIN jumpyard.guest_profiles AS gp
           ON gp.roller_customer_id = contact_candidate.roller_customer_id
       WHERE gp.email_masked IS NOT NULL
          OR (gp.latest_booking_context ->> 'firstName') IS NOT NULL
          OR (gp.latest_booking_context ->> 'lastName') IS NOT NULL
          OR gp.contact_number_masked IS NOT NULL
       ) AS contact_source
       ORDER BY contact_source.priority ASC, contact_source.updated_at DESC NULLS LAST
       LIMIT 1
     ) AS guest_identity ON true
     WHERE cs.checkin_session_id = :checkinSessionId
     LIMIT 1`,
    [stringParameter('checkinSessionId', checkinSessionId)],
  );

  const session = mapStaffSessionSummaryRow(firstMappedRow(result));
  if (!session) return null;

  const items = await findStaffBookingItems(session.rollerUniqueId);
  const tickets = await findStaffBookingTickets(session.rollerUniqueId, session.selectedTicketIds);

  return {
    ...session,
    items,
    tickets,
  };
}

async function findStaffBookingItems(rollerUniqueId) {
  if (!rollerUniqueId) return [];

  const result = await executeStatement(
    `WITH staff_items AS (
       SELECT
         item.booking_item_key,
         item.booking_item_id,
         item.product_id,
         item.parent_product_id,
         item.product_name,
         item.parent_product_name,
         item.quantity,
         item.booking_date::text AS booking_date,
         item.start_time::text AS start_time,
         item.end_time::text AS end_time,
         item.item_summary::text AS item_summary,
         NULL::text AS linked_booking_reference,
         NULL::text AS linked_roller_unique_id,
         'original'::text AS fulfillment_source,
         0 AS source_order
       FROM jumpyard.roller_booking_items AS item
       WHERE item.roller_unique_id = :rollerUniqueId
       UNION ALL
       SELECT
         item.booking_item_key,
         item.booking_item_id,
         item.product_id,
         item.parent_product_id,
         item.product_name,
         item.parent_product_name,
         item.quantity,
         item.booking_date::text AS booking_date,
         item.start_time::text AS start_time,
         item.end_time::text AS end_time,
         item.item_summary::text AS item_summary,
         link.linked_booking_reference,
         link.linked_roller_unique_id,
         'linked_add_on'::text AS fulfillment_source,
         1 AS source_order
       FROM jumpyard.booking_links AS link
       INNER JOIN jumpyard.roller_booking_items AS item
         ON item.roller_unique_id = link.linked_roller_unique_id
       LEFT JOIN jumpyard.roller_bookings AS linked_booking
         ON linked_booking.roller_unique_id = link.linked_roller_unique_id
       LEFT JOIN jumpyard.prepayment_booking_drafts AS linked_draft
         ON linked_draft.roller_draft_unique_id = link.linked_roller_unique_id
       WHERE link.original_roller_unique_id = :rollerUniqueId
         AND link.link_type = 'add_product_draft'
         AND (
           linked_draft.status = 'published'
           OR linked_booking.amount_owing_cents = 0
           OR lower(replace(COALESCE(linked_booking.payment_status, linked_booking.booking_status, ''), ' ', '')) IN ('paid', 'paidinfull', 'nopaymentrequired')
         )
     )
     SELECT
       booking_item_key,
       booking_item_id,
       product_id,
       parent_product_id,
       product_name,
       parent_product_name,
       quantity,
       booking_date,
       start_time,
       end_time,
       item_summary,
       linked_booking_reference,
       linked_roller_unique_id,
       fulfillment_source
     FROM staff_items
     ORDER BY source_order ASC, booking_date NULLS LAST, start_time NULLS LAST, product_name NULLS LAST`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );

  return mappedRows(result).map((row) => ({
    bookingDate: stringOrNull(row.booking_date),
    bookingItemId: stringOrNull(row.booking_item_id),
    bookingItemKey: stringOrNull(row.booking_item_key),
    endTime: stringOrNull(row.end_time),
    fulfillmentSource: stringOrNull(row.fulfillment_source) || 'original',
    linkedBookingReference: stringOrNull(row.linked_booking_reference),
    linkedRollerUniqueId: stringOrNull(row.linked_roller_unique_id),
    parentProductId: stringOrNull(row.parent_product_id),
    parentProductName: stringOrNull(row.parent_product_name),
    productId: stringOrNull(row.product_id),
    productName: stringOrNull(row.product_name),
    quantity: numberOrNull(row.quantity) ?? 0,
    startTime: stringOrNull(row.start_time),
    summary: parseJsonObject(row.item_summary),
  }));
}

async function findStaffBookingTickets(rollerUniqueId, selectedTicketIds) {
  if (!rollerUniqueId) return [];

  const selected = new Set(selectedTicketIds);
  const result = await executeStatement(
    `SELECT
       ticket_id,
       custom_ticket_id,
       booking_item_id,
       product_id,
       booking_date::text AS booking_date,
       expiry_date::text AS expiry_date,
       redeem_status_last_seen,
       last_seen_from_roller_at::text AS last_seen_from_roller_at,
       ticket_summary::text AS ticket_summary
     FROM jumpyard.roller_booking_tickets
     WHERE roller_unique_id = :rollerUniqueId
     ORDER BY booking_date NULLS LAST, ticket_id`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );

  return mappedRows(result).map((row) => ({
    bookingDate: stringOrNull(row.booking_date),
    bookingItemId: stringOrNull(row.booking_item_id),
    customTicketId: stringOrNull(row.custom_ticket_id),
    expiryDate: stringOrNull(row.expiry_date),
    lastSeenFromRollerAt: stringOrNull(row.last_seen_from_roller_at),
    productId: stringOrNull(row.product_id),
    redeemStatusLastSeen: stringOrNull(row.redeem_status_last_seen),
    selectedForCheckIn: selected.has(stringOrNull(row.ticket_id)),
    summary: parseJsonObject(row.ticket_summary),
    ticketId: stringOrNull(row.ticket_id),
  }));
}

async function createSessionLinkToken({ channel, context, ttlMinutes }) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = hashString(token);
    const result = await executeStatement(
      `INSERT INTO jumpyard.checkin_tokens (
         token_hash,
         roller_unique_id,
         channel,
         expires_at
       )
       VALUES (
         :tokenHash,
         :rollerUniqueId,
         :channel,
         CAST(:expiresAt AS timestamptz)
       )
       ON CONFLICT (token_hash) DO NOTHING
       RETURNING token_hash, expires_at::text AS expires_at`,
      [
        stringParameter('tokenHash', tokenHash),
        stringParameter('rollerUniqueId', context.booking.rollerUniqueId),
        stringParameter('channel', channel),
        stringParameter('expiresAt', expiresAt),
      ],
    );
    const row = firstMappedRow(result);
    if (row) {
      return {
        expiresAt: stringOrNull(row.expires_at),
        token,
        tokenHash,
      };
    }
  }

  const error = new Error('Could not allocate a unique check-in link token.');
  error.code = 'checkin_link_token_collision';
  throw error;
}

async function findSessionLinkToken(tokenHash) {
  const result = await executeStatement(
    `SELECT
       ct.token_hash,
       ct.roller_unique_id,
       ct.channel,
       ct.expires_at::text AS expires_at,
       ct.opened_at::text AS opened_at,
       ct.consumed_at::text AS consumed_at,
       b.booking_reference
     FROM jumpyard.checkin_tokens AS ct
     LEFT JOIN jumpyard.roller_bookings AS b
       ON b.roller_unique_id = ct.roller_unique_id
     WHERE ct.token_hash = :tokenHash
     LIMIT 1`,
    [stringParameter('tokenHash', tokenHash)],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  return {
    bookingReference: stringOrNull(row.booking_reference),
    channel: stringOrNull(row.channel),
    consumedAt: stringOrNull(row.consumed_at),
    expiresAt: stringOrNull(row.expires_at),
    openedAt: stringOrNull(row.opened_at),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    tokenHash: stringOrNull(row.token_hash),
  };
}

async function markSessionLinkOpened(tokenHash) {
  await executeStatement(
    `UPDATE jumpyard.checkin_tokens
     SET opened_at = COALESCE(opened_at, now())
     WHERE token_hash = :tokenHash`,
    [stringParameter('tokenHash', tokenHash)],
  );
}

async function markSessionLinkSent(tokenHash) {
  await executeStatement(
    `UPDATE jumpyard.checkin_tokens
     SET sent_at = COALESCE(sent_at, now())
     WHERE token_hash = :tokenHash`,
    [stringParameter('tokenHash', tokenHash)],
  );
}

async function recordSmsDelivery({
  booking,
  deliveryId,
  destination,
  dryRun,
  errorCode = null,
  errorSummary = null,
  provider,
  providerMessageId = null,
  status,
  tokenHash,
}) {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  const failedAt = status === 'failed' ? new Date().toISOString() : null;

  await executeStatement(
    `INSERT INTO jumpyard.sms_deliveries (
       sms_delivery_id,
       roller_unique_id,
       booking_reference,
       token_hash,
       provider,
       destination_hash,
       destination_masked,
       message_template,
       status,
       dry_run,
       provider_message_id,
       error_code,
       error_summary,
       sent_at,
       failed_at
     )
     VALUES (
       :deliveryId,
       :rollerUniqueId,
       :bookingReference,
       :tokenHash,
       :provider,
       :destinationHash,
       :destinationMasked,
       :messageTemplate,
       :status,
       :dryRun,
       :providerMessageId,
       :errorCode,
       :errorSummary,
       CAST(:sentAt AS timestamptz),
       CAST(:failedAt AS timestamptz)
     )`,
    [
      stringParameter('deliveryId', deliveryId),
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('tokenHash', tokenHash),
      stringParameter('provider', provider),
      stringParameter('destinationHash', destination.hash),
      stringParameter('destinationMasked', destination.masked),
      stringParameter('messageTemplate', CHECKIN_SMS_TEMPLATE),
      stringParameter('status', status),
      booleanParameter('dryRun', dryRun),
      stringParameter('providerMessageId', providerMessageId),
      stringParameter('errorCode', errorCode),
      stringParameter('errorSummary', errorSummary),
      stringParameter('sentAt', sentAt),
      stringParameter('failedAt', failedAt),
    ],
  );
}

async function recordEmailDelivery({
  booking,
  deliveryId,
  destination,
  dryRun,
  errorCode = null,
  errorSummary = null,
  provider,
  providerMessageId = null,
  status,
  subject,
  tokenHash,
}) {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  const failedAt = status === 'failed' ? new Date().toISOString() : null;

  await executeStatement(
    `INSERT INTO jumpyard.email_deliveries (
       email_delivery_id,
       roller_unique_id,
       booking_reference,
       token_hash,
       provider,
       destination_hash,
       destination_masked,
       message_template,
       subject,
       status,
       dry_run,
       provider_message_id,
       error_code,
       error_summary,
       sent_at,
       failed_at
     )
     VALUES (
       :deliveryId,
       :rollerUniqueId,
       :bookingReference,
       :tokenHash,
       :provider,
       :destinationHash,
       :destinationMasked,
       :messageTemplate,
       :subject,
       :status,
       :dryRun,
       :providerMessageId,
       :errorCode,
       :errorSummary,
       CAST(:sentAt AS timestamptz),
       CAST(:failedAt AS timestamptz)
     )`,
    [
      stringParameter('deliveryId', deliveryId),
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('tokenHash', tokenHash),
      stringParameter('provider', provider),
      stringParameter('destinationHash', destination.hash),
      stringParameter('destinationMasked', destination.masked),
      stringParameter('messageTemplate', CHECKIN_EMAIL_TEMPLATE),
      stringParameter('subject', subject),
      stringParameter('status', status),
      booleanParameter('dryRun', dryRun),
      stringParameter('providerMessageId', providerMessageId),
      stringParameter('errorCode', errorCode),
      stringParameter('errorSummary', errorSummary),
      stringParameter('sentAt', sentAt),
      stringParameter('failedAt', failedAt),
    ],
  );
}

async function sendSmsWithSns({ message, phoneNumber }) {
  if (SMS_PROVIDER !== 'aws_sns') {
    const error = new Error('Unsupported SMS provider.');
    error.code = 'sms_provider_unsupported';
    throw error;
  }

  const messageAttributes = {
    'AWS.SNS.SMS.SMSType': {
      DataType: 'String',
      StringValue: 'Transactional',
    },
  };
  if (/^[A-Za-z0-9]{1,11}$/.test(SMS_SENDER_ID)) {
    messageAttributes['AWS.SNS.SMS.SenderID'] = {
      DataType: 'String',
      StringValue: SMS_SENDER_ID,
    };
  }

  const response = await snsClient.send(
    new PublishCommand({
      Message: message,
      MessageAttributes: messageAttributes,
      PhoneNumber: phoneNumber,
    }),
  );

  return response.MessageId || null;
}

function getSmsProviderDiagnostics() {
  return {
    provider: SMS_PROVIDER,
    senderIdConfigured: Boolean(SMS_SENDER_ID),
    senderIdRequested: /^[A-Za-z0-9]{1,11}$/.test(SMS_SENDER_ID),
  };
}

function getEmailProviderDiagnostics() {
  return {
    provider: EMAIL_PROVIDER,
    fromAddressConfigured: Boolean(normalizeEmailAddress(EMAIL_FROM_ADDRESS)),
    replyToConfigured: EMAIL_REPLY_TO_ADDRESSES.length > 0,
  };
}

async function sendEmailWithSes({ destinationEmail, html, subject, text }) {
  if (EMAIL_PROVIDER !== 'aws_ses') {
    const error = new Error('Unsupported email provider.');
    error.code = 'email_provider_unsupported';
    throw error;
  }

  const fromAddress = normalizeEmailAddress(EMAIL_FROM_ADDRESS);
  if (!fromAddress) {
    const error = new Error('Email sender address is not configured.');
    error.code = 'email_sender_not_configured';
    throw error;
  }

  const { client, SendEmailCommand } = getSesClient();
  const commandInput = {
    Content: {
      Simple: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: html,
          },
          Text: {
            Charset: 'UTF-8',
            Data: text,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: subject,
        },
      },
    },
    Destination: {
      ToAddresses: [destinationEmail],
    },
    FromEmailAddress: fromAddress,
  };
  if (EMAIL_REPLY_TO_ADDRESSES.length > 0) {
    commandInput.ReplyToAddresses = EMAIL_REPLY_TO_ADDRESSES;
  }

  const command = new SendEmailCommand(commandInput);

  const response = await client.send(command);
  return response.MessageId || null;
}

function getSesClient() {
  if (cachedSesClient && cachedSendEmailCommand) {
    return { client: cachedSesClient, SendEmailCommand: cachedSendEmailCommand };
  }

  try {
    const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
    cachedSesClient = new SESv2Client({});
    cachedSendEmailCommand = SendEmailCommand;
    return { client: cachedSesClient, SendEmailCommand };
  } catch {
    const error = new Error('SESv2 AWS SDK client is not available in the Lambda runtime.');
    error.code = 'email_provider_module_missing';
    throw error;
  }
}

function evaluateStartContext(context, request) {
  const booking = context.booking;
  const selectedTickets = selectTickets(context.tickets, request.ticketIds);
  const { redeemableTickets } = splitRedeemableTickets(selectedTickets);
  const selectedTicketIds = redeemableTickets.map((ticket) => ticket.ticketId).filter(Boolean);
  const visitDate = request.expectedDate || booking.bookingDate || redeemableTickets.find((ticket) => ticket.bookingDate)?.bookingDate || null;

  if (booking.isTombstoned || isInactiveBookingStatus(booking.bookingStatus)) {
    return blocked('booking_not_active', 'The booking is cancelled, deleted, or otherwise inactive.', selectedTicketIds, visitDate);
  }

  if (booking.freshnessStatus !== 'fresh') {
    return blocked('booking_not_fresh', 'The local booking snapshot is not fresh enough to start check-in.', selectedTicketIds, visitDate);
  }

  if (!isPaymentComplete(booking)) {
    return blocked('payment_required', 'The booking is not fully paid and cannot start check-in yet.', selectedTicketIds, visitDate);
  }

  if (request.expectedDate && !bookingMatchesExpectedDate(booking, context.tickets, request.expectedDate)) {
    return blocked('wrong_date', 'The booking is not valid for the expected check-in date.', selectedTicketIds, visitDate);
  }

  if (request.ticketIds.length > 0 && selectedTickets.length !== request.ticketIds.length) {
    return blocked('unknown_ticket', 'One or more requested ticket ids were not found on the booking.', selectedTicketIds, visitDate);
  }

  if (selectedTicketIds.length === 0) {
    return blocked('no_redeemable_tickets', 'The booking does not have local ticket ids for check-in.', selectedTicketIds, visitDate);
  }

  const usedTicket = redeemableTickets.find((ticket) => isUsedRedeemStatus(ticket.redeemStatusLastSeen));
  if (usedTicket) {
    return blocked('already_redeemed', 'At least one selected ticket is already marked redeemed locally.', selectedTicketIds, visitDate);
  }

  return {
    canStart: true,
    message: null,
    reason: 'ready',
    selectedTicketIds,
    visitDate,
  };
}

function selectTickets(tickets, requestedTicketIds) {
  if (requestedTicketIds.length === 0) return tickets;
  const requested = new Set(requestedTicketIds);
  return tickets.filter((ticket) => requested.has(ticket.ticketId));
}

function splitRedeemableTickets(tickets) {
  const redeemableTickets = [];
  const excludedTickets = [];

  for (const ticket of tickets) {
    const eligibility = getTicketRedeemEligibility(ticket);
    if (eligibility.redeemable) {
      redeemableTickets.push(ticket);
    } else {
      excludedTickets.push({
        ...ticket,
        redeemEligibilityReason: eligibility.reason,
      });
    }
  }

  return { excludedTickets, redeemableTickets };
}

function getTicketRedeemEligibility(ticket) {
  const markers = [
    ticket.ticketProductType,
    ticket.ticketProductSubType,
    ticket.itemProductType,
    ticket.itemProductSubType,
    ticket.itemParentType,
    ticket.productCatalogType,
    ticket.productCatalogSubType,
    ticket.productCatalogParentType,
  ].map(productKey).filter(Boolean);

  const nonRedeemableMarker = markers.find((marker) => NON_REDEEMABLE_PRODUCT_KEYS.has(marker));
  if (nonRedeemableMarker) {
    return { reason: `non_redeemable_product_type:${nonRedeemableMarker}`, redeemable: false };
  }

  if (markers.some((marker) => REDEEMABLE_PRODUCT_KEYS.has(marker))) {
    return { reason: 'redeemable_product_type', redeemable: true };
  }

  const sourceKey = productKey(ticket.ticketSource);
  if (sourceKey?.includes('dataapi') && sourceKey.includes('tickets')) {
    return { reason: 'data_api_ticket_source', redeemable: true };
  }

  return { reason: 'unknown_product_type', redeemable: false };
}

function productKey(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  return normalized || null;
}

function blocked(reason, message, selectedTicketIds, visitDate) {
  return {
    canStart: false,
    message,
    reason,
    selectedTicketIds,
    visitDate,
  };
}

function buildSessionPlan(context, decision) {
  return {
    bookingReference: context.booking.bookingReference,
    canStartSession: decision.canStart,
    freshnessStatus: context.booking.freshnessStatus,
    reason: decision.reason,
    selectedTicketIds: decision.selectedTicketIds,
    ticketCount: decision.selectedTicketIds.length,
    visitDate: decision.visitDate,
  };
}

async function buildPhoneSessionBookingResponse(context) {
  const items = await findPhoneBookingItems(context.booking.rollerUniqueId);
  const fallbackItem = fallbackPhoneBookingItem(context);

  return {
    booking: {
      amountOwing: centsToCurrency(context.booking.amountOwingCents),
      bookingReference: context.booking.bookingReference,
      items: items.length > 0 ? items : [fallbackItem].filter(Boolean),
      paymentStatus: context.booking.paymentStatus ?? context.booking.bookingStatus,
      rollerUniqueId: context.booking.rollerUniqueId,
      status: context.booking.bookingStatus,
    },
    source: {
      environment: context.booking.rollerEnv,
      freshnessStatus: context.booking.freshnessStatus,
      lookupPath: 'checkin_link',
      refreshedFromRoller: false,
      system: 'jumpyard_cloud',
    },
  };
}

async function findPhoneBookingItems(rollerUniqueId) {
  if (!rollerUniqueId) return [];

  const result = await executeStatement(
    `SELECT
       item.booking_item_id,
       item.product_id,
       item.parent_product_id,
       item.product_name,
       item.parent_product_name,
       COALESCE(item.item_summary ->> 'productType', item.item_summary ->> 'productSubType', item.item_summary ->> 'parentType') AS product_type,
       item.quantity,
       item.booking_date::text AS booking_date,
       item.start_time::text AS start_time,
       item.end_time::text AS end_time,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'ticketId', ticket.ticket_id
           )
           ORDER BY ticket.ticket_id
         ) FILTER (WHERE ticket.ticket_id IS NOT NULL),
         '[]'::jsonb
       )::text AS tickets_json
     FROM jumpyard.roller_booking_items AS item
     LEFT JOIN jumpyard.roller_booking_tickets AS ticket
       ON ticket.roller_unique_id = item.roller_unique_id
      AND (
        ticket.booking_item_key = item.booking_item_key
        OR (ticket.booking_item_id IS NOT NULL AND ticket.booking_item_id = item.booking_item_id)
      )
     WHERE item.roller_unique_id = :rollerUniqueId
     GROUP BY
       item.booking_item_id,
       item.product_id,
       item.parent_product_id,
       item.product_name,
       item.parent_product_name,
       item.item_summary,
       item.quantity,
       item.booking_date,
       item.start_time,
       item.end_time
     ORDER BY item.booking_date NULLS LAST, item.start_time NULLS LAST, item.product_name NULLS LAST`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );

  return mappedRows(result).map((row) => ({
    bookingDate: stringOrNull(row.booking_date),
    bookingItemId: stringOrNull(row.booking_item_id),
    endTime: stringOrNull(row.end_time),
    parentProductId: numberOrNull(row.parent_product_id),
    parentProductName: stringOrNull(row.parent_product_name),
    productId: numberOrNull(row.product_id),
    productName: stringOrNull(row.product_name),
    productType: stringOrNull(row.product_type),
    quantity: numberOrNull(row.quantity),
    startTime: stringOrNull(row.start_time),
    tickets: parseJsonArray(row.tickets_json),
  }));
}

function fallbackPhoneBookingItem(context) {
  if (!context.booking.bookingDate && !context.booking.startTime && !context.booking.endTime) return null;

  return {
    bookingDate: context.booking.bookingDate,
    bookingItemId: null,
    endTime: context.booking.endTime,
    parentProductId: null,
    parentProductName: null,
    productId: null,
    productName: null,
    productType: null,
    quantity: context.tickets.length || null,
    startTime: context.booking.startTime,
    tickets: context.tickets.map((ticket) => ({ ticketId: ticket.ticketId })).filter((ticket) => ticket.ticketId),
  };
}

async function findActiveSession(rollerUniqueId, visitDate) {
  const result = await executeStatement(
    `SELECT
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at
     FROM jumpyard.checkin_sessions
     WHERE roller_unique_id = :rollerUniqueId
       AND COALESCE(visit_date, DATE '1900-01-01') = COALESCE(CAST(:visitDate AS date), DATE '1900-01-01')
       AND status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       AND expires_at > now()
     ORDER BY updated_at DESC
     LIMIT 1`,
    [stringParameter('rollerUniqueId', rollerUniqueId), stringParameter('visitDate', visitDate)],
  );

  return mapSessionRow(firstMappedRow(result));
}

async function findSessionById(checkinSessionId) {
  const result = await executeStatement(
    `SELECT
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at
     FROM jumpyard.checkin_sessions
     WHERE checkin_session_id = :checkinSessionId
     LIMIT 1`,
    [stringParameter('checkinSessionId', checkinSessionId)],
  );

  return mapSessionRow(firstMappedRow(result));
}

function mapStaffSessionSummaryRow(row) {
  if (!row) return null;

  const selectedTicketIds = parseJsonArray(row.selected_ticket_ids).map(stringOrNull).filter(Boolean);
  const guest = mapStaffGuestIdentity(row);

  return {
    booking: {
      amountOwingCents: numberOrNull(row.amount_owing_cents),
      bookingDate: stringOrNull(row.booking_date),
      bookingStatus: stringOrNull(row.booking_status),
      endTime: stringOrNull(row.end_time),
      freshnessStatus: stringOrNull(row.freshness_status),
      paymentStatus: stringOrNull(row.payment_status),
      startTime: stringOrNull(row.start_time),
      totalCents: numberOrNull(row.total_cents),
    },
    bookingReference: stringOrNull(row.booking_reference),
    checkinSessionId: stringOrNull(row.checkin_session_id),
    completedAt: stringOrNull(row.completed_at),
    counts: {
      bookingItems: numberOrNull(row.item_count) ?? 0,
      selectedTickets: selectedTicketIds.length,
      tickets: numberOrNull(row.ticket_count) ?? 0,
    },
    createdAt: stringOrNull(row.created_at),
    expiresAt: stringOrNull(row.expires_at),
    guest,
    handoffCode: stringOrNull(row.handoff_code),
    handoffStatus: stringOrNull(row.handoff_status),
    isExpired: isExpired(row.expires_at),
    readyForStaffAt: stringOrNull(row.ready_for_staff_at),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    safetyStatus: stringOrNull(row.safety_status),
    selectedTicketIds,
    status: stringOrNull(row.status),
    updatedAt: stringOrNull(row.updated_at),
    visitDate: stringOrNull(row.visit_date),
  };
}

function mapStaffGuestIdentity(row) {
  const guest = {
    emailMasked: stringOrNull(row.guest_email_masked),
    name: stringOrNull(row.guest_name),
    phoneMasked: stringOrNull(row.guest_phone_masked),
  };

  return guest.emailMasked || guest.name || guest.phoneMasked ? guest : null;
}

async function createSession({ booking, idempotencyKey, selectedTicketIds, sourceLookupRef, visitDate }) {
  const checkinSessionId = createSessionId();
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
  const sessionSummary = {
    source: 'checkin_session_api',
    ticketCount: selectedTicketIds.length,
  };

  const result = await executeStatement(
    `INSERT INTO jumpyard.checkin_sessions (
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date,
       status,
       safety_status,
       handoff_status,
       selected_ticket_ids,
       source_lookup_ref,
       idempotency_key,
       expires_at,
       session_summary
     )
     VALUES (
       :checkinSessionId,
       :rollerUniqueId,
       :bookingReference,
       CAST(:visitDate AS date),
       'guest_in_progress',
       'not_started',
       'not_ready',
       CAST(:selectedTicketIds AS jsonb),
       :sourceLookupRef,
       :idempotencyKey,
       CAST(:expiresAt AS timestamptz),
       CAST(:sessionSummary AS jsonb)
     )
     RETURNING
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at`,
    [
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('visitDate', visitDate),
      stringParameter('selectedTicketIds', JSON.stringify(selectedTicketIds)),
      stringParameter('sourceLookupRef', sourceLookupRef),
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('expiresAt', expiresAt),
      stringParameter('sessionSummary', JSON.stringify(sessionSummary)),
    ],
  );

  return mapSessionRow(firstMappedRow(result));
}

async function markSessionReadyForStaff(checkinSessionId, { handoffCode, safetyStatus }) {
  const result = await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET
       status = 'ready_for_staff',
       handoff_status = 'ready_for_staff',
       safety_status = COALESCE(:safetyStatus, safety_status),
       handoff_code = COALESCE(handoff_code, :handoffCode),
       ready_for_staff_at = COALESCE(ready_for_staff_at, now()),
       updated_at = now(),
       session_summary = session_summary || CAST(:sessionSummary AS jsonb)
     WHERE checkin_session_id = :checkinSessionId
     RETURNING
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at`,
    [
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('handoffCode', handoffCode),
      stringParameter('safetyStatus', safetyStatus),
      stringParameter(
        'sessionSummary',
        JSON.stringify({
          readyForStaffSource: 'checkin_session_api',
        }),
      ),
    ],
  );

  return mapSessionRow(firstMappedRow(result));
}

async function markSessionExpired(checkinSessionId) {
  await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET status = 'expired',
         handoff_status = 'expired',
         updated_at = now()
     WHERE checkin_session_id = :checkinSessionId`,
    [stringParameter('checkinSessionId', checkinSessionId)],
  );
}

async function generateUnusedHandoffCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `JY${crypto.randomInt(1000, 10000)}`;
    const result = await executeStatement(
      `SELECT 1 FROM jumpyard.checkin_sessions WHERE handoff_code = :handoffCode LIMIT 1`,
      [stringParameter('handoffCode', code)],
    );
    if ((result.records ?? []).length === 0) return code;
  }

  const error = new Error('Could not allocate a unique handoff code.');
  error.code = 'handoff_code_collision';
  throw error;
}

async function reserveIdempotencyKey(operation, idempotencyKey, requestHash) {
  const insertResult = await executeStatement(
    `INSERT INTO jumpyard.idempotency_records (
       idempotency_key,
       operation,
       request_hash,
       status,
       expires_at
     )
     VALUES (
       :idempotencyKey,
       :operation,
       :requestHash,
       'started',
       now() + interval '2 hours'
     )
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('operation', operation),
      stringParameter('requestHash', requestHash),
    ],
  );

  if ((insertResult.numberOfRecordsUpdated ?? 0) > 0) {
    return { ok: true, replayed: false };
  }

  const existingResult = await executeStatement(
    `SELECT operation, request_hash
     FROM jumpyard.idempotency_records
     WHERE idempotency_key = :idempotencyKey
     LIMIT 1`,
    [stringParameter('idempotencyKey', idempotencyKey)],
  );
  const existing = firstMappedRow(existingResult);

  return {
    ok: existing?.operation === operation && existing?.request_hash === requestHash,
    replayed: true,
  };
}

async function completeIdempotencyKey(idempotencyKey, status, resultRef) {
  await executeStatement(
    `UPDATE jumpyard.idempotency_records
     SET status = :status,
         result_ref = :resultRef,
         updated_at = now()
     WHERE idempotency_key = :idempotencyKey`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('status', status),
      stringParameter('resultRef', resultRef),
    ],
  );
}

async function writeEventLog({ booking, correlationId, eventType, payload, summary }) {
  const subjectRef = booking.checkinSessionId || booking.rollerUniqueId || booking.bookingReference || null;

  await executeStatement(
    `INSERT INTO jumpyard.event_log (
       event_id,
       correlation_id,
       event_type,
       subject_ref,
       summary,
       event_payload
     )
     VALUES (
       :eventId,
       :correlationId,
       :eventType,
       :subjectRef,
       :summary,
       CAST(:eventPayload AS jsonb)
     )`,
    [
      stringParameter('eventId', `evt_${hashString(`${eventType}:${correlationId}:${Date.now()}:${Math.random()}`)}`),
      stringParameter('correlationId', correlationId),
      stringParameter('eventType', eventType),
      stringParameter('subjectRef', subjectRef),
      stringParameter('summary', summary),
      stringParameter('eventPayload', JSON.stringify(payload ?? {})),
    ],
  );
}

function mapSessionRow(row) {
  if (!row) return null;

  return {
    bookingReference: stringOrNull(row.booking_reference),
    checkinSessionId: stringOrNull(row.checkin_session_id),
    completedAt: stringOrNull(row.completed_at),
    createdAt: stringOrNull(row.created_at),
    expiresAt: stringOrNull(row.expires_at),
    handoffCode: stringOrNull(row.handoff_code),
    handoffStatus: stringOrNull(row.handoff_status),
    readyForStaffAt: stringOrNull(row.ready_for_staff_at),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    safetyStatus: stringOrNull(row.safety_status),
    selectedTicketIds: parseJsonArray(row.selected_ticket_ids),
    status: stringOrNull(row.status),
    updatedAt: stringOrNull(row.updated_at),
    visitDate: stringOrNull(row.visit_date),
  };
}

function mapDueMessagingBookingRow(row) {
  const smsDestination = buildSmsDestination(row.sms_contact_number, 'guest_profile');
  const emailDestination = buildEmailDestination(row.email, 'guest_profile');

  return {
    alreadySentRecently: {
      email: Boolean(row.email_already_sent_recently),
      sms: Boolean(row.sms_already_sent_recently),
    },
    amountOwingCents: numberOrNull(row.amount_owing_cents),
    bookingDate: stringOrNull(row.booking_date),
    bookingReference: stringOrNull(row.booking_reference),
    bookingStartAt: stringOrNull(row.booking_start_at),
    bookingStatus: stringOrNull(row.booking_status),
    destinations: {
      email: emailDestination
        ? {
            ...emailDestination,
            hash: stringOrNull(row.email_hash) || emailDestination.hash,
            masked: stringOrNull(row.email_masked) || emailDestination.masked,
          }
        : null,
      sms: smsDestination
        ? {
            ...smsDestination,
            hash: stringOrNull(row.sms_contact_number_hash) || smsDestination.hash,
            masked: stringOrNull(row.sms_contact_number_masked) || smsDestination.masked,
          }
        : null,
    },
    paymentStatus: stringOrNull(row.payment_status),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    startTime: stringOrNull(row.start_time),
  };
}

function mapDueMessageSendResponse(channel, candidate, sendResponse, plannedItem) {
  const body = parseJsonObject(sendResponse?.body);
  const success = Number(sendResponse?.statusCode) >= 200 && Number(sendResponse?.statusCode) < 300;
  const delivery = body[channel] ?? {};

  if (!success) {
    return {
      ...plannedItem,
      action: Number(sendResponse?.statusCode) === 409 ? 'skipped' : 'failed',
      errorCode: stringOrNull(body.error?.code) || 'sms_send_failed',
      reason: stringOrNull(body.error?.code) || 'sms_send_failed',
    };
  }

  return {
    action: body.status === `${channel}_sent` ? 'sent' : 'planned',
    bookingDate: candidate.bookingDate,
    bookingReference: candidate.bookingReference,
    bookingStartAt: candidate.bookingStartAt,
    channel,
    deliveryId: stringOrNull(delivery.deliveryId),
    destinationMasked: stringOrNull(delivery.destinationMasked) || candidate.destinations[channel]?.masked || null,
    fromAddressConfigured: delivery.fromAddressConfigured === true ? true : undefined,
    provider: stringOrNull(delivery.provider),
    providerMessageIdPresent: Boolean(delivery.providerMessageId),
    reason: body.status === `${channel}_sent` ? 'sent' : 'planned',
    replyToConfigured: delivery.replyToConfigured === true ? true : undefined,
    rollerUniqueId: candidate.rollerUniqueId,
    senderIdConfigured: delivery.senderIdConfigured === true ? true : undefined,
    senderIdRequested: delivery.senderIdRequested === true ? true : undefined,
    startTime: candidate.startTime,
  };
}

function summarizeDueMessageItems(items) {
  const summary = items.reduce(
    (summary, item) => {
      summary.total += 1;
      if (item.action === 'planned' || item.action === 'send_ready') summary.planned += 1;
      if (item.action === 'sent') summary.sent += 1;
      if (item.action === 'skipped') summary.skipped += 1;
      if (item.action === 'failed') summary.failed += 1;
      if (summary.byChannel[item.channel]) {
        summary.byChannel[item.channel].total += 1;
        if (item.action === 'planned' || item.action === 'send_ready') summary.byChannel[item.channel].planned += 1;
        if (item.action === 'sent') summary.byChannel[item.channel].sent += 1;
        if (item.action === 'skipped') summary.byChannel[item.channel].skipped += 1;
        if (item.action === 'failed') summary.byChannel[item.channel].failed += 1;
      }
      return summary;
    },
    {
      byChannel: {
        email: { failed: 0, planned: 0, sent: 0, skipped: 0, total: 0 },
        sms: { failed: 0, planned: 0, sent: 0, skipped: 0, total: 0 },
      },
      failed: 0,
      planned: 0,
      sent: 0,
      skipped: 0,
      total: 0,
    },
  );

  return summary;
}

function createDueSmsIdempotencyKey(window, candidate) {
  return createDueMessageIdempotencyKey(window, candidate, 'sms');
}

function createDueMessageIdempotencyKey(window, candidate, channel) {
  const destination = candidate.destinations?.[channel] ?? candidate.destination ?? null;
  const seed = [
    `booking-time-${channel}`,
    window.start.toISOString(),
    window.end.toISOString(),
    candidate.bookingReference,
    destination?.hash?.slice(0, 16) || 'no-destination',
  ].join(':');

  return `booking-time-${channel}:${hashString(seed).slice(0, 48)}`;
}

function isScheduledDueSessionLinkMessagingEvent(event) {
  const trigger = stringOrNull(event?.detail?.trigger);
  return (
    ['jumpyard.booking-time-sms-scheduler', 'jumpyard.booking-time-messaging-scheduler'].includes(
      stringOrNull(event?.source),
    ) && ['scheduled_booking_time_sms', 'scheduled_booking_time_messaging'].includes(trigger)
  );
}

function normalizeScheduledDueSessionLinkMessagingBody(event) {
  const detail = event?.detail ?? {};

  return {
    baseUrl: stringOrNull(detail.baseUrl) || DEFAULT_SMS_BASE_URL,
    channels: detail.channels,
    confirmedSendApproval: stringOrNull(detail.confirmedSendApproval),
    confirmSend: booleanFromValue(detail.confirmSend),
    correlationId: stringOrNull(event?.id) ? `eventbridge:${event.id}` : null,
    emailBaseUrl: stringOrNull(detail.emailBaseUrl) || DEFAULT_EMAIL_BASE_URL,
    leadMinutes: detail.leadMinutes,
    limit: detail.limit,
    now: stringOrNull(detail.now),
    smsBaseUrl: stringOrNull(detail.smsBaseUrl) || DEFAULT_SMS_BASE_URL,
    ttlMinutes: detail.ttlMinutes,
    windowEndAt: stringOrNull(detail.windowEndAt),
    windowMinutes: detail.windowMinutes,
    windowStartAt: stringOrNull(detail.windowStartAt),
  };
}

function parseBody(event) {
  if (!event || !event.body) return {};

  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'invalid_json';
    throw error;
  }
}

function isStartSessionRoute(routeKey, event) {
  return routeKey === 'POST /v1/check-in/sessions' || event?.rawPath === '/v1/check-in/sessions';
}

function isStaffAuthLoginRoute(routeKey, event) {
  return routeKey === 'POST /v1/staff/auth/login' || event?.rawPath === '/v1/staff/auth/login';
}

function isStaffSessionListRoute(routeKey, event) {
  return (
    routeKey === 'GET /v1/staff/check-in/sessions' ||
    (event?.requestContext?.http?.method === 'GET' && event?.rawPath === '/v1/staff/check-in/sessions')
  );
}

function isStaffSessionDetailRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'GET /v1/staff/check-in/sessions/{checkinSessionId}' ||
    (event?.requestContext?.http?.method === 'GET' && /^\/v1\/staff\/check-in\/sessions\/[^/]+$/.test(rawPath))
  );
}

function isReadyForStaffRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff' ||
    /^\/v1\/check-in\/sessions\/[^/]+\/ready-for-staff$/.test(rawPath)
  );
}

function isCreateSessionLinkRoute(routeKey, event) {
  return routeKey === 'POST /v1/check-in/session-links' || event?.rawPath === '/v1/check-in/session-links';
}

function isSendSessionLinkSmsRoute(routeKey, event) {
  return (
    routeKey === 'POST /v1/check-in/session-links/send-sms' ||
    event?.rawPath === '/v1/check-in/session-links/send-sms'
  );
}

function isSendSessionLinkEmailRoute(routeKey, event) {
  return (
    routeKey === 'POST /v1/check-in/session-links/send-email' ||
    event?.rawPath === '/v1/check-in/session-links/send-email'
  );
}

function isSendDueSessionLinkSmsRoute(routeKey, event) {
  return (
    routeKey === 'POST /v1/check-in/session-links/send-due-sms' ||
    event?.rawPath === '/v1/check-in/session-links/send-due-sms'
  );
}

function isSendDueSessionLinkMessagesRoute(routeKey, event) {
  return (
    routeKey === 'POST /v1/check-in/session-links/send-due-messages' ||
    event?.rawPath === '/v1/check-in/session-links/send-due-messages'
  );
}

function isResolveSessionLinkRoute(routeKey, event) {
  return (
    routeKey === 'POST /v1/check-in/session-links/resolve' ||
    event?.rawPath === '/v1/check-in/session-links/resolve'
  );
}

function extractSessionIdFromPath(rawPath) {
  const match = String(rawPath ?? '').match(/^\/v1\/check-in\/sessions\/([^/]+)\/ready-for-staff$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractStaffSessionIdFromPath(rawPath) {
  const match = String(rawPath ?? '').match(/^\/v1\/staff\/check-in\/sessions\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isInactiveBookingStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'deleted' || normalized === 'draft';
}

function isPaymentComplete(booking) {
  if (booking.amountOwingCents !== null && booking.amountOwingCents > 0) return false;

  const status = `${booking.paymentStatus ?? ''} ${booking.bookingStatus ?? ''}`.toLowerCase();
  if (status.includes('pending') || status.includes('draft')) return false;
  if (status.includes('paid') || status.includes('nopaymentrequired')) return true;

  return booking.amountOwingCents === 0;
}

function bookingMatchesExpectedDate(booking, tickets, expectedDate) {
  if (booking.bookingDate === expectedDate) return true;
  return tickets.some((ticket) => ticket.bookingDate === expectedDate);
}

function isUsedRedeemStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  if (!normalized || normalized.includes('unredeemed')) return false;
  return normalized.includes('redeemed') || normalized.includes('used') || normalized.includes('exhausted');
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= Date.now();
}

function normalizeSafetyStatus(value) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;

  const allowed = new Set(['not_started', 'in_progress', 'completed', 'requires_staff', 'skipped']);
  return allowed.has(normalized) ? normalized : 'requires_staff';
}

function normalizeSessionLinkChannel(value) {
  return stringOrNull(value)?.toLowerCase() || 'sms';
}

function normalizeDueMessageChannels(value) {
  const rawValues = Array.isArray(value)
    ? value
    : stringOrNull(value)
      ? stringOrNull(value)
          .split(',')
          .map((entry) => entry.trim())
      : ['sms', 'email'];

  return [...new Set(rawValues.map((entry) => stringOrNull(entry)?.toLowerCase()).filter(Boolean))];
}

function normalizeTtlMinutes(ttlMinutesValue, ttlHoursValue) {
  const ttlMinutes = numberOrNull(ttlMinutesValue);
  const ttlHours = numberOrNull(ttlHoursValue);
  const rawMinutes = ttlMinutes ?? (ttlHours === null ? null : ttlHours * 60);

  if (rawMinutes === null) return DEFAULT_CHECKIN_LINK_TTL_MINUTES;
  return Math.min(Math.max(Math.floor(rawMinutes), 5), MAX_CHECKIN_LINK_TTL_MINUTES);
}

function buildDueSmsWindow(request) {
  if (request.windowStartAt || request.windowEndAt) {
    if (!request.windowStartAt || !request.windowEndAt) {
      return {
        error: {
          code: 'window_bounds_required',
          message: 'windowStartAt and windowEndAt must be supplied together.',
        },
      };
    }

    const start = parseDateValue(request.windowStartAt);
    const end = parseDateValue(request.windowEndAt);
    if (!start || !end || end.getTime() <= start.getTime()) {
      return {
        error: {
          code: 'window_bounds_invalid',
          message: 'windowStartAt and windowEndAt must be valid ISO datetimes and end after start.',
        },
      };
    }

    if (end.getTime() - start.getTime() > MAX_SMS_TRIGGER_WINDOW_MINUTES * 60 * 1000) {
      return {
        error: {
          code: 'window_too_large',
          message: `Booking-time SMS windows are capped at ${MAX_SMS_TRIGGER_WINDOW_MINUTES} minutes.`,
        },
      };
    }

    return { end, start };
  }

  const now = request.now ? parseDateValue(request.now) : new Date();
  if (!now) {
    return {
      error: {
        code: 'now_invalid',
        message: 'now must be a valid ISO datetime when supplied.',
      },
    };
  }

  const start = new Date(now.getTime() + request.leadMinutes * 60 * 1000);
  const end = new Date(start.getTime() + request.windowMinutes * 60 * 1000);
  return { end, start };
}

function buildDueSmsTriggerSummary(request, window, blocked) {
  return {
    baseUrlConfigured: Boolean(request.baseUrl),
    channels: request.channels,
    confirmSend: request.confirmSend,
    confirmedScheduledSend: request.confirmedSendApproval === SCHEDULED_SMS_CONFIRMED_SEND_APPROVAL,
    dryRun: blocked || !request.confirmSend,
    emailBaseUrlConfigured: Boolean(request.emailBaseUrl),
    leadMinutes: request.leadMinutes,
    limit: request.limit,
    smsBaseUrlConfigured: Boolean(request.smsBaseUrl),
    timezone: SMS_TRIGGER_TIME_ZONE,
    windowEndAt: window.end.toISOString(),
    windowMinutes: request.windowMinutes,
    windowStartAt: window.start.toISOString(),
  };
}

function isSafeCheckinBaseUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isPublicHttpsCheckinBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const privateIpv4 =
      /^10\./.test(hostname) ||
      /^127\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname);

    return (
      parsed.protocol === 'https:' &&
      hostname !== 'localhost' &&
      hostname !== '::1' &&
      hostname !== '[::1]' &&
      !hostname.endsWith('.local') &&
      !privateIpv4
    );
  } catch {
    return false;
  }
}

function buildCheckinUrl(baseUrl, token) {
  if (!baseUrl) return null;

  const parsed = new URL(baseUrl);
  parsed.searchParams.set('jy_token', token);
  return parsed.toString();
}

function buildCheckinSmsMessage({ booking, checkinUrl }) {
  const timeText = buildSmsBookingTimeText(booking);
  const intro = timeText ? `Din hopptid ${timeText} narmar sig.` : 'Din incheckning ar redo.';
  return `JumpYard: ${intro} Checka in: ${checkinUrl}`;
}

function buildSmsBookingTimeText(booking) {
  const startTime = stringOrNull(booking?.startTime);
  if (!startTime) return null;

  const time = startTime.length >= 5 ? startTime.slice(0, 5) : startTime;
  return time ? `kl ${time}` : null;
}

function buildCheckinEmailMessage({ booking, checkinUrl }) {
  const bookingReference = booking.bookingReference || '';
  const safeBookingReference = escapeHtml(bookingReference);
  const safeCheckinUrl = escapeHtml(checkinUrl);
  const timeText = buildSmsBookingTimeText(booking);
  const intro = timeText ? `Din hopptid ${timeText} narmar sig.` : 'Din hopptid hos JumpYard narmar sig.';
  const subject = timeText ? `Dags att checka in ${timeText}` : 'Dags att checka in hos JumpYard';
  const text = [
    'Hej!',
    '',
    intro,
    `Checka in har: ${checkinUrl}`,
    '',
    bookingReference ? `Bokning: ${bookingReference}` : null,
    '',
    'Vi ses snart.',
    'JumpYard',
  ]
    .filter((line) => line !== null)
    .join('\n');
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 24px 8px 24px;">
                <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e7193f;">JumpYard</p>
                <h1 style="margin:0;font-size:28px;line-height:1.1;font-weight:900;font-style:italic;color:#111827;">Dags att checka in</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 4px 24px;">
                <p style="margin:0;font-size:16px;line-height:1.55;color:#374151;">${escapeHtml(intro)} Checka in innan du kommer fram sa gar handoffen snabbare i parken.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;">
                <a href="${safeCheckinUrl}" style="display:block;background:#ed1745;color:#ffffff;text-decoration:none;text-align:center;border-radius:14px;padding:16px 20px;font-size:18px;font-weight:900;font-style:italic;">CHECKA IN</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 26px 24px;">
                <p style="margin:0;font-size:13px;line-height:1.45;color:#6b7280;">${safeBookingReference ? `Bokning: ${safeBookingReference}. ` : ''}Lanken ar personlig och ska inte delas vidare.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, subject, text };
}

function buildCheckinEmailPreview(booking) {
  const message = buildCheckinEmailMessage({
    booking,
    checkinUrl: '[check-in-link]',
  });

  return {
    html: message.html,
    subject: message.subject,
    text: message.text,
  };
}

function buildSmsDestination(value, source) {
  const phoneNumber = normalizePhoneForSms(value);
  if (!phoneNumber) return null;

  return {
    hash: hashString(phoneNumber),
    masked: maskPhoneNumber(phoneNumber),
    phoneNumber,
    source,
  };
}

function buildEmailDestination(value, source) {
  const email = normalizeEmailAddress(value);
  if (!email) return null;

  return {
    email,
    hash: hashString(email),
    masked: maskEmailAddress(email),
    source,
  };
}

function normalizePhoneForSms(value) {
  const raw = stringOrNull(value);
  if (!raw) return null;

  let normalized = raw.replace(/[\s().-]/g, '');
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  if (normalized.startsWith('07')) normalized = `+46${normalized.slice(1)}`;

  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function normalizeEmailAddress(value) {
  const raw = stringOrNull(value);
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  if (normalized.length > 254) return null;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function maskPhoneNumber(phoneNumber) {
  const value = String(phoneNumber);
  if (value.length <= 7) return '***';
  return `${value.slice(0, 3)}*****${value.slice(-4)}`;
}

function maskEmailAddress(email) {
  const [localPart, domainPart] = String(email).split('@');
  if (!localPart || !domainPart) return '***';
  const domainSections = domainPart.split('.');
  const domainName = domainSections.shift() || '';
  const suffix = domainSections.length > 0 ? `.${domainSections.join('.')}` : '';
  return `${localPart.slice(0, 1)}***@${domainName.slice(0, 1)}***${suffix}`;
}

function parseEmailAddressList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => normalizeEmailAddress(item))
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function booleanFromValue(value) {
  if (value === true) return true;
  if (value === false) return false;
  return ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());
}

function createSmsDeliveryId() {
  return `jysms_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function createEmailDeliveryId() {
  return `jyem_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function safeSmsProviderError(error, phoneNumber) {
  const code = stringOrNull(error?.code) || stringOrNull(error?.name) || 'sms_provider_error';
  const rawMessage = stringOrNull(error?.message) || 'SMS provider request failed.';
  const message = rawMessage.replaceAll(String(phoneNumber), '[redacted_phone]').slice(0, 240);

  return { code, message };
}

function safeEmailProviderError(error, email) {
  const code = stringOrNull(error?.code) || stringOrNull(error?.name) || 'email_provider_error';
  const rawMessage = stringOrNull(error?.message) || 'Email provider request failed.';
  const message = rawMessage.replaceAll(String(email), '[redacted_email]').slice(0, 240);

  return { code, message };
}

async function verifyCheckinLinkDevToken(event) {
  const providedToken = getCheckinLinkAuthToken(event);

  if (!providedToken) {
    return { ok: false, code: 'checkin_link_token_required' };
  }

  const expectedToken = await getCheckinLinkDevToken();
  if (!safeEquals(providedToken, expectedToken)) {
    return { ok: false, code: 'checkin_link_token_invalid' };
  }

  return { ok: true, code: 'authorized' };
}

function getCheckinLinkAuthToken(event) {
  for (const headerName of CHECKIN_LINK_DEV_TOKEN_HEADERS) {
    const value = getHeader(event, headerName);
    if (!value) continue;

    const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
    return bearerMatch ? bearerMatch[1].trim() : value;
  }

  return null;
}

async function getCheckinLinkDevToken() {
  if (process.env.CHECKIN_LINK_DEV_TOKEN) {
    return process.env.CHECKIN_LINK_DEV_TOKEN;
  }

  if (cachedCheckinLinkDevToken) return cachedCheckinLinkDevToken;

  const secretId = process.env.CHECKIN_LINK_DEV_TOKEN_SECRET_ARN;
  if (!secretId) {
    const error = new Error('Check-in link dev token secret is not configured.');
    error.code = 'checkin_link_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Check-in link dev token secret has no string value.');
    error.code = 'checkin_link_config_error';
    throw error;
  }

  try {
    const parsed = JSON.parse(secretString);
    cachedCheckinLinkDevToken = String(parsed.token ?? parsed.checkinLinkToken ?? '').trim();
  } catch {
    cachedCheckinLinkDevToken = secretString.trim();
  }

  if (!cachedCheckinLinkDevToken) {
    const error = new Error('Check-in link dev token is empty.');
    error.code = 'checkin_link_config_error';
    throw error;
  }

  return cachedCheckinLinkDevToken;
}

async function getStaffAuthConfig() {
  const now = Date.now();
  if (cachedStaffAuthConfig && cachedStaffAuthConfigExpiresAt > now) return cachedStaffAuthConfig;

  const secretId = process.env.STAFF_AUTH_SECRET_ARN;
  if (!secretId) {
    const error = new Error('Staff auth secret is not configured.');
    error.code = 'staff_auth_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Staff auth secret has no string value.');
    error.code = 'staff_auth_config_error';
    throw error;
  }

  let parsed = {};
  try {
    parsed = JSON.parse(secretString);
  } catch {
    parsed = { passcode: secretString };
  }

  const passcode = stringOrNull(parsed.passcode) || stringOrNull(parsed.staffPasscode) || stringOrNull(parsed.token);
  if (!passcode) {
    const error = new Error('Staff auth passcode is empty.');
    error.code = 'staff_auth_config_error';
    throw error;
  }

  cachedStaffAuthConfig = {
    displayName: stringOrNull(parsed.displayName) || 'JumpYard Staff',
    passcode,
    signingSecret: stringOrNull(parsed.signingSecret) || passcode,
    tokenTtlMinutes: clampInteger(parsed.tokenTtlMinutes, 5, 24 * 60, DEFAULT_STAFF_AUTH_TTL_MINUTES),
  };
  cachedStaffAuthConfigExpiresAt = now + STAFF_AUTH_CONFIG_CACHE_MS;

  return cachedStaffAuthConfig;
}

function createStaffAuthToken(config) {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + config.tokenTtlMinutes * 60;
  const payload = {
    displayName: config.displayName,
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    scope: 'staff',
    sub: 'jumpyard-staff',
    v: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signStaffAuthPayload(encodedPayload, config.signingSecret);

  return {
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    token: `${encodedPayload}.${signature}`,
  };
}

async function verifyStaffAuthToken(event) {
  const token = getStaffAuthToken(event);
  if (!token) {
    return { ok: false, code: 'staff_auth_token_required' };
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return { ok: false, code: 'staff_auth_token_invalid' };
  }

  const config = await getStaffAuthConfig();
  const expectedSignature = signStaffAuthPayload(encodedPayload, config.signingSecret);
  if (!safeEquals(providedSignature, expectedSignature)) {
    return { ok: false, code: 'staff_auth_token_invalid' };
  }

  const payload = parseJsonObject(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  if (payload.scope !== 'staff' || payload.sub !== 'jumpyard-staff') {
    return { ok: false, code: 'staff_auth_token_invalid' };
  }

  if (numberOrNull(payload.exp) === null || numberOrNull(payload.exp) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, code: 'staff_auth_token_expired' };
  }

  return {
    ok: true,
    code: 'authorized',
    staff: {
      displayName: stringOrNull(payload.displayName) || config.displayName,
    },
  };
}

function getStaffAuthToken(event) {
  for (const headerName of STAFF_AUTH_HEADERS) {
    const value = getHeader(event, headerName);
    if (!value) continue;

    const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
    return bearerMatch ? bearerMatch[1].trim() : value;
  }

  return null;
}

function signStaffAuthPayload(encodedPayload, signingSecret) {
  return crypto.createHmac('sha256', signingSecret).update(encodedPayload).digest('base64url');
}

function staffAuthErrorResponse(correlationId, auth) {
  return jsonResponse(auth.code === 'staff_auth_token_expired' ? 401 : 403, correlationId, {
    status: 'forbidden',
    error: {
      code: auth.code,
      message:
        auth.code === 'staff_auth_token_expired'
          ? 'Staff authentication has expired.'
          : 'Staff authentication is required.',
    },
  });
}

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function executeStatement(sql, parameters = []) {
  const resourceArn = process.env.DATABASE_CLUSTER_ARN;
  const secretArn = process.env.DATABASE_SECRET_ARN;

  if (!resourceArn || !secretArn) {
    const error = new Error('Database environment is not configured.');
    error.code = 'database_config_error';
    throw error;
  }

  return rdsClient.send(
    new ExecuteStatementCommand({
      database: DATABASE_NAME,
      includeResultMetadata: true,
      parameters,
      resourceArn,
      secretArn,
      sql,
    }),
  );
}

function mappedRows(result) {
  const columns = (result.columnMetadata ?? []).map((column) => column.name);
  return (result.records ?? []).map((record) => {
    const row = {};
    for (let index = 0; index < record.length; index += 1) {
      row[columns[index] ?? String(index)] = fieldToJsValue(record[index]);
    }
    return row;
  });
}

function firstMappedRow(result) {
  return mappedRows(result)[0] ?? null;
}

function fieldToJsValue(field) {
  if (!field || field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return Number(field.longValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  if (field.booleanValue !== undefined) return Boolean(field.booleanValue);
  if (field.blobValue !== undefined) return field.blobValue;
  if (field.arrayValue !== undefined) return field.arrayValue;
  return null;
}

function getHeader(event, name) {
  const headers = event?.headers ?? {};
  const target = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return null;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim() || null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInteger(value, min, max, fallback) {
  const parsed = numberOrNull(value);
  if (parsed === null) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseDateValue(value) {
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function centsToCurrency(value) {
  const cents = numberOrNull(value);
  return cents === null ? null : Number((cents / 100).toFixed(2));
}

function stringParameter(name, value) {
  return value === null || value === undefined
    ? { name, value: { isNull: true } }
    : { name, value: { stringValue: String(value) } };
}

function booleanParameter(name, value) {
  return { name, value: { booleanValue: Boolean(value) } };
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function createSessionId() {
  return `jycs_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function hashJson(value) {
  return hashString(JSON.stringify(value));
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function classifyError(error) {
  if (error.code === 'invalid_json') {
    return {
      statusCode: 400,
      status: 'invalid_request',
      code: 'invalid_json',
      message: error.message,
    };
  }

  if (error.code === 'database_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'database_config_error',
      message: 'JumpYard Cloud session database configuration is incomplete.',
    };
  }

  if (error.code === 'handoff_code_collision') {
    return {
      statusCode: 500,
      status: 'internal_error',
      code: 'handoff_code_collision',
      message: 'JumpYard Cloud could not allocate a handoff code.',
    };
  }

  if (error.code === 'checkin_link_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'checkin_link_config_error',
      message: 'JumpYard Cloud check-in link token configuration is incomplete.',
    };
  }

  if (error.code === 'checkin_link_token_collision') {
    return {
      statusCode: 500,
      status: 'internal_error',
      code: 'checkin_link_token_collision',
      message: 'JumpYard Cloud could not allocate a check-in link token.',
    };
  }

  if (error.code === 'staff_auth_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'staff_auth_config_error',
      message: 'JumpYard Cloud staff authentication configuration is incomplete.',
    };
  }

  return {
    statusCode: 500,
    status: 'internal_error',
    code: 'session_failed',
    message: 'JumpYard Cloud check-in session operation failed.',
  };
}

function jsonResponse(statusCode, correlationId, payload) {
  return {
    statusCode,
    headers: {
      'access-control-allow-origin': '*',
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({
      correlationId,
      ...payload,
    }),
  };
}
