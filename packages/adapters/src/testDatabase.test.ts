import { describe, expect, it } from "vitest";

// biome-ignore-start lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import {
  openTestDatabase,
  type TestDatabaseOptions,
} from "../../../tools/supabase/testDatabase.mts";

// biome-ignore-end lint/style/noRestrictedImports: the import above

// What the global setup does before the tests run: hold the lock, start the
// test stack, and hand its address to the tests, but only when it is the
// test stack. The lock and the start are given.
describe("opening the test database", () => {
  it("sets the address and keys of the test stack, and keeps the lock until the run ends", async () => {
    const world = createWorld("http://127.0.0.1:54421");

    const release = await openTestDatabase(world.options);

    expect(world.environment).toEqual({
      SUPABASE_URL: "http://127.0.0.1:54421",
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    });
    expect(world.released).toBe(0);

    release();

    expect(world.released).toBe(1);
  });

  it("refuses a stack whose API is not on the test stack's port, sets nothing, and gives the lock back", async () => {
    const world = createWorld("http://127.0.0.1:54321");

    await expect(openTestDatabase(world.options)).rejects.toThrow(
      "The tests would run against http://127.0.0.1:54321, which is not the test stack (its API is on port 54421).",
    );
    expect(world.environment).toEqual({});
    expect(world.released).toBe(1);
  });

  it("gives the lock back when the stack does not start", async () => {
    const world = createWorld("http://127.0.0.1:54421");

    await expect(
      openTestDatabase({
        ...world.options,
        start: () => {
          return Promise.reject(new Error("no Docker"));
        },
      }),
    ).rejects.toThrow("no Docker");
    expect(world.released).toBe(1);
  });
});

interface World {
  options: TestDatabaseOptions;
  environment: NodeJS.ProcessEnv;
  readonly released: number;
}

/** A lock that counts its releases, and a stack that answers at `url`. */
function createWorld(url: string): World {
  const environment: NodeJS.ProcessEnv = {};
  let released = 0;

  return {
    environment,
    get released(): number {
      return released;
    },
    options: {
      environment,
      apiPort: 54421,
      lock: () => {
        return Promise.resolve(() => {
          released += 1;
        });
      },
      start: () => {
        return Promise.resolve({
          url,
          anonKey: "anon",
          serviceRoleKey: "service",
        });
      },
    },
  };
}
