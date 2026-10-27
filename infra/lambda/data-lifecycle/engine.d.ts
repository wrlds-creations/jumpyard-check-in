// Types for engine.js (T0195 / GH-598), used by the TypeScript operator CLI.
import type { Field, RDSDataClient, SqlParameter } from "@aws-sdk/client-rds-data";

import type { LifecycleApplyResult, LifecyclePlan } from "./policy";

export interface LifecycleContext {
  clusterArn: string;
  clusterIdentifier: string;
  database: string;
  environment: string;
  rds: RDSDataClient;
  secretArn: string;
}

export declare function applyPlan(
  context: LifecycleContext,
  reviewedPlan: LifecyclePlan,
): Promise<LifecycleApplyResult>;
export declare function execute(
  context: LifecycleContext,
  sql: string,
  parameters: SqlParameter[],
  transactionId?: string,
): Promise<Field[][]>;
export declare function fieldNumber(field: Field | undefined): number;
export declare function fieldString(field: Field | undefined): string;
export declare function loadEligibleCounts(
  context: LifecycleContext,
  referenceAt: string,
  transactionId?: string,
): Promise<Map<string, number>>;
export declare function sqlParameters(referenceAt: string, batchSize?: number): SqlParameter[];
