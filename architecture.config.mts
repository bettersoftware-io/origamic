import type { ArchitectureConfig } from "./tools/arch/gates/lib/config.mts";

// Every workspace package appears here with the role it plays. A package that
// is not listed fails the structure gate, so a new one cannot slip in without
// its rules.
//
// Role       May import
// domain     nothing
// leaf       nothing
// shared     domain, leaf
// core       domain, shared, leaf
// bindings   core, domain, leaf
// client     bindings, core, domain, leaf
// server     domain, shared, leaf
// explicit   only what its own mayImport names; only a package naming it imports it
// integration  every role above; nothing may import it, and it holds only tests
// e2e        no source of the application: only a client's test ids, and types
const config: ArchitectureConfig = {
  packages: {
    // `noNodeBuiltins` is on for every package that ends up in the browser.
    // The domain has it by default.
    "packages/domain": { role: "domain", npm: ["rxjs"] },
    // Origamic's packages. The table in docs/architecture/ARCHITECTURE.md
    // ("Layers and the dependency rule") is the source; each line below holds
    // one row of it. A role that grants too much is narrowed by `explicit`,
    // whose edges are only the ones its mayImport writes down.
    //
    // The schemas: imports nothing but zod, and every package may import it.
    "packages/spec": { role: "leaf", npm: ["zod"], noNodeBuiltins: true },
    // spec only. The role also grants the price list's domain and shared,
    // until the slice removes them.
    "packages/core": {
      role: "core",
      npm: ["rxjs", "zod"],
      noNodeBuiltins: true,
    },
    // spec only, and only the runtime imports it (the runtime names it).
    "packages/catalog": {
      role: "explicit",
      mayImport: ["packages/spec"],
      npm: ["react", "zod"],
      noNodeBuiltins: true,
    },
    // spec, core and catalog; never adapters. The bindings role is the
    // starter's "where RxJS meets React", with its lint rules.
    "packages/runtime": {
      role: "bindings",
      mayImport: ["packages/catalog"],
      npm: ["react", "rxjs"],
      noNodeBuiltins: true,
    },
    // core and spec, and only the app imports it (the app will name it).
    "packages/adapters": {
      role: "explicit",
      mayImport: ["packages/core", "packages/spec"],
      npm: ["@supabase/supabase-js"],
      noNodeBuiltins: true,
    },
    "packages/shared": { role: "shared", noNodeBuiltins: true },
    "packages/client-core": { role: "core", noNodeBuiltins: true },
    "packages/react-bindings": { role: "bindings", noNodeBuiltins: true },
    // `reactCompiler` says the client's build runs the React Compiler, which
    // is why its source may not use useMemo, useCallback or memo.
    // `compilerTracked` lists what relies on that: `pnpm check:compiler`
    // fails when the compiler stops memoizing one of them.
    "packages/client-react": {
      role: "client",
      entry: ["main.tsx", "index.css", "*.d.ts"],
      noNodeBuiltins: true,
      reactCompiler: true,
      compilerTracked: [{ file: "src/ui/PriceList.tsx", fn: "PriceRowView" }],
    },
    "packages/server": { role: "server" },
    "packages/integration": { role: "integration" },
    "packages/e2e": { role: "e2e" },
  },

  // Folders whose modules implement ports. Each must run the contract test of
  // every port it implements.
  adapters: [
    "packages/domain/src/simulators",
    "packages/client-core/src/adapters",
    "packages/adapters/src",
  ],

  // A library named here may be imported only from the packages listed, so it
  // can be replaced by changing those alone.
  // Remove a line when its package gets a test script.
  packagesWithoutTests: {
    "packages/core":
      "it holds no code yet: its first code comes with the first slice, and its tests with it",
    "packages/catalog":
      "it holds no code yet: its first code comes with the first slice, and its tests with it",
    "packages/runtime":
      "it holds no code yet: its first code comes with the first slice, and its tests with it",
  },

  vendorOnlyIn: {
    react: [
      "packages/react-bindings",
      "packages/client-react",
      "packages/catalog",
      "packages/runtime",
    ],
    "react-dom": ["packages/react-bindings", "packages/client-react"],
    ws: ["packages/server"],
    // Origamic: rule 3 of ARCHITECTURE.md for the libraries, and the schema
    // language only where the table allows it.
    "@supabase/supabase-js": ["packages/adapters"],
    zod: ["packages/spec", "packages/core", "packages/catalog"],
  },
};

export default config;
