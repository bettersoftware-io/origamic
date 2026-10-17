# @origamic/runtime

The interpreter of specs: it renders a UI spec over the catalog and wires its
views, state and actions to the core. What it may import is in
[ARCHITECTURE.md](../../docs/architecture/ARCHITECTURE.md) and is held by
`architecture.config.mts`: `spec`, `core` and `catalog`, `react` and `rxjs`.
Its role is `bindings`: RxJS meets React here and nowhere else.

| File | Holds |
|---|---|
| `src/AppView.tsx` | `AppView`: an app's UI spec drawn over the catalog's implementations, the tree rebuilt from the flat map (ADR-0002). Each element's props are resolved by kind, its events run its handlers in the app's session, and a component the catalog does not have is drawn as a box that names it |
| `src/appSnapshot.ts` | `showApp`: the session's state, the rows of each view an element reads and each element's problems, as one stream |
| `src/resolveProps.ts` | What a component receives for each prop, by kind: a view's rows, a state key's value, a literal |
| `src/elementTestId.ts` | An element's test id, `spec.<id>` (the slice plan's decision 6) |
| `src/viewModel/` | `createShellViewModel`, the shell's hooks over the core; `useObservable`; the provider and `useShellViewModel` |

A form whose submit wrote through an action, with nothing refused, is drawn
afresh, so it starts empty again; a refused one keeps what was typed beside
the problems. An app session is opened by `useAppSession` when its view
mounts and closed when it unmounts.
