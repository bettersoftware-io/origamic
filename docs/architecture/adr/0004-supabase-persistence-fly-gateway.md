# ADR-0004: Supabase for persistence and auth; Fly.io for the LLM gateway

Status: accepted · 2026-10-11

## Decision
Supabase (Postgres + RLS + auth) behind `OntologyStore`, `ObjectStore` and
`SpecLibrary`. A small Node service on Fly.io behind `LlmGateway`: it holds
model keys, builds prompts from the ontology and catalog, validates returned
specs against `packages/spec`, and validates specs on save.

## Consequences
The client stays honestly client-interpreted; the only server is the one
the browser cannot safely be. RLS is on from the first migration even with
one user.

## Amended 2026-10-14: who the gateway serves, and what it does not do

From the first reading ([review](../reviews/2026-10-14-first-reading.md),
items 16, 17, 21, 23 and 24):

- **The gateway checks who is calling.** Each request carries the caller's
  Supabase access token, and the gateway verifies it before it spends the
  model key. Without that it is an open way to the key.
- **The gateway validates what the model returns, and retries once.** It runs
  the schema and the reference checks of `packages/spec` against the
  ontology and the catalog manifest it was given, feeds the errors back for
  one retry, and returns a second failure to the client.
- **The gateway does not store specs.** The browser saves specs and objects
  to Supabase itself. ADR-0009 says what that means for validation.
- **Row-level security covers every table**, keyed on the owner: `objects`,
  `links` (which gains an `owner` column), `ontology_versions`, apps and
  workspaces. There is one ontology per owner, shared by all their apps.
- **The adapter's tests run against a local Supabase** (the Supabase CLI, in
  Docker), in `pnpm gate:full` and in CI. A test that needs it is named so it
  can be left out, and said to be left out, where Docker cannot run, as
  `*.port.test.ts` is for a port. The SQL migrations live in
  `packages/adapters/supabase/`. The model is the one outside thing no test in
  the gate calls (ADR-0011).

## Amended 2026-10-16: how the local Supabase is installed and started

Decision 7 of [the first slice's plan](../plans/2026-10-16-first-slice.md),
built in its part 1b:

- **The Supabase CLI is a dev dependency of `packages/adapters`**, pinned at
  an exact version like any other, so every machine and CI run the same one.
  Its project is `packages/adapters/supabase/`: `config.toml` runs only the
  database, the API and auth, and the migrations are beside it.
- **A test that needs it is named `*.supabase.test.ts`.** The package's vitest
  config asks `tools/supabase/localSupabase.mts` what to leave out. Where
  Docker does not answer, those files are left out and the run prints
  `SKIP supabase — Docker is not running here; the tests against a local
  Supabase were not run`. Where it answers, vitest's global setup starts the
  stack if it is not up, applies the pending migrations, and hands the tests
  `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. In CI
  nothing is left out: without Docker the run fails and says Docker is
  needed.
- **The stack is left running** when the tests end, and is shared by every
  checkout of the project on the machine: its project id is `origamic`, on
  the CLI's default ports (the API on 54321, Postgres on 54322).
