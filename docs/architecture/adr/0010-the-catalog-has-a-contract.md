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

## Amended 2026-10-16: the five components of the first slice

Built in part 5 of [the first slice's plan](../plans/2026-10-16-first-slice.md).
Each prop has a kind (ADR-0002): `fixed` holds a value, `state` a value or a
`$state`, `view` a `$view` and nothing else.

| Component | Props (kind) | Events (payload) |
|---|---|---|
| `Stack` | `gap` (fixed: `"small" \| "medium" \| "large"`, optional) | none |
| `Text` | `text` (state: string), `tone` (fixed: `"body" \| "heading" \| "muted"`, optional) | none |
| `Select` | `label`, `options`, `emptyLabel` (fixed, the last optional), `value` (state: string or null) | `change` (`value`; null for the empty choice) |
| `Table` | `rows` (view), `columns` (fixed: `{ property, label }[]`), `selected` (state: a row's id or null, optional) | `select` (`id`, `values`) |
| `Form` | `fields` (fixed: `{ name, label, input, options? }[]`, `input` one of `text`, `longText`, `number`, `select`, `date`, `checkbox`), `submitLabel` (fixed), `mode` (fixed: `"create" \| "edit"`), `values` (state: a record or null, optional) | `submit` (one field per entry of `fields`; an empty field is left out) |

How the two layers are laid out in `packages/catalog`:

- **The contract** is `src/contract/`, read through the entry
  `@origamic/catalog/manifest`: `contracts`, `catalog` (the manifest and
  `checkElement`, which `validateApp` takes), and what the model is held to,
  `generationSchema()` and `readGenerated`. It imports `spec` and `zod`, and a
  test of the package holds it to that.
- **The implementation** is `src/react/`, read through the entry
  `@origamic/catalog`: `implementations`, one component per contract, each
  taking an `Envelope` of its props, children, `emit`, test id and problems.
  Its React code is held to a client's lint rules (`reactRules: "client"`),
  since the app's build compiles it.
- **shadcn's primitives** are in `src/react/primitives/`: `button`, `input`,
  `label`, `select`, `table` and `checkbox` of the `new-york-v4` style, one
  component to a file as the project's lint asks. What no catalog entry
  uses was not copied: the button's other variants and sizes and its
  `asChild`, the table's footer and caption, the select's group, label,
  separator, sizes and popper position. They bring `radix-ui`, `cn`,
  `class-variance-authority` and `lucide-react`, which only this package
  may import (`vendorOnlyIn`). A `longText` field is a plain `textarea`: no
  primitive of shadcn's was copied for it.
