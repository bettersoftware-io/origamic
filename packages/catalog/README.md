# @origamic/catalog

The components a UI spec may name: each a contract (a Zod schema of its
props by kind, its events, a description for the model) and a React
implementation built from shadcn's primitives. The decisions behind it are
ADR-0002, ADR-0010 and ADR-0011 in
[docs/architecture/](../../docs/architecture/ARCHITECTURE.md).

| Entry | Holds | Imports |
|---|---|---|
| `@origamic/catalog/manifest` (`src/manifest.ts`) | `contracts`; `catalog`, the manifest and `checkElement` that `validateApp` takes; `generationSchema()` and `readGenerated`, what the model is held to and how its reply is read | `spec` and `zod` only, so the gateway can read it |
| `@origamic/catalog` (`src/index.ts`) | `implementations`, one React component per contract; `partTestId` | React, and the libraries of the primitives |

| Folder | Holds |
|---|---|
| `src/contract/` | `fixed`, `state`, `view` and `defineComponent`; the five contracts in `components/`; `checkElement`'s checks in `check.ts` |
| `src/generation.ts` | The model's reply: one closed object per component, with elements, views and state as lists with an id, read back into spec's maps |
| `src/react/` | The components, each with a page object (`*.page.tsx`) and a test |
| `src/react/primitives/` | shadcn's `button`, `input`, `label`, `select`, `table` and `checkbox`, as copied and trimmed to what the components use |

An element's test id is `spec.<element id>`, given by the runtime. A part of
it adds `.<part>` (`partTestId`); the parts are named in
`src/react/testIds.ts`.
