# ADR-0006: Zod is the single schema language

Status: accepted · 2026-10-11

## Decision
All five specs, every catalog component's props, every action's input, and
every LLM structured-output schema are Zod. JSON Schema is derived from Zod
for prompts and validation on the gateway; never hand-written.

## Consequences
One source of truth; TypeScript types are inferred, never duplicated.
