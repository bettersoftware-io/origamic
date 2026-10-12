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
