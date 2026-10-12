# ADR-0002: UI specs follow the json-render model over a shadcn catalog

Status: accepted · 2026-10-11

## Context
Several declarative generative-UI formats exist (A2UI, json-render,
Open-JSON-UI). All share: a catalog of permitted components described by
schemas, a flat or tree JSON spec referencing only catalog entries, a renderer.

## Decision
`packages/spec` defines Origamic's own UI-spec schema, modelled on
json-render's shape (catalog of components + catalog of actions, Zod
schemas). `packages/catalog` is built from shadcn/ui primitives
(ui.shadcn.com), one schema per component. We may use json-render as a
dependency in `runtime` for v1 to move fast, but the spec format is ours so
the renderer can be replaced.

## Consequences
We own the contract; we can swap the renderer. Catalog quality (descriptions,
prop schemas) becomes the primary lever on generation quality.
