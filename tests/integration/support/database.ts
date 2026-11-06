import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_LABEL = "com.supabase.cli.project=coveweft-swim";

let containerName: string | undefined;

async function findDatabaseContainer(): Promise<string> {
  if (containerName) {
    return containerName;
  }

  const { stdout } = await execFileAsync("docker", [
    "ps",
    "--filter",
    `label=${PROJECT_LABEL}`,
    "--format",
    "{{.Names}}",
  ]);

  const names = stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);

  const database = names.find((name) => name.startsWith("supabase_db_"));

  if (!database) {
    throw new Error(
      "Could not find the local Supabase database container. Start the stack with `supabase start`.",
    );
  }

  containerName = database;
  return database;
}

/**
 * Runs one SQL statement as the local database owner. Used only by tests to
 * schedule locks and inspect the server; it is never part of the application.
 */
export async function runSql(sql: string): Promise<string> {
  const container = await findDatabaseContainer();
  const { stdout } = await execFileAsync("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-Atc",
    sql,
  ]);

  return stdout.trim();
}

/**
 * Starts a psql session that runs the supplied statements. The test keeps the
 * returned process alive to hold a lock, then awaits it before asserting.
 */
export async function startSqlSession(sql: string): Promise<ChildProcess> {
  const container = await findDatabaseContainer();

  return spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { stdio: "ignore" },
  );
}

export function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForSql(
  predicate: () => Promise<boolean>,
  description: string,
  timeoutMilliseconds = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

export async function waitForActiveQuery(fragment: string): Promise<void> {
  await waitForSql(async () => {
    const count = await runSql(`
      select count(*)
      from pg_stat_activity
      where datname = current_database()
        and state = 'active'
        and query ilike '%${fragment}%'
        and pid <> pg_backend_pid()
    `);

    return Number(count) > 0;
  }, `the query containing "${fragment}"`);
}

export async function waitForBlockedQuery(fragment: string): Promise<void> {
  await waitForSql(async () => {
    const count = await runSql(`
      select count(*)
      from pg_stat_activity
      where datname = current_database()
        and state = 'active'
        and wait_event_type = 'Lock'
        and query ilike '%${fragment}%'
        and pid <> pg_backend_pid()
    `);

    return Number(count) > 0;
  }, `the blocked query containing "${fragment}"`);
}
