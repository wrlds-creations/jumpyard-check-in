// Types for policy.js (T0195 / GH-598), used by the TypeScript operator CLI.

export interface ActionSpec {
  candidateSql: string;
  mutateSql: string;
  name: string;
}

export interface ActionCount {
  action: string;
  affected?: number;
  eligible: number;
  planned: number;
}

export interface LifecyclePlan {
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

export interface LifecycleApplyResult {
  actions: ActionCount[];
  affectedCountsDigest: string;
  affectedTotal: number;
  completedAt: string;
  runId: string;
}

export declare const ACTION_SPECS: ActionSpec[];
export declare const ADVISORY_LOCK_ID: number;
export declare const DATABASE: string;
export declare const DEFAULT_BATCH_SIZE: number;
export declare const DEFAULT_MAX_MUTATIONS: number;
export declare const LIFECYCLE_TABLES: readonly string[];
export declare const MAX_BATCH_SIZE: number;
export declare const MAX_DATA_API_SQL_BYTES: number;
export declare const MAX_MUTATIONS_LIMIT: number;
export declare const POLICY_VERSION: "t0195-v1";

export declare function affectedEvidence(actions: ActionCount[]): { digest: string; total: number };
export declare function countsObject(
  actions: ActionCount[],
  key: "affected" | "eligible" | "planned",
): string;
export declare function countsQuery(): string;
export declare function makePlan(
  counts: Map<string, number>,
  clusterIdentifier: string,
  clusterArn: string,
  environment: string,
  referenceAt: string,
  batchSize: number,
  maxMutations: number,
): LifecyclePlan;
export declare function policyDefinitionDigest(actionSpecs?: readonly ActionSpec[]): string;
