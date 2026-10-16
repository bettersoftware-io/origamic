# First reading of the architecture documents

2026-10-14. Step 1 of [HANDOVER.md](../../../HANDOVER.md): `VISION.md`,
`ARCHITECTURE.md`, ADR-0001 to ADR-0007 and `FIRST-SLICE.md` read against
each other, against the `packages/spec` skeleton, and against the starter's
gates in `tools/arch`. The author accepted every resolution below, and named
Anthropic as the first provider and shadcn as a convenience not to couple to.

Each item: what was wrong, how it was settled, and where that is written now.
The numbers are the ones the discussion used.

## Before the schemas (step 2)

1. **A type's version was never defined.** The ontology was versioned "as a
   whole", while bindings and stored objects used `ObjectType@version`.
   → A type and an action carry versions of their own; the ontology's counts
   change sets. [ADR-0005](../adr/0005-versioned-specs-from-day-one.md).
2. **Nothing said what a change does to stored objects.** → Objects are never
   rewritten; an added property is optional or has a default; a view reads
   every version of its type. ADR-0005.
3. **Actions belonged to the ontology in the glossary and to the app
   elsewhere.** → The ontology's; an app binds `action@version`.
   [ADR-0008](../adr/0008-actions-belong-to-the-ontology.md).
4. **"Binding" meant two things**: an app's reference to a type, and a UI
   node's link to a view or an action. → "Binding" keeps the first meaning,
   the one the vision's third non-negotiable uses; the second is *wiring*.
   This reverses what was first proposed, so that the vision's table and the
   file names of `packages/spec` stay as the author wrote them.
   [ARCHITECTURE.md](../ARCHITECTURE.md), glossary.
5. **Too many versions, and no version of the spec language.** → The store
   assigns an app's and a workspace's version; the UI spec has none of its
   own; every root has `format`. ADR-0005.
6. **Tree or flat was left open.** → Flat: elements in a map by id, children
   as ids. [ADR-0002](../adr/0002-json-render-shadcn-as-ui-spec.md), with the
   reasons; [ADR-0011](../adr/0011-anthropic-first-behind-the-gateway-port.md)
   for the provider's part in it.
7. **A node's binding could not express the slice**: no event, no input
   mapping, no selection, no filter chosen by the user. → Declared `state`,
   props that read `$view` and `$state`, and events that `set` or `invoke`.
   ADR-0002.
8. **Two acceptance tests of `spec` could not be schema tests**: an unknown
   `ObjectType@version` needs the ontology, an unknown component the catalog.
   → `packages/spec` also holds pure reference checks that take both as
   data. ADR-0002; `HANDOVER.md` step 2.
9. **An action's input could not carry the Book**: five input types where the
   ontology has eight, and rules that restated the ontology. → The input is a
   set of the type's properties; rules say only what the ontology cannot.
   ADR-0008.
10. **Operations on the ontology did not match the tests**: "removed" with
    only "deprecate" offered, a rename that breaks data keyed by name, one
    operation where a change is several. → Removing is deprecating, no rename
    in v1, a change set is applied whole against a base version. ADR-0005.
11. **The workspace layout was dockview's opaque blob.** → A layout schema of
    Origamic's own; accepting a revision moves the panel's pin.
    [ADR-0003](../adr/0003-dockview-for-workspaces.md), ADR-0005.
12. **`SemVerish` named an integer counter.** → Renamed in step 2.

## Before the rules as gates (step 3)

13. **The starter's roles could not express Origamic's graph.** The kit's
    roles form a fixed ladder; `adapters` importing `core` fits none, and
    `catalog` as a `leaf` would be importable by `core`. → A change to the kit
    in `bettersoftware-io/skills`: a package declared by its explicit edges.
    `docs/STATUS.md`.
14. **The port-contract gate would judge nothing.** It looks for ports only
    in packages of role `domain`; Origamic's are in `core`. It prints
    `SKIP port-contracts — no port interfaces were found` and the run still
    ends "all gates passed." (The discussion first said it would print a
    pass; it prints a skip, which is easier to miss than a failure and
    passes CI all the same.) → A change to the kit: any package may declare
    its ports, and none found where adapters are declared fails.
    [ADR-0012](../adr/0012-ports-in-core-with-contracts-and-simulators.md).
15. **Simulators were missing.** → Every port gets one in `core`, the model's
    replaying scripted replies. ADR-0012.
16. **The gateway needed the catalog and the wire types**, and was drawn
    importing `spec` alone. → The catalog has a React-free manifest the
    gateway imports. ARCHITECTURE.md;
    [ADR-0010](../adr/0010-the-catalog-has-a-contract.md).
17. **"The gateway validates on save, so a client cannot store an invalid
    spec" was not true as drawn**: the browser writes to Supabase directly.
    → In v1 the client enforces the schemas and the actions, a stated known
    limit, behind single adapter methods so it can move to the server.
    [ADR-0009](../adr/0009-validation-in-v1-is-the-clients.md).
18. **"`core` imports `spec` only" banned the RxJS its ports return**, and the
    `zod` it needs to check data against the ontology. The rule mixed two
    lists the gates keep apart: which of our packages, and which npm
    packages. → Both written per package, and which rules can be import bans
    and which cannot. ARCHITECTURE.md;
    [ADR-0006](../adr/0006-zod-as-the-schema-language.md).
19. **`apps/web` had no edge to `core`**, and `apps/*` is not in the
    workspace. → Edges drawn; `pnpm-workspace.yaml` and knip's globs gain
    `apps/*` with the first app. Dockview is imported by `apps/web` only.
    ARCHITECTURE.md.

## Before the slice (step 4)

20. **The starter's price list.** → Built beside, removed with `AGENTS.md`'s
    tables rewritten in the slice's last pull request.
    [FIRST-SLICE.md](../FIRST-SLICE.md), "Before the slice".
21. **The builder's flow had no home**, and `propose()` stored at once. → A
    state machine in `core`; a proposal is a value until accepted;
    `apply()`; the retry is the gateway's; the ontology is applied before
    the app is saved. ADR-0012, ADR-0004.
22. **"Builds it in front of them" against "validates before anything
    renders".** → No partial rendering in v1. ARCHITECTURE.md, generation.
23. **Auth was assumed and absent.** → A `Session` port, the gateway verifies
    the Supabase token, one ontology per owner. ADR-0012,
    [ADR-0004](../adr/0004-supabase-persistence-fly-gateway.md).
24. **Supabase inside the gate.** → A local Supabase in `gate:full` and CI,
    SQL under `packages/adapters/supabase/`. ADR-0004.
25. **The `e2e` add-on was said to be on the recommended list; it is not
    installed.** → Installed before the slice; test ids derived from element
    ids. FIRST-SLICE.md.
26. **shadcn is copied source**, and its prop names would end up in stored
    specs. → The catalog's contract is Origamic's; no prop passes through;
    shadcn's files are held to the project's gates. ADR-0010.
27. **No model or provider was named.** → Anthropic, behind the
    `LlmGateway` port, with what its structured outputs accept and how two
    other providers compared on that date. ADR-0011.

## Smaller

- "Migration" meant three things. → *Change set* for the ontology,
  *compatibility report* for a broken app, *migration* only for SQL.
  ARCHITECTURE.md, glossary.
- `SpecLibrary` stored no workspaces. → It does. ADR-0012.
- Link types named their ends by bare names, and `links` had no owner. →
  Inside one ontology version names are fine (ADR-0008); `links` gains
  `owner` ([ADR-0001](../adr/0001-jsonb-objects-not-per-type-tables.md)).
- `view()` did not say how it stays live or pages. → It emits again after
  each action through the same store; a page is bounded by the limit only.
  ADR-0012.
- "Optionally materialised", "retrieved slice" and "derived views" were
  undefined. → Materialised views are out of v1; the other two stay words
  for later.
- "Nothing the model emits is executed" overclaimed once a prop can take a
  URL. → URLs are `http` and `https` only, and no prop takes HTML. ADR-0010.

## Found while writing these down

- **Rule 5 said `adapters` is the only package that knows the LLM API**, yet
  the gateway is the one that calls it. → Rule 3 of the new text: of the
  browser's packages, only `adapters` knows Supabase, SQL or HTTP, and only
  the gateway calls the model.
