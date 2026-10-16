# First vertical slice

One loop, end to end, nothing else. If this loop feels magical the rest is
layering; if it doesn't, we learned it cheaply.

## The loop

1. The builder, signed in, types: "a simple tracker for the books I'm reading, with
   title, author, status (want / reading / done) and a rating".
2. The model proposes a change set to the ontology: a `Book` object type
   with those properties, and the actions `createBook` and `updateBook`. The
   builder sees it as a readable diff and accepts.
3. The model emits a UI spec over the catalog: a table view of `Book`, a form
   wired to the actions `createBook` and `updateBook`, and a status filter.
   The spec passes the schemas and the reference checks of `packages/spec`
   before anything renders.
4. The runtime renders it in a dockview panel. The builder adds two books.
5. The app is saved to the library with its version and the ontology version.
6. The builder closes the workspace, reopens it, and the app is there with its
   data.
7. The builder says "add a 'date finished' field". The model proposes a
   change set *and* a revision of the app; both are shown as diffs;
   accepting re-saves the app as a new version, and the workspace's panel
   moves to it. The old version is still in the library, and the two books
   are still there, without a date.

Step 7 is not optional. It is the builder-equals-consumer loop in miniature
and forces versioning on week one.

## Explicitly out of scope

No pipes, no functions, no cross-panel state, no sharing, no second user,
no mobile layout, no visual polish beyond shadcn defaults.

## Before the slice

These are not part of the loop, and the loop cannot be built without them.
Each is a part of [the slice's plan](plans/2026-10-16-first-slice.md), and
`docs/STATUS.md` holds the plan until it is done.

- How a catalog component's props say they accept a `$view` or a `$state`
  reference (ADR-0002): settled in the plan, under "Settled: how a prop says
  what it accepts", and built in its parts 2 and 5.
- The packages `spec`, `core`, `catalog`, `runtime` and `adapters` and the
  apps are built beside the starter's price list. The price list goes, and
  `AGENTS.md`'s tables are rewritten for Origamic's packages, in the slice's
  last pull request.

## Acceptance criteria (write these as tests before building)

The tests of `core` and `runtime` run on the simulators of the ports
(ADR-0012). The model is the scripted `LlmGateway` simulator in every test
here; how the real model does is measured outside the gate (ADR-0011).

- `spec`: an app with a binding to an unknown `ObjectType@version` is
  rejected by the reference checks. A UI spec naming a component that is not
  in the catalog's manifest is rejected. Both checks take the ontology and the
  manifest as data.
- `core`: executing `createBook` with a missing `title` fails validation and
  writes nothing. Executing it with valid input emits exactly one object
  through the `view` stream of a subscribed table view.
- `core`: loading an app saved against ontology v1 when the ontology is at v2
  with a compatible change succeeds; with a deprecated property it uses, it
  returns a compatibility report, not an error.
- `adapters`: against a local Supabase, the adapter round-trips an object
  and a link and passes each port's contract; RLS denies a read by a
  different owner.
- `runtime`: rendering the saved spec produces a table with the two books
  (a component test, through a page object; an element's test id is derived
  from its id in the spec).
- `apps/web`: after reload, the workspace restores the same panel with the
  same app version (an end-to-end test in a browser).
- Architecture gate: an import from `packages/adapters` inside
  `packages/runtime` fails `pnpm gate:full`.

## Done means

A fresh Claude Code session runs `reviewing-architecture` on the diff and
finds nothing in the dependency rule or the three non-negotiables to object
to; `gate:full` is green; the loop above works on a clean database.
