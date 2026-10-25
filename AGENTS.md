# Working in this project

Origamic: a TypeScript monorepo built on ports and adapters, with a streaming
UI on RxJS and React. The rules below are enforced by checks, not by
convention.

## Commands

```bash
pnpm dev          # Origamic's web app, every port on its simulator and the model scripted
pnpm dev:stack    # the web app on a local Supabase, with the gateway when ANTHROPIC_API_KEY is set
pnpm gate:fast    # architecture gates, React checks, lint, typecheck: seconds, for while you work
pnpm gate:full    # gate:fast, then tests and the build: what CI runs
pnpm gate:full:quiet   # the same commands and verdict, printing only the stage that failed
pnpm test
```

Run `pnpm gate:full` before you say work is finished. A red gate means the
work is not finished, and `gate:fast` alone does not show that it is: it runs
no test. The stop hook runs `gate:full` for you whenever a file has changed
since it last passed.

`pnpm gate:full:quiet` (and `gate:fast:quiet`) runs the same commands in the
same order and exits with the same code. It prints one line for each stage
that passed, any `SKIP` line that stage printed, and the whole output of the
stage that failed. Run the quiet form
when you are the one reading the output: the loud form prints every passing
test and every cached task. Skip it when a person asked to see the full
output; CI runs the loud form.

Some sandboxes do not let a process listen on a port; Codex's default one does
not. There the tests that open a real port (the files named `*.port.test.ts`)
are left out, and the run prints a `SKIP` line that says so. That is the
sandbox, not your change: say in your report that those tests were not run
where you are. The stop hook runs `gate:full` outside the sandbox, and CI
never skips them.

## The layers

Dependencies point inward only. `architecture.config.mts` is the declaration
the gates read; a package that is not listed there fails.
[ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) holds the same rule as
a table, and says why.

| Package | Role | Holds | May import |
|---|---|---|---|
| `packages/spec` | leaf | The schemas of every spec, and the pure functions over them: the reference checks, `applyChangeSet`, `validateApp` | nothing (npm: `zod` only) |
| `packages/core` | core | The ports, their contracts and simulators; the ontology's rules (`planWrite`); the session of an open app, the builder, the workspace; `createCore` | spec (npm: `rxjs`, `zod`) |
| `packages/catalog` | explicit | The components a spec can name: each one's contract and its React implementation; the manifest the model is held to | spec (npm: `react`, `zod`, and what its shadcn primitives are built from) |
| `packages/runtime` | bindings | The spec interpreter (`AppView`) and the shell's view model: the only place RxJS meets React | spec, core, catalog; never adapters (npm: `react`, `rxjs`) |
| `packages/adapters` | explicit | The real adapters: the Supabase stores and session, the gateway's HTTP client; the local Supabase's migrations | spec, core (npm: `@supabase/supabase-js`, `rxjs`) |
| `apps/web` | client | `src/app` (the composition root) and `src/ui` (the shell's dumb components, on dockview) | runtime, core, spec, adapters (npm: `react`, `react-dom`, `dockview`) |
| `apps/gateway` | server | The one place that calls the model, and checks what it returns | spec, the catalog's manifest (npm: `@anthropic-ai/sdk`, Node's built-ins) |
| `packages/integration` | integration | Tests that run a client adapter against a real server: the gateway. Tests only | every package above; nothing imports it |
| `packages/e2e` | e2e | The end-to-end specs, run on the built web app in a browser | no source of the app: its test ids, and types |

## Where a thing goes

- **It needs the outside world** (storage, the session, the model): declare a
  port in `packages/core/src/ports`, as `<Name>Port` in `<name>Port.ts`, in
  the ontology's words. Write its contract beside it, in
  `__contracts__/<Name>PortContract.ts`. Implement it as a simulator in
  `packages/core/src/simulators` and as a real adapter in
  `packages/adapters/src`, and run the contract against both. The gates find
  a port, and hold an adapter to its contract, only by that name.
- **It is the shape of a spec, or a pure check over one** (a schema, a
  reference, applying a change set): `packages/spec`. It takes the ontology
  and the catalog's manifest as data.
- **It is application behaviour** (what an action writes, what a view
  returns, the builder's conversation with the model, the panels of the
  workspace): a rule, a presenter or a state machine in `packages/core`.
  `createCore` builds them over the ports.
- **It turns a row or a response into the spec's terms**: the adapter, which
  parses it with a schema of `spec`. Nothing past an adapter names a table, a
  column, a query or an address.
- **It is a component a spec can name**: a catalog entry, with its contract in
  `packages/catalog/src/contract/components` and its implementation in
  `packages/catalog/src/react`. It is a pure function of its props and emits
  events. Never a component written by hand in the shell when an entry would
  do.
- **It draws a UI spec, or turns the core's streams into hooks**:
  `packages/runtime`.
- **It reads configuration or picks an adapter**: the composition root of its
  app, `apps/web/src/app` for the browser and `apps/gateway/src/main.ts` for
  the gateway. Nowhere else.
- **It is the shell on screen** (signing in, the builder, the library, the
  workspace): a component in `apps/web/src/ui`, reading from the view model.
  No RxJS, storage, `fetch`, environment or timers there.
- **It asks the model**: `apps/gateway`, and nothing else.
- **It checks that a client adapter and a server agree**: a test in
  `packages/integration`, the only package that may import both. Each side's
  own tests stay where they are; this is for what neither can see alone.
- **It is a new package**: list it in `architecture.config.mts` with its role,
  and give it a `typecheck` and a `test` script. One that holds only types
  also says `typesOnly: true`.

Four rules about imports:

- A presenter or a state machine takes its ports as arguments. It never
  imports an adapter.
- No Node built-in (`node:fs`, `node:path`) outside `apps/gateway`, except in
  tests: everything else runs in the browser.
- `react` is imported only in `catalog`, `runtime` and `apps/web`;
  `react-dom` and `dockview` only in `apps/web`; `@supabase/supabase-js` only
  in `adapters`; `@anthropic-ai/sdk` only in `apps/gateway`; `zod` only in
  `spec`, `core` and `catalog`; what shadcn's primitives are built from
  (`radix-ui`, `cn`, `class-variance-authority`, `lucide-react`) only in
  `catalog`.
- What is written for tests (a `testing/` folder, a `*.page.tsx`, a test) is
  imported only by tests.

The first slice, the book tracker, is a worked example of every one of
these. Copy its shape:

| Pattern | File |
|---|---|
| Port | `packages/core/src/ports/objectStorePort.ts` |
| Contract test | `packages/core/src/ports/__contracts__/ObjectStorePortContract.ts` |
| Simulator, and the contract run against it | `packages/core/src/simulators/objectStoreSimulator.ts`, `objectStoreSimulator.test.ts` |
| Real adapter, and the contract run against it | `packages/adapters/src/supabase/supabaseObjectStore.ts`, `supabaseObjectStore.supabase.test.ts` |
| A rule of the ontology, a pure function | `packages/core/src/actions/planWrite.ts` |
| Presenter (shared state) | `packages/core/src/workspace/workspacePresenter.ts` |
| State machine | `packages/core/src/builder/builder.ts` |
| The core's composition, and its one harness | `packages/core/src/createCore.ts`, `packages/core/src/testing/coreHarness.ts` |
| Catalog component: contract, implementation, page object and test | `packages/catalog/src/contract/components/select.ts`, `packages/catalog/src/react/Select.tsx`, `Select.page.tsx`, `Select.test.tsx` |
| Spec interpreter | `packages/runtime/src/AppView.tsx` |
| View model | `packages/runtime/src/viewModel/createShellViewModel.ts` |
| Composition root, and the choice of adapters | `apps/web/src/app/startApp.tsx`, `apps/web/src/app/composePorts.ts` |
| Dumb component | `apps/web/src/ui/Library.tsx` |
| Page object and its test | `apps/web/src/ui/Library.page.tsx`, `Library.test.tsx` |
| Server | `apps/gateway/src/server.ts` |
| Client adapter against the real server | `packages/integration/src/llmGatewayOverHttp.port.test.ts` |

## Tests

- Anything on a timer is tested on fake timers, advanced by the exact interval.
  A test never sleeps.
- A UI test talks to a page object. Only the page object touches the testing
  library.
- A test id is a constant, never a string literal. The shell's are in
  `apps/web/src/ui/testids.ts`, used by the component, its page object and
  the end-to-end page objects (`packages/e2e/src/pages`). An element of a UI spec has `spec.<element id>`,
  which the runtime derives (`packages/runtime/src/elementTestId.ts`), and a
  part of it adds `.<part>` (`packages/catalog/src/react/testIds.ts`).
- A test that needs the whole core asks `createCoreHarness`, in
  `packages/core/src/testing/coreHarness.ts`: every port on its simulator,
  the model scripted. No other test, page object or `testing/` file calls
  `createCore`.
- A port's contract imports the port, the spec, the helpers and fixtures
  beside it, and the test runner. Never a simulator or an adapter: each
  one's test passes itself in.
- A test that opens a real port is named `*.port.test.ts`, so it can be left
  out, and said to be left out, where a port cannot be opened. One that needs
  the local Supabase is named `*.supabase.test.ts` (see "Origamic" below).
- No test asks the real model. The gateway and everything above it are
  tested on a scripted model (ADR-0011).
- A fixture factory is named `create…`.
- Tests come first in a test file; helpers go below them.

## TypeScript only

No JavaScript source files. Scripts and tool configs are `.mts`, which Node runs
directly. A file a tool can only load as JavaScript is listed in
`architecture.config.mts` under `javascriptAllowed`, with the reason.

## Node

The oldest Node this runs on is declared once, as `devEngines.runtime` in the
root `package.json`. Never add `engines.node` to any `package.json`: a host's
build (`vercel build`) reads it and refuses a range above the Node it offers,
so the deploy fails with every check green. The `node-floor` gate holds both.

pnpm is named once, as `packageManager` in the root `package.json`: an exact
version, then `+sha512.` and the hash of that release. Corepack checks the
download against it. To move to another pnpm run
`node tools/arch/ci/pin-package-manager.mts pnpm@<version> --write`, then
`pnpm install`. Never type or copy the hash by hand, and never delete it to
get past the `package-manager` gate.

## How code is written

`pnpm lint` enforces these. `pnpm lint --fix` repairs the ones marked (fix).

- A named function is a `function` declaration, never a `const` holding an
  arrow. Helpers go below the function that uses them.
- An arrow (a callback, a member of an object) has a block body and a
  `return`. (fix)
- A blank line before and after a function and a block that spans lines,
  between two declarations that span lines, and between the members of a
  class. (fix)
- An object type has a name. No `{ … }` type on a parameter, a return type, a
  variable, a class property, a cast or a type argument: declare an
  `interface` and use it.
- One import statement per module, with an inline `type` on each type:
  `import { type Ontology, validateApp } from "@origamic/spec"`. A statement that names only
  types stays `import type`. (fix)
- No CommonJS: no `require`, `module.exports`, `__dirname` or `__filename`,
  and no `.cts` file. Use `import` and `import.meta.dirname`.
- One class in a file, and the file has its name.
- In a component, take the hooks out of the view model by name:
  `const { useLibrary } = useShellViewModel()`. Never keep the bundle in a variable
  or call through it.
- A component follows React's rules: a hook is called at the top level, an
  effect lists what it reads, and nothing reads a ref or sets state while
  rendering.
- No `style={{ … }}` in a component: styling goes in a stylesheet, by class.
- `packages/runtime` uses no `useMemo`, `useCallback` or `memo`. Logic that
  needs one belongs in the core.
- `apps/web` and `packages/catalog` use none of the three either, for another
  reason: the React Compiler memoizes at build time. Write the plain value,
  and a function declaration for a callback.

## The React Compiler

The web app's build runs the React Compiler (`apps/web/vite.config.ts`), over
its own components and the catalog's; the runtime is left out of it. The
compiler skips a function it cannot compile and says nothing, so two checks
in `gate:fast` hold it:

- `pnpm check:react-policies` fails when `reactCompiler` in
  `architecture.config.mts` and the build disagree, and when a package that
  imports React is not under the lint rules for its role.
- `pnpm check:compiler` compiles each function listed under `compilerTracked`
  in `architecture.config.mts` and fails when one is no longer memoized.

What no check decides:

- **A component that reads the view model is not compiled.** Its hooks come
  out of a value (`const { useLibrary } = useShellViewModel()`), and the
  compiler skips such a function. Keep that component thin: it reads, and
  hands plain props to components that take only props. Those are compiled.
  `apps/web/src/ui/Library.tsx` shows both.
- **When to add an entry to `compilerTracked`.** When a component depends on
  the compiler to keep something stable or cheap: a costly derived value, a
  callback a child compares. Skip it for a component whose render is cheap
  anyway.
- **When the compiler cannot do it** (an identity a library needs to stay the
  same, in a function the compiler skips): say so and ask. Do not switch the
  lint rule off to add a `useMemo`.

## Imports inside a package

An import of a file in the same package is relative and climbs one folder at
most, as in `../ports/objectStorePort.ts`. Anything deeper is written from
the package's `src` with the `#/` alias: `#/ports/objectStorePort.ts`. Every package
declares it (`"imports": { "#/*": "./src/*" }` in its `package.json`), and
Node, Vite, Vitest and `tsc` all read it from there. A new package declares it
too.

Skip it in a `*.config.ts` file that reaches `tools/`: the alias cannot point
outside its package. The gates follow an alias to the file it names, so a
forbidden import is still found. The `format-lint` add-on fails a deeper
relative import; without it this is a convention.

## Adding a check

Every check in this project was put here by an installer, and
`tools/installed.json` records each file it wrote. So a new check, or a newer
copy of the kit or of an add-on, comes through that installer too: the
`extending-a-project` skill of the plugin this project was made with says how
to run it, and run with no arguments it lists the add-ons. Look there before
you write a workflow, a lint config or a test package for a check. A file the
installer did not write is one it cannot update, and it will not overwrite a
file you have edited.

## Reviewing a change

A review in this project does two things first, whoever or whatever does it:

1. Runs `pnpm gate:fast` and shows its output. Not run is not passed.
2. Answers the seven questions in `tools/arch/docs/review.md`, each with its
   evidence as `file:line` and a verdict, including the ones that pass.

Anything else a review finds (robustness, security, performance) comes after
those, never in place of them.

## When a gate fails

Its message says what is wrong and where the code belongs. Fix the code. If you
believe a finding is wrong, or it is outside what you were asked to do, say so;
do not work around the gate or edit the rules to make it pass.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

<!-- add-on: ci-security -->
## CI security

Three workflows check the supply chain on GitHub: `CI security` (workflow lint
and `pnpm audit --prod`), `Dependency Review` and `Scorecard`. They need the
network, so none of them is in `pnpm gate:full`. `pnpm check:dockerfiles`
needs none and is in `gate:fast`. This section is what they cannot decide.

```bash
pnpm lint:workflows              # actionlint (valid?) then zizmor (safe?)
pnpm lint:workflows zizmor       # one of them
pnpm check:dockerfiles           # images by digest, no root, no package outside a lockfile
pnpm repo:settings               # which repository settings on GitHub are off; it only reads
```

Exit 0 is a pass. Exit 1 is a finding, named in the linter's output above the
`FAIL` line. Exit 2 with a `SKIP` line means the lint did not run here (no
network on the first run, no build for this machine, a wrong checksum). Report
a `SKIP` as "not run". Never report it as a pass, and do not retry in a loop: a
sandbox with no network will not get one.

### The repository's settings

`pnpm repo:settings` asks GitHub which of the settings these checks depend on
are on. Run it after the project's first push to GitHub, and when a check
fails for a reason the diff cannot have caused, such as Dependency Review
saying the dependency graph is off. Skip it otherwise. It only reads.
Switching a setting on is a person's step: show the user the `fix:` command
it prints, and do not run it. Report a `SKIP` line as "not read", never as on
or as off.

### When you add or change a workflow

Run `pnpm lint:workflows` before you commit. Skip it only when no file under
`.github/` changed. In a new workflow:

- Pin every action by its full commit hash, with the version in a comment
  after it. Take the hash from the action's release, not from memory.
- Give the workflow `permissions: contents: read`. Grant a write on the one job
  that needs it, with a comment that says why.
- Write `persist-credentials: false` on every checkout, unless that job pushes.
- Put no `${{ … }}` expression in a `run:` line. Pass the value through `env:`
  and quote the variable.
- Do not use `pull_request_target` or `workflow_run`. If the task seems to need
  one, stop and ask the user.

Do not silence a finding with `# zizmor: ignore[…]`, a `zizmor.yml` or an
`actionlint.yaml` to turn the run green. Fix the workflow. If you believe a
finding is wrong, say so and leave it red.

### When Dependency Review fails a pull request

Its job summary names the package and the advisory or licence.

- **An advisory:** move to the patched version it names. If the package came
  in through another one, update that one, or add a pnpm `overrides` entry
  that lifts only the vulnerable package, with a comment that names the
  advisory.
- **No patched version exists:** do not add the dependency. If it is already
  on main, tell the user; they decide whether to accept it.
- **A refused licence** (GPL, AGPL, SSPL): do not add the package. Find
  another. A package offered under two licences, one of them permissive, is
  the user's decision, not yours.

Never loosen `fail-on-severity`, `fail-on-scopes` or `deny-licenses` to pass.

### When `pnpm audit --prod` fails

The same steps as an advisory above. The weekly run can fail with no change in
the project: an advisory was published for a version already in the lockfile.

### When you add or change a Dockerfile

Run `pnpm check:dockerfiles`. Skip this when no Dockerfile changed.

- Take a digest from the registry
  (`docker buildx imagetools inspect <image>:<tag>`), never from memory, and
  keep the tag in front of it for the reader. The same for an image in
  `COPY --from=` and in `RUN --mount=…,from=`.
- Write the image and the user out. A variable in either fails, whatever its
  default: `FROM ${BASE}`, `USER ${APP_USER}`.
- End the last stage with `USER` and a plain name or number that is not root.
- Write a heredoc as `<<EOF` on a line with no quotes, and put the script in
  its body.
- "Nothing else in this file was judged" means the check could not read the
  file as Docker does. Fix that line first, then run it again: the other
  findings come after.

Do not get past a finding by another spelling, by moving the Dockerfile, or
by a `--build-arg` or `--target` on the command line. If you believe a finding
is wrong, say so and leave it red.

### The update bot

The project has one update bot, Dependabot or Renovate, and its config is the
one file for it in `.github/`. Never add a config for the other by hand: two
bots open the same pull requests twice. To
move from one to the other, tell the user; it is one command in the
repository the add-on came from, and Renovate needs its GitHub App installed
by a person. Do not shorten the release age in either file to get an update
sooner.

### `SECURITY.md`

It is the project's own text. Change it only when the user asks, and keep
its promises (the answer time, the disclosure time) ones the user chose.

### Moving a linter to a newer release

`tools/ci-security/lib/pins.mts` holds the version, four URLs and four
checksums of each linter, and its first lines give the command that prints the
checksums. Change all of them together. If a download is refused for a wrong
checksum, never copy the new checksum into the file to make it pass: tell the
user.
<!-- /add-on: ci-security -->

<!-- add-on: coverage -->
## Coverage

`pnpm coverage` holds every file of every package to the bar: 95% of lines,
statements and functions, 85% of branches. It runs in `pnpm gate:full`. A file
is measured with its own package's tests only, so a file that only another
package's tests run reads 0%. The gate decides pass or fail; this section is
what it cannot decide.

### Closing a gap

1. Run `pnpm coverage:gaps`. It measures afresh and ranks the files with the
   most lines no test reaches, across all packages.
2. Start from the top. Read the file and say what is uncovered: a branch, an
   error path, a whole module. Take first the code whose failure nobody would
   notice, such as the choice of adapter in a composition root.
3. Write the test through the public interface: the port, the presenter, the
   page object. Do not export an internal function to reach a line, and do not
   write a test that runs a line and asserts nothing.
4. Prove the test can fail. Put the mutant a wrong implementation would contain
   (`<` for `>`, a dropped guard) in a JSON spec and run
   `pnpm mutation-check mutants.json`; the format is at the top of
   `tools/coverage/mutation-check.mts`. `SURVIVED` means the test cannot see
   that mistake: strengthen the test. `NO TESTS` means the row's command ran
   no test, usually a `-t` filter that matches no title (vitest cuts an
   `it.each` title at 40 characters): fix the command. Skip this only for a test that already
   failed in front of you before the code existed.
5. Run `pnpm coverage` again.

### When not to chase the number

- **A file no test can reach** (generated code, an entry point that starts the
  app when it is imported): list it under `exclude` in
  `tools/coverage.config.mts`, written from the project root, with the reason.
  Create that file if it is not there; `tools/coverage/lib/config.mts` shows
  its shape and belongs to the add-on, so do not edit it.
- **A line only a real browser or a real network reaches**: mark it
  `/* v8 ignore next -- <why no test can reach it> */`. The gate fails a
  comment without the reason.
- **Test code** (page objects, contract tests, `testing/` harnesses) and files
  with nothing to run (types, re-exports) are already left out. They need no
  test.
- A missing test is never a reason. Do not lower a threshold, exclude a file or
  ignore a line to turn the gate green. If the bar looks wrong for a file, say
  so and leave the gate red.

### Reading the published report

The report on GitHub Pages shows the commit that built it, not the newest one.
Its first line states that commit and the date, and `summary.json` beside it
holds the same. Compare the commit with the code you are reading before you
quote a number from it. For a decision, run `pnpm coverage:gaps`: it is never
stale.
<!-- /add-on: coverage -->

<!-- add-on: format-lint -->
## Formatting and lint (Biome)

`pnpm biome:check` (part of `gate:fast`) fails a file that is not formatted, an
import list that is out of order, and a lint finding, warnings included. It
changes nothing. What it cannot decide is below.

**When to run the fixer.** Run `pnpm fix` after you finish editing and before
you run the gate. Do not lay code out by hand, and do not sort imports by
hand. Skip it when you changed no source, JSON or CSS file.

`pnpm fix` runs Biome's fixer and `eslint --fix` in turn until neither
changes a file. Run that one command, not the two by hand: each can make
work for the other (Biome rewraps a line, and ESLint then wants a blank line
beside it), so one pass of each is not always enough. `pnpm biome:fix` is
Biome alone.

- **It prints `FAIL fix — … still has findings no fixer repairs`.** The files
  are settled; what is listed is yours to fix in the code.
- **It prints `FAIL fix — not settled`.** The two fixers undo each other on
  the files it names. Do not run it again. That is a conflict between
  `biome.json` and the ESLint config: say so, with the file, and ask.

**An import for its effect is sorted too.** `import "./index.css"` goes
where the fixer puts it, after the code's imports. Do not write CSS that
depends on which of two imported stylesheets loads first. If one must follow
another, `@import` it from that one.

**What the fixer leaves to you.** It applies only the fixes Biome calls safe.
A finding it prints and does not fix is yours to fix in the code: add the
braces, write the type, narrow the value. Do not pass `--unsafe` over the
whole project; an unsafe fix can change what the code does.

**When a rule seems wrong.** Decide which of these it is:

- The code can say the same thing in a way the rule accepts. Do that. For a
  `!` assertion, check the value and throw with a message that says what was
  missing.
- The rule does not fit one kind of file (a framework needs a default export
  there, say). Add an `overrides` entry for those files to `biome.json` at
  the root, and write the reason in the commit message.
- The rule does not fit this project at all. Say so and ask before you turn it
  off in `biome.json`.
- One line is a true exception. Only then write
  `// biome-ignore lint/<group>/<rule>: <reason>` on the line above. The
  reason says why this line is different, not what the rule is. Never write
  one without a reason, and never to get a gate to pass.

Do not edit `tools/format-lint/biome.base.json`: an update of the add-on
replaces it. The project's own rules go in `biome.json`, which extends it.

Biome does not read `tools/`. It does not replace `pnpm lint` (ESLint, the
architecture rules); both run.
<!-- /add-on: format-lint -->

<!-- add-on: strict-lint -->
## Strict lint (types and dead code)

Two checks run in `gate:fast`. `pnpm lint:types` runs the ESLint rules that
need types. `pnpm lint:dead` runs knip: unused files, exports and
dependencies. Each names the file. What they cannot decide is below.

**A promise nothing waits for.** Choose one, in this order:

- `await` it, when the code after it needs the work to be done or must see it
  fail.
- `return` it, when the caller is the one who should wait.
- Mark it `void`, when nothing may wait (an event handler, a fire-and-forget
  log). Then the promise must handle its own failure (`.catch`), and a comment
  on the line above says why nothing waits. Never write `void` to get the
  gate to pass.

**An `async` function where a plain callback is expected** (`forEach`, an
event handler, a subscriber). Do not make the callback `async`. Use a
`for…of` loop with `await`, or call a named function and treat its promise as
above.

**A `switch` that misses a case.** Add the case. Add a `default` branch only
when the rest really are handled the same way; a `default` that hides a new
member is the bug this rule exists to stop.

**"No tsconfig.json includes this file."** The file is not typechecked
either. Add it to the `include` of its package's `tsconfig.json`. Do not move
it under `tools/` to hide it.

**knip calls something unused.** First check that it is: search for the name.

- It is unused. Remove it: the file, the `export` keyword, the line in an
  `index.ts`, the line in `package.json`. Do not keep an export for a caller
  that does not exist yet; add it with the caller.
- Only a test uses it. That counts as used, and knip does not report it. If it
  is reported, the test does not import it.
- It is used in a way knip cannot follow: a file a tool loads by name, a
  program started from a string, a page a config serves. Name the file as an
  `entry` in `tools/strict-lint/knip.jsonc`, or the dependency in
  `ignoreDependencies`, with a comment that says who uses it.

Never turn a kind of finding off, and never add a file to `ignore`, to get
past one finding.

A new package needs nothing: `packages/*` covers it. Skip all of this for a
change that touches no TypeScript file and no `package.json`.

Do not edit `tools/strict-lint/eslint.typed.base.mts`; an update replaces it.
A rule the project adds or changes goes in `tools/strict-lint/eslint.config.mts`.
<!-- /add-on: strict-lint -->

## Origamic

Read docs/architecture/VISION.md and docs/architecture/ARCHITECTURE.md
before any change, and the decision records in docs/architecture/adr/ that
touch it. The dependency rule between Origamic's packages: spec ← core ←
runtime ← apps/web; catalog imports spec only; of the browser's packages,
adapters are the only one that knows Supabase, SQL or HTTP, and only the
gateway calls the model. Which npm packages each may import is in
ARCHITECTURE.md. UI binds to the ontology only; every write is a named
action; every spec is versioned and bindings carry versions.

Two things agents get wrong in spec-driven systems: bypassing the schemas
with `any`, and hand-writing a component when a catalog entry would do.
Don't.

The tests named `*.supabase.test.ts` run against a local Supabase in Docker,
the test stack, which the gate starts and leaves running (ADR-0004). Where
Docker is not running they are left out, and the run prints `SKIP supabase —
Docker is not running here; …`. Report that as not run, as for a port. In CI
they always run. The test stack's data is throwaway: a run resets it when its
migrations do not match the checkout's, and says so, and runs from several
checkouts take turns on it. The dev stack, apart from it, is the author's:
`pnpm supabase:dev` starts it, and nothing resets it.

<!-- add-on: agent-workflow -->
## Agent workflow

How a change leaves this machine. A hook refuses a shell command that joins
an outward step to anything else; this section is what the hook cannot
decide: when the outward steps run.

The rules serve three aims, in this order when they pull apart:

1. **Main is never red.** A red main stops every session at once.
2. **Many sessions work on the project at the same time.** None waits for
   another, and none edits what another is editing.
3. **A green change is on main within minutes.** Nothing waits for a person
   who was not asked to review it.

```bash
pnpm worktree <name> [--ready]     # a worktree beside the project, on worktree-<name>, cut from origin's main
pnpm worktree:audit [part of a name]   # which worktrees are finished, and which hold work; it only reads
pnpm changelog due                 # the finished weeks to write or extend (reads git, offline)
pnpm changelog weeks               # the weeks CHANGELOG.md has no entry for
pnpm changelog prs <week>          # what was merged in a week (reads GitHub)
pnpm changelog check <week>        # every merged pull request cited, every citation defined
pnpm changelog defs [--write]      # the link definitions are the generated ones
pnpm agent-workflow:check          # the hook works and is registered in each host's settings
```

### An outward step is a call of its own

An outward step sends something off this machine or changes shared state:
`git push`, `gh pr create`, `merge`, `edit`, `comment` or `close`,
`gh workflow run`, `gh run rerun` or `cancel`, a `gh api` call that writes,
and `gh issue`, `gh release` and `gh repo` writes. Everything else is local:
`git add`, `git commit`, `git fetch`, tests, `gh pr view`, `gh run list`.

Run each outward step as its own tool call. A pipe into a filter
(`git push 2>&1 | tail -2`) is still one step. Joining it to anything with
`&&`, `;`, `||` or a new line is refused. When the hook refuses a command,
split it. Do not reword it to get past the hook: the point is the order of
the work, not the shape of the command.

### Put the outward steps at the two ends

Plan a piece of work in three parts:

1. **Start:** anything outward the work depends on, such as a workflow run
   whose result you need later. Often nothing.
2. **Local work:** the worktree, edits, tests, gates, commits. Nothing here
   asks for permission. For several pull requests, do the local work of all
   of them here.
3. **End:** push, open the pull request, wait for green, merge, clean up,
   watch main. One call each, one after the other. The sections from "Wait
   for green on your commit" on say how.

A person may be away while you work, and each permission prompt stops the
session until they return. Prompts at the two ends cost two waits; prompts
spread through the work cost one wait each.

- Waiting for checks is not a reason to start local work that will need a
  second push. Use the wait to read and to write the report.
- A decision the user must make (whether to delete, whether to force) goes at
  the same end, not in the middle. Whether to merge a green pull request is
  not one: see "Merge when it is green".
- If you pushed and then found one more edit, fold it into the next closing
  batch. Do not push after every edit.

Skip this ordering for a task with no outward step, and when the user asks
for a push now.

### Every outward step asks

The hook never lets a command run without a prompt. It refuses a chain, and
of Claude Code it asks about a push that is not written plainly
(a colon as in `git push origin a:b`, an option that forces or deletes, a
quote, a variable), whatever rule allows a push. It says nothing else,
so each push, each pull request step and each merge asks a person, under the
host's own rules. Do not add an `allow` rule for one to
`.claude/settings.json`, and do not change the hook under
`tools/agent-workflow/`, unless the user asks: that is the user's decision,
not a step of the work.

A session often does not stand in the worktree when it runs an outward step.
Name the place in the command: `git -C <worktree> push`, and
`--repo <owner>/<name>` for `gh`. `cd <worktree> && git push` is a chain,
and the hook refuses it.

Give a title or a body as one quoted word, with the new lines inside the
quotes, so that the prompt shows the whole text as it will be sent:

```bash
gh pr create --head worktree-price-list --title 'Add the price list' --body '## Summary

- Stale prices are greyed out
- The total no longer counts a row twice'
```

Never use `--admin`, `--force` or `--delete` unless the user asked for
exactly that. Never merge a pull request you did not open in this session
unless the user named it.

### Start every change in a worktree

Run `pnpm worktree <name> --ready` before the first edit. It fetches and cuts
the branch from `origin`'s main by name, so the work does not start from a
stale local branch. `--ready` installs and runs `pnpm gate:fast` there; hand
a worktree to another agent only when the last line says `READY`. Skip the
worktree for a question that changes no file.

Look at main first, with `gh run list --branch main --limit 5`. If its
latest runs are red, say so before the first edit: see "After the merge,
watch main".

Several sessions can work on one project at the same time this way: each has
its own folder and its own branch, and none edits the project's own checkout.

- **Never edit or commit in the project's own checkout**, however small the
  change. Another session may be reading it, and main takes changes only
  through a pull request. Files someone left uncommitted there stay as they
  are.
- **Never make the worktree by hand** with `git worktree add -b`. That cuts
  the branch from where the checkout stands, and a local main is behind
  `origin` whenever another session has merged since the last fetch.
- **Several changes in one session get a worktree each**, and each its own
  pull request. Do the local work of all of them first, then their outward
  steps.

In the commands below, `main` stands for the branch `origin/HEAD` points at.

### One pull request for what is reviewed together

Put in one pull request what a reviewer would accept or reject together: the
change, its tests, the document it makes wrong, the entry it closes. Open a
second one only when a reviewer could accept one part and reject the other,
or when one part is wrong until the other is on main. "After this one lands"
is not a reason by itself: each split costs a run of the checks and a merge.

### Wait for green on your commit

After the push and `gh pr create`, wait for the checks of the commit you
pushed, not for any green run:

```bash
git rev-parse HEAD        # the commit to match
gh run list --commit <commit> --json workflowName,status,conclusion,headSha
```

The pull request is green when every run for that commit is `completed` with
`success`. Ask by the commit, not by the branch: a scan can run for the same
commit under the pull request's own ref, and the branch's list does not show
it. `gh pr checks <number> --watch` waits for them. Read the list afterwards
all the same: a run of an earlier push can still be shown as the latest.

- **A run failed:** read it with `gh run view <id> --log-failed`, fix it in
  the worktree, commit, push, and wait again. Never merge past a red check,
  and never weaken a check to pass it.
- **No run appears:** ask `gh pr view <number> --json mergeable`. A pull
  request that conflicts with main gets no run, however long you wait. Run
  `git merge origin/main` in the worktree, resolve, push.
- **A run takes twice its usual time:** stop waiting and look, with
  `gh run view <id> --json jobs`. A step that hangs before the project's own
  commands start (the checkout, a cache, the install) is the runner: start it
  again with `gh run rerun <id> --failed`. A second hang at the same step is
  an outage: say so and stop.
- **A check fails for a reason the diff cannot have caused** (a repository
  setting that is off, a service that is down): say what it is. Do not change
  the workflow to get past it.

### Read what landed on main before the merge

Green proves the branch against the main it was cut from. Others merge while
you work, so compare the two sides first:

```bash
git fetch origin
git diff --name-only HEAD...origin/main     # what landed since the branch was cut
git diff --name-only origin/main...HEAD     # what the branch changed
```

The question is one: can the two changes break each other? Git refuses a
merge when the same lines changed, so what is left is the break git cannot
see: a name one side renamed and the other still uses, a rule one side
tightened, a fixture both rely on.

- **Nothing landed, or what landed is plainly apart from your change**
  (another package, documents while you changed code): merge as it is. Behind
  is not the same as at risk.
- **Both sides changed the same file, and it is prose** (a `.md` file a
  person wrote): merge as it is. Git still stops on the same lines. Not prose
  in this sense: a generated or checked document, a renamed heading that
  something links to, and any settings file.
- **What landed touches code you touched, or a file every package depends
  on** (the lockfile above all; a config, a lint rule, a workflow, a fixture,
  an exported name): run `git merge origin/main` in the worktree, push, and
  wait for green again.
- **What landed is too much to judge quickly:** do the same. Do not spend
  longer on judging than a run of the checks takes.

Do not bring main in every time it moves. Each time costs a run of the
checks, and on a busy project main moves again before that run ends.

Bring main in with a merge. Never rebase a pushed branch: that needs a forced
push, and the runs of the checks are lost with the old commits.

When git stops on a conflict, resolve only what conflicts. If the other side
changed the body of something you renamed, read the merged body against the
name before you commit: no check sees a name that no longer says what the
code does.

### Merge when it is green

Merge a green pull request you opened in this session at once. Do not ask
whether to merge it, and do not wait to be told: the host's prompt for the
command is where a person says no.

```bash
gh pr merge <number> --merge
```

Always `--merge`. A squash or a rebase puts other commits on main than the
ones the checks ran on, and the next step could not find yours there. Never
`--auto`: read the checks yourself, then merge.

Skip the merge when the user asked for a pull request only, or said that a
person reviews it first. Say then that it is open and green.

### Clean up when the commit is on main

From the project's own folder, not from inside the worktree:

```bash
git fetch --prune origin
git merge-base --is-ancestor <commit> origin/main    # exit 0: it is on main
git worktree remove ../<project>-worktrees/<name>
git branch -D worktree-<name>
git merge --ff-only origin/main                      # see below
```

Remove the worktree only after the second line exits 0. Removing it deletes
every file in it, the ones git ignores too: notes or reports to keep are
committed, or written outside the worktree, before this. Remove only the
worktree you made: another one belongs to another session. For those that
others left, `pnpm worktree:audit` says which are finished; it removes
nothing, and nor do you without a yes. A merged pull
request whose worktree is still on disk is not finished.

If the branch is still on `origin` after the merge, say so and leave it:
removing it is `git push --delete`, which is the user's to ask for.

The last line brings the project's own checkout up to main. It is not an edit
of that checkout: it moves main to what `origin` has, and refuses to do
anything else. A session reads this file and starts the hooks from that
checkout, so one left behind works by the rules of an earlier day. Run it
only when the checkout stands on main with nothing uncommitted; otherwise
leave it and say so.

### After the merge, watch main

Some workflows run only on main, after the merge: a slow visual or end-to-end
tier, a published report, a scan. The work is not done until they are.
`gh pr view <number> --json mergeCommit` gives the commit to ask about:

```bash
gh run list --branch main --commit <merge commit> --json workflowName,status,conclusion
```

Wait until each run for that commit is `completed`. A run can take a minute
to be listed, so list again before you call the list whole. Not every
workflow runs for every commit: one with a `paths` filter runs only when
those files changed.

- **One fails because of your change:** fix it forward at once, without
  being asked: a new worktree, a new pull request, the same steps. Say in the
  report what broke and what fixed it.
- **One fails for another reason** (it was red before the merge, a setting,
  an outage): say which, and why it is not the change.

Never report the work as done while a run for the merge commit is in
progress.

A red main comes before any other work, yours or not: every session cuts its
next branch from it. If it was red before your merge, say so before you
start, and do not add a change to it that is not its fix.

### Stop when you are about to

- edit a file while the session stands in the project's own checkout;
- make a worktree with anything but `pnpm worktree`;
- put off a test, a document or an entry to "a follow-up pull request" that
  nothing forces to be separate;
- merge without a `completed`, `success` run for the commit you pushed;
- merge without having read what landed on main since the branch was cut;
- bring main in "to be safe" when what landed is plainly apart;
- type `gh pr merge` with `--squash`, `--rebase`, `--auto` or `--admin`;
- wait on a run past twice its usual time without having looked at its jobs;
- say "done" with the worktree still on disk, or a run on main in progress.

### What is left

`docs/STATUS.md` is the one answer to "what is still to do?". It holds only
what is not done: an entry is removed when its work is on main, and the page
shrinks. `docs/IDEAS.md` comes before it: what nobody has committed to.

A piece of work ends with something left more often than not: a follow-up
nobody asked for, a step only a person can take, a decision that is the
user's, a thing that was not verified. The closing report is not the place
that keeps it: the report is gone when the session ends, and another session
never saw it. Write each one into `docs/STATUS.md`, in the pull request of
the work that left it.

| Section | What goes in it |
|---|---|
| In progress | Work that has started and is not finished |
| Designed, not built | A plan or a design is on main, and nothing of it is built |
| Planned, and held by something | It waits on a release, a decision or other work. Say on what |
| Next, with no plan yet | The next step is known, and nobody has written a plan |
| Waiting on a person | A step or a decision an agent cannot take. Say who, and give the command or the question |
| Known limits | What will not be fixed soon: a thing not verified, a case not covered |

One bullet for each: the name in bold, what is left, and a link to its plan
when it has one. Link only a file that is on main.
Every edit sets the "Last updated" line to today. `pnpm check:status`, in
`gate:fast`, fails a page that leaves one of the six sections out, adds one,
or writes an entry without its bold name, and one changed since the last
commit with an old date.

- **Work is planned, or something is left over:** add its entry.
- **Its pull request merges:** remove the entry, in that pull request. There
  is no section for what is done.
- **Its state changes:** move it, and say what is left now.
- **Someone asks what is pending:** read the page. Where it differs from the
  project, correct it as part of the answer.
- **An idea with no plan:** `docs/IDEAS.md`, not this page. When it gets a
  plan, move it. Never keep it in both.

Every edit sets `Last updated` to today's date.

Skip the page for work that leaves nothing: say so in the report, and add no
entry to say so. Do not keep what is left in the host's own memory in place
of this page. A memory belongs to one person on one machine, and the page is
the project's.

### The changelog

`CHANGELOG.md` has one entry per ISO week. The `Weekly tag` workflow tags
each finished week and opens an issue that asks for its entry. To write one,
follow `.claude/commands/workflow/changelog.md` (`/workflow:changelog` in
Claude Code, the `workflow-changelog` skill in Codex). What the entry says is
your judgement; that it cites every merged pull request is checked by
`pnpm changelog check <week>`. Never create or move a week's tag by hand.

A session may start with a note of the weeks that are due. Mention them to the
person when it fits, and do not drop the task you were given to write them.

### The other runbooks

Each is a command in Claude Code (`/workflow:status`) and a skill of the same
name in Codex (`workflow-status`). The steps are in the file, and it runs
nothing by itself.

- `.claude/commands/workflow/status.md`: where the project stands. This
  checkout, the open pull requests, the last runs on main, and the headings
  of `docs/STATUS.md`. It reads and changes nothing.
- `.claude/commands/workflow/docs.md`: write what a session worked out into
  the project's documents. It says where each kind of finding goes, and stops
  for a yes before it writes.
- `.claude/commands/workflow/worktrees.md`: which worktrees are finished and
  which hold work someone stopped in the middle of, from
  `pnpm worktree:audit`. Nothing is removed before the user says yes to a
  list that names what goes.

Three more stop at their first step when the add-on they need is not in the
project:
`.claude/commands/workflow/coverage-backfill.md` (needs `coverage`),
`.claude/commands/workflow/visual-tolerance-audit.md` (needs `visual`) and
`.claude/commands/workflow/perf-audit.md` (needs `performance`).
<!-- /add-on: agent-workflow -->

<!-- add-on: e2e -->
## End-to-end tests

`packages/e2e` drives the built client in a real browser, with Playwright. It
runs Origamic's web app (`apps/web`) in two modes, and a mode's specs are in
the folder of its name. The model is scripted in both (the app's
`src/app/devScript.ts`):

| Mode | What runs | Specs |
|---|---|---|
| `sim` | The web app alone, every port on its simulator | `packages/e2e/src/sim` |
| `stack` | The web app on a local Supabase (`host: true`: it needs Docker) | `packages/e2e/src/stack` |

```bash
pnpm e2e                              # build, serve, run every spec in both modes, stop everything
pnpm e2e --mode sim                   # one mode: only what it needs is built and started
pnpm e2e --where host                 # the modes that say host: true; --where container, the others
pnpm e2e src/sim/bookTracker.spec.ts  # one spec
pnpm e2e -g "after a reload"          # the tests whose title matches
pnpm e2e --mode sim --headed          # a visible browser; --ui opens Playwright's own runner
pnpm e2e:install                      # once on a machine: downloads the browser
```

`pnpm e2e` is not part of `gate:full`: it needs a browser and a port. Run it
yourself after a change that can reach the screen through more than one layer
(the composition root, an adapter, the server, a build setting). Skip it for a
change one layer's own tests cover, and for docs and tooling. In CI it is the
`End-to-end` workflow.

Exit code 2 means the run could not start, not that the code is wrong. Where a
port cannot be opened (a sandbox), say that the specs were not run where you
are. Where the browser is missing, run `pnpm e2e:install`.

### Is it an end-to-end test?

Most behaviour has a cheaper and sharper home. An end-to-end spec waits in
real time and sees only the screen, so write one only for what nothing else
can show.

| What you want to prove | Where it goes |
|---|---|
| A rule of the application: order, movement, when a row goes stale | A presenter, use case or machine test, on fake timers |
| How a component draws a given state | The component's test, through its page object |
| The client and the server agree on a message | `packages/integration` |
| How it looks | The visual goldens, if the project has them |
| The built app wires the feature at all; a mode picks the right adapter; a journey across screens | An end-to-end spec |

One or two specs for a feature, on its main path. If a spec needs a state that
takes time or luck to reach (a stale row, one symbol among several), the rule
belongs in a test that controls time.

### How a spec is written

Copy `packages/e2e/src/sim/bookTracker.spec.ts`.

- A spec imports `test` and `expect` from `#/testing/test.ts`, takes page
  objects as fixtures, and asserts on what they return. It never holds the
  browser: the lint fails on `page`, a locator or a selector in a spec.
- A page object is `packages/e2e/src/pages/<Name>.page.ts`: an interface in
  the words of a user, and a function that builds it from Playwright's
  `Page`. Add it to the fixtures in `packages/e2e/src/testing/test.ts`.
- A page object finds an element by a test id from
  `apps/web/src/ui/testids.ts`, or by its role. Add the id to the
  client first. It reads what it reports in one step, so the page cannot
  change between two reads.
- The package imports nothing else of the application. Use `import type` for
  a type of the application's (a spec's, a port's): a type is not an edge.

### Waiting

- Wait for a state, never for time. `await expect.poll(() => shell.caption("books"))` asks
  again until it holds; `await expect(async () => { … }).toPass()` does the
  same for two things that must agree.
- Read a value to compare with only after waiting for the state it depends on.
- When the state depends on chance, work out the odds and write them beside
  the timeout. Better: assert something that does not depend on chance.
- Do not add a retry, and do not raise a timeout to make a spec pass. A spec
  that fails now and then waits on the wrong thing.

### A mode, and what it starts

`tools/e2e.config.mts` is the project's. It says how the client is built and
served and what each mode starts. Add a mode there, with a folder of its name
under `packages/e2e/src`. A spec outside every mode's folder stops the run, and
so does a mode with no spec.

- Write a command as the program and its arguments, never `pnpm …`: the
  wrapper can die on the stop signal and leave the server running.
- Write no port. A program prints its address and the `ready` pattern reads it.
- A server that answers a second protocol on its port still prints one
  address. Write each of the client's variables around `SERVER_HOST`, its
  host and port (`http://${SERVER_HOST}/api`), and give a new page object
  the `serverHost` option to tell that server's responses from any other.
- To prove a mode uses the server, show what only the server can: a state
  that outlives a reload, as `packages/e2e/src/stack/reopen.spec.ts` does. The
  simulators answer the same way until the page is loaded again.
- A mode that needs Docker (a local database) says `host: true`: the
  container's job cannot start it, and a job on the runner does. Read its
  keys with an `env` function that asks the running stack (its status
  command), never write them in the config.

### When a spec fails

1. Read the output in full. Do not pipe it through `tail`, `head` or `grep`.
2. Open the report: `pnpm --dir packages/e2e exec playwright show-report reports/html`.
   Each failure has a trace: every step, the page at that step, the network
   and the console.
3. Decide which it is. **The application is wrong:** fix it, and ask whether a
   cheaper test should have caught it. **The spec waits on time or chance:**
   make it wait on a state. If you cannot tell, stop and ask.

### Traps

- **`playwright test` run by hand fails with "the run is started with
  `pnpm e2e`".** The Playwright config starts no server. Use `pnpm e2e`.
- **Upgrading Playwright.** Change the version in `packages/e2e/package.json`
  and the image tag in `.github/workflows/e2e.yml` together; the
  `playwright-pin` gate fails otherwise. Every package that uses Playwright
  takes the same version.
<!-- /add-on: e2e -->
