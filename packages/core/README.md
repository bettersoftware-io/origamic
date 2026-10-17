# @origamic/core

The behavioural core: ports, the ontology, actions, views, the library and the builder. Framework-free; RxJS at its boundaries.

- `src/ports`: the five ports (ADR-0012), each with its contract in
  `__contracts__`, which every adapter's test runs.
- `src/simulators`: each port in memory, for the tests and for `pnpm dev`.
- `src/actions/planWrite.ts`: where an action is checked (ADR-0009).
- `src/ontology/valueSchema.ts`: a property's type as a Zod schema
  (ADR-0006).
- `src/apps/compatibility.ts`: an app against a newer ontology (ADR-0005).
- `createCore`, and `src/testing/coreHarness.ts`, the one place a test
  builds it.

What it may import is in
[ARCHITECTURE.md](../../docs/architecture/ARCHITECTURE.md) and is held by
`architecture.config.mts`.
