import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import path from 'path';
import { App } from 'aws-cdk-lib';

import { loadJumpYardCloudConfig } from '../lib/config';
import { JumpYardCloudStack } from '../lib/jumpyard-cloud-stack';

const PREFIX = 'jumpyard-check-in-park-test';
const HANDLERS = ['booking', 'data-sync', 'lookup', 'redeem', 'session', 'webhook'] as const;
type HandlerName = (typeof HANDLERS)[number];

const ROLE_BY_HANDLER: Readonly<Record<HandlerName, string>> = {
  booking: 'jumpyard_booking_runtime',
  'data-sync': 'jumpyard_data_sync_runtime',
  lookup: 'jumpyard_lookup_runtime',
  redeem: 'jumpyard_redeem_runtime',
  session: 'jumpyard_session_runtime',
  webhook: 'jumpyard_webhook_runtime',
};

interface TemplateResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
  readonly DependsOn?: string | string[];
  readonly DeletionPolicy?: string;
  readonly UpdateReplacePolicy?: string;
}

interface Template {
  readonly Resources?: Record<string, TemplateResource>;
}

type Permission = 'DELETE' | 'INSERT' | 'SELECT' | 'UPDATE';

function synthParkTest(): Template {
  const configPath = path.resolve(__dirname, '..', 'config', 'park-test.json');
  const app = new App({
    context: { config: configPath },
    outdir: path.join(process.cwd(), 'cdk.out', 'validate-t0195-least-privilege'),
  });
  const config = loadJumpYardCloudConfig(app);
  const stack = new JumpYardCloudStack(app, `${config.resourcePrefix}-stack`, {
    config,
    env: { account: config.awsAccount, region: config.awsRegion },
  });
  const artifact = app.synth().stacks.find((candidate) => candidate.stackName === stack.stackName);
  assert.ok(artifact, 'Could not synthesize the park-test stack.');
  return artifact.template as Template;
}

function resources(template: Template): Record<string, TemplateResource> {
  return template.Resources ?? {};
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function collectRefs(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collectRefs(item, output));
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.Ref === 'string') output.push(record.Ref);
    Object.values(record).forEach((item) => collectRefs(item, output));
  }
  return output;
}

function secretLogicalIdsByName(template: Template): Map<string, string> {
  const result = new Map<string, string>();
  for (const [logicalId, resource] of Object.entries(resources(template))) {
    if (resource.Type === 'AWS::SecretsManager::Secret') {
      const name = resource.Properties?.Name;
      assert.equal(typeof name, 'string', `${logicalId} must have a fixed secret name.`);
      result.set(name as string, logicalId);
      assert.equal(resource.DeletionPolicy, 'Retain', `${name} must survive stack deletion.`);
      assert.equal(resource.UpdateReplacePolicy, 'Retain', `${name} must survive replacement.`);
    }
  }
  return result;
}

function findFunction(template: Template, functionName: string): [string, TemplateResource] {
  const match = Object.entries(resources(template)).find(([, resource]) =>
    resource.Type === 'AWS::Lambda::Function' && resource.Properties?.FunctionName === functionName,
  );
  assert.ok(match, `Missing Lambda ${functionName}.`);
  return match as [string, TemplateResource];
}

function functionRoleLogicalId(resource: TemplateResource): string {
  const role = resource.Properties?.Role as { 'Fn::GetAtt'?: unknown[] } | undefined;
  const logicalId = role?.['Fn::GetAtt']?.[0];
  assert.equal(typeof logicalId, 'string', 'Lambda role must be a synthesized GetAtt reference.');
  return logicalId as string;
}

function functionEnvironment(resource: TemplateResource): Record<string, unknown> {
  const environment = resource.Properties?.Environment as { Variables?: Record<string, unknown> } | undefined;
  assert.ok(environment?.Variables, 'Lambda environment variables are missing.');
  return environment!.Variables!;
}

function roleStatements(template: Template, roleLogicalId: string): Record<string, unknown>[] {
  const statements: Record<string, unknown>[] = [];
  for (const resource of Object.values(resources(template))) {
    if (resource.Type !== 'AWS::IAM::Policy') continue;
    if (!collectRefs(resource.Properties?.Roles).includes(roleLogicalId)) continue;
    const document = resource.Properties?.PolicyDocument as { Statement?: unknown } | undefined;
    const value = document?.Statement;
    if (Array.isArray(value)) {
      for (const statement of value) {
        if (statement && typeof statement === 'object') statements.push(statement as Record<string, unknown>);
      }
    } else if (value && typeof value === 'object') {
      statements.push(value as Record<string, unknown>);
    }
  }
  return statements;
}

function statementActions(statements: readonly Record<string, unknown>[]): string[] {
  return statements.flatMap((statement) => {
    const action = statement.Action;
    return (Array.isArray(action) ? action : [action]).filter((item): item is string => typeof item === 'string');
  });
}

function parseGrants(sql: string): Map<string, Map<string, Set<Permission>>> {
  const result = new Map<string, Map<string, Set<Permission>>>();
  const grantPattern = /^GRANT\s+([A-Z,\s]+?)\s+ON\s+([\s\S]+?)\s+TO\s+(jumpyard_[a-z_]+);/gim;
  for (const match of sql.matchAll(grantPattern)) {
    const role = match[3];
    const tables = [...match[2].matchAll(/jumpyard\.([a-z_]+)/gi)].map((entry) => entry[1]);
    if (tables.length === 0) continue;
    const permissions = match[1]
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter((value): value is Permission => ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].includes(value));
    const roleGrants = result.get(role) ?? new Map<string, Set<Permission>>();
    for (const table of tables) {
      const tableGrants = roleGrants.get(table) ?? new Set<Permission>();
      permissions.forEach((permission) => tableGrants.add(permission));
      roleGrants.set(table, tableGrants);
    }
    result.set(role, roleGrants);
  }
  return result;
}

function assertPermission(
  grants: Map<string, Map<string, Set<Permission>>>,
  role: string,
  table: string,
  permission: Permission,
  source: string,
): void {
  assert.ok(
    grants.get(role)?.get(table)?.has(permission),
    `${role} lacks ${permission} on jumpyard.${table}, required by ${source}.`,
  );
}

function validateHandlerSqlAgainstGrants(
  grants: Map<string, Map<string, Set<Permission>>>,
  handler: HandlerName,
): void {
  const filePath = path.resolve(__dirname, '..', 'lambda', handler, 'index.js');
  const source = readFileSync(filePath, 'utf8');
  const role = ROLE_BY_HANDLER[handler];
  const patterns: readonly [Permission, RegExp][] = [
    ['SELECT', /\b(?:FROM|JOIN)\s+jumpyard\.([a-z_]+)/gi],
    ['INSERT', /\bINSERT\s+INTO\s+jumpyard\.([a-z_]+)/gi],
    ['UPDATE', /\bUPDATE\s+jumpyard\.([a-z_]+)/gi],
    ['DELETE', /\bDELETE\s+FROM\s+jumpyard\.([a-z_]+)/gi],
  ];
  for (const [permission, pattern] of patterns) {
    for (const match of source.matchAll(pattern)) {
      assertPermission(grants, role, match[1], permission, `infra/lambda/${handler}/index.js`);
    }
  }

  for (const match of source.matchAll(/\bINSERT\s+INTO\s+jumpyard\.([a-z_]+)[\s\S]{0,1800}?\bON\s+CONFLICT\b[\s\S]{0,800}?\bDO\s+UPDATE\b/gi)) {
    assertPermission(grants, role, match[1], 'UPDATE', `ON CONFLICT in ${handler}`);
  }
}

function main(): void {
  const template = synthParkTest();
  const allResources = resources(template);
  const secretsByName = secretLogicalIdsByName(template);
  const adminSecretId = secretsByName.get(`/${PREFIX}/aurora/admin`);
  assert.ok(adminSecretId, 'Missing retained Aurora administrator secret.');

  const expectedRestrictedSecrets = [
    ...HANDLERS.map((handler) => `/${PREFIX}/aurora/runtime/${handler}`),
    `/${PREFIX}/aurora/lifecycle`,
  ];
  expectedRestrictedSecrets.forEach((name) => assert.ok(secretsByName.has(name), `Missing ${name}.`));

  for (const handler of HANDLERS) {
    const [, fn] = findFunction(template, `${PREFIX}-stack-${handler}`);
    const variables = functionEnvironment(fn);
    const expectedSecretId = secretsByName.get(`/${PREFIX}/aurora/runtime/${handler}`)!;
    assert.deepEqual(variables.DATABASE_SECRET_ARN, { Ref: expectedSecretId }, `${handler} uses the wrong DB secret.`);
    assert.notDeepEqual(variables.DATABASE_SECRET_ARN, { Ref: adminSecretId }, `${handler} must not use admin DB access.`);
    assert.equal(variables.RAW_PAYLOAD_BUCKET_NAME, undefined, `${handler} retains unused S3 configuration.`);
    assert.equal(variables.ROLLER_OPERATIONS_QUEUE_URL, undefined, `${handler} retains unused SQS configuration.`);
    assert.equal(variables.EVENT_BUS_NAME, undefined, `${handler} retains unused EventBridge configuration.`);

    const roleId = functionRoleLogicalId(fn);
    const statements = roleStatements(template, roleId);
    const actions = statementActions(statements);
    const forbiddenActions = actions.filter((action) => /^(?:s3|sqs|events):/i.test(action));
    assert.deepEqual(forbiddenActions, [], `${handler} retains unused AWS write permissions.`);
    assert.ok(!actions.includes('secretsmanager:*'), `${handler} has wildcard secret access.`);

    const rdsActions = [...new Set(actions.filter((action) => action.startsWith('rds-data:')))].sort();
    const expectedRdsActions = handler === 'session' || handler === 'data-sync'
      ? [
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:ExecuteStatement',
          'rds-data:RollbackTransaction',
        ]
      : ['rds-data:ExecuteStatement'];
    assert.deepEqual(rdsActions, expectedRdsActions, `${handler} has unexpected Data API actions.`);

    const secretStatements = statements.filter((statement) =>
      (Array.isArray(statement.Action) ? statement.Action : [statement.Action])
        .some((action) => typeof action === 'string' && action.startsWith('secretsmanager:')),
    );
    const secretRefs = secretStatements.flatMap((statement) => collectRefs(statement.Resource));
    assert.ok(secretRefs.includes(expectedSecretId), `${handler} cannot read its restricted DB secret.`);
    assert.ok(!secretRefs.includes(adminSecretId), `${handler} can still read the Aurora admin secret.`);

    if (handler === 'session') {
      assert.deepEqual(
        actions.filter((action) => /^(?:sns|ses):/i.test(action)),
        [],
        'park-test session must not receive messaging permissions while sends are disabled.',
      );
    }
  }

  const provisioner = findFunction(template, `${PREFIX}-database-runtime-role-provisioner`)[1];
  const provisionerCode = collectStrings(provisioner.Properties?.Code).join('\n');
  assert.match(provisionerCode, /ALTER ROLE/);
  assert.match(provisionerCode, /VALID UNTIL 'infinity'/);
  assert.match(provisionerCode, /process\.env\.DATABASE_CLUSTER_ARN/);
  assert.match(provisionerCode, /process\.env\.DATABASE_ADMIN_SECRET_ARN/);
  assert.match(provisionerCode, /process\.env\.RUNTIME_ROLE_SECRETS_JSON/);
  assert.doesNotMatch(
    provisionerCode,
    /event\.ResourceProperties/,
    'Provisioner credential targets must not be caller-controlled custom-resource properties.',
  );
  for (const role of [...Object.values(ROLE_BY_HANDLER), 'jumpyard_lifecycle_runtime']) {
    assert.match(provisionerCode, new RegExp(`['"]${role}['"]`), `Provisioner code does not allowlist ${role}.`);
  }
  assert.doesNotMatch(provisionerCode, /console\.log\s*\(.*password/i);

  const writerEntry = Object.entries(allResources).find(([, resource]) =>
    resource.Type === 'AWS::RDS::DBInstance'
    && resource.Properties?.DBInstanceIdentifier === `${PREFIX}-aurora-writer`,
  );
  assert.ok(writerEntry, 'Missing park-test Aurora writer instance.');
  const provisioningResource = Object.values(allResources).find((resource) =>
    resource.Type === 'AWS::CloudFormation::CustomResource'
    && resource.Properties?.ConfigurationVersion === 't0195-v1',
  );
  assert.ok(provisioningResource, 'Missing database runtime-role provisioning custom resource.');
  const provisioningDependencies = Array.isArray(provisioningResource?.DependsOn)
    ? provisioningResource.DependsOn
    : provisioningResource?.DependsOn
      ? [provisioningResource.DependsOn]
      : [];
  assert.ok(
    provisioningDependencies.includes(writerEntry![0]),
    'Runtime-role provisioning must wait for the Aurora writer before issuing ALTER ROLE.',
  );

  const database = Object.values(allResources).find((resource) =>
    resource.Type === 'AWS::RDS::DBCluster' && resource.Properties?.DBClusterIdentifier === `${PREFIX}-aurora`,
  );
  assert.ok(database, 'Missing park-test Aurora cluster.');
  assert.equal(database?.Properties?.BackupRetentionPeriod, 7);
  assert.equal(database?.DeletionPolicy, 'Retain');
  assert.equal(database?.UpdateReplacePolicy, 'Retain');

  const migration = readFileSync(path.resolve(__dirname, '..', 'migrations', '0011_runtime_database_roles.sql'), 'utf8');
  assert.match(migration, /REVOKE ALL PRIVILEGES ON SCHEMA jumpyard FROM PUBLIC/);
  assert.match(migration, /REVOKE CONNECT, TEMPORARY ON DATABASE jumpyard_cloud FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA jumpyard FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA jumpyard FROM PUBLIC/);
  assert.match(migration, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|CREATE|TRUNCATE|TRIGGER|REFERENCES)\b/i);
  for (const role of [...Object.values(ROLE_BY_HANDLER), 'jumpyard_lifecycle_runtime']) {
    assert.match(migration, new RegExp(`'${role}'`), `Migration does not create ${role}.`);
  }
  const grants = parseGrants(migration);
  for (const handler of HANDLERS) validateHandlerSqlAgainstGrants(grants, handler);
  for (const writeOnlyTable of ['roller_booking_tickets', 'roller_booking_payments', 'guest_profiles']) {
    assert.equal(
      grants.get('jumpyard_data_sync_runtime')?.get(writeOnlyTable)?.has('SELECT') ?? false,
      false,
      `Data-sync must not receive unused SELECT on jumpyard.${writeOnlyTable}.`,
    );
  }
  for (const role of Object.values(ROLE_BY_HANDLER)) {
    assert.equal(grants.get(role)?.has('schema_migrations') ?? false, false, `${role} can access schema history.`);
    assert.equal(grants.get(role)?.has('data_lifecycle_runs') ?? false, false, `${role} can access lifecycle evidence.`);
  }
  const lifecycleGrants = grants.get('jumpyard_lifecycle_runtime');
  assert.ok(lifecycleGrants?.get('data_lifecycle_runs')?.has('INSERT'));
  assert.ok(lifecycleGrants?.get('data_lifecycle_runs')?.has('UPDATE'));
  assert.equal(lifecycleGrants?.has('schema_migrations') ?? false, false);
  for (const table of [
    'prepayment_booking_drafts',
    'checkin_attempts',
    'sms_deliveries',
    'email_deliveries',
    'roller_webhook_events',
    'booking_seed_runs',
    'booking_links',
    'event_log',
    'staff_identities',
    // The staff-identity invalidation trigger executes an UPDATE even after
    // the lifecycle candidate query has proven that no session row remains.
    'staff_auth_sessions',
    'data_lifecycle_runs',
  ]) {
    assert.ok(
      lifecycleGrants?.get(table)?.has('UPDATE'),
      `Lifecycle role lacks UPDATE on jumpyard.${table}.`,
    );
  }
  for (const table of [
    'product_catalog_cache',
    'checkin_tokens',
    'idempotency_records',
    'staff_auth_sessions',
    'staff_pin_auth_limits',
    'prepayment_booking_drafts',
    'guest_profiles',
    'handoff_sessions',
    'roller_booking_tickets',
    'roller_booking_payments',
    'checkin_sessions',
    'roller_booking_items',
    'roller_bookings',
    'checkin_attempts',
    'sms_deliveries',
    'email_deliveries',
    'roller_webhook_events',
    'booking_seed_runs',
    'booking_links',
    'event_log',
    'data_lifecycle_runs',
  ]) {
    assert.ok(
      lifecycleGrants?.get(table)?.has('DELETE'),
      `Lifecycle role lacks DELETE on jumpyard.${table}.`,
    );
  }

  const sourceByHandler = Object.fromEntries(
    HANDLERS.map((handler) => [
      handler,
      readFileSync(path.resolve(__dirname, '..', 'lambda', handler, 'index.js'), 'utf8'),
    ]),
  ) as Record<HandlerName, string>;
  for (const handler of ['booking', 'data-sync', 'lookup', 'redeem', 'webhook'] as const) {
    assert.match(sourceByHandler[handler], /cachedRollerConfigExpiresAt/);
    assert.match(sourceByHandler[handler], /PROVIDER_CONFIG_CACHE_MS/);
  }
  for (const handler of ['booking', 'lookup', 'redeem', 'session', 'data-sync'] as const) {
    assert.match(sourceByHandler[handler], /COALESCE\([^\n]*expires_at[^\n]*fetched_at \+ interval '24 hours'\) > now\(\)/);
  }
  for (const handler of ['booking', 'redeem', 'session'] as const) {
    assert.match(sourceByHandler[handler], /ON CONFLICT \(idempotency_key\) DO UPDATE SET/);
    assert.match(sourceByHandler[handler], /WHERE jumpyard\.idempotency_records\.expires_at <= now\(\)/);
  }

  console.log('[pass] every park-test handler uses its own restricted retained database secret');
  console.log('[pass] synthesized handler IAM omits unused S3, SQS, EventBridge, and disabled messaging access');
  console.log('[pass] runtime SQL operations are covered by table-specific grants and admin surfaces remain denied');
  console.log('[pass] expiry-sensitive reads and bounded provider/shared-secret caches are enforced');
}

main();
