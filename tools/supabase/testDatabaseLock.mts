// The lock that lets one test run at a time use the test database.
//
// Every checkout on the machine shares the test stack, and a run may reset
// its database (see localSupabase.mts). A reset under another run's tests
// breaks them, and two runs starting the stack at once trip over each other.
// So a run holds this lock from before it starts the stack until its tests
// end: the global setup takes it, and its teardown gives it back.
//
// The lock is a file in the OS's temporary folder (`LOCK_FILE`) that holds
// the pid of the process that took it. It is made whole or not at all (written aside, then
// linked into place, which fails when the file is there), so nobody reads
// it half-written. A run that finds it held waits, and says once for which
// pid, up to `limitMs`; then it fails. A lock whose process is gone (killed,
// or crashed before its teardown) is stale, and the next run takes it over.

import { linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TEST_PROJECT_ID } from "./testStack.mts";

/**
 * The lock file. On Linux and macOS it is in `/tmp`, not in `os.tmpdir()`:
 * that follows `TMPDIR`, which differs from one run to another (on macOS it
 * is a folder of the user's own, and turbo's strict env mode drops it from a
 * task, so a run through `pnpm test` and a run of vitest by hand would each
 * hold a lock of its own). The stack is one for the whole machine, and so is
 * `/tmp`.
 */
const LOCK_FILE = join(process.platform === "win32" ? tmpdir() : "/tmp", `${TEST_PROJECT_ID}-supabase.lock`);

/** The seams of the lock. Each has the real thing as its default. */
export interface TestDatabaseLockOptions {
  /** The lock file. */
  path?: string;
  /** This process. */
  pid?: number;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  /** How long to wait for a live holder before failing. */
  limitMs?: number;
  /** How long to wait between two looks at the lock. */
  intervalMs?: number;
  say?: (line: string) => void;
}

/** Gives the lock back. Leaves it alone if another process holds it by then. */
type Release = () => void;

const MINUTE_MS = 60 * 1000;

/** Takes the lock on the test database, waiting while a live process holds it. */
export async function lockTestDatabase({
  path = LOCK_FILE,
  pid = process.pid,
  isAlive = processIsAlive,
  now = Date.now,
  wait = delay,
  limitMs = 10 * MINUTE_MS,
  intervalMs = 1000,
  say = console.log,
}: TestDatabaseLockOptions = {}): Promise<Release> {
  const started = now();
  let announced: number | undefined;

  for (;;) {
    if (tryCreate(path, pid)) {
      return () => {
        release(path, pid);
      };
    }

    const holder = readHolder(path);

    if (holder === "gone") {
      continue;
    }

    if (holder === undefined || !isAlive(holder)) {
      if (takeOver(path, holder, pid)) {
        say(
          holder === undefined
            ? `Took over the test database's lock, which held no pid (${path}).`
            : `Took over the test database's lock from process ${String(holder)}, which is gone (${path}).`,
        );
      }

      continue;
    }

    if (now() - started >= limitMs) {
      throw new Error(
        `The test database is still held by process ${String(holder)} after ${String(Math.round(limitMs / MINUTE_MS))} minutes (${path}). If that process is stuck, stop it; if no such process runs, delete the file.`,
      );
    }

    if (announced !== holder) {
      announced = holder;
      say(`Waiting for the test database: process ${String(holder)} holds it (${path}).`);
    }

    await wait(intervalMs);
  }
}

/** Makes the lock file, holding `pid`, unless it is there. True when this made it. */
function tryCreate(path: string, pid: number): boolean {
  const aside = `${path}.${String(pid)}.new`;

  writeFileSync(aside, String(pid));

  try {
    linkSync(aside, path);

    return true;
  } catch (error) {
    if (codeOf(error) === "EEXIST") {
      return false;
    }

    throw error;
  } finally {
    unlinkSync(aside);
  }
}

/** The pid the lock holds; `undefined` when it holds none; "gone" when there is no lock. */
function readHolder(path: string): number | "gone" | undefined {
  let text: string;

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (codeOf(error) === "ENOENT") {
      return "gone";
    }

    throw error;
  }

  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
}

/**
 * Removes a stale lock that held `stale`. It is moved aside first, which only
 * one process can do; if what was moved is not that lock (another process
 * took it over in the meantime), it is put back. True when it was removed.
 */
function takeOver(path: string, stale: number | undefined, pid: number): boolean {
  const aside = `${path}.${String(pid)}.stale`;

  try {
    renameSync(path, aside);
  } catch (error) {
    if (codeOf(error) === "ENOENT") {
      return false;
    }

    throw error;
  }

  const moved = readHolder(aside);

  if (moved !== stale) {
    try {
      linkSync(aside, path);
    } catch {
      // Someone made a new lock meanwhile: theirs stands.
    }
  }

  unlinkSync(aside);

  return moved === stale;
}

function release(path: string, pid: number): void {
  if (readHolder(path) === pid) {
    unlinkSync(path);
  }
}

/** True while a process with this pid runs, whoever it belongs to. */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    // EPERM: it runs, as another user.
    return codeOf(error) === "EPERM";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
}
