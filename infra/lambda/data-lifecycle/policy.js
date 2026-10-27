"use strict";

// T0195 / GH-598: the reviewed Aurora lifecycle policy, shared by the operator CLI
// (infra/scripts/data-lifecycle.ts) and the nightly lifecycle Lambda. The SQL templates are
// unchanged from T0195; policyDefinitionDigest() binds every candidate and mutation statement.
const { createHash } = require("crypto");

const DATABASE = "jumpyard_cloud";
const POLICY_VERSION = "t0195-v1";
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_MUTATIONS = 1000;
const MAX_BATCH_SIZE = 500;
const MAX_MUTATIONS_LIMIT = 5000;

const MAX_DATA_API_SQL_BYTES = 60 * 1024;

const ADVISORY_LOCK_ID = 1940195;

const LIFECYCLE_TABLES = [
  "jumpyard.booking_links",
  "jumpyard.booking_seed_runs",
  "jumpyard.checkin_attempts",
  "jumpyard.checkin_sessions",
  "jumpyard.checkin_tokens",
  "jumpyard.data_lifecycle_runs",
  "jumpyard.email_deliveries",
  "jumpyard.event_log",
  "jumpyard.guest_profiles",
  "jumpyard.handoff_sessions",
  "jumpyard.idempotency_records",
  "jumpyard.prepayment_booking_drafts",
  "jumpyard.product_catalog_cache",
  "jumpyard.roller_booking_items",
  "jumpyard.roller_booking_payments",
  "jumpyard.roller_booking_tickets",
  "jumpyard.roller_bookings",
  "jumpyard.roller_webhook_events",
  "jumpyard.sms_deliveries",
  "jumpyard.staff_auth_sessions",
  "jumpyard.staff_identities",
  "jumpyard.staff_pin_auth_limits",
];

const reference = "CAST(:referenceAt AS timestamptz)";
const cutoff24Hours = `${reference} - interval '24 hours'`;
const cutoff30Days = `${reference} - interval '30 days'`;
const cutoff90Days = `${reference} - interval '90 days'`;

const bookingLifecycleAt = (alias) => `(
  ${alias}.booking_date
  + COALESCE(${alias}.end_time, ${alias}.start_time, TIME '23:59:59')
) AT TIME ZONE 'Europe/Stockholm'`;

const bookingItemLifecycleAt = (alias) => `(
  ${alias}.booking_date
  + COALESCE(${alias}.end_time, ${alias}.start_time, TIME '23:59:59')
) AT TIME ZONE 'Europe/Stockholm'`;

const datedDayLifecycleAt = (alias, column) => `(
  ${alias}.${column} + TIME '23:59:59'
) AT TIME ZONE 'Europe/Stockholm'`;

const bookingIsLifecycleEligible = (alias) => `
  ${alias}.booking_date IS NOT NULL
  AND ${bookingLifecycleAt(alias)} <= ${cutoff30Days}
  AND NOT EXISTS (
    SELECT 1
    FROM jumpyard.roller_booking_items AS lifecycle_item
    WHERE lifecycle_item.roller_unique_id = ${alias}.roller_unique_id
      AND (
        lifecycle_item.booking_date IS NULL
        OR ${bookingItemLifecycleAt("lifecycle_item")} > ${cutoff30Days}
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jumpyard.roller_booking_tickets AS lifecycle_ticket
    WHERE lifecycle_ticket.roller_unique_id = ${alias}.roller_unique_id
      AND (
        (
          lifecycle_ticket.booking_date IS NULL
          AND lifecycle_ticket.expiry_date IS NULL
        )
        OR
        (
          lifecycle_ticket.booking_date IS NOT NULL
          AND ${datedDayLifecycleAt("lifecycle_ticket", "booking_date")} > ${cutoff30Days}
        )
        OR (
          lifecycle_ticket.expiry_date IS NOT NULL
          AND ${datedDayLifecycleAt("lifecycle_ticket", "expiry_date")} > ${cutoff30Days}
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jumpyard.checkin_sessions AS active_session
    WHERE active_session.roller_unique_id = ${alias}.roller_unique_id
      AND active_session.status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
      AND active_session.expires_at > ${reference}
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jumpyard.checkin_tokens AS active_token
    WHERE active_token.roller_unique_id = ${alias}.roller_unique_id
      AND active_token.expires_at > ${reference}
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jumpyard.handoff_sessions AS active_handoff
    WHERE active_handoff.roller_unique_id = ${alias}.roller_unique_id
      AND active_handoff.completed_at IS NULL
      AND (active_handoff.expires_at IS NULL OR active_handoff.expires_at > ${reference})
  )`;

const bookingLinkSideCanAnonymize = (
  linkAlias,
  rollerUniqueIdColumn,
  bookingAlias,
) => `(
  EXISTS (
    SELECT 1
    FROM jumpyard.roller_bookings AS ${bookingAlias}
    WHERE ${bookingAlias}.roller_unique_id = ${linkAlias}.${rollerUniqueIdColumn}
      AND ${bookingIsLifecycleEligible(bookingAlias)}
  )
  OR (
    NOT EXISTS (
      SELECT 1
      FROM jumpyard.roller_bookings AS ${bookingAlias}_present
      WHERE ${bookingAlias}_present.roller_unique_id = ${linkAlias}.${rollerUniqueIdColumn}
    )
    AND (
      ${linkAlias}.${rollerUniqueIdColumn} ~ '^audit_[a-f0-9]{32}$'
      OR ${linkAlias}.created_at <= ${cutoff30Days}
    )
  )
)`;

const bookingLinkSideHasPii = (
  linkAlias,
  rollerUniqueIdColumn,
  bookingReferenceColumn,
) => `(
  ${linkAlias}.${rollerUniqueIdColumn} !~ '^audit_[a-f0-9]{32}$'
  OR (
    ${linkAlias}.${bookingReferenceColumn} IS NOT NULL
    AND ${linkAlias}.${bookingReferenceColumn} !~ '^audit_[a-f0-9]{32}$'
  )
)`;

const bookingLinkHasProtectedBooking = (
  linkAlias,
  rollerUniqueIdColumn,
  bookingAlias,
) => `EXISTS (
  SELECT 1
  FROM jumpyard.roller_bookings AS ${bookingAlias}
  WHERE ${bookingAlias}.roller_unique_id = ${linkAlias}.${rollerUniqueIdColumn}
    AND NOT (${bookingIsLifecycleEligible(bookingAlias)})
)`;

function deleteBySingleKey(
  table,
  alias,
  key,
  predicate,
  orderBy,
) {
  return `
    WITH candidates AS (
      SELECT ${alias}.${key}
      FROM ${table} AS ${alias}
      WHERE ${predicate}
      ORDER BY ${orderBy}, ${alias}.${key}
      LIMIT CAST(:batchSize AS integer)
      FOR UPDATE SKIP LOCKED
    ), deleted AS (
      DELETE FROM ${table} AS target
      USING candidates
      WHERE target.${key} = candidates.${key}
      RETURNING 1
    )
    SELECT count(*)::bigint AS affected_count FROM deleted`;
}

const draftLifecycleAt = (alias) => `GREATEST(
  COALESCE(
    (
      ${alias}.booking_date
      + COALESCE(${alias}.start_time, TIME '23:59:59')
    ) AT TIME ZONE 'Europe/Stockholm',
    '-infinity'::timestamptz
  ),
  COALESCE(${alias}.expires_at, '-infinity'::timestamptz),
  ${alias}.updated_at
)`;

const ACTION_SPECS = [
  {
    name: "product_catalog_delete_expired",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.product_catalog_cache AS cache
      WHERE COALESCE(cache.expires_at, cache.fetched_at + interval '24 hours') <= ${reference}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.product_catalog_cache",
      "cache",
      "cache_key",
      `COALESCE(cache.expires_at, cache.fetched_at + interval '24 hours') <= ${reference}`,
      "COALESCE(cache.expires_at, cache.fetched_at + interval '24 hours')",
    ),
  },
  {
    name: "checkin_token_delete_24h",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.checkin_tokens AS token
      WHERE token.expires_at <= ${cutoff24Hours}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.checkin_tokens",
      "token",
      "token_hash",
      `token.expires_at <= ${cutoff24Hours}`,
      "token.expires_at",
    ),
  },
  {
    name: "idempotency_delete_24h",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.idempotency_records AS record
      WHERE record.expires_at <= ${cutoff24Hours}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.idempotency_records",
      "record",
      "idempotency_key",
      `record.expires_at <= ${cutoff24Hours}`,
      "record.expires_at",
    ),
  },
  {
    name: "staff_session_delete_24h",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.staff_auth_sessions AS staff_session
      WHERE LEAST(
        staff_session.token_expires_at,
        staff_session.idle_expires_at,
        staff_session.absolute_expires_at,
        COALESCE(staff_session.revoked_at, 'infinity'::timestamptz)
      ) <= ${cutoff24Hours}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.staff_auth_sessions",
      "staff_session",
      "staff_session_id",
      `LEAST(
        staff_session.token_expires_at,
        staff_session.idle_expires_at,
        staff_session.absolute_expires_at,
        COALESCE(staff_session.revoked_at, 'infinity'::timestamptz)
      ) <= ${cutoff24Hours}`,
      `LEAST(
        staff_session.token_expires_at,
        staff_session.idle_expires_at,
        staff_session.absolute_expires_at,
        COALESCE(staff_session.revoked_at, 'infinity'::timestamptz)
      )`,
    ),
  },
  {
    name: "staff_pin_limiter_delete_24h",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.staff_pin_auth_limits AS limiter
      WHERE GREATEST(
        limiter.window_started_at + interval '10 minutes',
        COALESCE(limiter.last_failure_at + interval '10 minutes', '-infinity'::timestamptz),
        COALESCE(limiter.blocked_until, '-infinity'::timestamptz),
        limiter.updated_at
      ) <= ${cutoff24Hours}`,
    mutateSql: `
      WITH candidates AS (
        SELECT limiter.environment, limiter.venue_id, limiter.scope_type, limiter.scope_hash
        FROM jumpyard.staff_pin_auth_limits AS limiter
        WHERE GREATEST(
          limiter.window_started_at + interval '10 minutes',
          COALESCE(limiter.last_failure_at + interval '10 minutes', '-infinity'::timestamptz),
          COALESCE(limiter.blocked_until, '-infinity'::timestamptz),
          limiter.updated_at
        ) <= ${cutoff24Hours}
        ORDER BY limiter.updated_at, limiter.environment, limiter.venue_id, limiter.scope_type, limiter.scope_hash
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), deleted AS (
        DELETE FROM jumpyard.staff_pin_auth_limits AS target
        USING candidates
        WHERE target.environment = candidates.environment
          AND target.venue_id = candidates.venue_id
          AND target.scope_type = candidates.scope_type
          AND target.scope_hash = candidates.scope_hash
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM deleted`,
  },
  {
    name: "prepayment_draft_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.prepayment_booking_drafts AS draft
      WHERE ${draftLifecycleAt("draft")} <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.prepayment_booking_drafts",
      "draft",
      "prepayment_draft_id",
      `${draftLifecycleAt("draft")} <= ${cutoff90Days}`,
      draftLifecycleAt("draft"),
    ),
  },
  {
    name: "prepayment_draft_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.prepayment_booking_drafts AS draft
      WHERE ${draftLifecycleAt("draft")} <= ${cutoff30Days}
        AND ${draftLifecycleAt("draft")} > ${cutoff90Days}
        AND (
          draft.customer_email IS NOT NULL
          OR draft.customer_email_hash IS NOT NULL
          OR draft.customer_email_masked IS NOT NULL
          OR draft.customer_first_name IS NOT NULL
          OR draft.customer_last_name IS NOT NULL
          OR draft.customer_phone IS NOT NULL
          OR draft.customer_phone_hash IS NOT NULL
          OR draft.customer_phone_masked IS NOT NULL
          OR draft.terminal_transaction_ref IS NOT NULL
          OR draft.terminal_merchant_id IS NOT NULL
          OR (
            draft.roller_draft_unique_id IS NOT NULL
            AND draft.roller_draft_unique_id !~ '^provider_[a-f0-9]{32}$'
          )
          OR (
            draft.roller_capacity_reservation_id IS NOT NULL
            AND draft.roller_capacity_reservation_id !~ '^provider_[a-f0-9]{32}$'
          )
          OR draft.external_id !~ '^audit_[a-f0-9]{32}$'
          OR draft.idempotency_key !~ '^audit_[a-f0-9]{32}$'
          OR (
            draft.original_booking_reference IS NOT NULL
            AND draft.original_booking_reference !~ '^audit_[a-f0-9]{32}$'
          )
          OR (
            draft.original_roller_unique_id IS NOT NULL
            AND draft.original_roller_unique_id !~ '^audit_[a-f0-9]{32}$'
          )
          OR (
            draft.add_on_group_id IS NOT NULL
            AND draft.add_on_group_id !~ '^audit_[a-f0-9]{32}$'
          )
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT draft.prepayment_draft_id
        FROM jumpyard.prepayment_booking_drafts AS draft
        WHERE ${draftLifecycleAt("draft")} <= ${cutoff30Days}
          AND ${draftLifecycleAt("draft")} > ${cutoff90Days}
          AND (
            draft.customer_email IS NOT NULL
            OR draft.customer_email_hash IS NOT NULL
            OR draft.customer_email_masked IS NOT NULL
            OR draft.customer_first_name IS NOT NULL
            OR draft.customer_last_name IS NOT NULL
            OR draft.customer_phone IS NOT NULL
            OR draft.customer_phone_hash IS NOT NULL
            OR draft.customer_phone_masked IS NOT NULL
            OR draft.terminal_transaction_ref IS NOT NULL
            OR draft.terminal_merchant_id IS NOT NULL
            OR (
              draft.roller_draft_unique_id IS NOT NULL
              AND draft.roller_draft_unique_id !~ '^provider_[a-f0-9]{32}$'
            )
            OR (
              draft.roller_capacity_reservation_id IS NOT NULL
              AND draft.roller_capacity_reservation_id !~ '^provider_[a-f0-9]{32}$'
            )
            OR draft.external_id !~ '^audit_[a-f0-9]{32}$'
            OR draft.idempotency_key !~ '^audit_[a-f0-9]{32}$'
            OR (
              draft.original_booking_reference IS NOT NULL
              AND draft.original_booking_reference !~ '^audit_[a-f0-9]{32}$'
            )
            OR (
              draft.original_roller_unique_id IS NOT NULL
              AND draft.original_roller_unique_id !~ '^audit_[a-f0-9]{32}$'
            )
            OR (
              draft.add_on_group_id IS NOT NULL
              AND draft.add_on_group_id !~ '^audit_[a-f0-9]{32}$'
            )
          )
        ORDER BY ${draftLifecycleAt("draft")}, draft.prepayment_draft_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.prepayment_booking_drafts AS target
        SET customer_email = NULL,
            customer_email_hash = NULL,
            customer_email_masked = NULL,
            customer_first_name = NULL,
            customer_last_name = NULL,
            customer_phone = NULL,
            customer_phone_hash = NULL,
            customer_phone_masked = NULL,
            terminal_transaction_ref = NULL,
            terminal_merchant_id = NULL,
            roller_draft_unique_id = CASE
              WHEN target.roller_draft_unique_id IS NULL THEN NULL
              WHEN target.roller_draft_unique_id ~ '^provider_[a-f0-9]{32}$'
                THEN target.roller_draft_unique_id
              ELSE 'provider_' || md5(target.roller_draft_unique_id)
            END,
            roller_capacity_reservation_id = CASE
              WHEN target.roller_capacity_reservation_id IS NULL THEN NULL
              WHEN target.roller_capacity_reservation_id ~ '^provider_[a-f0-9]{32}$'
                THEN target.roller_capacity_reservation_id
              ELSE 'provider_' || md5(target.roller_capacity_reservation_id)
            END,
            external_id = CASE
              WHEN target.external_id ~ '^audit_[a-f0-9]{32}$' THEN target.external_id
              ELSE 'audit_' || md5(target.external_id)
            END,
            idempotency_key = CASE
              WHEN target.idempotency_key ~ '^audit_[a-f0-9]{32}$'
                THEN target.idempotency_key
              ELSE 'audit_' || md5(target.idempotency_key)
            END,
            original_booking_reference = CASE
              WHEN target.original_booking_reference IS NULL THEN NULL
              WHEN target.original_booking_reference ~ '^audit_[a-f0-9]{32}$'
                THEN target.original_booking_reference
              ELSE 'audit_' || md5(target.original_booking_reference)
            END,
            original_roller_unique_id = CASE
              WHEN target.original_roller_unique_id IS NULL THEN NULL
              WHEN target.original_roller_unique_id ~ '^audit_[a-f0-9]{32}$'
                THEN target.original_roller_unique_id
              ELSE 'audit_' || md5(target.original_roller_unique_id)
            END,
            add_on_group_id = CASE
              WHEN target.add_on_group_id IS NULL THEN NULL
              WHEN target.add_on_group_id ~ '^audit_[a-f0-9]{32}$'
                THEN target.add_on_group_id
              ELSE 'audit_' || md5(target.add_on_group_id)
            END
        FROM candidates
        WHERE target.prepayment_draft_id = candidates.prepayment_draft_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "guest_profile_delete_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.guest_profiles AS profile
      WHERE GREATEST(
          COALESCE(profile.last_seen_from_roller_at, '-infinity'::timestamptz),
          profile.updated_at
        ) <= ${cutoff30Days}
        AND NOT EXISTS (
          SELECT 1
          FROM jumpyard.roller_booking_tickets AS ticket
          INNER JOIN jumpyard.roller_bookings AS booking
            ON booking.roller_unique_id = ticket.roller_unique_id
          WHERE ticket.roller_customer_id = profile.roller_customer_id
            AND NOT (${bookingIsLifecycleEligible("booking")})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM jumpyard.prepayment_booking_drafts AS draft
          WHERE ${draftLifecycleAt("draft")} > ${cutoff30Days}
            AND (
              (profile.email_hash IS NOT NULL AND draft.customer_email_hash = profile.email_hash)
              OR (
                profile.contact_number_hash IS NOT NULL
                AND draft.customer_phone_hash = profile.contact_number_hash
              )
            )
        )`,
    mutateSql: deleteBySingleKey(
      "jumpyard.guest_profiles",
      "profile",
      "guest_profile_id",
      `GREATEST(
          COALESCE(profile.last_seen_from_roller_at, '-infinity'::timestamptz),
          profile.updated_at
        ) <= ${cutoff30Days}
        AND NOT EXISTS (
          SELECT 1
          FROM jumpyard.roller_booking_tickets AS ticket
          INNER JOIN jumpyard.roller_bookings AS booking
            ON booking.roller_unique_id = ticket.roller_unique_id
          WHERE ticket.roller_customer_id = profile.roller_customer_id
            AND NOT (${bookingIsLifecycleEligible("booking")})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM jumpyard.prepayment_booking_drafts AS draft
          WHERE ${draftLifecycleAt("draft")} > ${cutoff30Days}
            AND (
              (profile.email_hash IS NOT NULL AND draft.customer_email_hash = profile.email_hash)
              OR (
                profile.contact_number_hash IS NOT NULL
                AND draft.customer_phone_hash = profile.contact_number_hash
              )
            )
        )`,
      `GREATEST(
        COALESCE(profile.last_seen_from_roller_at, '-infinity'::timestamptz),
        profile.updated_at
      )`,
    ),
  },
  {
    name: "handoff_session_delete_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.handoff_sessions AS handoff
      WHERE COALESCE(handoff.completed_at, handoff.expires_at) IS NOT NULL
        AND COALESCE(handoff.completed_at, handoff.expires_at) <= ${cutoff30Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.handoff_sessions",
      "handoff",
      "handoff_code",
      `COALESCE(handoff.completed_at, handoff.expires_at) IS NOT NULL
        AND COALESCE(handoff.completed_at, handoff.expires_at) <= ${cutoff30Days}`,
      "COALESCE(handoff.completed_at, handoff.expires_at)",
    ),
  },
  {
    name: "checkin_attempt_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.checkin_attempts AS attempt
      WHERE attempt.created_at > ${cutoff90Days}
        AND (
          attempt.created_at <= ${cutoff30Days}
          OR EXISTS (
            SELECT 1
            FROM jumpyard.roller_bookings AS booking
            WHERE booking.roller_unique_id = attempt.roller_unique_id
              AND ${bookingIsLifecycleEligible("booking")}
          )
        )
        AND (
          attempt.roller_unique_id IS NOT NULL
          OR (attempt.booking_reference IS NOT NULL AND attempt.booking_reference !~ '^audit_[a-f0-9]{32}$')
          OR attempt.selected_ticket_ids <> '[]'::jsonb
          OR (
            attempt.roller_response_ref IS NOT NULL
            AND attempt.roller_response_ref !~ '^provider_[a-f0-9]{32}$'
          )
          OR attempt.idempotency_key IS NOT NULL
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT attempt.attempt_id
        FROM jumpyard.checkin_attempts AS attempt
        WHERE attempt.created_at > ${cutoff90Days}
          AND (
            attempt.created_at <= ${cutoff30Days}
            OR EXISTS (
              SELECT 1
              FROM jumpyard.roller_bookings AS booking
              WHERE booking.roller_unique_id = attempt.roller_unique_id
                AND ${bookingIsLifecycleEligible("booking")}
            )
          )
          AND (
            attempt.roller_unique_id IS NOT NULL
            OR (attempt.booking_reference IS NOT NULL AND attempt.booking_reference !~ '^audit_[a-f0-9]{32}$')
            OR attempt.selected_ticket_ids <> '[]'::jsonb
            OR (
              attempt.roller_response_ref IS NOT NULL
              AND attempt.roller_response_ref !~ '^provider_[a-f0-9]{32}$'
            )
            OR attempt.idempotency_key IS NOT NULL
          )
        ORDER BY attempt.created_at, attempt.attempt_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.checkin_attempts AS target
        SET roller_unique_id = NULL,
            booking_reference = CASE
              WHEN target.booking_reference IS NULL THEN NULL
              WHEN target.booking_reference ~ '^audit_[a-f0-9]{32}$' THEN target.booking_reference
              ELSE 'audit_' || md5(target.booking_reference)
            END,
            selected_ticket_ids = '[]'::jsonb,
            roller_response_ref = CASE
              WHEN target.roller_response_ref IS NULL THEN NULL
              WHEN target.roller_response_ref ~ '^provider_[a-f0-9]{32}$' THEN target.roller_response_ref
              ELSE 'provider_' || md5(target.roller_response_ref)
            END,
            idempotency_key = NULL
        FROM candidates
        WHERE target.attempt_id = candidates.attempt_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "sms_delivery_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.sms_deliveries AS delivery
      WHERE delivery.created_at > ${cutoff90Days}
        AND (
          delivery.created_at <= ${cutoff30Days}
          OR EXISTS (
            SELECT 1
            FROM jumpyard.roller_bookings AS booking
            WHERE booking.roller_unique_id = delivery.roller_unique_id
              AND ${bookingIsLifecycleEligible("booking")}
          )
        )
        AND (
          delivery.roller_unique_id IS NOT NULL
          OR delivery.token_hash IS NOT NULL
          OR (delivery.booking_reference IS NOT NULL AND delivery.booking_reference !~ '^audit_[a-f0-9]{32}$')
          OR delivery.error_summary IS NOT NULL
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT delivery.sms_delivery_id
        FROM jumpyard.sms_deliveries AS delivery
        WHERE delivery.created_at > ${cutoff90Days}
          AND (
            delivery.created_at <= ${cutoff30Days}
            OR EXISTS (
              SELECT 1
              FROM jumpyard.roller_bookings AS booking
              WHERE booking.roller_unique_id = delivery.roller_unique_id
                AND ${bookingIsLifecycleEligible("booking")}
            )
          )
          AND (
            delivery.roller_unique_id IS NOT NULL
            OR delivery.token_hash IS NOT NULL
            OR (delivery.booking_reference IS NOT NULL AND delivery.booking_reference !~ '^audit_[a-f0-9]{32}$')
            OR delivery.error_summary IS NOT NULL
          )
        ORDER BY delivery.created_at, delivery.sms_delivery_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.sms_deliveries AS target
        SET roller_unique_id = NULL,
            token_hash = NULL,
            booking_reference = CASE
              WHEN target.booking_reference IS NULL THEN NULL
              WHEN target.booking_reference ~ '^audit_[a-f0-9]{32}$' THEN target.booking_reference
              ELSE 'audit_' || md5(target.booking_reference)
            END,
            error_summary = NULL
        FROM candidates
        WHERE target.sms_delivery_id = candidates.sms_delivery_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "email_delivery_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.email_deliveries AS delivery
      WHERE delivery.created_at > ${cutoff90Days}
        AND (
          delivery.created_at <= ${cutoff30Days}
          OR EXISTS (
            SELECT 1
            FROM jumpyard.roller_bookings AS booking
            WHERE booking.roller_unique_id = delivery.roller_unique_id
              AND ${bookingIsLifecycleEligible("booking")}
          )
        )
        AND (
          delivery.roller_unique_id IS NOT NULL
          OR delivery.token_hash IS NOT NULL
          OR (delivery.booking_reference IS NOT NULL AND delivery.booking_reference !~ '^audit_[a-f0-9]{32}$')
          OR delivery.error_summary IS NOT NULL
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT delivery.email_delivery_id
        FROM jumpyard.email_deliveries AS delivery
        WHERE delivery.created_at > ${cutoff90Days}
          AND (
            delivery.created_at <= ${cutoff30Days}
            OR EXISTS (
              SELECT 1
              FROM jumpyard.roller_bookings AS booking
              WHERE booking.roller_unique_id = delivery.roller_unique_id
                AND ${bookingIsLifecycleEligible("booking")}
            )
          )
          AND (
            delivery.roller_unique_id IS NOT NULL
            OR delivery.token_hash IS NOT NULL
            OR (delivery.booking_reference IS NOT NULL AND delivery.booking_reference !~ '^audit_[a-f0-9]{32}$')
            OR delivery.error_summary IS NOT NULL
          )
        ORDER BY delivery.created_at, delivery.email_delivery_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.email_deliveries AS target
        SET roller_unique_id = NULL,
            token_hash = NULL,
            booking_reference = CASE
              WHEN target.booking_reference IS NULL THEN NULL
              WHEN target.booking_reference ~ '^audit_[a-f0-9]{32}$' THEN target.booking_reference
              ELSE 'audit_' || md5(target.booking_reference)
            END,
            error_summary = NULL
        FROM candidates
        WHERE target.email_delivery_id = candidates.email_delivery_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "webhook_event_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.roller_webhook_events AS webhook_event
      WHERE webhook_event.received_at <= ${cutoff30Days}
        AND webhook_event.received_at > ${cutoff90Days}
        AND (
          webhook_event.roller_unique_id IS NOT NULL
          OR (webhook_event.booking_reference IS NOT NULL AND webhook_event.booking_reference !~ '^audit_[a-f0-9]{32}$')
          OR webhook_event.error_summary IS NOT NULL
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT webhook_event.event_id_or_hash
        FROM jumpyard.roller_webhook_events AS webhook_event
        WHERE webhook_event.received_at <= ${cutoff30Days}
          AND webhook_event.received_at > ${cutoff90Days}
          AND (
            webhook_event.roller_unique_id IS NOT NULL
            OR (webhook_event.booking_reference IS NOT NULL AND webhook_event.booking_reference !~ '^audit_[a-f0-9]{32}$')
            OR webhook_event.error_summary IS NOT NULL
          )
        ORDER BY webhook_event.received_at, webhook_event.event_id_or_hash
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.roller_webhook_events AS target
        SET roller_unique_id = NULL,
            booking_reference = CASE
              WHEN target.booking_reference IS NULL THEN NULL
              WHEN target.booking_reference ~ '^audit_[a-f0-9]{32}$' THEN target.booking_reference
              ELSE 'audit_' || md5(target.booking_reference)
            END,
            error_summary = NULL
        FROM candidates
        WHERE target.event_id_or_hash = candidates.event_id_or_hash
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "event_log_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.event_log AS audit_event
      WHERE audit_event.created_at <= ${cutoff30Days}
        AND audit_event.created_at > ${cutoff90Days}
        AND (
          (audit_event.subject_ref IS NOT NULL AND audit_event.subject_ref !~ '^audit_[a-f0-9]{32}$')
          OR audit_event.summary IS NOT NULL
          OR audit_event.event_payload <> '{}'::jsonb
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT audit_event.event_id
        FROM jumpyard.event_log AS audit_event
        WHERE audit_event.created_at <= ${cutoff30Days}
          AND audit_event.created_at > ${cutoff90Days}
          AND (
            (audit_event.subject_ref IS NOT NULL AND audit_event.subject_ref !~ '^audit_[a-f0-9]{32}$')
            OR audit_event.summary IS NOT NULL
            OR audit_event.event_payload <> '{}'::jsonb
          )
        ORDER BY audit_event.created_at, audit_event.event_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.event_log AS target
        SET subject_ref = CASE
              WHEN target.subject_ref IS NULL THEN NULL
              WHEN target.subject_ref ~ '^audit_[a-f0-9]{32}$' THEN target.subject_ref
              ELSE 'audit_' || md5(target.subject_ref)
            END,
            summary = NULL,
            event_payload = '{}'::jsonb
        FROM candidates
        WHERE target.event_id = candidates.event_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "booking_link_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.booking_links AS booking_link
      WHERE (
          (
            ${bookingLinkSideCanAnonymize(
              "booking_link",
              "original_roller_unique_id",
              "original_booking",
            )}
            AND ${bookingLinkSideHasPii(
              "booking_link",
              "original_roller_unique_id",
              "original_booking_reference",
            )}
          )
          OR (
            ${bookingLinkSideCanAnonymize(
              "booking_link",
              "linked_roller_unique_id",
              "linked_booking",
            )}
            AND ${bookingLinkSideHasPii(
              "booking_link",
              "linked_roller_unique_id",
              "linked_booking_reference",
            )}
          )
          OR (
            ${bookingLinkSideCanAnonymize(
              "booking_link",
              "original_roller_unique_id",
              "original_booking_for_group",
            )}
            AND ${bookingLinkSideCanAnonymize(
              "booking_link",
              "linked_roller_unique_id",
              "linked_booking_for_group",
            )}
            AND booking_link.add_on_group_id IS NOT NULL
            AND booking_link.add_on_group_id !~ '^audit_[a-f0-9]{32}$'
          )
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT
          booking_link.link_id,
          ${bookingLinkSideCanAnonymize(
            "booking_link",
            "original_roller_unique_id",
            "original_booking",
          )} AS anonymize_original,
          ${bookingLinkSideCanAnonymize(
            "booking_link",
            "linked_roller_unique_id",
            "linked_booking",
          )} AS anonymize_linked
        FROM jumpyard.booking_links AS booking_link
        WHERE (
            (
              ${bookingLinkSideCanAnonymize(
                "booking_link",
                "original_roller_unique_id",
                "original_booking_candidate",
              )}
              AND ${bookingLinkSideHasPii(
                "booking_link",
                "original_roller_unique_id",
                "original_booking_reference",
              )}
            )
            OR (
              ${bookingLinkSideCanAnonymize(
                "booking_link",
                "linked_roller_unique_id",
                "linked_booking_candidate",
              )}
              AND ${bookingLinkSideHasPii(
                "booking_link",
                "linked_roller_unique_id",
                "linked_booking_reference",
              )}
            )
            OR (
              ${bookingLinkSideCanAnonymize(
                "booking_link",
                "original_roller_unique_id",
                "original_booking_for_group",
              )}
              AND ${bookingLinkSideCanAnonymize(
                "booking_link",
                "linked_roller_unique_id",
                "linked_booking_for_group",
              )}
              AND booking_link.add_on_group_id IS NOT NULL
              AND booking_link.add_on_group_id !~ '^audit_[a-f0-9]{32}$'
            )
          )
        ORDER BY booking_link.created_at, booking_link.link_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.booking_links AS target
        SET original_roller_unique_id = CASE
              WHEN NOT candidates.anonymize_original
                OR target.original_roller_unique_id ~ '^audit_[a-f0-9]{32}$'
                THEN target.original_roller_unique_id
              ELSE 'audit_' || md5(target.original_roller_unique_id)
            END,
            linked_roller_unique_id = CASE
              WHEN NOT candidates.anonymize_linked
                OR target.linked_roller_unique_id ~ '^audit_[a-f0-9]{32}$'
                THEN target.linked_roller_unique_id
              ELSE 'audit_' || md5(target.linked_roller_unique_id)
            END,
            original_booking_reference = CASE
              WHEN NOT candidates.anonymize_original
                OR target.original_booking_reference IS NULL
                OR target.original_booking_reference ~ '^audit_[a-f0-9]{32}$'
                THEN target.original_booking_reference
              ELSE 'audit_' || md5(target.original_booking_reference)
            END,
            linked_booking_reference = CASE
              WHEN NOT candidates.anonymize_linked
                OR target.linked_booking_reference IS NULL
                OR target.linked_booking_reference ~ '^audit_[a-f0-9]{32}$'
                THEN target.linked_booking_reference
              ELSE 'audit_' || md5(target.linked_booking_reference)
            END,
            add_on_group_id = CASE
              WHEN NOT (candidates.anonymize_original AND candidates.anonymize_linked)
                OR target.add_on_group_id IS NULL
                OR target.add_on_group_id ~ '^audit_[a-f0-9]{32}$'
                THEN target.add_on_group_id
              ELSE 'audit_' || md5(target.add_on_group_id)
            END
        FROM candidates
        WHERE target.link_id = candidates.link_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "booking_seed_run_anonymize_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.booking_seed_runs AS seed_run
      WHERE COALESCE(seed_run.finished_at, seed_run.started_at) <= ${cutoff30Days}
        AND COALESCE(seed_run.finished_at, seed_run.started_at) > ${cutoff90Days}
        AND seed_run.error_summary IS NOT NULL`,
    mutateSql: `
      WITH candidates AS (
        SELECT seed_run.run_id
        FROM jumpyard.booking_seed_runs AS seed_run
        WHERE COALESCE(seed_run.finished_at, seed_run.started_at) <= ${cutoff30Days}
          AND COALESCE(seed_run.finished_at, seed_run.started_at) > ${cutoff90Days}
          AND seed_run.error_summary IS NOT NULL
        ORDER BY COALESCE(seed_run.finished_at, seed_run.started_at), seed_run.run_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.booking_seed_runs AS target
        SET error_summary = NULL
        FROM candidates
        WHERE target.run_id = candidates.run_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "roller_booking_ticket_delete_30d",
    candidateSql: `SELECT count(*)::bigint
      FROM jumpyard.roller_booking_tickets AS ticket
      INNER JOIN jumpyard.roller_bookings AS booking
        ON booking.roller_unique_id = ticket.roller_unique_id
      WHERE ${bookingIsLifecycleEligible("booking")}`,
    mutateSql: `
      WITH candidates AS (
        SELECT ticket.ticket_id
        FROM jumpyard.roller_booking_tickets AS ticket
        INNER JOIN jumpyard.roller_bookings AS booking
          ON booking.roller_unique_id = ticket.roller_unique_id
        WHERE ${bookingIsLifecycleEligible("booking")}
        ORDER BY booking.booking_date, ticket.ticket_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE OF ticket, booking SKIP LOCKED
      ), deleted AS (
        DELETE FROM jumpyard.roller_booking_tickets AS target
        USING candidates
        WHERE target.ticket_id = candidates.ticket_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM deleted`,
  },
  {
    name: "roller_booking_payment_delete_30d",
    candidateSql: `SELECT count(*)::bigint
      FROM jumpyard.roller_booking_payments AS payment
      INNER JOIN jumpyard.roller_bookings AS booking
        ON booking.roller_unique_id = payment.roller_unique_id
      WHERE ${bookingIsLifecycleEligible("booking")}`,
    mutateSql: `
      WITH candidates AS (
        SELECT payment.payment_key
        FROM jumpyard.roller_booking_payments AS payment
        INNER JOIN jumpyard.roller_bookings AS booking
          ON booking.roller_unique_id = payment.roller_unique_id
        WHERE ${bookingIsLifecycleEligible("booking")}
        ORDER BY booking.booking_date, payment.payment_key
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE OF payment, booking SKIP LOCKED
      ), deleted AS (
        DELETE FROM jumpyard.roller_booking_payments AS target
        USING candidates
        WHERE target.payment_key = candidates.payment_key
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM deleted`,
  },
  {
    name: "checkin_session_delete_30d",
    candidateSql: `SELECT count(*)::bigint
      FROM jumpyard.checkin_sessions AS checkin_session
      INNER JOIN jumpyard.roller_bookings AS booking
        ON booking.roller_unique_id = checkin_session.roller_unique_id
      WHERE ${bookingIsLifecycleEligible("booking")}`,
    mutateSql: `
      WITH candidates AS (
        SELECT checkin_session.checkin_session_id
        FROM jumpyard.checkin_sessions AS checkin_session
        INNER JOIN jumpyard.roller_bookings AS booking
          ON booking.roller_unique_id = checkin_session.roller_unique_id
        WHERE ${bookingIsLifecycleEligible("booking")}
        ORDER BY booking.booking_date, checkin_session.checkin_session_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE OF checkin_session, booking SKIP LOCKED
      ), deleted AS (
        DELETE FROM jumpyard.checkin_sessions AS target
        USING candidates
        WHERE target.checkin_session_id = candidates.checkin_session_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM deleted`,
  },
  {
    name: "roller_booking_item_delete_30d",
    candidateSql: `SELECT count(*)::bigint
      FROM jumpyard.roller_booking_items AS item
      INNER JOIN jumpyard.roller_bookings AS booking
        ON booking.roller_unique_id = item.roller_unique_id
      WHERE ${bookingIsLifecycleEligible("booking")}
        AND NOT EXISTS (
          SELECT 1
          FROM jumpyard.roller_booking_tickets AS ticket
          WHERE ticket.booking_item_key = item.booking_item_key
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT item.booking_item_key
        FROM jumpyard.roller_booking_items AS item
        INNER JOIN jumpyard.roller_bookings AS booking
          ON booking.roller_unique_id = item.roller_unique_id
        WHERE ${bookingIsLifecycleEligible("booking")}
          AND NOT EXISTS (
            SELECT 1
            FROM jumpyard.roller_booking_tickets AS ticket
            WHERE ticket.booking_item_key = item.booking_item_key
          )
        ORDER BY booking.booking_date, item.booking_item_key
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE OF item, booking SKIP LOCKED
      ), deleted AS (
        DELETE FROM jumpyard.roller_booking_items AS target
        USING candidates
        WHERE target.booking_item_key = candidates.booking_item_key
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM deleted`,
  },
  {
    name: "roller_booking_delete_30d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.roller_bookings AS booking
      WHERE ${bookingIsLifecycleEligible("booking")}
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.roller_booking_items AS item
          WHERE item.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.roller_booking_tickets AS ticket
          WHERE ticket.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.roller_booking_payments AS payment
          WHERE payment.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.checkin_sessions AS checkin_session
          WHERE checkin_session.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.checkin_tokens AS token
          WHERE token.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.handoff_sessions AS handoff
          WHERE handoff.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.checkin_attempts AS attempt
          WHERE attempt.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.sms_deliveries AS delivery
          WHERE delivery.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.email_deliveries AS delivery
          WHERE delivery.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.booking_links AS booking_link
          WHERE booking_link.original_roller_unique_id = booking.roller_unique_id
             OR booking_link.linked_roller_unique_id = booking.roller_unique_id
        )`,
    mutateSql: deleteBySingleKey(
      "jumpyard.roller_bookings",
      "booking",
      "roller_unique_id",
      `${bookingIsLifecycleEligible("booking")}
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.roller_booking_items AS item
          WHERE item.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.roller_booking_tickets AS ticket
          WHERE ticket.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.roller_booking_payments AS payment
          WHERE payment.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.checkin_sessions AS checkin_session
          WHERE checkin_session.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.checkin_tokens AS token
          WHERE token.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.handoff_sessions AS handoff
          WHERE handoff.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.checkin_attempts AS attempt
          WHERE attempt.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.sms_deliveries AS delivery
          WHERE delivery.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.email_deliveries AS delivery
          WHERE delivery.roller_unique_id = booking.roller_unique_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.booking_links AS booking_link
          WHERE booking_link.original_roller_unique_id = booking.roller_unique_id
             OR booking_link.linked_roller_unique_id = booking.roller_unique_id
        )`,
      "booking.booking_date",
    ),
  },
  {
    name: "staff_identity_anonymize_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.staff_identities AS identity
      WHERE identity.active = false
        AND identity.anonymized_at IS NULL
        AND identity.deactivated_at <= ${cutoff90Days}
        AND NOT EXISTS (
          SELECT 1 FROM jumpyard.staff_auth_sessions AS staff_session
          WHERE staff_session.staff_identity_id = identity.staff_identity_id
        )`,
    mutateSql: `
      WITH candidates AS (
        SELECT identity.staff_identity_id
        FROM jumpyard.staff_identities AS identity
        WHERE identity.active = false
          AND identity.anonymized_at IS NULL
          AND identity.deactivated_at <= ${cutoff90Days}
          AND NOT EXISTS (
            SELECT 1 FROM jumpyard.staff_auth_sessions AS staff_session
            WHERE staff_session.staff_identity_id = identity.staff_identity_id
          )
        ORDER BY identity.deactivated_at, identity.staff_identity_id
        LIMIT CAST(:batchSize AS integer)
        FOR UPDATE SKIP LOCKED
      ), anonymized AS (
        UPDATE jumpyard.staff_identities AS target
        SET provider_subject = 'anonymized:' || target.audit_subject_id,
            given_name = NULL,
            family_name = NULL,
            display_name = 'Former staff',
            pin_lookup_hash = NULL,
            pin_verifier = NULL,
            pin_changed_at = NULL,
            pin_pepper_version = NULL,
            pin_reenrollment_required_at = NULL,
            mfa_replacement_pending_at = NULL,
            mfa_replacement_email_hash = NULL,
            mfa_replacement_previous_subject = NULL,
            mfa_replacement_candidate_subject = NULL,
            mfa_replacement_reason = NULL,
            anonymized_at = ${reference},
            updated_at = ${reference}
        FROM candidates
        WHERE target.staff_identity_id = candidates.staff_identity_id
        RETURNING 1
      )
      SELECT count(*)::bigint AS affected_count FROM anonymized`,
  },
  {
    name: "checkin_attempt_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.checkin_attempts AS attempt
      WHERE attempt.created_at <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.checkin_attempts",
      "attempt",
      "attempt_id",
      `attempt.created_at <= ${cutoff90Days}`,
      "attempt.created_at",
    ),
  },
  {
    name: "sms_delivery_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.sms_deliveries AS delivery
      WHERE delivery.created_at <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.sms_deliveries",
      "delivery",
      "sms_delivery_id",
      `delivery.created_at <= ${cutoff90Days}`,
      "delivery.created_at",
    ),
  },
  {
    name: "email_delivery_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.email_deliveries AS delivery
      WHERE delivery.created_at <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.email_deliveries",
      "delivery",
      "email_delivery_id",
      `delivery.created_at <= ${cutoff90Days}`,
      "delivery.created_at",
    ),
  },
  {
    name: "webhook_event_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.roller_webhook_events AS webhook_event
      WHERE webhook_event.received_at <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.roller_webhook_events",
      "webhook_event",
      "event_id_or_hash",
      `webhook_event.received_at <= ${cutoff90Days}`,
      "webhook_event.received_at",
    ),
  },
  {
    name: "booking_seed_run_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.booking_seed_runs AS seed_run
      WHERE COALESCE(seed_run.finished_at, seed_run.started_at) <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.booking_seed_runs",
      "seed_run",
      "run_id",
      `COALESCE(seed_run.finished_at, seed_run.started_at) <= ${cutoff90Days}`,
      "COALESCE(seed_run.finished_at, seed_run.started_at)",
    ),
  },
  {
    name: "booking_link_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.booking_links AS booking_link
      WHERE booking_link.created_at <= ${cutoff90Days}
        AND NOT ${bookingLinkHasProtectedBooking(
          "booking_link",
          "original_roller_unique_id",
          "protected_original_booking",
        )}
        AND NOT ${bookingLinkHasProtectedBooking(
          "booking_link",
          "linked_roller_unique_id",
          "protected_linked_booking",
        )}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.booking_links",
      "booking_link",
      "link_id",
      `booking_link.created_at <= ${cutoff90Days}
        AND NOT ${bookingLinkHasProtectedBooking(
          "booking_link",
          "original_roller_unique_id",
          "protected_original_booking",
        )}
        AND NOT ${bookingLinkHasProtectedBooking(
          "booking_link",
          "linked_roller_unique_id",
          "protected_linked_booking",
        )}`,
      "booking_link.created_at",
    ),
  },
  {
    name: "event_log_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.event_log AS audit_event
      WHERE audit_event.created_at <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.event_log",
      "audit_event",
      "event_id",
      `audit_event.created_at <= ${cutoff90Days}`,
      "audit_event.created_at",
    ),
  },
  {
    name: "lifecycle_run_delete_90d",
    candidateSql: `SELECT count(*)::bigint FROM jumpyard.data_lifecycle_runs AS lifecycle_run
      WHERE lifecycle_run.status = 'completed'
        AND lifecycle_run.finished_at <= ${cutoff90Days}`,
    mutateSql: deleteBySingleKey(
      "jumpyard.data_lifecycle_runs",
      "lifecycle_run",
      "run_id",
      `lifecycle_run.status = 'completed'
        AND lifecycle_run.finished_at <= ${cutoff90Days}`,
      "lifecycle_run.finished_at",
    ),
  },
];

function countsQuery() {
  const rows = ACTION_SPECS.map(
    (action, index) => `SELECT ${index} AS ordinal, '${action.name}'::text AS action,
      (${action.candidateSql})::bigint AS eligible_count`,
  ).join("\nUNION ALL\n");
  return `SELECT action, eligible_count FROM (${rows}) AS lifecycle_counts ORDER BY ordinal`;
}

function policyDefinitionDigest(actionSpecs = ACTION_SPECS) {
  const canonical = JSON.stringify(
    actionSpecs.map(({ candidateSql, mutateSql, name }) => ({
      candidateSql,
      mutateSql,
      name,
    })),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function makePlan(
  counts,
  clusterIdentifier,
  clusterArn,
  environment,
  referenceAt,
  batchSize,
  maxMutations,
) {
  const actions = ACTION_SPECS.map(({ name }) => {
    const eligible = counts.get(name);
    if (eligible === undefined || !Number.isSafeInteger(eligible) || eligible < 0) {
      throw new Error(`Invalid lifecycle count for ${name}.`);
    }
    return { action: name, eligible, planned: Math.min(eligible, batchSize) };
  });
  const eligibleTotal = actions.reduce((total, action) => total + action.eligible, 0);
  const plannedTotal = actions.reduce((total, action) => total + action.planned, 0);
  const definitionDigest = policyDefinitionDigest();
  const canonical = JSON.stringify({
    actions: actions.map(({ action, eligible, planned }) => ({ action, eligible, planned })),
    batchSize,
    clusterArn,
    clusterIdentifier,
    environment,
    maxMutations,
    policyDefinitionDigest: definitionDigest,
    policyVersion: POLICY_VERSION,
    referenceAt,
  });
  return {
    actions,
    batchSize,
    clusterArn,
    clusterIdentifier,
    digest: createHash("sha256").update(canonical).digest("hex"),
    eligibleTotal,
    environment,
    maxMutations,
    plannedTotal,
    policyDefinitionDigest: definitionDigest,
    policyVersion: POLICY_VERSION,
    referenceAt,
  };
}

function countsObject(actions, key) {
  return JSON.stringify(
    Object.fromEntries(actions.map((action) => [action.action, action[key] ?? 0])),
  );
}

function affectedEvidence(actions) {
  const canonicalCounts = JSON.stringify(
    Object.fromEntries(
      [...actions]
        .sort((left, right) => {
          if (left.action < right.action) return -1;
          if (left.action > right.action) return 1;
          return 0;
        })
        .map((action) => [action.action, action.affected ?? 0]),
    ),
  );
  return {
    digest: createHash("sha256").update(canonicalCounts).digest("hex"),
    total: actions.reduce((total, action) => total + (action.affected ?? 0), 0),
  };
}

module.exports = {
  ACTION_SPECS,
  ADVISORY_LOCK_ID,
  DATABASE,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_MUTATIONS,
  LIFECYCLE_TABLES,
  MAX_BATCH_SIZE,
  MAX_DATA_API_SQL_BYTES,
  MAX_MUTATIONS_LIMIT,
  POLICY_VERSION,
  affectedEvidence,
  countsObject,
  countsQuery,
  makePlan,
  policyDefinitionDigest,
};
