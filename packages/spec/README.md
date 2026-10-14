# @origamic/spec

The schemas of Origamic's specs, and the checks of what a spec names. It
imports `zod` and nothing else. The decisions behind it are in
[docs/architecture/](../../docs/architecture/ARCHITECTURE.md), above all
ADR-0002, ADR-0005 and ADR-0008.

| File | Holds |
|---|---|
| `ontology.ts` | `Ontology`, `ObjectType`, `ChangeSet` |
| `action.ts` | `ActionType`, and `ActionTypeDraft` as a change set adds one |
| `ui-spec.ts` | `UiSpec`: a flat map of elements, wired to views, state and actions |
| `binding.ts` | `AppDraft` and `App`: a UI spec and what it binds, `ObjectType@version` and `action@version` |
| `workspace.ts` | `WorkspaceDraft` and `Workspace`: apps in panels, in a layout of our own |
| `references.ts` | `checkApp`: what an app names, against the ontology and the catalog's manifest |
| `common.ts` | Ids, names, versions, `format`, `TypeRef` |

A spec is validated in two parts:

1. **Parsing** (`App.parse`, `Ontology.safeParse`, …) checks everything one
   document can show by itself: its shape, a key nobody defined, a broken
   link between elements, a view or a state key nobody declared, a type or
   an action the app uses without binding it.
2. **`checkApp(app, ontology, catalog)`** checks what needs the others: a
   binding the ontology does not have at that version, a component or an
   event the catalog does not have, a property a view or an invocation names
   that its type or action lacks. It returns a list of problems; empty means
   the app can be rendered.

Every message names where it is and what to fix: the gateway feeds them back
to the model for its one retry.

A draft (`AppDraft`, `WorkspaceDraft`) has no `version`: the library gives it
one when it saves it. An object of the schemas accepts no key it does not
define.

Not here yet: the props of each component, which the catalog's contracts
check (ADR-0010).
