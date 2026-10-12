# First vertical slice

One loop, end to end, nothing else. If this loop feels magical the rest is
layering; if it doesn't, we learned it cheaply.

## The loop

1. The builder types: "a simple tracker for the books I'm reading, with
   title, author, status (want / reading / done) and a rating".
2. The model proposes an ontology migration: `Book` object type with those
   properties. The builder sees it as a readable diff and accepts.
3. The model emits a UI spec over the catalog: a table view of `Book`, a form
   bound to actions `createBook`, `updateBook`, and a status filter. The spec
   validates against `packages/spec` before anything renders.
4. The runtime renders it in a dockview panel. The builder adds two books.
5. The app is saved to the library with its version and the ontology version.
6. The builder closes the workspace, reopens it, and the app is there with its
   data.
7. The builder says "add a 'date finished' field". The model proposes an
   ontology migration *and* a spec revision; both are shown as diffs;
   accepting re-saves the app as a new version. The old version is still in
   the library.

Step 7 is not optional. It is the builder-equals-consumer loop in miniature
and forces versioning on week one.

## Explicitly out of scope

No pipes, no functions, no cross-panel state, no sharing, no second user,
no mobile layout, no visual polish beyond shadcn defaults.

## Acceptance criteria (write these as tests before building)

- `spec`: an app spec with a binding to an unknown `ObjectType@version` is
  rejected. A UI spec referencing a component not in the catalog is rejected.
- `core`: executing `createBook` with a missing `title` fails validation and
  writes nothing. Executing it with valid input emits exactly one object
  through the `view` stream of a subscribed table view.
- `core`: loading an app saved against ontology v1 when the ontology is at v2
  with an additive change succeeds; with a removed property it returns a
  migration proposal, not an error.
- `adapters`: the Supabase adapter round-trips an object and a link; RLS
  denies a read by a different owner.
- `runtime`: rendering the saved spec produces a table with the two books
  (a Playwright or component test; the `e2e` add-on is on the recommended
  list).
- `apps/web`: after reload, the workspace restores the same panel with the
  same app version.
- Architecture gate: an import from `packages/adapters` inside
  `packages/runtime` fails `pnpm gate:full`.

## Done means

A fresh Claude Code session runs `reviewing-architecture` on the diff and
finds nothing in the dependency rule or the three non-negotiables to object
to; `gate:full` is green; the loop above works on a clean database.
