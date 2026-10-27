"use strict";

// T0195 / GH-598: the reviewed bounded apply transaction, shared by the operator CLI and the
// nightly lifecycle Lambda. A run locks the lifecycle tables, recounts under the lock, refuses a
// changed plan, applies each action's reviewed batch and records aggregate evidence, or rolls back.
const { randomUUID } = require("crypto");
const {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RollbackTransactionCommand,
} = require("@aws-sdk/client-rds-data");
const {
  ACTION_SPECS,
  ADVISORY_LOCK_ID,
  LIFECYCLE_TABLES,
  POLICY_VERSION,
  affectedEvidence,
  countsObject,
  countsQuery,
  makePlan,
} = require("./policy");

function sqlParameters(referenceAt, batchSize) {
  const parameters = [
    { name: "referenceAt", value: { stringValue: referenceAt } },
  ];
  if (batchSize !== undefined) {
    parameters.push({ name: "batchSize", value: { longValue: batchSize } });
  }
  return parameters;
}

async function execute(
  context,
  sql,
  parameters,
  transactionId,
) {
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

function fieldString(field) {
  if (field?.stringValue !== undefined) return field.stringValue;
  throw new Error("Database result did not contain the expected string field.");
}

function fieldNumber(field) {
  if (field?.longValue !== undefined) return field.longValue;
  if (field?.stringValue !== undefined && /^\d+$/.test(field.stringValue)) {
    return Number(field.stringValue);
  }
  throw new Error("Database result did not contain the expected aggregate count.");
}

async function loadEligibleCounts(
  context,
  referenceAt,
  transactionId,
) {
  const records = await execute(
    context,
    countsQuery(),
    sqlParameters(referenceAt),
    transactionId,
  );
  const counts = new Map();
  for (const record of records) {
    counts.set(fieldString(record[0]), fieldNumber(record[1]));
  }
  if (counts.size !== ACTION_SPECS.length) {
    throw new Error("Lifecycle count query returned an incomplete action set.");
  }
  return counts;
}

async function acquireApplyLock(
  context,
  transactionId,
) {
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
  context,
  transactionId,
) {
  await execute(
    context,
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ WRITE",
    [],
    transactionId,
  );
}

async function acquireMaintenanceTableLocks(
  context,
  transactionId,
) {
  await execute(
    context,
    `LOCK TABLE ${LIFECYCLE_TABLES.join(", ")} IN SHARE ROW EXCLUSIVE MODE NOWAIT`,
    [],
    transactionId,
  );
}

async function recordRunStart(
  context,
  transactionId,
  runId,
  plan,
) {
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
  context,
  transactionId,
  runId,
  actions,
  affectedTotal,
  affectedCountsDigest,
  completedAt,
) {
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
  context,
  reviewedPlan,
) {
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
    const applied = [];
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

module.exports = {
  applyPlan,
  execute,
  fieldNumber,
  fieldString,
  loadEligibleCounts,
  sqlParameters,
};
