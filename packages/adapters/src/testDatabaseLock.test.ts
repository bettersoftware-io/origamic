import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// biome-ignore-start lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import {
  lockTestDatabase,
  type TestDatabaseLockOptions,
} from "../../../tools/supabase/testDatabaseLock.mts";

// biome-ignore-end lint/style/noRestrictedImports: the import above

// The lock that lets one test run at a time use the test database, across
// every checkout on the machine. A real file in a folder of the test's own;
// the clock, the wait and whether a process is alive are given, so nothing
// sleeps.
describe("the lock on the test database", () => {
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "origamic-lock-test-"));
    path = join(folder, "test.lock");
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("is taken when nobody holds it, and holds this process's pid", async () => {
    const world = createWorld(path);

    await lockTestDatabase(world.options);

    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(world.said).toEqual([]);
  });

  it("is released, and can then be taken again", async () => {
    const world = createWorld(path);

    const release = await lockTestDatabase(world.options);
    release();

    expect(existsSync(path)).toBe(false);

    await lockTestDatabase(world.options);

    expect(readFileSync(path, "utf8")).toBe("4242");
  });

  it("is not removed by a release once another process holds it", async () => {
    const world = createWorld(path);

    const release = await lockTestDatabase(world.options);
    writeFileSync(path, "777");
    release();

    expect(readFileSync(path, "utf8")).toBe("777");
  });

  it("waits while a live process holds it, says once for which pid, and takes it when freed", async () => {
    writeFileSync(path, "111");
    const world = createWorld(path, {
      alive: [111],
      onWait: (waits: number): void => {
        if (waits === 3) {
          rmSync(path);
        }
      },
    });

    await lockTestDatabase(world.options);

    expect(world.waits).toBe(3);
    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(world.said).toEqual([
      `Waiting for the test database: process 111 holds it (${path}).`,
    ]);
  });

  it("takes over a lock whose process is gone, and says so", async () => {
    writeFileSync(path, "222");
    const world = createWorld(path, { alive: [] });

    await lockTestDatabase(world.options);

    expect(world.waits).toBe(0);
    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(world.said).toEqual([
      `Took over the test database's lock from process 222, which is gone (${path}).`,
    ]);
  });

  it("takes over a lock that holds no pid", async () => {
    writeFileSync(path, "");
    const world = createWorld(path, { alive: [] });

    await lockTestDatabase(world.options);

    expect(readFileSync(path, "utf8")).toBe("4242");
  });

  it("gives up after the limit, saying who holds it and what to do", async () => {
    writeFileSync(path, "111");
    const world = createWorld(path, { alive: [111] });

    await expect(lockTestDatabase(world.options)).rejects.toThrow(
      `The test database is still held by process 111 after 10 minutes (${path}). If that process is stuck, stop it; if no such process runs, delete the file.`,
    );
    expect(world.now()).toBe(10 * 60 * 1000);
    expect(readFileSync(path, "utf8")).toBe("111");
  });

  let folder: string;
  let path: string;
});

interface WorldSettings {
  /** The pids that are alive, besides this one. */
  alive?: number[];
  /** Called after each wait, with how many waits there have been. */
  onWait?: (waits: number) => void;
}

interface World {
  options: TestDatabaseLockOptions;
  said: string[];
  readonly waits: number;
  now: () => number;
}

/** A lock at `path`, for process 4242, on a clock that moves only when it waits. */
function createWorld(
  path: string,
  { alive = [], onWait }: WorldSettings = {},
): World {
  const said: string[] = [];
  let clock = 0;
  let waits = 0;

  return {
    said,
    get waits(): number {
      return waits;
    },
    now: () => {
      return clock;
    },
    options: {
      path,
      pid: 4242,
      isAlive: (pid: number) => {
        return pid === 4242 || alive.includes(pid);
      },
      now: () => {
        return clock;
      },
      wait: (ms: number) => {
        clock += ms;
        waits += 1;
        onWait?.(waits);

        return Promise.resolve();
      },
      say: (line: string) => {
        said.push(line);
      },
    },
  };
}
