# origamic

A user describes a small app; Origamic builds it in front of them, saves it to
their library, and runs it, without generating code that must be deployed.
An app is a bundle of specs, data the runtime interprets. This is a
TypeScript monorepo built on ports and adapters, with a streaming UI on RxJS
and React, and the checks that keep it that way.

## First

```bash
git init          # the agent's stop hook reads git to know what changed
pnpm install
pnpm fix
pnpm gate:full    # everything CI runs
```

`pnpm gate:full` passes on the project as it was created. Run it before the
first change, so a later failure is known to come from the change.

## Every day

```bash
pnpm dev          # http://localhost:5173: the web app, every port on its simulator and the model scripted
pnpm dev:stack    # the web app on a local Supabase, with the gateway when ANTHROPIC_API_KEY is set
pnpm gate:fast    # architecture gates, lint, typecheck
pnpm gate:full    # gate:fast, then tests and the build: everything CI runs
pnpm gate:full:quiet   # the same commands and verdict, printing only the stage that failed
pnpm --filter @origamic/core test     # one package's tests
```

## What is in it

Seven packages under `packages/` and two apps under `apps/`, each named
`@origamic/<folder>` and imported by that name:

```ts
import type { ObjectStorePort } from "@origamic/core";
```

`spec` holds the schemas of the specs, `core` the ports and the behaviour,
`catalog` the components a spec can name, `runtime` the interpreter of a UI
spec, and `adapters` the real adapters (a local Supabase, the gateway's
client). `apps/web` is the composition root and the shell; `apps/gateway`
is the one place that calls the model. `packages/integration` and
`packages/e2e` hold tests only.
[docs/architecture/](docs/architecture/ARCHITECTURE.md) describes the
product, and [AGENTS.md](AGENTS.md) says where each kind of code goes and
lists the file that shows each pattern.

Packages export their TypeScript source. Nothing is compiled except the web
app, which Vite bundles; the gateway and the tooling are run by Node directly. This
needs Node 26 or later.

## The checks

The architecture gates, the lint rules and the agent hooks live in
`tools/arch`, and [its README](tools/arch/README.md) describes them. They are
files in this project, so they apply to everyone who works on it and to CI.

## Add-ons

Added when the project was created:

- `ci-security`: Supply-chain checks for a project on GitHub: workflow lint (actionlint, zizmor), Dependency Review, pnpm audit, OpenSSF Scorecard, a Dockerfile check, a security policy, and Dependabot or Renovate.
- `coverage`: A per-file coverage gate for every package, a ranked list of the gaps, a check that proves a test can fail, and a published coverage report.
- `format-lint`: Biome as the formatter, the general linter and the import sorter, with one check in gate:fast.
- `strict-lint`: Two checks in gate:fast: the ESLint rules that need types (a promise nobody waits for, a switch that misses a case), and knip for unused files, exports and dependencies.

Added since: `agent-workflow` (how a change leaves the machine) and `e2e`
(the end-to-end tests, in a real browser).

## By hand

- **A newer pnpm.** `packageManager` in `package.json` names pnpm by its
  version and by the hash of that release, which Corepack checks the download
  against. To move to another version run
  `node tools/arch/ci/pin-package-manager.mts pnpm@<version> --write`, then
  `pnpm install`. Do not type the hash.
- **What an add-on leaves to a person** is written at the top of the file it
  gave the project to keep. Read that file once: a security policy has times
  to make your own, and an update bot may need an app installed on the
  repository before it does anything. Settings on GitHub that no file can
  make are listed in that add-on's README, in the repository below.

`tools/installed.json` records what is installed now. The kit and the add-ons
come from <https://github.com/bettersoftware-io/skills>, which also holds the
script that adds one or brings one up to date.
