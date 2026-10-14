# ADR-0010: The catalog is a contract, and shadcn implements it

Status: accepted · 2026-10-14

## Context
shadcn/ui is not a library that is installed and imported. Its command line
copies a component's source into the repository (Radix underneath, Tailwind
classes, a few helpers), and from then on that code is the project's own: the
lint, dead-code and coverage gates judge it, and an update of shadcn is the
same command again, over any local change. The author's intent is to use it
for convenience without coupling to it
([review](../reviews/2026-10-14-first-reading.md), item 26).

The coupling that would last is not the files. A spec in a library is data.
Once a saved spec says `"props": { "variant": "outline", "asChild": true }`,
shadcn's prop names are part of stored data, and no compiler finds them when
they change.

## Decision
`packages/catalog` has two layers.

- **The contract**: for each component, its name, a closed Zod schema of its
  props in Origamic's own terms (`tone: "primary" | "danger"`, `label`), the
  events it emits, and a description for the model. It has an entry point
  that imports `zod` and nothing else (the manifest), which the gateway and
  the reference checks of `packages/spec` read as data. It knows nothing of
  shadcn.
- **The implementation**: one React component per contract entry. Today it is
  built from shadcn's primitives.

Rules that keep the two apart:

- **No prop is passed through** to what implements it: no `className`, no
  `asChild`, no Radix prop. A spec names contracts only.
- **shadcn's files are copied in only for a primitive a catalog entry uses**,
  brought to the project's style once, and covered by the tests of the
  entries that use them. They get no exemption from lint, knip or coverage.
- **A prop that takes a URL accepts `http` and `https` only, and no prop takes
  HTML.** "Nothing the model emits is executed" stays true only if no catalog
  prop can carry a script.

## Consequences
Replacing shadcn, or Tailwind, changes the implementation layer and no saved
spec. The contract is also the input of the schema the model is held to
(ADR-0006, ADR-0011), so the quality of its descriptions is the main lever on
what the model builds, as ADR-0002 said.
