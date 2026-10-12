# ADR-0001: Store objects in a JSONB `objects` table, not per-type tables

Status: accepted · 2026-10-11

## Context
The ontology mutates constantly while a builder works. Per-type tables mean a
migration per ontology change and a schema that drifts from the ontology.

## Decision
One `objects` table (`id`, `type`, `type_version`, `data jsonb`, `owner`,
timestamps) and one `links` table (`id`, `link_type`, `from_id`, `to_id`).
The ontology is data in `ontology_versions`. Indexes on `(type)` and GIN on
`data`. Per-type compilation is a later optimisation behind the same
`ObjectStore` port.

## Consequences
Simple to evolve; queries are less efficient at scale; JSONB validation is
done by the action layer against the ontology, not by the database. The
dependency rule guarantees nothing above `adapters` notices when this changes.
