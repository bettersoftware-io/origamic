import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
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
    root = mkdtempSync(join(tmpdir(), "origamic-lock-test-"));
    folder = join(root, "locks");
    mkdirSync(folder, { mode: 0o700 });
    path = join(folder, "origamic-test-supabase.lock");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("makes its folder, readable by this user only", async () => {
    const own = join(root, "new");

    await lockTestDatabase(createWorld(own).options);

    expect(statSync(own).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(own, "origamic-test-supabase.lock"), "utf8")).toBe(
      "4242",
    );
  });

  it("refuses a folder others can write to", async () => {
    chmodSync(folder, 0o777);

    await expect(lockTestDatabase(createWorld(folder).options)).rejects.toThrow(
      "mode 0700",
    );
    expect(existsSync(path)).toBe(false);
  });

  it("refuses a folder that is a link to another", async () => {
    const link = join(root, "link");
    symlinkSync(folder, link);

    await expect(lockTestDatabase(createWorld(link).options)).rejects.toThrow(
      "mode 0700",
    );
    expect(existsSync(path)).toBe(false);
  });

  it("is taken when nobody holds it, and holds this process's pid", async () => {
    const world = createWorld(folder);

    await lockTestDatabase(world.options);

    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(world.said).toEqual([]);
  });

  it("does not follow a link left where it writes its pid aside", async () => {
    const elsewhere = join(root, "elsewhere");
    writeFileSync(elsewhere, "untouched");
    symlinkSync(elsewhere, `${path}.4242.new`);

    await lockTestDatabase(createWorld(folder).options);

    expect(readFileSync(elsewhere, "utf8")).toBe("untouched");
    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(existsSync(`${path}.4242.new`)).toBe(false);
  });

  it("is released, and can then be taken again", async () => {
    const world = createWorld(folder);

    const release = await lockTestDatabase(world.options);
    release();

    expect(existsSync(path)).toBe(false);

    await lockTestDatabase(world.options);

    expect(readFileSync(path, "utf8")).toBe("4242");
  });

  it("is not removed by a release once another process holds it", async () => {
    const world = createWorld(folder);

    const release = await lockTestDatabase(world.options);
    writeFileSync(path, "777");
    release();

    expect(readFileSync(path, "utf8")).toBe("777");
  });

  it("waits while a live process holds it, says once for which pid, and takes it when freed", async () => {
    writeFileSync(path, "111");
    const world = createWorld(folder, {
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
    const world = createWorld(folder, { alive: [] });

    await lockTestDatabase(world.options);

    expect(world.waits).toBe(0);
    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(world.said).toEqual([
      `Took over the test database's lock from process 222, which is gone (${path}).`,
    ]);
  });

  it("takes over a lock that holds this process's own pid, without waiting", async () => {
    writeFileSync(path, "4242");
    const world = createWorld(folder);

    await lockTestDatabase(world.options);

    expect(world.waits).toBe(0);
    expect(world.said).toEqual([
      `Took over the test database's lock from process 4242, which is this one (${path}).`,
    ]);
  });

  it("leaves a stale lock alone when another process took it over meanwhile", async () => {
    writeFileSync(path, "222");
    let heldOnFirstWait = "";
    const world = createWorld(folder, {
      alive: [333],
      onIsAlive: (pid: number): void => {
        if (pid === 222) {
          // Between this run's look and its takeover, process 333 took over.
          writeFileSync(path, "333");
        }
      },
      onWait: (waits: number): void => {
        if (waits === 1) {
          heldOnFirstWait = readFileSync(path, "utf8");
          rmSync(path);
        }
      },
    });

    await lockTestDatabase(world.options);

    expect(heldOnFirstWait).toBe("333");
    expect(world.said).toEqual([
      `Waiting for the test database: process 333 holds it (${path}).`,
    ]);
  });

  it("waits while another process is breaking a stale lock", async () => {
    writeFileSync(path, "222");
    writeFileSync(`${path}.break`, "333");
    const world = createWorld(folder, {
      onWait: (waits: number): void => {
        if (waits === 2) {
          rmSync(`${path}.break`);
        }
      },
    });

    await lockTestDatabase(world.options);

    expect(world.waits).toBe(2);
    expect(readFileSync(path, "utf8")).toBe("4242");
  });

  it("gives up when another process keeps breaking a stale lock for the limit", async () => {
    writeFileSync(path, "222");
    writeFileSync(`${path}.break`, "333");
    const world = createWorld(folder);

    await expect(lockTestDatabase(world.options)).rejects.toThrow(
      `Another process has been breaking the test database's stale lock for 10 minutes (${path}.break). If no test run is starting, delete that file.`,
    );
    expect(world.now()).toBe(10 * 60 * 1000);
  });

  it("clears a breaker left by a process that died while breaking", async () => {
    writeFileSync(path, "222");
    writeFileSync(`${path}.break`, "333");
    const aMinuteAgo = new Date(Date.now() - 60 * 1000);
    utimesSync(`${path}.break`, aMinuteAgo, aMinuteAgo);
    const world = createWorld(folder);

    await lockTestDatabase(world.options);

    expect(world.waits).toBe(0);
    expect(readFileSync(path, "utf8")).toBe("4242");
    expect(existsSync(`${path}.break`)).toBe(false);
  });

  it("takes over a lock that holds no pid", async () => {
    writeFileSync(path, "");
    const world = createWorld(folder, { alive: [] });

    await lockTestDatabase(world.options);

    expect(readFileSync(path, "utf8")).toBe("4242");
  });

  it("gives up after the limit, saying who holds it and what to do", async () => {
    writeFileSync(path, "111");
    const world = createWorld(folder, { alive: [111] });

    await expect(lockTestDatabase(world.options)).rejects.toThrow(
      `The test database is still held by process 111 after 10 minutes (${path}). If that process is stuck, stop it; if no such process runs, delete the file.`,
    );
    expect(world.now()).toBe(10 * 60 * 1000);
    expect(readFileSync(path, "utf8")).toBe("111");
  });

  it("counts the limit from when the holder last changed, so a queue that moves does not fail", async () => {
    writeFileSync(path, "111");
    const world = createWorld(folder, {
      alive: [111, 222],
      onWait: (): void => {
        if (world.now() === 9 * 60 * 1000) {
          writeFileSync(path, "222");
        }
      },
    });

    await expect(lockTestDatabase(world.options)).rejects.toThrow(
      "still held by process 222 after 10 minutes",
    );
    expect(world.now()).toBe(19 * 60 * 1000);
    expect(world.said).toEqual([
      `Waiting for the test database: process 111 holds it (${path}).`,
      `Waiting for the test database: process 222 holds it (${path}).`,
    ]);
  });

  let root: string;
  let folder: string;
  let path: string;
});

interface WorldSettings {
  /** The pids that are alive, besides this one. */
  alive?: number[];
  /** Called after each wait, with how many waits there have been. */
  onWait?: (waits: number) => void;
  /** Called when the lock asks whether a process is alive, before it is answered. */
  onIsAlive?: (pid: number) => void;
}

interface World {
  options: TestDatabaseLockOptions;
  said: string[];
  readonly waits: number;
  now: () => number;
}

/** A lock in `folder`, for process 4242, on a clock that moves only when it waits. */
function createWorld(
  folder: string,
  { alive = [], onWait, onIsAlive }: WorldSettings = {},
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
      folder,
      pid: 4242,
      isAlive: (pid: number) => {
        onIsAlive?.(pid);

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
