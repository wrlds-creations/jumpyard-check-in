import assert from "assert/strict";
import { createHash, randomUUID } from "crypto";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  type Field,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { DescribeSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";

const DATABASE = "jumpyard_cloud";
const POLICY_VERSION = "t0195-v1";
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_MUTATIONS = 1000;
const MAX_BATCH_SIZE = 500;
const MAX_MUTATIONS_LIMIT = 5000;
const MAX_REFERENCE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_DATA_API_SQL_BYTES = 60 * 1024;
const APPLY_PHRASE = "I_UNDERSTAND_THIS_DELETES_OR_ANONYMIZES_DATA";
const KILL_SWITCH_RELEASE = "DISABLED_FOR_APPROVED_MAINTENANCE";
const ADVISORY_LOCK_ID = 1940195;
const PARK_TEST_ENVIRONMENT = "park-test";
const PARK_TEST_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const APPROVED_LIFECYCLE_SECRET_NAME = `/${PARK_TEST_RESOURCE_PREFIX}/aurora/lifecycle`;
const RESTORE_ENVIRONMENT = "park-test-restore-rehearsal";
const RESTORE_ACCOUNT = "376129878018";
const RESTORE_REGION = "eu-north-1";
const RESTORE_CLUSTER_PATTERN = /^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}-aurora$/;
const RESTORE_RESOURCE_PREFIX_PATTERN = /^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}$/;
const REQUIRED_COMMON_TAGS: Readonly<Record<string, string>> = {
  "WRLDS:Client": "JumpYard",
  "WRLDS:Project": "jumpyard-check-in",
  "WRLDS:Owner": "love",
  "WRLDS:Repository": "wrlds-creations/jumpyard-check-in",
  "WRLDS:ManagedBy": "cdk",
  "WRLDS:DataClassification": "confidential",
  "WRLDS:Exportable": "true",
  "WRLDS:CostCenter": "unassigned",
  "WRLDS:CreatedBy": "love",
};
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
] as const;

interface DeployConfig {
  awsAccount: string;
  awsRegion: string;
  environment: string;
  resourcePrefix: string;
}

interface LifecycleArgs {
  apply: boolean;
  batchSize: number;
  clusterArn?: string;
  clusterIdentifier?: string;
  configPath?: string;
  evidenceOut?: string;
  maxMutations: number;
  planDigest?: string;
  profile?: string;
  referenceAt?: string;
  secretId?: string;
  selfTestOnly: boolean;
}

interface LifecycleContext {
  clusterArn: string;
  clusterIdentifier: string;
  database: string;
  environment: string;
  rds: RDSDataClient;
  secretArn: string;
}

interface ActionSpec {
  candidateSql: string;
  mutateSql: string;
  name: string;
}

interface ActionCount {
  action: string;
  affected?: number;
  eligible: number;
  planned: number;
}

interface LifecyclePlan {
  actions: ActionCount[];
  batchSize: number;
  clusterArn: string;
  clusterIdentifier: string;
  digest: string;
  eligibleTotal: number;
  environment: string;
  maxMutations: number;
  plannedTotal: number;
  policyDefinitionDigest: string;
  policyVersion: string;
  referenceAt: string;
}

interface LifecycleApplyResult {
  actions: ActionCount[];
  affectedCountsDigest: string;
  affectedTotal: number;
  completedAt: string;
  runId: string;
}

interface ClusterTarget {
  arn: string;
  identifier: string;
  restoreRehearsal: boolean;
}

interface LifecycleEvidenceReceipt {
  action: "lifecycle-apply";
  affectedCountsDigest: string;
  affectedTotal: number;
  aggregateOnly: true;
  clusterArn: string;
  clusterIdentifier: string;
  completedAt: string;
  containsSensitiveData: false;
  environment: "park-test" | "park-test-restore-rehearsal";
  issue: 194;
  planDigest: string;
  policyDefinitionDigest: string;
  policyVersion: "t0195-v1";
  referenceAt: string;
  result: "succeeded";
  runId: string;
  schemaVersion: 1;
}

const reference = "CAST(:referenceAt AS timestamptz)";
const cutoff24Hours = `${reference} - interval '24 hours'`;
const cutoff30Days = `${reference} - interval '30 days'`;
const cutoff90Days = `${reference} - interval '90 days'`;

const bookingLifecycleAt = (alias: string): string => `(
  ${alias}.booking_date
  + COALESCE(${alias}.end_time, ${alias}.start_time, TIME '23:59:59')
) AT TIME ZONE 'Europe/Stockholm'`;

const bookingItemLifecycleAt = (alias: string): string => `(
  ${alias}.booking_date
  + COALESCE(${alias}.end_time, ${alias}.start_time, TIME '23:59:59')
) AT TIME ZONE 'Europe/Stockholm'`;

const datedDayLifecycleAt = (alias: string, column: string): string => `(
  ${alias}.${column} + TIME '23:59:59'
) AT TIME ZONE 'Europe/Stockholm'`;

const bookingIsLifecycleEligible = (alias: string): string => `
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
  linkAlias: string,
  rollerUniqueIdColumn: string,
  bookingAlias: string,
): string => `(
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
  linkAlias: string,
  rollerUniqueIdColumn: string,
  bookingReferenceColumn: string,
): string => `(
  ${linkAlias}.${rollerUniqueIdColumn} !~ '^audit_[a-f0-9]{32}$'
  OR (
    ${linkAlias}.${bookingReferenceColumn} IS NOT NULL
    AND ${linkAlias}.${bookingReferenceColumn} !~ '^audit_[a-f0-9]{32}$'
  )
)`;

const bookingLinkHasProtectedBooking = (
  linkAlias: string,
  rollerUniqueIdColumn: string,
  bookingAlias: string,
): string => `EXISTS (
  SELECT 1
  FROM jumpyard.roller_bookings AS ${bookingAlias}
  WHERE ${bookingAlias}.roller_unique_id = ${linkAlias}.${rollerUniqueIdColumn}
    AND NOT (${bookingIsLifecycleEligible(bookingAlias)})
)`;

function deleteBySingleKey(
  table: string,
  alias: string,
  key: string,
  predicate: string,
  orderBy: string,
): string {
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

const draftLifecycleAt = (alias: string): string => `GREATEST(
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

const ACTION_SPECS: ActionSpec[] = [
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

function positiveInteger(value: string | undefined, name: string, maximum: number): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): LifecycleArgs {
  let apply = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let clusterArn: string | undefined;
  let clusterIdentifier: string | undefined;
  let configPath: string | undefined;
  let evidenceOut: string | undefined;
  let maxMutations = DEFAULT_MAX_MUTATIONS;
  let planDigest: string | undefined;
  let profile: string | undefined;
  let referenceAt: string | undefined;
  let secretId: string | undefined;
  let selfTestOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--batch-size") {
      batchSize = positiveInteger(next, "--batch-size", MAX_BATCH_SIZE);
      index += 1;
    } else if (arg === "--cluster-arn") {
      clusterArn = next;
      index += 1;
    } else if (arg === "--cluster-identifier") {
      clusterIdentifier = next;
      index += 1;
    } else if (arg === "--config") {
      configPath = next;
      index += 1;
    } else if (arg === "--evidence-out") {
      evidenceOut = next;
      index += 1;
    } else if (arg === "--max-mutations") {
      maxMutations = positiveInteger(next, "--max-mutations", MAX_MUTATIONS_LIMIT);
      index += 1;
    } else if (arg === "--plan-digest") {
      planDigest = next;
      index += 1;
    } else if (arg === "--profile") {
      profile = next;
      index += 1;
    } else if (arg === "--reference-at") {
      referenceAt = next;
      index += 1;
    } else if (arg === "--secret-id") {
      secretId = next;
      index += 1;
    } else if (arg === "--self-test") {
      selfTestOnly = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!selfTestOnly && (!configPath || !referenceAt)) {
    throw new Error("--config and --reference-at are required for a lifecycle plan.");
  }
  if (planDigest && !/^[a-f0-9]{64}$/.test(planDigest)) {
    throw new Error("--plan-digest must be a lowercase SHA-256 digest.");
  }
  if (clusterArn && clusterIdentifier) {
    throw new Error("Use only one of --cluster-arn or --cluster-identifier.");
  }
  if (apply && !planDigest) {
    throw new Error("Apply requires --plan-digest from a prior dry-run.");
  }
  if (evidenceOut && !apply) {
    throw new Error("--evidence-out is valid only with --apply.");
  }
  if (apply && !evidenceOut) {
    throw new Error("Lifecycle apply requires --evidence-out for an aggregate post-commit receipt.");
  }

  return {
    apply,
    batchSize,
    clusterArn,
    clusterIdentifier,
    configPath,
    evidenceOut,
    maxMutations,
    planDigest,
    profile,
    referenceAt,
    secretId,
    selfTestOnly,
  };
}

function normalizeReferenceAt(value: string, nowMs = Date.now()): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("--reference-at must include an explicit UTC offset or Z suffix.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("--reference-at is not a valid timestamp.");
  }
  if (parsed.getTime() > nowMs + MAX_REFERENCE_CLOCK_SKEW_MS) {
    throw new Error("--reference-at cannot be more than five minutes in the future.");
  }
  return parsed.toISOString();
}

function readDeployConfig(configPath: string): DeployConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file does not exist: ${resolvedPath}`);
  }
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as {
    awsAccount?: string;
    awsRegion?: string;
    resourcePrefix?: string;
    tags?: Record<string, string>;
  };
  const environment = parsed.tags?.["WRLDS:Environment"];
  if (
    typeof parsed.awsAccount !== "string"
    || !/^\d{12}$/.test(parsed.awsAccount)
    || typeof parsed.awsRegion !== "string"
    || !/^[a-z0-9-]+$/.test(parsed.awsRegion)
    || typeof parsed.resourcePrefix !== "string"
    || !/^[A-Za-z][A-Za-z0-9-]{0,55}$/.test(parsed.resourcePrefix)
    || typeof environment !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(environment)
  ) {
    throw new Error(
      "Config must include safe awsAccount, awsRegion, resourcePrefix, and WRLDS:Environment values.",
    );
  }
  for (const [key, expected] of Object.entries(REQUIRED_COMMON_TAGS)) {
    if (parsed.tags?.[key] !== expected) {
      throw new Error("Config WRLDS ownership, repository, management, and data tags must match the approved contract.");
    }
  }
  return {
    awsAccount: parsed.awsAccount,
    awsRegion: parsed.awsRegion,
    environment,
    resourcePrefix: parsed.resourcePrefix,
  };
}

function resolveClusterTarget(config: DeployConfig, args: LifecycleArgs): ClusterTarget {
  const hasExplicitTarget = Boolean(args.clusterArn || args.clusterIdentifier);
  if (config.environment !== RESTORE_ENVIRONMENT) {
    if (
      config.environment !== PARK_TEST_ENVIRONMENT
      || config.awsAccount !== RESTORE_ACCOUNT
      || config.awsRegion !== RESTORE_REGION
      || config.resourcePrefix !== PARK_TEST_RESOURCE_PREFIX
    ) {
      throw new Error(
        "Lifecycle runs are allowlisted only for the approved park-test target or isolated restore rehearsal.",
      );
    }
    if (hasExplicitTarget) {
      throw new Error(
        "Explicit lifecycle cluster targets are allowed only for park-test-restore-rehearsal.",
      );
    }
    const identifier = `${config.resourcePrefix}-aurora`;
    return {
      arn: `arn:aws:rds:${config.awsRegion}:${config.awsAccount}:cluster:${identifier}`,
      identifier,
      restoreRehearsal: false,
    };
  }

  if (config.awsAccount !== RESTORE_ACCOUNT || config.awsRegion !== RESTORE_REGION) {
    throw new Error("Restore-rehearsal lifecycle target must use the approved park-test account and region.");
  }
  if (!RESTORE_RESOURCE_PREFIX_PATTERN.test(config.resourcePrefix)) {
    throw new Error("Restore-rehearsal resource prefix does not match the isolated restore naming contract.");
  }
  if (!hasExplicitTarget) {
    throw new Error(
      "Restore-rehearsal lifecycle runs require --cluster-identifier or --cluster-arn; no source fallback is allowed.",
    );
  }

  const arnPrefix = `arn:aws:rds:${RESTORE_REGION}:${RESTORE_ACCOUNT}:cluster:`;
  let identifier = args.clusterIdentifier;
  if (args.clusterArn) {
    if (!args.clusterArn.startsWith(arnPrefix)) {
      throw new Error("Restore-rehearsal cluster ARN does not match the approved account and region.");
    }
    identifier = args.clusterArn.slice(arnPrefix.length);
  }
  if (!identifier || !RESTORE_CLUSTER_PATTERN.test(identifier)) {
    throw new Error("Restore-rehearsal cluster identifier does not match the isolated restore naming contract.");
  }
  if (identifier !== `${config.resourcePrefix}-aurora`) {
    throw new Error("Restore-rehearsal cluster identifier must match the reviewed restore config prefix.");
  }

  return {
    arn: `${arnPrefix}${identifier}`,
    identifier,
    restoreRehearsal: true,
  };
}

function validateEvidencePath(value: string | undefined, environment: string): string | undefined {
  if (!value) return undefined;
  if (environment !== PARK_TEST_ENVIRONMENT && environment !== RESTORE_ENVIRONMENT) {
    throw new Error("Lifecycle evidence receipts are limited to approved park-test targets.");
  }
  if (!path.isAbsolute(value) || path.extname(value).toLowerCase() !== ".json") {
    throw new Error("--evidence-out must be an absolute .json path.");
  }
  const resolved = path.resolve(value);
  if (!existsSync(path.dirname(resolved))) {
    throw new Error("The lifecycle evidence output directory does not exist.");
  }
  if (existsSync(resolved)) {
    throw new Error("Lifecycle evidence output already exists; overwrite is forbidden.");
  }
  return resolved;
}

function createEvidenceReceipt(
  plan: LifecyclePlan,
  result: LifecycleApplyResult,
): LifecycleEvidenceReceipt {
  if (plan.environment !== PARK_TEST_ENVIRONMENT && plan.environment !== RESTORE_ENVIRONMENT) {
    throw new Error("Lifecycle evidence receipt environment is outside the approved allowlist.");
  }
  return {
    schemaVersion: 1,
    issue: 194,
    action: "lifecycle-apply",
    result: "succeeded",
    runId: result.runId,
    planDigest: plan.digest,
    referenceAt: plan.referenceAt,
    clusterArn: plan.clusterArn,
    clusterIdentifier: plan.clusterIdentifier,
    environment: plan.environment,
    policyDefinitionDigest: plan.policyDefinitionDigest,
    policyVersion: POLICY_VERSION,
    completedAt: result.completedAt,
    affectedTotal: result.affectedTotal,
    affectedCountsDigest: result.affectedCountsDigest,
    aggregateOnly: true,
    containsSensitiveData: false,
  };
}

function writeEvidenceReceiptAtomically(
  outputPath: string,
  receipt: LifecycleEvidenceReceipt,
): void {
  if (existsSync(outputPath)) {
    throw new Error("Lifecycle evidence output already exists; overwrite is forbidden.");
  }
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  try {
    linkSync(temporaryPath, outputPath);
  } catch (error) {
    unlinkSync(temporaryPath);
    throw error;
  }
  unlinkSync(temporaryPath);
}

function sqlParameters(referenceAt: string, batchSize?: number): SqlParameter[] {
  const parameters: SqlParameter[] = [
    { name: "referenceAt", value: { stringValue: referenceAt } },
  ];
  if (batchSize !== undefined) {
    parameters.push({ name: "batchSize", value: { longValue: batchSize } });
  }
  return parameters;
}

async function execute(
  context: LifecycleContext,
  sql: string,
  parameters: SqlParameter[],
  transactionId?: string,
): Promise<Field[][]> {
  const response = await context.rds.send(
    new ExecuteStatementCommand({
      database: context.database,
      parameters,
      resourceArn: context.clusterArn,
      secretArn: context.secretArn,
      sql,
      transactionId,
    }),
  );
  return response.records ?? [];
}

function fieldString(field: Field | undefined): string {
  if (field?.stringValue !== undefined) return field.stringValue;
  throw new Error("Database result did not contain the expected string field.");
}

function fieldNumber(field: Field | undefined): number {
  if (field?.longValue !== undefined) return field.longValue;
  if (field?.stringValue !== undefined && /^\d+$/.test(field.stringValue)) {
    return Number(field.stringValue);
  }
  throw new Error("Database result did not contain the expected aggregate count.");
}

function countsQuery(): string {
  const rows = ACTION_SPECS.map(
    (action, index) => `SELECT ${index} AS ordinal, '${action.name}'::text AS action,
      (${action.candidateSql})::bigint AS eligible_count`,
  ).join("\nUNION ALL\n");
  return `SELECT action, eligible_count FROM (${rows}) AS lifecycle_counts ORDER BY ordinal`;
}

async function loadEligibleCounts(
  context: LifecycleContext,
  referenceAt: string,
  transactionId?: string,
): Promise<Map<string, number>> {
  const records = await execute(
    context,
    countsQuery(),
    sqlParameters(referenceAt),
    transactionId,
  );
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(fieldString(record[0]), fieldNumber(record[1]));
  }
  if (counts.size !== ACTION_SPECS.length) {
    throw new Error("Lifecycle count query returned an incomplete action set.");
  }
  return counts;
}

function policyDefinitionDigest(actionSpecs: readonly ActionSpec[] = ACTION_SPECS): string {
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
  counts: Map<string, number>,
  clusterIdentifier: string,
  clusterArn: string,
  environment: string,
  referenceAt: string,
  batchSize: number,
  maxMutations: number,
): LifecyclePlan {
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

function countsObject(actions: ActionCount[], key: "affected" | "eligible" | "planned"): string {
  return JSON.stringify(
    Object.fromEntries(actions.map((action) => [action.action, action[key] ?? 0])),
  );
}

function affectedEvidence(actions: ActionCount[]): { digest: string; total: number } {
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

function printPlan(plan: LifecyclePlan, mode: "apply" | "dry-run"): void {
  console.log(
    JSON.stringify(
      {
        actions: plan.actions,
        clusterArn: plan.clusterArn,
        clusterIdentifier: plan.clusterIdentifier,
        environment: plan.environment,
        guard: {
          maxMutations: plan.maxMutations,
          state: plan.plannedTotal <= plan.maxMutations ? "within_limit" : "blocked",
        },
        mode,
        planDigest: plan.digest,
        policyDefinitionDigest: plan.policyDefinitionDigest,
        policyVersion: plan.policyVersion,
        referenceAt: plan.referenceAt,
        totals: {
          eligible: plan.eligibleTotal,
          planned: plan.plannedTotal,
        },
      },
      null,
      2,
    ),
  );
}

function verifyApplyGates(args: LifecycleArgs, config: DeployConfig, plan: LifecyclePlan): void {
  if (process.env.DATA_LIFECYCLE_KILL_SWITCH !== KILL_SWITCH_RELEASE) {
    throw new Error("Lifecycle apply is blocked by the kill switch.");
  }
  if (process.env.DATA_LIFECYCLE_ALLOW_APPLY !== APPLY_PHRASE) {
    throw new Error("Lifecycle apply approval phrase is missing or invalid.");
  }
  if (process.env.DATA_LIFECYCLE_APPLY_ENVIRONMENT !== config.environment) {
    throw new Error("Lifecycle apply environment confirmation does not match the config.");
  }
  if (args.planDigest !== plan.digest) {
    throw new Error("Lifecycle plan changed since dry-run; run dry-run again and review the new digest.");
  }
  if (plan.plannedTotal > plan.maxMutations) {
    throw new Error("Lifecycle plan exceeds --max-mutations; no mutations were attempted.");
  }
}

function isApprovedLifecycleSecretId(value: string): boolean {
  if (value === APPROVED_LIFECYCLE_SECRET_NAME) return true;
  const approvedArnPrefix =
    `arn:aws:secretsmanager:${RESTORE_REGION}:${RESTORE_ACCOUNT}:secret:`
    + `${APPROVED_LIFECYCLE_SECRET_NAME}-`;
  if (!value.startsWith(approvedArnPrefix)) return false;
  return /^[A-Za-z0-9_-]{6}$/.test(value.slice(approvedArnPrefix.length));
}

async function resolveSecretArn(
  config: DeployConfig,
  secretId: string,
  profile?: string,
): Promise<string> {
  const client = new SecretsManagerClient({
    credentials: profile ? fromIni({ profile }) : undefined,
    region: config.awsRegion,
  });
  const response = await client.send(new DescribeSecretCommand({ SecretId: secretId }));
  if (!response.ARN) {
    throw new Error("Could not resolve the lifecycle database secret.");
  }
  if (
    response.Name !== APPROVED_LIFECYCLE_SECRET_NAME
    || !isApprovedLifecycleSecretId(response.ARN)
  ) {
    throw new Error("Lifecycle database secret is not the dedicated approved lifecycle identity.");
  }
  return response.ARN;
}

async function acquireApplyLock(
  context: LifecycleContext,
  transactionId: string,
): Promise<void> {
  const records = await execute(
    context,
    `SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
    [],
    transactionId,
  );
  if (records[0]?.[0]?.booleanValue !== true) {
    throw new Error("Another lifecycle apply holds the database lock.");
  }
}

async function configureApplyTransaction(
  context: LifecycleContext,
  transactionId: string,
): Promise<void> {
  await execute(
    context,
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ WRITE",
    [],
    transactionId,
  );
}

async function acquireMaintenanceTableLocks(
  context: LifecycleContext,
  transactionId: string,
): Promise<void> {
  await execute(
    context,
    `LOCK TABLE ${LIFECYCLE_TABLES.join(", ")} IN SHARE ROW EXCLUSIVE MODE NOWAIT`,
    [],
    transactionId,
  );
}

async function recordRunStart(
  context: LifecycleContext,
  transactionId: string,
  runId: string,
  plan: LifecyclePlan,
): Promise<void> {
  await execute(
    context,
    `INSERT INTO jumpyard.data_lifecycle_runs (
       run_id, policy_version, environment, cluster_identifier, cluster_arn, reference_at, status,
       batch_size, max_mutations, plan_digest, policy_definition_digest, eligible_counts, planned_counts
     ) VALUES (
       :runId, :policyVersion, :environment, :clusterIdentifier, :clusterArn,
       CAST(:referenceAt AS timestamptz), 'applying', :batchSize, :maxMutations, :planDigest,
       :policyDefinitionDigest, CAST(:eligibleCounts AS jsonb), CAST(:plannedCounts AS jsonb)
     )`,
    [
      { name: "runId", value: { stringValue: runId } },
      { name: "policyVersion", value: { stringValue: POLICY_VERSION } },
      { name: "environment", value: { stringValue: plan.environment } },
      { name: "clusterIdentifier", value: { stringValue: plan.clusterIdentifier } },
      { name: "clusterArn", value: { stringValue: plan.clusterArn } },
      { name: "referenceAt", value: { stringValue: plan.referenceAt } },
      { name: "batchSize", value: { longValue: plan.batchSize } },
      { name: "maxMutations", value: { longValue: plan.maxMutations } },
      { name: "planDigest", value: { stringValue: plan.digest } },
      { name: "policyDefinitionDigest", value: { stringValue: plan.policyDefinitionDigest } },
      { name: "eligibleCounts", value: { stringValue: countsObject(plan.actions, "eligible") } },
      { name: "plannedCounts", value: { stringValue: countsObject(plan.actions, "planned") } },
    ],
    transactionId,
  );
}

async function recordRunComplete(
  context: LifecycleContext,
  transactionId: string,
  runId: string,
  actions: ActionCount[],
  affectedTotal: number,
  affectedCountsDigest: string,
  completedAt: string,
): Promise<void> {
  const records = await execute(
    context,
    `UPDATE jumpyard.data_lifecycle_runs
     SET status = 'completed',
         affected_counts = CAST(:affectedCounts AS jsonb),
         affected_total = :affectedTotal,
         affected_counts_digest = :affectedCountsDigest,
         finished_at = CAST(:completedAt AS timestamptz)
     WHERE run_id = :runId
       AND status = 'applying'
     RETURNING run_id`,
    [
      { name: "affectedCounts", value: { stringValue: countsObject(actions, "affected") } },
      { name: "affectedTotal", value: { longValue: affectedTotal } },
      { name: "affectedCountsDigest", value: { stringValue: affectedCountsDigest } },
      { name: "completedAt", value: { stringValue: completedAt } },
      { name: "runId", value: { stringValue: runId } },
    ],
    transactionId,
  );
  if (records.length !== 1 || fieldString(records[0]?.[0]) !== runId) {
    throw new Error("Lifecycle run completion could not be correlated to its applying run.");
  }
}

async function applyPlan(
  context: LifecycleContext,
  reviewedPlan: LifecyclePlan,
): Promise<LifecycleApplyResult> {
  const begin = await context.rds.send(
    new BeginTransactionCommand({
      database: context.database,
      resourceArn: context.clusterArn,
      secretArn: context.secretArn,
    }),
  );
  if (!begin.transactionId) {
    throw new Error("Could not start lifecycle transaction.");
  }
  const transactionId = begin.transactionId;
  const runId = `jylc_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  try {
    await configureApplyTransaction(context, transactionId);
    await acquireApplyLock(context, transactionId);
    await acquireMaintenanceTableLocks(context, transactionId);
    const lockedCounts = await loadEligibleCounts(
      context,
      reviewedPlan.referenceAt,
      transactionId,
    );
    const plan = makePlan(
      lockedCounts,
      context.clusterIdentifier,
      context.clusterArn,
      context.environment,
      reviewedPlan.referenceAt,
      reviewedPlan.batchSize,
      reviewedPlan.maxMutations,
    );
    if (plan.digest !== reviewedPlan.digest) {
      throw new Error(
        "Lifecycle plan changed after the apply lock was acquired; transaction will roll back.",
      );
    }
    await recordRunStart(context, transactionId, runId, plan);
    const applied: ActionCount[] = [];
    for (const spec of ACTION_SPECS) {
      const source = plan.actions.find((action) => action.action === spec.name);
      if (!source) throw new Error(`Missing lifecycle plan action: ${spec.name}`);
      if (source.planned === 0) {
        applied.push({ ...source, affected: 0 });
        continue;
      }
      const records = await execute(
        context,
        spec.mutateSql,
        sqlParameters(plan.referenceAt, source.planned),
        transactionId,
      );
      const affected = fieldNumber(records[0]?.[0]);
      if (affected > source.planned) {
        throw new Error(`Lifecycle action ${spec.name} exceeded its reviewed batch.`);
      }
      applied.push({ ...source, affected });
    }
    const affected = affectedEvidence(applied);
    if (affected.total > plan.maxMutations) {
      throw new Error("Lifecycle mutations exceeded the maximum guard; transaction will roll back.");
    }
    const completedAt = new Date().toISOString();
    await recordRunComplete(
      context,
      transactionId,
      runId,
      applied,
      affected.total,
      affected.digest,
      completedAt,
    );
    await context.rds.send(
      new CommitTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );
    return {
      actions: applied,
      affectedCountsDigest: affected.digest,
      affectedTotal: affected.total,
      completedAt,
      runId,
    };
  } catch (error) {
    await context.rds.send(
      new RollbackTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );
    throw error;
  }
}

function elapsedHours(earlier: string, later: string): number {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / 3_600_000;
}

function elapsedDays(earlier: string, later: string): number {
  return elapsedHours(earlier, later) / 24;
}

function syntheticSelfTest(): void {
  const now = "2026-07-14T12:00:00.000Z";
  const nowMs = new Date(now).getTime();
  assert.equal(normalizeReferenceAt(now, nowMs), now);
  assert.equal(
    normalizeReferenceAt("2026-07-14T12:04:59.000Z", nowMs),
    "2026-07-14T12:04:59.000Z",
  );
  assert.throws(
    () => normalizeReferenceAt("2026-07-14T12:05:01.000Z", nowMs),
    /more than five minutes in the future/,
  );
  assert.throws(
    () => parseArgs([
      "--config",
      "synthetic.json",
      "--reference-at",
      now,
      "--apply",
      "--plan-digest",
      "a".repeat(64),
    ]),
    /apply requires --evidence-out/,
  );
  const approvedLifecycleSecretArn =
    `arn:aws:secretsmanager:${RESTORE_REGION}:${RESTORE_ACCOUNT}:secret:`
    + `${APPROVED_LIFECYCLE_SECRET_NAME}-Ab12_z`;
  assert.equal(isApprovedLifecycleSecretId(APPROVED_LIFECYCLE_SECRET_NAME), true);
  assert.equal(isApprovedLifecycleSecretId(approvedLifecycleSecretArn), true);
  assert.equal(
    isApprovedLifecycleSecretId(`/${PARK_TEST_RESOURCE_PREFIX}/aurora/runtime/session`),
    false,
  );
  assert.equal(isApprovedLifecycleSecretId(`/${PARK_TEST_RESOURCE_PREFIX}/aurora/admin`), false);
  assert.equal(
    isApprovedLifecycleSecretId(approvedLifecycleSecretArn.replace(RESTORE_ACCOUNT, "000000000000")),
    false,
  );
  const expiredAt25Hours = "2026-07-13T11:00:00.000Z";
  const expiredAt23Hours = "2026-07-13T13:00:00.000Z";
  assert.equal(elapsedHours(expiredAt25Hours, now) >= 24, true);
  assert.equal(elapsedHours(expiredAt23Hours, now) >= 24, false);

  const visit31DaysAgo = "2026-06-13T12:00:00.000Z";
  const visit29DaysAgo = "2026-06-15T12:00:00.000Z";
  assert.equal(elapsedDays(visit31DaysAgo, now) >= 30, true);
  assert.equal(elapsedDays(visit29DaysAgo, now) >= 30, false);

  const audit91DaysAgo = "2026-04-14T12:00:00.000Z";
  const audit89DaysAgo = "2026-04-16T12:00:00.000Z";
  assert.equal(elapsedDays(audit91DaysAgo, now) >= 90, true);
  assert.equal(elapsedDays(audit89DaysAgo, now) >= 90, false);

  const oldBooking = {
    activeSession: false,
    futureChild: false,
    futureVisit: false,
    knownVisit: true,
    ageDays: 31,
  };
  const protectedBySession = {
    activeSession: true,
    futureChild: false,
    futureVisit: false,
    knownVisit: true,
    ageDays: 31,
  };
  const protectedFuture = {
    activeSession: false,
    futureChild: false,
    futureVisit: true,
    knownVisit: true,
    ageDays: -10,
  };
  const protectedUnknownVisit = {
    activeSession: false,
    futureChild: false,
    futureVisit: false,
    knownVisit: false,
    ageDays: 31,
  };
  const protectedFutureChild = {
    activeSession: false,
    futureChild: true,
    futureVisit: false,
    knownVisit: true,
    ageDays: 31,
  };
  const eligibleBooking = (booking: typeof oldBooking): boolean =>
    booking.knownVisit
    && booking.ageDays >= 30
    && !booking.activeSession
    && !booking.futureChild
    && !booking.futureVisit;
  assert.equal(eligibleBooking(oldBooking), true);
  assert.equal(eligibleBooking(protectedBySession), false);
  assert.equal(eligibleBooking(protectedFuture), false);
  assert.equal(eligibleBooking(protectedUnknownVisit), false);
  assert.equal(eligibleBooking(protectedFutureChild), false);

  const bookingLinkSideCanBeAnonymized = (
    bookingExists: boolean,
    bookingEligible: boolean,
    linkAgeDays: number,
  ): boolean => bookingExists ? bookingEligible : linkAgeDays >= 30;
  assert.equal(bookingLinkSideCanBeAnonymized(true, true, 31), true);
  assert.equal(bookingLinkSideCanBeAnonymized(true, false, 100), false);
  assert.equal(bookingLinkSideCanBeAnonymized(false, false, 29), false);
  assert.equal(bookingLinkSideCanBeAnonymized(false, false, 30), true);

  type SyntheticKind =
    | "audit"
    | "booking"
    | "booking_link"
    | "delivery"
    | "draft"
    | "idempotency"
    | "limiter"
    | "seed_run"
    | "staff_identity"
    | "staff_session"
    | "token";
  interface SyntheticRow {
    active?: boolean;
    ageHours: number;
    anonymized?: boolean;
    errorSummary?: boolean;
    future?: boolean;
    id: string;
    kind: SyntheticKind;
    pii?: boolean;
  }
  const applySyntheticLifecycle = (rows: SyntheticRow[]): SyntheticRow[] =>
    rows
      .filter((row) => {
        if (["token", "idempotency", "staff_session", "limiter"].includes(row.kind)) {
          return row.active === true || row.ageHours < 24;
        }
        if (row.kind === "booking") {
          return row.active === true || row.future === true || row.ageHours < 30 * 24;
        }
        if (row.kind === "booking_link") {
          return row.future === true || row.ageHours < 90 * 24;
        }
        if (["draft", "audit", "delivery", "seed_run"].includes(row.kind)) {
          return row.ageHours < 90 * 24;
        }
        return true;
      })
      .map((row) => {
        if (row.kind === "draft" && row.ageHours >= 30 * 24) {
          return { ...row, anonymized: true, pii: false };
        }
        if (
          ["audit", "booking_link", "delivery", "seed_run"].includes(row.kind)
          && row.ageHours >= 30 * 24
          && row.future !== true
        ) {
          return { ...row, anonymized: true, errorSummary: false, pii: false };
        }
        if (
          row.kind === "staff_identity"
          && row.active === false
          && row.ageHours >= 90 * 24
        ) {
          return { ...row, anonymized: true, pii: false };
        }
        return { ...row };
      });

  const syntheticRows: SyntheticRow[] = [
    { ageHours: 25, id: "expired-token", kind: "token" },
    { ageHours: 23, id: "live-token", kind: "token" },
    { ageHours: 25, id: "expired-idempotency", kind: "idempotency" },
    { active: true, ageHours: 25, id: "live-idempotency", kind: "idempotency" },
    { ageHours: 25, id: "expired-staff-session", kind: "staff_session" },
    { active: true, ageHours: 25, id: "active-staff-session", kind: "staff_session" },
    { ageHours: 25, id: "expired-limiter", kind: "limiter" },
    { active: true, ageHours: 25, id: "blocked-limiter", kind: "limiter" },
    { ageHours: 31 * 24, id: "old-booking", kind: "booking", pii: true },
    { active: true, ageHours: 31 * 24, id: "active-booking", kind: "booking", pii: true },
    { ageHours: 0, future: true, id: "future-booking", kind: "booking", pii: true },
    { ageHours: 31 * 24, id: "old-draft", kind: "draft", pii: true },
    { ageHours: 91 * 24, id: "expired-draft", kind: "draft", pii: true },
    { ageHours: 89 * 24, id: "recent-audit", kind: "audit", pii: true },
    { ageHours: 91 * 24, id: "expired-audit", kind: "audit" },
    { ageHours: 31 * 24, id: "old-booking-link", kind: "booking_link", pii: true },
    {
      ageHours: 100 * 24,
      future: true,
      id: "future-booking-link",
      kind: "booking_link",
      pii: true,
    },
    { ageHours: 31 * 24, errorSummary: true, id: "old-delivery", kind: "delivery" },
    { ageHours: 31 * 24, errorSummary: true, id: "old-seed-run", kind: "seed_run" },
    {
      active: false,
      ageHours: 91 * 24,
      id: "deactivated-staff",
      kind: "staff_identity",
      pii: true,
    },
    {
      active: true,
      ageHours: 91 * 24,
      id: "active-staff",
      kind: "staff_identity",
      pii: true,
    },
  ];
  const firstSyntheticApply = applySyntheticLifecycle(syntheticRows);
  const secondSyntheticApply = applySyntheticLifecycle(firstSyntheticApply);
  const byId = new Map(firstSyntheticApply.map((row) => [row.id, row]));
  for (const removedId of [
    "expired-token",
    "expired-idempotency",
    "expired-staff-session",
    "expired-limiter",
    "old-booking",
    "expired-draft",
    "expired-audit",
  ]) {
    assert.equal(byId.has(removedId), false, `${removedId} should be removed`);
  }
  for (const protectedId of [
    "live-token",
    "live-idempotency",
    "active-staff-session",
    "blocked-limiter",
    "active-booking",
    "future-booking",
    "future-booking-link",
    "recent-audit",
    "active-staff",
  ]) {
    assert.equal(byId.has(protectedId), true, `${protectedId} should survive`);
  }
  assert.equal(byId.get("old-draft")?.pii, false);
  assert.equal(byId.get("old-draft")?.anonymized, true);
  assert.equal(byId.get("deactivated-staff")?.pii, false);
  assert.equal(byId.get("deactivated-staff")?.anonymized, true);
  assert.equal(byId.get("recent-audit")?.pii, false);
  assert.equal(byId.get("recent-audit")?.anonymized, true);
  assert.equal(byId.get("old-booking-link")?.pii, false);
  assert.equal(byId.get("old-booking-link")?.anonymized, true);
  assert.equal(byId.get("future-booking-link")?.pii, true);
  assert.notEqual(byId.get("future-booking-link")?.anonymized, true);
  assert.equal(byId.get("old-delivery")?.errorSummary, false);
  assert.equal(byId.get("old-seed-run")?.errorSummary, false);
  assert.deepEqual(secondSyntheticApply, firstSyntheticApply);

  const counts = new Map(ACTION_SPECS.map(({ name }) => [name, 2]));
  const syntheticClusterArn =
    "arn:aws:rds:eu-north-1:376129878018:cluster:synthetic-cluster";
  const firstPlan = makePlan(
    counts,
    "synthetic-cluster",
    syntheticClusterArn,
    "synthetic",
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  const secondPlan = makePlan(
    counts,
    "synthetic-cluster",
    syntheticClusterArn,
    "synthetic",
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  assert.equal(firstPlan.digest, secondPlan.digest);
  assert.equal(firstPlan.policyDefinitionDigest, policyDefinitionDigest());
  assert.notEqual(
    firstPlan.policyDefinitionDigest,
    policyDefinitionDigest([
      { ...ACTION_SPECS[0], candidateSql: `${ACTION_SPECS[0].candidateSql} AND false` },
      ...ACTION_SPECS.slice(1),
    ]),
  );
  assert.notEqual(
    firstPlan.digest,
    makePlan(
      counts,
      "different-cluster",
      "arn:aws:rds:eu-north-1:376129878018:cluster:different-cluster",
      "synthetic",
      now,
      1,
      MAX_MUTATIONS_LIMIT,
    ).digest,
  );
  assert.notEqual(
    firstPlan.digest,
    makePlan(
      counts,
      "synthetic-cluster",
      "arn:aws:rds:eu-west-1:376129878018:cluster:synthetic-cluster",
      "synthetic",
      now,
      1,
      MAX_MUTATIONS_LIMIT,
    ).digest,
  );
  assert.equal(firstPlan.actions.every((action) => action.planned === 1), true);
  assert.equal(firstPlan.plannedTotal, ACTION_SPECS.length);

  const baseArgs: LifecycleArgs = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    configPath: "synthetic.json",
    maxMutations: DEFAULT_MAX_MUTATIONS,
    referenceAt: now,
    selfTestOnly: false,
  };
  const normalConfig: DeployConfig = {
    awsAccount: RESTORE_ACCOUNT,
    awsRegion: RESTORE_REGION,
    environment: "park-test",
    resourcePrefix: "jumpyard-check-in-park-test",
  };
  const normalTarget = resolveClusterTarget(normalConfig, baseArgs);
  assert.equal(normalTarget.identifier, "jumpyard-check-in-park-test-aurora");
  assert.throws(
    () => resolveClusterTarget(normalConfig, { ...baseArgs, clusterIdentifier: "source-override" }),
    /only for park-test-restore-rehearsal/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, environment: "production" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, awsRegion: "eu-west-1" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, awsAccount: "000000000000" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, resourcePrefix: "production" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  const restoreIdentifier = "jy-park-test-restore-20260714t120000z-abc123-aurora";
  const restoreConfig: DeployConfig = {
    ...normalConfig,
    environment: RESTORE_ENVIRONMENT,
    resourcePrefix: restoreIdentifier.slice(0, -"-aurora".length),
  };
  assert.throws(() => resolveClusterTarget(restoreConfig, baseArgs), /no source fallback/);
  assert.throws(
    () => resolveClusterTarget(
      { ...restoreConfig, resourcePrefix: "jumpyard-check-in-park-test" },
      { ...baseArgs, clusterIdentifier: restoreIdentifier },
    ),
    /resource prefix does not match/,
  );
  const restoreTarget = resolveClusterTarget(restoreConfig, {
    ...baseArgs,
    clusterIdentifier: restoreIdentifier,
  });
  assert.equal(restoreTarget.identifier, restoreIdentifier);
  assert.equal(
    restoreTarget.arn,
    `arn:aws:rds:${RESTORE_REGION}:${RESTORE_ACCOUNT}:cluster:${restoreIdentifier}`,
  );
  assert.equal(
    resolveClusterTarget(restoreConfig, {
      ...baseArgs,
      clusterArn: restoreTarget.arn,
    }).identifier,
    restoreIdentifier,
  );
  assert.throws(
    () => resolveClusterTarget(restoreConfig, {
      ...baseArgs,
      clusterArn: `arn:aws:rds:${RESTORE_REGION}:000000000000:cluster:${restoreIdentifier}`,
    }),
    /approved account and region/,
  );
  assert.throws(
    () => resolveClusterTarget(restoreConfig, { ...baseArgs, clusterIdentifier: "production-aurora" }),
    /naming contract/,
  );

  const receiptPlan = makePlan(
    counts,
    restoreIdentifier,
    restoreTarget.arn,
    RESTORE_ENVIRONMENT,
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  const receiptActions = receiptPlan.actions.map((action) => ({ ...action, affected: action.planned }));
  const receiptAffected = affectedEvidence(receiptActions);
  const receiptResult: LifecycleApplyResult = {
    actions: receiptActions,
    affectedCountsDigest: receiptAffected.digest,
    affectedTotal: receiptAffected.total,
    completedAt: now,
    runId: "jylc_synthetic",
  };
  const parkReceiptPlan = makePlan(
    counts,
    normalTarget.identifier,
    normalTarget.arn,
    PARK_TEST_ENVIRONMENT,
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  assert.equal(
    createEvidenceReceipt(parkReceiptPlan, receiptResult).environment,
    PARK_TEST_ENVIRONMENT,
  );
  const receipt = createEvidenceReceipt(receiptPlan, receiptResult);
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    issue: 194,
    action: "lifecycle-apply",
    result: "succeeded",
    runId: receiptResult.runId,
    planDigest: receiptPlan.digest,
    referenceAt: now,
    clusterArn: restoreTarget.arn,
    clusterIdentifier: restoreIdentifier,
    environment: RESTORE_ENVIRONMENT,
    policyDefinitionDigest: receiptPlan.policyDefinitionDigest,
    policyVersion: POLICY_VERSION,
    completedAt: now,
    affectedTotal: receiptAffected.total,
    affectedCountsDigest: receiptAffected.digest,
    aggregateOnly: true,
    containsSensitiveData: false,
  });
  const evidenceDirectory = mkdtempSync(path.join(tmpdir(), "jumpyard-lifecycle-evidence-"));
  const evidencePath = path.join(evidenceDirectory, "receipt.json");
  try {
    assert.equal(validateEvidencePath(evidencePath, PARK_TEST_ENVIRONMENT), evidencePath);
    writeEvidenceReceiptAtomically(evidencePath, receipt);
    assert.deepEqual(JSON.parse(readFileSync(evidencePath, "utf8")), receipt);
    assert.throws(
      () => writeEvidenceReceiptAtomically(evidencePath, receipt),
      /overwrite is forbidden/,
    );
  } finally {
    rmSync(evidenceDirectory, { force: true, recursive: true });
  }

  const names = ACTION_SPECS.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...LIFECYCLE_TABLES].sort(), [...LIFECYCLE_TABLES]);
  assert.equal(new Set(LIFECYCLE_TABLES).size, LIFECYCLE_TABLES.length);
  assert.equal(Buffer.byteLength(countsQuery(), "utf8") <= MAX_DATA_API_SQL_BYTES, true);
  assert.equal(
    ACTION_SPECS.every(
      (action) => Buffer.byteLength(action.mutateSql, "utf8") <= MAX_DATA_API_SQL_BYTES,
    ),
    true,
  );
  assert.equal(names.indexOf("roller_booking_ticket_delete_30d") < names.indexOf("roller_booking_item_delete_30d"), true);
  assert.equal(names.indexOf("roller_booking_item_delete_30d") < names.indexOf("roller_booking_delete_30d"), true);
  assert.match(ACTION_SPECS.find(({ name }) => name === "staff_identity_anonymize_90d")?.mutateSql ?? "", /pin_verifier = NULL/);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  syntheticSelfTest();
  if (args.selfTestOnly) {
    console.log("T0195 lifecycle synthetic self-test passed.");
    return;
  }
  if (!args.configPath || !args.referenceAt) {
    throw new Error("--config and --reference-at are required.");
  }
  const config = readDeployConfig(args.configPath);
  const referenceAt = normalizeReferenceAt(args.referenceAt);
  const clusterTarget = resolveClusterTarget(config, args);
  const evidenceOut = validateEvidencePath(args.evidenceOut, config.environment);
  if (clusterTarget.restoreRehearsal && !args.secretId) {
    throw new Error("Restore-rehearsal lifecycle runs require an explicit --secret-id.");
  }
  if (args.secretId !== undefined && !isApprovedLifecycleSecretId(args.secretId)) {
    throw new Error("Lifecycle runs require the exact dedicated park-test lifecycle secret name or ARN.");
  }
  const secretId = args.secretId ?? APPROVED_LIFECYCLE_SECRET_NAME;
  const secretArn = await resolveSecretArn(config, secretId, args.profile);
  const context: LifecycleContext = {
    clusterArn: clusterTarget.arn,
    clusterIdentifier: clusterTarget.identifier,
    database: DATABASE,
    environment: config.environment,
    rds: new RDSDataClient({
      credentials: args.profile ? fromIni({ profile: args.profile }) : undefined,
      region: config.awsRegion,
    }),
    secretArn,
  };

  if (!args.apply) {
    const counts = await loadEligibleCounts(context, referenceAt);
    const plan = makePlan(
      counts,
      context.clusterIdentifier,
      context.clusterArn,
      context.environment,
      referenceAt,
      args.batchSize,
      args.maxMutations,
    );
    printPlan(plan, "dry-run");
    return;
  }

  const counts = await loadEligibleCounts(context, referenceAt);
  const plan = makePlan(
    counts,
    context.clusterIdentifier,
    context.clusterArn,
    context.environment,
    referenceAt,
    args.batchSize,
    args.maxMutations,
  );
  verifyApplyGates(args, config, plan);
  if (!evidenceOut) {
    throw new Error("Lifecycle apply is blocked without its required aggregate receipt path.");
  }
  const applyResult = await applyPlan(context, plan);
  const receipt = createEvidenceReceipt(plan, applyResult);
  writeEvidenceReceiptAtomically(evidenceOut, receipt);
  printPlan({ ...plan, actions: applyResult.actions }, "apply");
}

function safeOperatorError(error: unknown): string {
  if (
    error instanceof Error
    && error.constructor === Error
    && !("$metadata" in error)
  ) {
    return error.message;
  }
  return "Lifecycle command failed; the upstream diagnostic was suppressed to avoid exposing protected data.";
}

main().catch((error: unknown) => {
  console.error(safeOperatorError(error));
  process.exitCode = 1;
});
