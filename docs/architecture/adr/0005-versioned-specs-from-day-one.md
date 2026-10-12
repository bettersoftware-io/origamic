# ADR-0005: Every spec is versioned from the first commit

Status: accepted · 2026-10-11

## Decision
Every root schema in `packages/spec` carries `version`. The ontology is a
sequence of migrations. App bindings reference `ObjectType@version`. Loading
an app against a newer ontology runs a compatibility check and, on a breaking
mismatch, produces a migration proposal rather than failing silently.

## Consequences
Ceremony while a single builder is the only user; avoids a rewrite the first
time an ontology change breaks three saved apps.
