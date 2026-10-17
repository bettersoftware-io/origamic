// The lock that lets one test run at a time use the test database.
//
// Every checkout on the machine shares the test stack, and a run may reset
// its database (see localSupabase.mts). A reset under another run's tests
// breaks them, and two runs starting the stack at once trip over each other.
// So a run holds this lock from before it starts the stack until its tests
// end: the global setup takes it, and its teardown gives it back.
//
// The lock is a file that holds the pid of the process that took it, in a
// folder of the user's own (`defaultFolder`). It is made whole or not at
// all: written aside, then linked into place, which fails when the file is
// there, so nobody reads it half-written.
//
// A run that finds it held by a live process waits, and says so once for
// each holder, up to `limitMs` from when that holder took it: a queue that
// moves does not fail. A lock whose process is gone (killed, or crashed
// before its teardown), or that holds this process's own pid, is stale. It is
// removed under a breaker, a second file only one process can make: it reads
// the lock again under it and removes it only if it still holds the stale
// pid, so a lock someone took meanwhile stands.

import { linkSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TEST_PROJECT_ID } from "./testStack.mts";

/** The seams of the lock. Each has the real thing as its default. */
export interface TestDatabaseLockOptions {
  /** The folder the lock is made in. */
  folder?: string;
  /** This process. */
  pid?: number;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  /** How long to wait for one live holder before failing. */
  limitMs?: number;
  /** How long to wait between two looks at the lock. */
  intervalMs?: number;
  say?: (line: string) => void;
}

/** Gives the lock back. Leaves it alone if another process holds it by then. */
export type Release = () => void;

const LOCK_NAME = `${TEST_PROJECT_ID}-supabase.lock`;

const MINUTE_MS = 60 * 1000;

/** How old a breaker is when the process that made it counts as dead before removing it. */
const BREAKER_STALE_MS = 10 * 1000;

/** Takes the lock on the test database, waiting while a live process holds it. */
export async function lockTestDatabase({
  folder = defaultFolder(),
  pid = process.pid,
  isAlive = processIsAlive,
  now = Date.now,
  wait = delay,
  limitMs = 10 * MINUTE_MS,
  intervalMs = 1000,
  say = console.log,
}: TestDatabaseLockOptions = {}): Promise<Release> {
  requirePrivateFolder(folder);

  const path = join(folder, LOCK_NAME);
  let waitingOn: number | undefined;
  let since = now();
  /** When this run found another process breaking a stale lock, while it still is. */
  let breakingSince: number | undefined;

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

    if (holder === undefined || holder === pid || !isAlive(holder)) {
      const outcome = takeOver(path, holder, pid);

      if (outcome === "taken") {
        say(`Took over the test database's lock ${staleness(holder, pid)} (${path}).`);
      }

      if (outcome !== "busy") {
        breakingSince = undefined;

        continue;
      }

      breakingSince ??= now();

      if (now() - breakingSince >= limitMs) {
        throw new Error(
          `Another process has been breaking the test database's stale lock for ${minutes(limitMs)} minutes (${path}.break). If no test run is starting, delete that file.`,
        );
      }

      await wait(intervalMs);

      continue;
    }

    if (holder !== waitingOn) {
      waitingOn = holder;
      since = now();
      say(`Waiting for the test database: process ${String(holder)} holds it (${path}).`);
    }

    if (now() - since >= limitMs) {
      throw new Error(
        `The test database is still held by process ${String(holder)} after ${minutes(limitMs)} minutes (${path}). If that process is stuck, stop it; if no such process runs, delete the file.`,
      );
    }

    await wait(intervalMs);
  }
}

/**
 * The folder of the lock: `/tmp/origamic-<uid>` on Linux and macOS. Not under
 * `os.tmpdir()`, which follows `TMPDIR`, and that differs from one run to
 * another (on macOS it is a folder of the user's own, and turbo's strict env
 * mode drops it from a task, so a run through `pnpm test` and a run of vitest
 * by hand would each hold a lock of its own). One for each user, so nobody
 * else can make or remove files in it.
 */
function defaultFolder(): string {
  if (process.platform === "win32") {
    return join(tmpdir(), "origamic");
  }

  return `/tmp/origamic-${String(process.getuid?.() ?? "user")}`;
}

/** Makes the folder, readable by this user only; fails when it is there and is not that. */
function requirePrivateFolder(folder: string): void {
  mkdirSync(folder, { recursive: true, mode: 0o700 });

  if (process.platform === "win32") {
    return;
  }

  const found = lstatSync(folder);

  if (!found.isDirectory() || found.uid !== process.getuid?.() || (found.mode & 0o077) !== 0) {
    throw new Error(
      `${folder} must be a folder of this user's own that nobody else can read or write (mode 0700), and it is not, so the lock on the test database is not taken there. Remove it and run again.`,
    );
  }
}

/** Makes `path`, holding `pid`, unless it is there. True when this made it. */
function tryCreate(path: string, pid: number): boolean {
  const aside = `${path}.${String(pid)}.new`;

  // A file left by a process with the same pid, or a link someone put there:
  // removed, never followed.
  rmSync(aside, { force: true });
  writeFileSync(aside, String(pid), { flag: "wx" });

  try {
    linkSync(aside, path);

    return true;
  } catch (error) {
    if (codeOf(error) === "EEXIST") {
      return false;
    }

    throw error;
  } finally {
    rmSync(aside, { force: true });
  }
}

/** The pid a file holds; `undefined` when it holds none; "gone" when there is no file. */
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
 * Removes the lock if it still holds `stale`, under the breaker. "taken": it
 * was removed. "lost": it was not (someone took it, or a dead process's
 * breaker was cleared); look again at once. "busy": another process holds the
 * breaker; wait before looking again.
 */
function takeOver(path: string, stale: number | undefined, pid: number): "taken" | "lost" | "busy" {
  const breaker = `${path}.break`;

  if (!tryCreate(breaker, pid)) {
    if (breakerIsStale(breaker)) {
      rmSync(breaker, { force: true });

      return "lost";
    }

    return "busy";
  }

  try {
    if (readHolder(path) !== stale) {
      return "lost";
    }

    unlinkSync(path);

    return "taken";
  } finally {
    rmSync(breaker, { force: true });
  }
}

/** True when the breaker was made so long ago that whoever made it has died. */
function breakerIsStale(breaker: string): boolean {
  try {
    return Date.now() - statSync(breaker).mtimeMs > BREAKER_STALE_MS;
  } catch (error) {
    if (codeOf(error) === "ENOENT") {
      return false;
    }

    throw error;
  }
}

/** Why a lock that held `holder` was stale, as said when it is taken over. */
function staleness(holder: number | undefined, pid: number): string {
  if (holder === undefined) {
    return "which held no pid";
  }

  return holder === pid
    ? `from process ${String(holder)}, which is this one`
    : `from process ${String(holder)}, which is gone`;
}

function minutes(ms: number): string {
  return String(Math.round(ms / MINUTE_MS));
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
