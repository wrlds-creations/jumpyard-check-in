const crypto = require('crypto');
const { withGuestItemDetails } = require('./package-contents');

const KIOSK_PAYMENT_CURRENCY = 'SEK';
const KIOSK_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const KIOSK_INSTALLATION_ID_PATTERN = /^ki_[a-f0-9]{24}$/;
const KIOSK_PROFILE_IDS = new Set(['nacka-forum-kiosk-1', 'nacka-forum-kiosk-2']);
const KIOSK_TERMINAL_LOCK_ID_PATTERN = /^kt_[a-f0-9]{32}$/;
// GH-481 (D0238): the provider transaction id (Adyen PSP reference) of an approved terminal payment.
const KIOSK_TERMINAL_TRANSACTION_REF_PATTERN = /^[A-Za-z0-9]{8,64}$/;
// GH-481: the Adyen merchant account (PaymentAcquirerData.MerchantID) of the same approval, which
// ROLLER needs to link the published payment to its gateway transaction for refunds.
const KIOSK_TERMINAL_MERCHANT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;
const KIOSK_TERMINAL_PAYMENT_TYPE = 'CreditCard';
// GH-488 (D0243): server-owned kiosk names (Nacka K1 → Nacka T1 …) that a kiosk installation
// claims after an allowlisted staff PIN proof. Names and display labels are not secret; the
// terminal identifiers behind their aliases stay in the provider secret.
const KIOSK_NAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
const KIOSK_NAME_KINDS = new Set(['operational', 'test']);
const KIOSK_DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,31}$/u;
const KIOSK_STAFF_IDENTITY_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const KIOSK_WRAPPER_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const KIOSK_WEB_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SUPPORTED_KIOSK_VENUE_ID = '50871';
// GH-483 (D0239): "No payment" waits until the terminal has timed out (about 135 s) and ROLLER
// has had time to turn a late payment notification into a booking (up to about 75 s).
const KIOSK_STAFF_NO_PAYMENT_MIN_AGE_SECONDS = 5 * 60;
const KIOSK_STAFF_RESOLUTION_ACTIONS = new Set(['inspect', 'no_payment', 'paid']);

function normalizePaymentTerminalMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([alias, terminal]) => [String(alias).trim(), normalizePaymentTerminal(terminal)])
      .filter(([alias, terminal]) => alias && terminal),
  );
}

function normalizePaymentTerminal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const deviceId = stringOrNull(value.deviceId);
  const terminalId = stringOrNull(value.terminalId);
  if (!terminalId) return null;
  if (value.lockId !== undefined && !KIOSK_TERMINAL_LOCK_ID_PATTERN.test(value.lockId)) return null;
  return {
    ...(deviceId ? { deviceId } : {}),
    terminalId,
    promptForTip: false,
    ...(KIOSK_TERMINAL_LOCK_ID_PATTERN.test(value.lockId) ? { lockId: value.lockId } : {}),
  };
}

function normalizeKioskInstallationMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([installationId, installation]) => [
        String(installationId).trim(),
        normalizeKioskInstallation(installation),
      ])
      .filter(([installationId, installation]) => (
        KIOSK_INSTALLATION_ID_PATTERN.test(installationId) && installation
      )),
  );
}

function normalizeKioskInstallation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const venueId = stringOrNull(value.venueId);
  const allowedProfileIds = Array.isArray(value.allowedProfileIds)
    ? [...new Set(value.allowedProfileIds.map(stringOrNull).filter((item) => KIOSK_PROFILE_IDS.has(item)))]
    : [];
  if (!venueId || allowedProfileIds.length === 0) return null;
  return {
    active: value.active === true,
    allowedProfileIds,
    venueId,
  };
}

function normalizeKioskProfileMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([profileId, profile]) => [String(profileId).trim(), normalizeKioskProfile(profile)])
      .filter(([profileId, profile]) => KIOSK_PROFILE_IDS.has(profileId) && profile),
  );
}

function normalizeKioskProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const paymentTerminalAlias = stringOrNull(value.paymentTerminalAlias);
  const venueId = stringOrNull(value.venueId);
  if (!paymentTerminalAlias || !venueId) return null;
  return {
    active: value.active === true,
    paymentTerminalAlias,
    venueId,
  };
}

// Display labels per terminal alias, kept apart from the mapping so they never reach ROLLER.
function normalizePaymentTerminalNameMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([alias, terminal]) => [String(alias).trim(), displayNameOrNull(terminal?.displayName)])
      .filter(([alias, displayName]) => alias && displayName),
  );
}

function normalizeKioskNameMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([kioskNameId, kioskName]) => [String(kioskNameId).trim(), normalizeKioskName(kioskName)])
      .filter(([kioskNameId, kioskName]) => KIOSK_NAME_ID_PATTERN.test(kioskNameId) && kioskName),
  );
}

function normalizeKioskName(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const displayName = displayNameOrNull(value.displayName);
  const kind = stringOrNull(value.kind);
  const paymentTerminalAlias = stringOrNull(value.paymentTerminalAlias);
  const venueId = stringOrNull(value.venueId);
  if (!displayName || !KIOSK_NAME_KINDS.has(kind) || !paymentTerminalAlias || !venueId) return null;
  return { active: value.active === true, displayName, kind, paymentTerminalAlias, venueId };
}

function normalizeKioskPairingStaffIdentityIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stringOrNull).filter((id) => id && KIOSK_STAFF_IDENTITY_ID_PATTERN.test(id)))];
}

function displayNameOrNull(value) {
  const displayName = stringOrNull(value);
  return displayName && KIOSK_DISPLAY_NAME_PATTERN.test(displayName) ? displayName : null;
}

// The kiosk names one venue offers, in label order. A name is offered only while it is active and
// its terminal alias resolves to a mapping with a valid lock, so a kiosk can never be paired to a
// terminal that cannot take a payment.
function kioskNameDirectory(config) {
  const venueId = config.kioskVenueId;
  if (venueId !== SUPPORTED_KIOSK_VENUE_ID) return [];
  return Object.entries(config.kioskNames ?? {})
    .filter(([, kioskName]) => kioskName.active && kioskName.venueId === venueId)
    .filter(([, kioskName]) => {
      const mapping = config.paymentTerminals?.[kioskName.paymentTerminalAlias];
      return Boolean(mapping && validTerminalLock(config.paymentTerminals, mapping));
    })
    .map(([id, kioskName]) => ({
      id,
      kind: kioskName.kind,
      name: kioskName.displayName,
      terminalName: config.paymentTerminalNames?.[kioskName.paymentTerminalAlias] ?? null,
    }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'operational' ? -1 : 1) ||
      a.name.localeCompare(b.name, 'sv', { numeric: true }));
}

function kioskTerminalLockId(config, kioskNameId) {
  const kioskName = config.kioskNames?.[kioskNameId];
  const mapping = kioskName ? config.paymentTerminals?.[kioskName.paymentTerminalAlias] : null;
  return mapping && validTerminalLock(config.paymentTerminals, mapping) ? mapping.lockId : null;
}

function isKioskPairingStaffAllowed(config, staffIdentityId) {
  const id = stringOrNull(staffIdentityId);
  return Boolean(id && (config.kioskPairingStaffIdentityIds ?? []).includes(id));
}

// The installation proof both routes accept: the opaque id and the capability it was derived from.
function verifiedKioskInstallationProof(installationIdValue, capabilityValue) {
  const installationId = stringOrNull(installationIdValue);
  const capability = stringOrNull(capabilityValue);
  if (!installationId || !capability) return null;
  return kioskCapabilityMatchesInstallationId(capability, installationId) ? { capability, installationId } : null;
}

function normalizeKioskClientVersions(value) {
  const wrapperVersion = stringOrNull(value?.wrapperVersion);
  const webVersion = stringOrNull(value?.webVersion);
  return {
    webVersion: webVersion && KIOSK_WEB_VERSION_PATTERN.test(webVersion) ? webVersion : null,
    wrapperVersion: wrapperVersion && KIOSK_WRAPPER_VERSION_PATTERN.test(wrapperVersion) ? wrapperVersion : null,
  };
}

function normalizeKioskPairingDetail(detail) {
  const proof = verifiedKioskInstallationProof(detail?.kioskInstallationId, detail?.kioskCapability);
  const kioskNameId = stringOrNull(detail?.kioskNameId);
  const staffIdentityId = stringOrNull(detail?.staffIdentityId);
  if (
    !proof ||
    !kioskNameId || !KIOSK_NAME_ID_PATTERN.test(kioskNameId) ||
    !staffIdentityId || !KIOSK_STAFF_IDENTITY_ID_PATTERN.test(staffIdentityId) ||
    (detail?.replace !== undefined && typeof detail.replace !== 'boolean')
  ) {
    return null;
  }
  return {
    ...proof,
    ...normalizeKioskClientVersions(detail),
    kioskNameId,
    replace: detail.replace === true,
    staffIdentityId,
  };
}

// Status for one installation: its own pairing, the venue's names with taken/free state, and
// whether the installation still has a pre-GH-488 profile authorization. Never returns ids of
// other installations, terminal identifiers or staff identities.
function buildKioskStatus(config, installationId, activeRows) {
  const directory = kioskNameDirectory(config);
  const own = (activeRows ?? []).find((row) => row.installationId === installationId) ?? null;
  const ownName = own ? directory.find((entry) => entry.id === own.kioskNameId) ?? null : null;
  return {
    kiosk: ownName
      ? { id: ownName.id, kind: ownName.kind, name: ownName.name, paired: true, terminalName: ownName.terminalName }
      : { legacy: config.kioskInstallations?.[installationId]?.active === true, paired: false },
    names: directory.map((entry) => ({
      ...entry,
      mine: Boolean(ownName && ownName.id === entry.id),
      taken: (activeRows ?? []).some((row) => row.kioskNameId === entry.id && row.installationId !== installationId),
    })),
  };
}

function resolveKioskPaymentTerminal(config, request, pairing = null) {
  if (request.channel !== 'kiosk') return { enabled: false, paymentTerminal: null };

  const installationId = stringOrNull(request.kioskInstallationId);
  const profileId = stringOrNull(request.kioskProfileId);
  const capability = stringOrNull(request.kioskCapability);
  const usesInstallationIdentity = Boolean(installationId || profileId || capability);

  if (usesInstallationIdentity && pairing) return resolvePairedKioskTerminal(config, request, pairing);
  if (usesInstallationIdentity && !profileId) return kioskInstallationNotPaired();

  if (usesInstallationIdentity) {
    const installation = installationId ? config.kioskInstallations?.[installationId] : null;
    const profile = profileId ? config.kioskProfiles?.[profileId] : null;
    const authorized = Boolean(
      installationId && KIOSK_INSTALLATION_ID_PATTERN.test(installationId) &&
      profileId && KIOSK_PROFILE_IDS.has(profileId) &&
      capability && KIOSK_CAPABILITY_PATTERN.test(capability) &&
      !request.paymentTerminalAlias &&
      installation?.active &&
      profile?.active &&
      installation.allowedProfileIds.includes(profileId) &&
      installation.venueId === profile.venueId &&
      config.kioskVenueId === '50871' && profile.venueId === config.kioskVenueId &&
      (!request.venueId || request.venueId === profile.venueId) &&
      kioskCapabilityMatchesInstallationId(capability, installationId)
    );

    if (!authorized) return kioskInstallationNotAuthorized();
    const terminalMapping = config.paymentTerminals?.[profile.paymentTerminalAlias] ?? null;
    if (!terminalMapping || !validTerminalLock(config.paymentTerminals, terminalMapping)) {
      return {
        enabled: true,
        error: {
          code: 'kiosk_payment_terminal_not_configured',
          message: 'The configured kiosk profile has no available payment terminal.',
        },
        paymentTerminal: null,
      };
    }

    const paymentTerminal = {
      deviceId: installationId,
      promptForTip: false,
      terminalId: terminalMapping.terminalId,
    };
    return {
      enabled: true, installationId, paymentTerminal, profileId,
      reservationKeys: [`jykb_install_${installationId}`, `jykb_terminal_${terminalMapping.lockId}`].sort(),
    };
  }

  if (config.allowLegacyKioskTerminalAlias === false) return kioskInstallationNotAuthorized();
  const alias = typeof request.paymentTerminalAlias === 'string' ? request.paymentTerminalAlias.trim() : '';
  const mapping = alias === 'primary' ? config.paymentTerminals?.[alias] : null;
  if (!mapping?.deviceId) {
    return {
      enabled: true,
      error: {
        code: 'kiosk_payment_terminal_not_configured',
        message: 'The requested kiosk payment terminal is not configured.',
      },
      paymentTerminal: null,
    };
  }
  if (mapping.lockId && !validTerminalLock(config.paymentTerminals, mapping)) return kioskInstallationNotAuthorized();
  const { lockId, ...paymentTerminal } = mapping;
  return {
    enabled: true, paymentTerminal,
    ...(lockId ? { reservationKeys: [`jykb_terminal_${lockId}`] } : {}),
  };
}

function validTerminalLock(mappings, terminal) {
  if (!KIOSK_TERMINAL_LOCK_ID_PATTERN.test(terminal.lockId)) return false;
  return Object.values(mappings).every((other) => (
    other.terminalId !== terminal.terminalId || other.lockId === terminal.lockId
  ));
}

// GH-488 (D0243): an installation paired in Aurora pays only on its kiosk name's terminal. Any
// profile the device still sends is ignored; reservations keep the D0220 installation and
// terminal keys, so a pairing never changes the lock semantics.
function resolvePairedKioskTerminal(config, request, pairing) {
  const installationId = stringOrNull(request.kioskInstallationId);
  const capability = stringOrNull(request.kioskCapability);
  const kioskNameId = stringOrNull(pairing?.kioskNameId);
  const kioskName = kioskNameId ? config.kioskNames?.[kioskNameId] ?? null : null;
  const authorized = Boolean(
    installationId && KIOSK_INSTALLATION_ID_PATTERN.test(installationId) &&
    capability && KIOSK_CAPABILITY_PATTERN.test(capability) &&
    !request.paymentTerminalAlias &&
    pairing?.installationId === installationId &&
    pairing?.status === 'active' &&
    kioskName?.active &&
    config.kioskVenueId === SUPPORTED_KIOSK_VENUE_ID &&
    kioskName.venueId === config.kioskVenueId &&
    pairing.venueId === config.kioskVenueId &&
    (!request.venueId || request.venueId === kioskName.venueId) &&
    kioskCapabilityMatchesInstallationId(capability, installationId)
  );
  if (!authorized) return kioskInstallationNotAuthorized();

  const terminalMapping = config.paymentTerminals?.[kioskName.paymentTerminalAlias] ?? null;
  if (!terminalMapping || !validTerminalLock(config.paymentTerminals, terminalMapping)) {
    return {
      enabled: true,
      error: {
        code: 'kiosk_payment_terminal_not_configured',
        message: 'The paired kiosk name has no available payment terminal.',
      },
      paymentTerminal: null,
    };
  }
  return {
    enabled: true, installationId, kioskNameId,
    paymentTerminal: { deviceId: installationId, promptForTip: false, terminalId: terminalMapping.terminalId },
    reservationKeys: [`jykb_install_${installationId}`, `jykb_terminal_${terminalMapping.lockId}`].sort(),
  };
}

function kioskInstallationNotAuthorized() {
  return {
    enabled: true,
    error: {
      code: 'kiosk_installation_not_authorized',
      message: 'This kiosk installation is not authorized for the requested profile.',
    },
    paymentTerminal: null,
  };
}

function kioskInstallationNotPaired() {
  return {
    enabled: true,
    error: {
      code: 'kiosk_installation_not_paired',
      message: 'This kiosk is not paired with a kiosk name. Ask staff to pair it.',
    },
    paymentTerminal: null,
  };
}

function kioskCapabilityMatchesInstallationId(capability, installationId) {
  if (!KIOSK_CAPABILITY_PATTERN.test(capability) || !KIOSK_INSTALLATION_ID_PATTERN.test(installationId)) return false;
  const actualFingerprint = crypto.createHash('sha256').update(capability, 'utf8').digest('hex').slice(0, 24);
  const expectedFingerprint = installationId.slice(3);
  return crypto.timingSafeEqual(
    Buffer.from(actualFingerprint, 'utf8'),
    Buffer.from(expectedFingerprint, 'utf8'),
  );
}

function buildKioskQuotePayload(draftPayload) {
  if (!draftPayload || typeof draftPayload !== 'object' || Array.isArray(draftPayload)) return {};
  const { paymentTerminal: _paymentTerminal, ...quotePayload } = draftPayload;
  // Cost verification never carries a marketing choice (#444); only the draft does.
  if (quotePayload.customer && typeof quotePayload.customer === 'object') {
    const { acceptMarketing: _email, acceptMarketingSms: _sms, ...customer } = quotePayload.customer;
    return { ...quotePayload, customer };
  }
  return quotePayload;
}

function redactPaymentTerminalValues(value, paymentTerminal) {
  let redacted = stringOrNull(value) || '';
  const secrets = typeof paymentTerminal === 'string'
    ? [stringOrNull(paymentTerminal)]
    : [stringOrNull(paymentTerminal?.deviceId), stringOrNull(paymentTerminal?.terminalId)];
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.split(secret).join('[REDACTED_TERMINAL]');
  }
  return redacted;
}

function verifyKioskDraftPayment({ draftBody, paymentJwt, quoteBody }) {
  const draftAmountCents = amountToCents(readAmountOwing(draftBody));
  const quoteAmountCents = amountToCents(readAmountOwing(quoteBody));
  if (draftAmountCents === null || quoteAmountCents === null || draftAmountCents !== quoteAmountCents) {
    return {
      ok: false,
      error: {
        code: 'kiosk_payment_amount_mismatch',
        message: 'ROLLER draft amount did not match the server-side quote.',
      },
    };
  }

  const jwtPayload = parseJwtPayload(paymentJwt);
  const currencies = [
    findNamedScalar(quoteBody, ['currency', 'currencyCode']),
    findNamedScalar(draftBody, ['currency', 'currencyCode']),
    findNamedScalar(jwtPayload, ['currency', 'currencyCode']),
  ].filter((value) => typeof value === 'string' && value.trim());
  if (currencies.length === 0 || currencies.some((value) => value.trim().toUpperCase() !== KIOSK_PAYMENT_CURRENCY)) {
    return {
      ok: false,
      error: {
        code: 'kiosk_payment_currency_mismatch',
        message: 'ROLLER terminal payment currency was not the configured kiosk currency.',
      },
    };
  }

  if (!jwtPayload || typeof jwtPayload.merchantReference !== 'string' || !jwtPayload.merchantReference.trim()) {
    return {
      ok: false,
      error: {
        code: 'kiosk_payment_jwt_invalid',
        message: 'ROLLER did not return a usable terminal payment token.',
      },
    };
  }

  return { amountOwingCents: draftAmountCents, currency: KIOSK_PAYMENT_CURRENCY, ok: true };
}

function normalizeTerminalOutcome(value) {
  return ['approved', 'failed', 'cancelled', 'unknown'].includes(value) ? value : null;
}

function normalizeDraftFinalizeAction(value) {
  if (value === undefined || value === null || value === '') return 'result';
  return ['result', 'status'].includes(value) ? value : null;
}

// A malformed reference is dropped, never rejected: it only disables the immediate publish,
// and the approval itself must always be recorded.
function normalizeTerminalTransactionRef(value) {
  const ref = typeof value === 'string' ? value.trim() : '';
  return KIOSK_TERMINAL_TRANSACTION_REF_PATTERN.test(ref) ? ref : null;
}

function normalizeTerminalMerchantId(value) {
  const merchantId = typeof value === 'string' ? value.trim() : '';
  return KIOSK_TERMINAL_MERCHANT_ID_PATTERN.test(merchantId) ? merchantId : null;
}

// GH-481 (D0238): ROLLER publishes a card-present draft at once only when the publish carries
// the approved payment (its PaymentCreate model); without it ROLLER answers 409 while an amount
// is owing and creates the booking from its own notification about a minute later. Only an
// installation-bound attempt with a stored reference and merchant account qualifies: ROLLER
// links the payment to its Adyen transaction through `MerchantId`, and without that link the
// payment cannot be refunded through the gateway. The amount is the amount owing verified at
// draft creation, never a client value.
function kioskTerminalPublishPayment(row) {
  const id = normalizeTerminalTransactionRef(row?.terminal_transaction_ref);
  const merchantId = normalizeTerminalMerchantId(row?.terminal_merchant_id);
  const amountOwingCents = Number(row?.amount_owing_cents);
  if (!id || !merchantId) return null;
  if (!KIOSK_INSTALLATION_ID_PATTERN.test(stringOrNull(row?.kiosk_installation_id) ?? '')) return null;
  if (!Number.isSafeInteger(amountOwingCents) || amountOwingCents <= 0) return null;
  return { id, paymentType: KIOSK_TERMINAL_PAYMENT_TYPE, amount: amountOwingCents / 100, MerchantId: merchantId };
}

function publicKioskPaymentStatus(row) {
  const paymentStatus = stringOrNull(row?.payment_attempt_status);
  const storedConfirmationStatus = stringOrNull(row?.booking_confirmation_status);
  const bookingReference = stringOrNull(row?.roller_booking_reference);
  const bookingConfirmed =
    storedConfirmationStatus === 'confirmed' ||
    paymentStatus === 'reconciled' ||
    row?.status === 'published';
  const hasProvisionalHandoff = Boolean(stringOrNull(row?.checkin_session_id));
  const handoffConfirmed =
    !hasProvisionalHandoff ||
    (
      stringOrNull(row?.session_booking_sync_status) === 'confirmed' &&
      Boolean(stringOrNull(row?.confirmed_roller_unique_id)) &&
      parseJsonArray(row?.selected_ticket_ids).length > 0
    );
  const confirmed = bookingConfirmed && handoffConfirmed;
  const confirmationStatus = confirmed
    ? 'confirmed'
    : storedConfirmationStatus === 'needs_staff' ||
        stringOrNull(row?.session_booking_sync_status) === 'needs_staff' ||
        paymentStatus === 'unknown'
      ? 'needs_staff'
      : storedConfirmationStatus === 'failed' || ['failed', 'cancelled'].includes(paymentStatus)
        ? 'failed'
        : 'pending';

  const provisionalHandoff = hasProvisionalHandoff
    ? {
        booking: {
          amountOwing: 0,
          bookingReference: confirmed ? bookingReference : stringOrNull(row?.roller_draft_unique_id),
          customer: {
            firstName: stringOrNull(row?.customer_first_name),
            lastName: stringOrNull(row?.customer_last_name),
          },
          // GH-459: the same item details as a kiosk lookup: band colour and Combo contents.
          items: normalizeItemsSummary(row?.items_summary).map((item) => withGuestItemDetails(item)),
          paymentStatus: 'paid',
          rollerUniqueId: confirmed
            ? stringOrNull(row?.confirmed_roller_unique_id)
            : stringOrNull(row?.roller_draft_unique_id),
          status: confirmed ? 'confirmed' : 'payment_approved_booking_syncing',
        },
        guestAccess: {
          expiresAt: stringOrNull(row?.guest_access_expires_at),
          token: stringOrNull(row?.payment_attempt_id),
        },
        session: {
          bookingSyncStatus: confirmed
            ? 'confirmed'
            : stringOrNull(row?.session_booking_sync_status) === 'needs_staff'
              ? 'needs_staff'
              : 'pending',
          checkinSessionId: stringOrNull(row?.checkin_session_id),
          expiresAt: stringOrNull(row?.session_expires_at),
          ...(stringOrNull(row?.session_guest_resume_step) === 'safety'
            ? { guestResumeStep: 'safety' }
            : {}),
          handoffCode: stringOrNull(row?.handoff_code),
          handoffStatus: stringOrNull(row?.handoff_status),
          safetyStatus: stringOrNull(row?.safety_status),
          status: stringOrNull(row?.session_status),
        },
      }
    : null;

  return {
    status: confirmationStatus,
    payment: {
      status: paymentStatus,
    },
    booking: {
      bookingReference: confirmed ? bookingReference : null,
      status: confirmationStatus,
    },
    ...(provisionalHandoff ? { provisionalHandoff } : {}),
  };
}

function normalizeKioskStaffResolutionAction(value) {
  return KIOSK_STAFF_RESOLUTION_ACTIONS.has(value) ? value : null;
}

// GH-483 (D0239): what ROLLER says about one kiosk draft, from `GET /bookings/{draft uniqueId}`.
// ROLLER answers 404 until it has turned the terminal payment into a booking, so only a 404
// (together with an empty local cache) can support "no payment"; any other answer, error or
// transport failure keeps the kiosk locked.
function classifyKioskStaffRollerEvidence(result, { expectedOwingCents, requireTickets }) {
  if (!result || result.transportError) return { booking: 'unavailable', amountOwingCents: null, readback: null };
  if (result.status === 404) return { booking: 'not_found', amountOwingCents: null, readback: null };
  if (!result.ok) return { booking: 'unavailable', amountOwingCents: null, readback: null };

  const readback = normalizeBookingReadback(result.body, { requireTickets });
  const booking = result.body?.booking && typeof result.body.booking === 'object' ? result.body.booking : result.body;
  const costs = booking?.costs && typeof booking.costs === 'object' ? booking.costs : booking;
  const owing = finiteNumber(costs?.amountOwing ?? booking?.amountOwing ?? booking?.remainder);
  const amountOwingCents = owing === null ? null : Math.round(owing * 100);
  if (readback.confirmed) return { booking: 'paid', amountOwingCents: 0, readback };
  const expected = Number(expectedOwingCents);
  if (amountOwingCents !== null && amountOwingCents > 0 && Number.isSafeInteger(expected) && expected > 0) {
    return {
      booking: amountOwingCents >= expected ? 'unpaid' : 'partially_paid',
      amountOwingCents,
      readback: null,
    };
  }
  return { booking: 'unconfirmed', amountOwingCents, readback: null };
}

// GH-483 (D0239): which staff decisions one attempt allows. "Paid" needs a confirmed ROLLER
// booking; "no payment" needs ROLLER and the local cache to know nothing about the draft, an
// attempt that never reported an approval, and the minimum age. Nothing here is decided by time
// alone or by the staff member's word.
function kioskStaffResolutionEligibility(row, evidence) {
  const attemptStatus = stringOrNull(row?.payment_attempt_status);
  const published = row?.status === 'published';
  const unresolved = ['created', 'unknown'].includes(attemptStatus);
  const approvedNeedsStaff = attemptStatus === 'approved' && row?.booking_confirmation_status === 'needs_staff';
  const ageSeconds = Math.max(0, Math.floor(Number(row?.age_seconds) || 0));
  const noPaymentEvidence =
    unresolved &&
    !published &&
    !stringOrNull(row?.roller_booking_reference) &&
    Number(row?.local_booking_count ?? 0) === 0 &&
    evidence?.booking === 'not_found';
  const waitSeconds = noPaymentEvidence ? Math.max(0, KIOSK_STAFF_NO_PAYMENT_MIN_AGE_SECONDS - ageSeconds) : 0;
  return {
    ageSeconds,
    noPayment: noPaymentEvidence && waitSeconds === 0,
    noPaymentAvailableInSeconds: waitSeconds,
    paid: (unresolved || approvedNeedsStaff) && evidence?.booking === 'paid',
    resolvable: unresolved || approvedNeedsStaff,
  };
}

// GH-483: the PII-free view of one attempt for the staff panel on the kiosk.
function publicKioskStaffResolution(row, evidence, eligibility) {
  const totalCents = Number(row?.total_cents);
  return {
    attempt: {
      ageSeconds: eligibility.ageSeconds,
      currency: stringOrNull(row?.currency) || KIOSK_PAYMENT_CURRENCY,
      flowType: stringOrNull(row?.flow_type),
      state: publicKioskPaymentStatus(row).status,
      totalCents: Number.isSafeInteger(totalCents) ? totalCents : null,
    },
    roller: {
      amountOwingCents: evidence?.amountOwingCents ?? null,
      booking: evidence?.booking ?? 'unavailable',
    },
    actions: {
      noPayment: eligibility.noPayment,
      noPaymentAvailableInSeconds: eligibility.noPaymentAvailableInSeconds,
      paid: eligibility.paid,
    },
  };
}

function normalizeItemsSummary(value) {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? parseJsonArray(value)
      : [];
  return items.map((item) => ({
    bookingDate: stringOrNull(item?.bookingDate),
    durationMinutes: finiteNumber(item?.durationMinutes),
    endTime: stringOrNull(item?.endTime),
    parentProductId: stringOrNull(item?.parentProductId),
    parentProductName: stringOrNull(item?.parentProductName),
    parentType: stringOrNull(item?.parentType),
    productId: stringOrNull(item?.productId),
    productName: stringOrNull(item?.productName),
    productSubType: stringOrNull(item?.productSubType),
    productType: stringOrNull(item?.productType),
    quantity: finiteNumber(item?.quantity) ?? 1,
    startTime: stringOrNull(item?.startTime),
    tickets: [],
  }));
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBookingReadback(body, options = {}) {
  const booking = body?.booking && typeof body.booking === 'object' ? body.booking : body;
  const costs = booking?.costs && typeof booking.costs === 'object' ? booking.costs : booking;
  const amountOwing = finiteNumber(costs?.amountOwing ?? booking?.amountOwing ?? booking?.remainder);
  const paymentStatus = stringOrNull(booking?.paymentStatus ?? booking?.status ?? booking?.bookingStatus);
  const unsafeStatus = /pending|unpaid|partial|cancel|fail|draft/i.test(paymentStatus ?? '');
  const items = normalizeReadbackItems(booking);
  const ticketIds = items.flatMap((item) => item.tickets.map((ticket) => ticket.ticketId)).filter(Boolean);
  const bookingReference = stringOrNull(booking?.bookingReference ?? booking?.reference ?? booking?.bookingId);
  const rollerUniqueId = stringOrNull(booking?.uniqueId ?? booking?.id ?? booking?.bookingUniqueId);
  const requiredContentPresent = options.requireTickets === false ? items.length > 0 : ticketIds.length > 0;
  return {
    bookingReference,
    confirmed:
      amountOwing !== null &&
      amountOwing <= 0 &&
      !unsafeStatus &&
      Boolean(bookingReference && rollerUniqueId) &&
      requiredContentPresent,
    items,
    paymentStatus,
    rollerUniqueId,
    ticketIds,
  };
}

function normalizeReadbackItems(booking) {
  const rawItems = Array.isArray(booking?.items) ? booking.items : [];
  return rawItems.map((item, itemIndex) => {
    const rawTickets = Array.isArray(item?.tickets)
      ? item.tickets
      : Array.isArray(item?.ticketInstances)
        ? item.ticketInstances
        : [];
    return {
      bookingDate: stringOrNull(item?.bookingDate ?? booking?.bookingDate),
      bookingItemId: stringOrNull(item?.bookingItemId ?? item?.id ?? item?.uniqueId),
      durationMinutes: finiteNumber(item?.durationMinutes ?? item?.duration),
      endTime: stringOrNull(item?.endTime ?? item?.sessionEndTime),
      itemIndex,
      parentProductId: stringOrNull(item?.parentProductId ?? item?.product?.parentProductId),
      parentProductName: stringOrNull(item?.parentProductName ?? item?.product?.parentProductName),
      parentType: stringOrNull(item?.parentType ?? item?.product?.parentType),
      productId: stringOrNull(item?.productId ?? item?.product?.id),
      productName: stringOrNull(item?.productName ?? item?.name ?? item?.product?.name),
      productSubType: stringOrNull(item?.productSubType ?? item?.product?.productSubType),
      productType: stringOrNull(item?.productType ?? item?.product?.productType),
      quantity: finiteNumber(item?.quantity) ?? rawTickets.length ?? 1,
      startTime: stringOrNull(item?.startTime ?? item?.sessionStartTime),
      tickets: rawTickets
        .map((ticket) => ({
          redeemStatus: stringOrNull(ticket?.redeemStatus ?? ticket?.status),
          ticketId: stringOrNull(ticket?.ticketId ?? ticket?.id),
        }))
        .filter((ticket) => ticket.ticketId),
    };
  });
}

function readAmountOwing(body) {
  const costs = body?.costs && typeof body.costs === 'object'
    ? body.costs
    : body?.bookingCosts && typeof body.bookingCosts === 'object'
      ? body.bookingCosts
      : body;
  return finiteNumber(costs?.amountOwing);
}

function parseJwtPayload(jwt) {
  if (typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function findNamedScalar(value, names, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  for (const [key, child] of Object.entries(value)) {
    if (names.includes(key) && (typeof child === 'string' || typeof child === 'number')) return String(child);
  }
  for (const child of Object.values(value)) {
    const found = findNamedScalar(child, names, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function amountToCents(value) {
  const amount = finiteNumber(value);
  return amount === null ? null : Math.round(amount * 100);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim() || null;
}

module.exports = {
  buildKioskQuotePayload,
  buildKioskStatus,
  isKioskPairingStaffAllowed,
  classifyKioskStaffRollerEvidence,
  kioskStaffResolutionEligibility,
  KIOSK_STAFF_NO_PAYMENT_MIN_AGE_SECONDS,
  normalizeKioskStaffResolutionAction,
  publicKioskStaffResolution,
  KIOSK_PAYMENT_CURRENCY,
  kioskNameDirectory,
  kioskTerminalLockId,
  kioskTerminalPublishPayment,
  normalizeDraftFinalizeAction,
  normalizeBookingReadback,
  normalizeItemsSummary,
  normalizeKioskClientVersions,
  normalizeKioskInstallationMap,
  normalizeKioskNameMap,
  normalizeKioskPairingDetail,
  normalizeKioskPairingStaffIdentityIds,
  normalizeKioskProfileMap,
  normalizePaymentTerminalMap,
  normalizePaymentTerminalNameMap,
  normalizeTerminalOutcome,
  normalizeTerminalMerchantId,
  normalizeTerminalTransactionRef,
  publicKioskPaymentStatus,
  redactPaymentTerminalValues,
  resolveKioskPaymentTerminal,
  verifiedKioskInstallationProof,
  verifyKioskDraftPayment,
};
