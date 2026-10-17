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
  // The kit requires a `domain` by default. Origamic has none: its ports are
  // in `core` (ADR-0012), which is the one role every project of the kit has.
  requiredRoles: ["core"],

  packages: {
    // `noNodeBuiltins` is on for every package that ends up in the browser.
    //
    // Origamic's packages. The table in docs/architecture/ARCHITECTURE.md
    // ("Layers and the dependency rule") is the source; each line below holds
    // one row of it. A role that grants too much is narrowed by `explicit`,
    // whose edges are only the ones its mayImport writes down.
    //
    // The schemas: imports nothing but zod, and every package may import it.
    "packages/spec": { role: "leaf", npm: ["zod"], noNodeBuiltins: true },
    // spec only: the role grants a domain and a shared package too, and
    // Origamic has neither. Origamic's ports are here, not in a domain
    // (ADR-0012). The function that builds the core is `createCore`,
    // not the kit's `createApp`: "app" is a word the glossary keeps for a
    // saved spec (the slice's plan, decision 5).
    "packages/core": {
      role: "core",
      npm: ["rxjs", "zod"],
      noNodeBuiltins: true,
      ports: "src/ports",
      compose: "createCore",
      appHarness: "src/testing/coreHarness.ts",
    },
    // spec only, and only the runtime imports it (the runtime names it). Its
    // React code is held to a client's rules, the compiler's included: it is
    // compiled by the app's build, which runs the React Compiler. The
    // libraries after react and zod are what its shadcn primitives are built
    // from (ADR-0010).
    "packages/catalog": {
      role: "explicit",
      mayImport: ["packages/spec"],
      reactRules: "client",
      reactCompiler: true,
      npm: [
        "react",
        "zod",
        "radix-ui",
        "cn",
        "class-variance-authority",
        "lucide-react",
      ],
      noNodeBuiltins: true,
    },
    // spec, core and catalog; never adapters. The bindings role is the kit's
    // "where RxJS meets React", with its lint rules.
    "packages/runtime": {
      role: "bindings",
      mayImport: ["packages/catalog"],
      npm: ["react", "rxjs"],
      noNodeBuiltins: true,
    },
    // core and spec, and only the app imports it (the app names it).
    // RxJS because the ports it implements return observables, as core's do.
    "packages/adapters": {
      role: "explicit",
      mayImport: ["packages/core", "packages/spec"],
      npm: ["@supabase/supabase-js", "rxjs"],
      noNodeBuiltins: true,
    },
    // The one place that calls the model (ADR-0011): spec, and the catalog's
    // manifest entry for what the model is held to. `mayImport` names the
    // whole catalog, so an import of its React side would pass the gate;
    // that half of the rule is a question for a review (ARCHITECTURE.md).
    "apps/gateway": {
      role: "server",
      mayImport: ["packages/catalog"],
      npm: ["@anthropic-ai/sdk"],
    },
    // The composition root and the shell (ARCHITECTURE.md's table): runtime,
    // core and spec by its role, and adapters, which it alone names. It is
    // the build that compiles the catalog, so the React Compiler that the
    // catalog's `reactCompiler` relies on runs here; src/app/compiler.test.ts
    // holds the build to it. Dockview is named nowhere else (ADR-0003).
    // `compilerTracked` lists the components that rely on the compiler:
    // `pnpm check:compiler` fails when it stops memoizing one of them.
    "apps/web": {
      role: "client",
      mayImport: ["packages/adapters"],
      npm: ["react", "react-dom", "dockview"],
      entry: ["main.tsx", "index.css", "*.d.ts"],
      noNodeBuiltins: true,
      reactCompiler: true,
      compilerTracked: [
        { file: "src/ui/Workspace.tsx", fn: "Dock" },
        { file: "src/ui/Proposal.tsx", fn: "Proposal" },
      ],
    },
    // The tests that run a client adapter against a real server (the
    // gateway); it may import every package, and nothing imports it.
    "packages/integration": { role: "integration" },
    // The end-to-end specs: they drive the built web app in a browser and
    // read only its test ids.
    "packages/e2e": { role: "e2e" },
  },

  // Folders whose modules implement ports. Each must run the contract test of
  // every port it implements.
  adapters: ["packages/core/src/simulators", "packages/adapters/src"],

  // Remove a line when its package gets a test script.
  packagesWithoutTests: {},

  // A library named here may be imported only from the packages listed, so it
  // can be replaced by changing those alone.
  vendorOnlyIn: {
    react: ["packages/catalog", "packages/runtime", "apps/web"],
    "react-dom": ["apps/web"],
    // ADR-0003: the shell translates Origamic's layout to dockview and back,
    // and replacing dockview changes that translation alone.
    dockview: ["apps/web"],
    // Origamic: rule 3 of ARCHITECTURE.md for the libraries, and the schema
    // language only where the table allows it.
    "@supabase/supabase-js": ["packages/adapters"],
    "@anthropic-ai/sdk": ["apps/gateway"],
    zod: ["packages/spec", "packages/core", "packages/catalog"],
    // What the catalog's shadcn primitives are built from (ADR-0010): only
    // its implementation layer may name them, so replacing shadcn changes
    // that package alone.
    "radix-ui": ["packages/catalog"],
    cn: ["packages/catalog"],
    "class-variance-authority": ["packages/catalog"],
    "lucide-react": ["packages/catalog"],
  },
};

export default config;
