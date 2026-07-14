import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
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

const DEFAULT_DATABASE = "jumpyard_cloud";
const MIGRATION_SCHEMA = "jumpyard";
const MIGRATION_TABLE = "schema_migrations";

interface DeployConfig {
  awsAccount: string;
  awsRegion: string;
  resourcePrefix: string;
}

interface MigrationArgs {
  configPath?: string;
  profile?: string;
  selfTestOnly: boolean;
  statusOnly: boolean;
}

interface MigrationContext {
  clusterArn: string;
  database: string;
  rds: RDSDataClient;
  secretArn: string;
}

interface MigrationFile {
  checksum: string;
  name: string;
  statements: string[];
  version: string;
}

interface AppliedMigration {
  checksum: string;
  version: string;
}

function parseArgs(argv: string[]): MigrationArgs {
  let configPath: string | undefined;
  let profile: string | undefined;
  let selfTestOnly = false;
  let statusOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--config") {
      configPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      profile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--status") {
      statusOnly = true;
      continue;
    }

    if (arg === "--self-test") {
      selfTestOnly = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!configPath && !selfTestOnly) {
    throw new Error("Missing required --config path.");
  }

  return { configPath, profile, selfTestOnly, statusOnly };
}

function readDeployConfig(configPath: string): DeployConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file does not exist: ${resolvedPath}`);
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as Partial<DeployConfig>;

  if (!parsed.awsAccount || !parsed.awsRegion || !parsed.resourcePrefix) {
    throw new Error("Config must include awsAccount, awsRegion, and resourcePrefix.");
  }

  return {
    awsAccount: parsed.awsAccount,
    awsRegion: parsed.awsRegion,
    resourcePrefix: parsed.resourcePrefix,
  };
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1] ?? "";

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (inLineComment) {
      current += char;
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "-" && next === "-") {
      current += char + next;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "/" && next === "*") {
      current += char + next;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      current += char;
      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (!inSingleQuote && char === "\"") {
      current += char;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "$") {
      const dollarQuoteMatch = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (dollarQuoteMatch) {
        dollarQuoteTag = dollarQuoteMatch[0];
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        continue;
      }
    }

    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (inSingleQuote || inDoubleQuote || inBlockComment || dollarQuoteTag) {
    throw new Error("SQL file contains an unterminated string or comment.");
  }

  const lastStatement = current.trim();
  if (lastStatement) {
    statements.push(lastStatement);
  }

  return statements;
}

function selfTestSqlSplitter(): void {
  const sample = `
CREATE TABLE test_one (value text);
CREATE OR REPLACE FUNCTION test_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $body$
BEGIN
  NEW.value := 'semi;colon';
  RETURN NEW;
END;
$body$;
CREATE TABLE test_two (value text);
`;
  const statements = splitSqlStatements(sample);
  if (statements.length !== 3 || !statements[1]?.includes("NEW.value := 'semi;colon';")) {
    throw new Error("SQL splitter self-test failed for PostgreSQL dollar-quoted function bodies.");
  }

  let unterminatedRejected = false;
  try {
    splitSqlStatements("CREATE FUNCTION broken() RETURNS void AS $$ BEGIN; END;");
  } catch {
    unterminatedRejected = true;
  }
  if (!unterminatedRejected) {
    throw new Error("SQL splitter self-test failed to reject an unterminated dollar quote.");
  }
}

function readMigrationFiles(): MigrationFile[] {
  const migrationsDir = path.resolve(__dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_[a-z0-9_]+\.sql$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right));

  return files.map((fileName) => {
    const filePath = path.join(migrationsDir, fileName);
    const sql = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
    const [versionPart] = fileName.split("_");
    const name = fileName
      .replace(/^\d+_/, "")
      .replace(/\.sql$/i, "")
      .replace(/_/g, " ");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const statements = splitSqlStatements(sql);

    if (!versionPart || statements.length === 0) {
      throw new Error(`Invalid migration file: ${fileName}`);
    }

    return {
      checksum,
      name,
      statements,
      version: versionPart,
    };
  });
}

function stringParameters(values: Record<string, string>): SqlParameter[] {
  return Object.entries(values).map(([name, value]) => ({
    name,
    value: { stringValue: value },
  }));
}

async function executeStatement(
  context: MigrationContext,
  sql: string,
  transactionId?: string,
  parameters?: SqlParameter[],
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

async function ensureMigrationTable(context: MigrationContext): Promise<void> {
  const statements = [
    `CREATE SCHEMA IF NOT EXISTS ${MIGRATION_SCHEMA}`,
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_SCHEMA}.${MIGRATION_TABLE} (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  ];

  for (const statement of statements) {
    await executeStatement(context, statement);
  }
}

async function getAppliedMigrations(context: MigrationContext): Promise<Map<string, AppliedMigration>> {
  const records = await executeStatement(
    context,
    `SELECT version, checksum_sha256 FROM ${MIGRATION_SCHEMA}.${MIGRATION_TABLE} ORDER BY version`,
  );

  return new Map(
    records.map((record) => {
      const version = record[0]?.stringValue;
      const checksum = record[1]?.stringValue;

      if (!version || !checksum) {
        throw new Error("Migration table contains a row without version or checksum.");
      }

      return [version, { checksum, version }];
    }),
  );
}

async function applyMigration(context: MigrationContext, migration: MigrationFile): Promise<void> {
  const begin = await context.rds.send(
    new BeginTransactionCommand({
      database: context.database,
      resourceArn: context.clusterArn,
      secretArn: context.secretArn,
    }),
  );
  const transactionId = begin.transactionId;

  if (!transactionId) {
    throw new Error("Could not start database transaction.");
  }

  try {
    for (const statement of migration.statements) {
      await executeStatement(context, statement, transactionId);
    }

    await executeStatement(
      context,
      `INSERT INTO ${MIGRATION_SCHEMA}.${MIGRATION_TABLE} (version, name, checksum_sha256)
       VALUES (:version, :name, :checksum)`,
      transactionId,
      stringParameters({
        checksum: migration.checksum,
        name: migration.name,
        version: migration.version,
      }),
    );

    await context.rds.send(
      new CommitTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );
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

async function resolveSecretArn(config: DeployConfig, profile?: string): Promise<string> {
  const client = new SecretsManagerClient({
    credentials: profile ? fromIni({ profile }) : undefined,
    region: config.awsRegion,
  });
  const secretName = `/${config.resourcePrefix}/aurora/admin`;
  const response = await client.send(new DescribeSecretCommand({ SecretId: secretName }));

  if (!response.ARN) {
    throw new Error(`Could not resolve secret ARN for ${secretName}`);
  }

  return response.ARN;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  selfTestSqlSplitter();
  if (args.selfTestOnly) {
    console.log("SQL splitter self-test passed.");
    return;
  }
  if (!args.configPath) {
    throw new Error("Missing required --config path.");
  }
  const config = readDeployConfig(args.configPath);
  const secretArn = await resolveSecretArn(config, args.profile);
  const context: MigrationContext = {
    clusterArn: `arn:aws:rds:${config.awsRegion}:${config.awsAccount}:cluster:${config.resourcePrefix}-aurora`,
    database: DEFAULT_DATABASE,
    rds: new RDSDataClient({
      credentials: args.profile ? fromIni({ profile: args.profile }) : undefined,
      region: config.awsRegion,
    }),
    secretArn,
  };
  const migrations = readMigrationFiles();

  console.log(`Migration target: ${context.clusterArn}`);
  await ensureMigrationTable(context);

  const appliedMigrations = await getAppliedMigrations(context);
  for (const migration of migrations) {
    const applied = appliedMigrations.get(migration.version);
    if (applied && applied.checksum !== migration.checksum) {
      throw new Error(`Applied migration checksum mismatch: ${migration.version}`);
    }

    const state = applied ? "applied" : "pending";
    console.log(`${migration.version} ${migration.name}: ${state}`);
  }

  if (args.statusOnly) {
    return;
  }

  for (const migration of migrations) {
    if (appliedMigrations.has(migration.version)) {
      continue;
    }

    console.log(`Applying ${migration.version} ${migration.name}`);
    await applyMigration(context, migration);
    console.log(`Applied ${migration.version}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
