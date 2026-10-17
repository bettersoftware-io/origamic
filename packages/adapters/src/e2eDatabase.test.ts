import { describe, expect, it } from "vitest";

// biome-ignore-start lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import {
  type E2eDatabaseOptions,
  openE2eTestDatabase,
} from "../../../tools/supabase/e2eDatabase.mts";

// biome-ignore-end lint/style/noRestrictedImports: the imports above

// What the end-to-end tests' `stack` mode asks of the test database: what
// the adapters' tests ask (testDatabase.mts), with the lock held until the
// run ends. The opening is given; the real one is testDatabase.test.ts's.
describe("the e2e run's test database", () => {
  it("gives the web app the test stack's address and anon key, and no gateway", async () => {
    const world = createWorld();

    await expect(openE2eTestDatabase(world.options)).resolves.toEqual({
      VITE_SUPABASE_URL: "http://127.0.0.1:54421",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_GATEWAY_URL: "",
    });
  });

  it("holds the lock until the run ends, then gives it back", async () => {
    const world = createWorld();

    await openE2eTestDatabase(world.options);

    expect(world.released).toBe(0);

    world.endRun();

    expect(world.released).toBe(1);
  });

  it("holds nothing when the test database could not be opened", async () => {
    const world = createWorld({ fails: "Docker does not answer" });

    await expect(openE2eTestDatabase(world.options)).rejects.toThrow(
      "Docker does not answer",
    );
    expect(world.endings).toBe(0);
  });

  it("refuses a database opened without its address", async () => {
    const world = createWorld({ setsNothing: true });

    await expect(openE2eTestDatabase(world.options)).rejects.toThrow(
      "The test database was opened without its address or its anon key.",
    );
  });
});

interface WorldOptions {
  fails?: string;
  setsNothing?: boolean;
}

interface World {
  options: E2eDatabaseOptions;
  released: number;
  /** How many releases were handed to be given back at the run's end. */
  endings: number;
  endRun: () => void;
}

/** An opening that sets the test stack's variables as testDatabase.mts does, and a run's end the test chooses. */
function createWorld({ fails, setsNothing = false }: WorldOptions = {}): World {
  const atEnd: (() => void)[] = [];
  const world: World = {
    released: 0,
    endings: 0,
    endRun: (): void => {
      for (const release of atEnd) {
        release();
      }
    },
    options: {
      open: (environment: NodeJS.ProcessEnv): Promise<() => void> => {
        if (fails !== undefined) {
          return Promise.reject(new Error(fails));
        }

        if (!setsNothing) {
          environment.SUPABASE_URL = "http://127.0.0.1:54421";
          environment.SUPABASE_ANON_KEY = "anon";
          environment.SUPABASE_SERVICE_ROLE_KEY = "service";
        }

        return Promise.resolve(() => {
          world.released += 1;
        });
      },
      releaseAtEnd: (release: () => void): void => {
        world.endings += 1;
        atEnd.push(release);
      },
    },
  };

  return world;
}
