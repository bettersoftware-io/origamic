// @vitest-environment node
// Vite builds in Node, not in the page jsdom stands in for.

import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

describe("the build", () => {
  it(
    "compiles the catalog's components with the React Compiler, which they rely on",
    BUILDING,
    async () => {
      const code = await codeBuiltFrom("catalog");

      expect(code).toContain(COMPILER_RUNTIME);
    },
  );

  it(
    "leaves the runtime uncompiled, as its own tests run it",
    BUILDING,
    async () => {
      const code = await codeBuiltFrom("runtime");

      expect(code).toContain("function AppView");
      expect(code).not.toContain(COMPILER_RUNTIME);
    },
  );

  it("compiles this package's own components with it", BUILDING, async () => {
    const code = await codeBuiltFrom("workspace");

    expect(code).toContain(COMPILER_RUNTIME);
  });
});

/** A build starts Vite and its plugins, which takes seconds on a busy machine (the gate runs every package's tests at once), not the test's usual five. */
const BUILDING = { timeout: 60_000 };

/** What a compiled component imports its memo cache from. */
const COMPILER_RUNTIME = '"react/compiler-runtime"';

/** One of the catalog's implementations, read as the workspace links it: as source, from its own folder. */
const CATALOG_TABLE: string = new URL(
  "../../../../packages/catalog/src/react/Table.tsx",
  import.meta.url,
).pathname;

/** The runtime's view of an app: the compiler would compile it, were the runtime not left out. */
const RUNTIME_APP_VIEW: string = new URL(
  "../../../../packages/runtime/src/AppView.tsx",
  import.meta.url,
).pathname;

const WORKSPACE: string = new URL("../ui/Workspace.tsx", import.meta.url)
  .pathname;

/** The three files, each an entry of the one build. */
const ENTRIES: Readonly<Record<string, string>> = {
  catalog: CATALOG_TABLE,
  runtime: RUNTIME_APP_VIEW,
  workspace: WORKSPACE,
};

let built: Promise<Map<string, string>> | undefined;

/** The code Vite wrote for one entry; the build runs once, for all three. */
async function codeBuiltFrom(entry: string): Promise<string> {
  built ??= runBuild();

  const code = (await built).get(entry);

  if (code === undefined) {
    throw new Error(`the build has no entry "${entry}"`);
  }

  return code;
}

/**
 * The files built together with this package's own Vite config, everything
 * they import left out, and the code of each as Vite wrote it.
 */
async function runBuild(): Promise<Map<string, string>> {
  const files = new Set(Object.values(ENTRIES));
  const output = await build({
    configFile: new URL("../../vite.config.ts", import.meta.url).pathname,
    root: new URL("../..", import.meta.url).pathname,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: { entry: ENTRIES, formats: ["es"] },
      rolldownOptions: {
        external: (id: string): boolean => {
          return !files.has(id);
        },
      },
    },
  });

  return new Map(
    chunksOf(output).map((chunk): [string, string] => {
      return [chunk.name, chunk.code];
    }),
  );
}

function chunksOf(
  output: Awaited<ReturnType<typeof build>>,
): Rolldown.OutputChunk[] {
  const outputs = Array.isArray(output) ? output : [output];

  return outputs.flatMap((each) => {
    if (!("output" in each)) {
      throw new Error("the build was started in watch mode");
    }

    return each.output.filter((file): file is Rolldown.OutputChunk => {
      return file.type === "chunk";
    });
  });
}
