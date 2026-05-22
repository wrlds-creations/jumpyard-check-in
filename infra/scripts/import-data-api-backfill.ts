import { spawn } from "child_process";
import path from "path";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_WINDOWS = 370;
const WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_DATA_API_BACKFILL";

interface BackfillArgs {
  apply: boolean;
  configPath: string;
  endDate: string;
  json: boolean;
  maxPages: number;
  maxWindows: number;
  pageSize: number;
  profile?: string;
  skipProducts: boolean;
  startDate: string;
  venueId?: string;
}

interface WindowRange {
  endDate: string;
  startDate: string;
}

interface CommandExecution {
  source: string;
  summary: unknown;
  window?: WindowRange;
}

interface CommandSpec {
  args: string[];
  env: NodeJS.ProcessEnv;
  source: string;
  window?: WindowRange;
}

interface BackfillSummary {
  apply: boolean;
  commandsRun: number;
  productRefresh: boolean;
  sourceWindow: WindowRange;
  windows: WindowRange[];
}

function parseArgs(argv: string[]): BackfillArgs {
  let configPath = "./config/dev.json";
  let profile: string | undefined;
  let startDate = process.env.ROLLER_DATA_START_DATE || "";
  let endDate = process.env.ROLLER_DATA_END_DATE || "";
  let pageSize = parsePositiveInteger(process.env.ROLLER_DATA_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let maxPages = parsePositiveInteger(process.env.ROLLER_DATA_MAX_PAGES, DEFAULT_MAX_PAGES);
  let maxWindows = parsePositiveInteger(process.env.ROLLER_DATA_BACKFILL_MAX_WINDOWS, DEFAULT_MAX_WINDOWS);
  let venueId = process.env.JUMPYARD_VENUE_ID;
  let apply = false;
  let json = false;
  let skipProducts = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--config") {
      configPath = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--end-date") {
      endDate = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--max-pages") {
      maxPages = parsePositiveInteger(requiredNext(argv, index, arg), DEFAULT_MAX_PAGES);
      index += 1;
      continue;
    }

    if (arg === "--max-windows") {
      maxWindows = parsePositiveInteger(requiredNext(argv, index, arg), DEFAULT_MAX_WINDOWS);
      index += 1;
      continue;
    }

    if (arg === "--page-size") {
      pageSize = parsePositiveInteger(requiredNext(argv, index, arg), DEFAULT_PAGE_SIZE);
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      profile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--skip-products") {
      skipProducts = true;
      continue;
    }

    if (arg === "--start-date") {
      startDate = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--venue-id") {
      venueId = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (isIsoDate(arg) && isIsoDate(argv[index + 1] ?? "")) {
      startDate = arg;
      endDate = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!startDate || !endDate) {
    throw new Error("Backfill requires --start-date and --end-date.");
  }
  validateDateWindow(startDate, endDate);

  return {
    apply,
    configPath,
    endDate,
    json,
    maxPages,
    maxWindows,
    pageSize,
    profile,
    skipProducts,
    startDate,
    venueId,
  };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Page controls must be positive integers.");
  }
  return parsed;
}

function validateDateWindow(startDate: string, endDate: string): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Backfill dates must be YYYY-MM-DD.");
  }

  if (endDate <= startDate) {
    throw new Error("End date must be after start date.");
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildWindows(args: BackfillArgs): WindowRange[] {
  const windows: WindowRange[] = [];
  let currentStart = args.startDate;

  while (currentStart < args.endDate) {
    const currentEnd = addDays(currentStart, 1);
    windows.push({
      endDate: currentEnd > args.endDate ? args.endDate : currentEnd,
      startDate: currentStart,
    });
    currentStart = currentEnd;

    if (windows.length > args.maxWindows) {
      throw new Error(`Backfill would run more than ${args.maxWindows} daily windows.`);
    }
  }

  return windows;
}

function commonArgs(args: BackfillArgs): string[] {
  const commandArgs = ["--config", args.configPath];

  if (args.profile) {
    commandArgs.push("--profile", args.profile);
  }

  if (args.venueId) {
    commandArgs.push("--venue-id", args.venueId);
  }

  return commandArgs;
}

function dataWindowArgs(args: BackfillArgs, window: WindowRange): string[] {
  return [
    ...commonArgs(args),
    "--start-date",
    window.startDate,
    "--end-date",
    window.endDate,
    "--page-size",
    String(args.pageSize),
    "--max-pages",
    String(args.maxPages),
    "--json",
    ...(args.apply ? ["--apply"] : []),
  ];
}

function productArgs(args: BackfillArgs): string[] {
  return [...commonArgs(args), "--json", ...(args.apply ? ["--apply"] : [])];
}

function childEnv(args: BackfillArgs): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (!args.apply) {
    return env;
  }

  env.ROLLER_IMPORT_ALLOW_WRITE = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS";
  env.ROLLER_RELATED_IMPORT_ALLOW_WRITE = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_RELATED_DATA";
  env.ROLLER_PRODUCT_IMPORT_ALLOW_WRITE = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_PRODUCTS";

  return env;
}

function buildCommands(args: BackfillArgs, windows: WindowRange[]): CommandSpec[] {
  const env = childEnv(args);
  const commands: CommandSpec[] = [];

  for (const window of windows) {
    commands.push({
      args: [scriptPath("import-bookingitems.ts"), ...dataWindowArgs(args, window)],
      env,
      source: "bookingitems",
      window,
    });
    commands.push({
      args: [scriptPath("import-related-data.ts"), ...dataWindowArgs(args, window)],
      env,
      source: "related-data",
      window,
    });
  }

  if (!args.skipProducts) {
    commands.push({
      args: [scriptPath("import-products.ts"), ...productArgs(args)],
      env,
      source: "products",
    });
  }

  return commands;
}

function scriptPath(fileName: string): string {
  return path.join(__dirname, fileName);
}

async function runCommand(command: CommandSpec): Promise<CommandExecution> {
  const output = await spawnJsonCommand(command.args, command.env);

  return {
    source: command.source,
    summary: output,
    window: command.window,
  };
}

function spawnJsonCommand(args: string[], env: NodeJS.ProcessEnv): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-r", "ts-node/register", ...args], {
      cwd: path.resolve(__dirname, ".."),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `Command failed with exit code ${code}.`).trim()));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reject(new Error(`Could not parse child command JSON output: ${message}`));
      }
    });
  });
}

function buildSummary(args: BackfillArgs, windows: WindowRange[], commandsRun: number): BackfillSummary {
  return {
    apply: args.apply,
    commandsRun,
    productRefresh: !args.skipProducts,
    sourceWindow: {
      endDate: args.endDate,
      startDate: args.startDate,
    },
    windows,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.apply && process.env.ROLLER_DATA_BACKFILL_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(`Set ROLLER_DATA_BACKFILL_ALLOW_WRITE=${WRITE_CONFIRMATION} to write a Data API backfill into dev Aurora.`);
  }

  const windows = buildWindows(args);
  const commands = buildCommands(args, windows);
  const executions: CommandExecution[] = [];

  for (const command of commands) {
    executions.push(await runCommand(command));
  }

  const summary = buildSummary(args, windows, executions.length);

  if (args.json) {
    console.log(JSON.stringify({ ...summary, executions }, null, 2));
    return;
  }

  console.log(args.apply ? "Roller Data API backfill applied." : "Roller Data API backfill dry-run passed.");
  console.log(`- window: ${summary.sourceWindow.startDate} -> ${summary.sourceWindow.endDate}`);
  console.log(`- dailyWindows: ${summary.windows.length}`);
  console.log(`- commandsRun: ${summary.commandsRun}`);
  console.log(`- productRefresh: ${summary.productRefresh}`);
  console.log(`- apply: ${summary.apply}`);
  console.log("- sources: bookingitems, tickets, bookingpayments, customers, products");
  console.log("- no secrets, access tokens, customer names, emails, phone numbers, booking notes, or raw payloads were printed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
