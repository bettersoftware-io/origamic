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
| `references.ts` | `checkApp`: what an app names and how it is wired, against the ontology and the catalog's manifest; `validateApp`, which runs every check |
| `change.ts` | `applyChangeSet`: the ontology a change set yields |
| `generation.ts` | `GenerationRequest`, `GenerationEvent` and `Proposal`: what travels between the client and the gateway |
| `common.ts` | Ids, names, versions, `format`, `TypeRef`, `Json` |

A spec is validated in three parts:

1. **Parsing** (`App.parse`, `Ontology.safeParse`, …) checks everything one
   document can show by itself: its shape, a key nobody defined, a broken
   link between elements, a view or a state key nobody declared, a type or
   an action the app uses without binding it.
2. **`checkApp(app, ontology, manifest)`** checks what needs the others: a
   binding the ontology does not have at that version, a component, a prop
   or an event the catalog does not have, a prop that holds what its kind
   does not accept (ADR-0002), a `$event` field its event does not carry, a
   property a view or an invocation names that its type or action lacks. It
   returns a list of problems.
3. **The catalog's `checkElement`** checks each prop's value against the
   prop's schema (ADR-0010).

`validateApp(input, ontology, catalog)` runs the three in order, and stops
after the first if the schema refuses the app. It answers with the parsed
app, or with every problem, a schema's issues worded the same way; an app
it accepts can be rendered.

Every message names where it is and what to fix: the gateway feeds them back
to the model for its one retry.

A draft (`AppDraft`, `WorkspaceDraft`) has no `version`: the library gives it
one when it saves it. An object of the schemas accepts no key it does not
define.
