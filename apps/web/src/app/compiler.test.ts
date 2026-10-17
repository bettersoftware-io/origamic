// @vitest-environment node
// Vite builds in Node, not in the page jsdom stands in for.

import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

describe("the build", () => {
  it(
    "compiles the catalog's components with the React Compiler, which they rely on",
    BUILDING,
    async () => {
      const code = await readCodeBuiltFrom(CATALOG_TABLE);

      expect(code).toContain(COMPILER_RUNTIME);
    },
  );

  it(
    "leaves the runtime uncompiled, as its own tests run it",
    BUILDING,
    async () => {
      const code = await readCodeBuiltFrom(RUNTIME_APP_VIEW);

      expect(code).toContain("function AppView");
      expect(code).not.toContain(COMPILER_RUNTIME);
    },
  );

  it("compiles this package's own components with it", BUILDING, async () => {
    const code = await readCodeBuiltFrom(WORKSPACE);

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

/**
 * The one file built with this package's own Vite config, everything it
 * imports left out, and the code as Vite wrote it.
 */
async function readCodeBuiltFrom(file: string): Promise<string> {
  const output = await build({
    configFile: new URL("../../vite.config.ts", import.meta.url).pathname,
    root: new URL("../..", import.meta.url).pathname,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: { entry: file, formats: ["es"] },
      rolldownOptions: {
        external: (id: string): boolean => {
          return id !== file;
        },
      },
    },
  });

  return chunksOf(output)
    .map((chunk) => {
      return chunk.code;
    })
    .join("\n");
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
