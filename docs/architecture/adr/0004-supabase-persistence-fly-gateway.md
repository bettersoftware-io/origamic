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
