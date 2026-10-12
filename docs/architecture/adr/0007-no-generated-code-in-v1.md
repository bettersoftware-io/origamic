# ADR-0007: The model emits specs only; no generated code in v1

Status: accepted · 2026-10-11

## Decision
Nothing the model returns is executed as code. Validation rules and derived
values are expressed in the declarative action/view vocabulary of
`packages/spec`. If a real use case cannot be expressed, the answer is to
extend the vocabulary, and only after that fails, to introduce sandboxed,
typed, pre-validated functions (a superseding ADR).

## Consequences
Smaller attack surface; a vocabulary that must be designed deliberately.
