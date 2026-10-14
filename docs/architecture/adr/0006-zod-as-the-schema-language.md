# ADR-0006: Zod is the single schema language

Status: accepted · 2026-10-11

## Decision
All five specs, every catalog component's props, every action's input, and
every LLM structured-output schema are Zod. JSON Schema is derived from Zod
for prompts and validation on the gateway; never hand-written.

## Consequences
One source of truth; TypeScript types are inferred, never duplicated.

## Amended 2026-10-14: two kinds of schema

From the first reading ([review](../reviews/2026-10-14-first-reading.md),
items 9, 18 and 27):

- **`core` imports `zod` at run time.** An object's data is checked against
  its type by a validator `core` builds from the ontology's property
  definitions. The ontology's property types are a vocabulary Zod is
  compiled from, not a second schema language.
- **The schema the model is held to is derived, per request, from the
  catalog.** It is a union of one closed object per catalog component. The
  storage schemas in `packages/spec` may say more than a provider accepts (a
  JSON value, a record): they are never sent as an output schema
  (ADR-0011 lists what Anthropic accepts).
