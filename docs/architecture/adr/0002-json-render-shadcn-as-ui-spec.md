# ADR-0002: UI specs follow the json-render model over a shadcn catalog

Status: accepted · 2026-10-11

## Context
Several declarative generative-UI formats exist (A2UI, json-render,
Open-JSON-UI). All share: a catalog of permitted components described by
schemas, a flat or tree JSON spec referencing only catalog entries, a renderer.

## Decision
`packages/spec` defines Origamic's own UI-spec schema, modelled on
json-render's shape (catalog of components + catalog of actions, Zod
schemas). `packages/catalog` is built from shadcn/ui primitives
(ui.shadcn.com), one schema per component. We may use json-render as a
dependency in `runtime` for v1 to move fast, but the spec format is ours so
the renderer can be replaced.

## Consequences
We own the contract; we can swap the renderer. Catalog quality (descriptions,
prop schemas) becomes the primary lever on generation quality.

## Amended 2026-10-14: flat, wired, and validated in two parts

The first reading ([review](../reviews/2026-10-14-first-reading.md), items 6,
7, 8 and 26) settled what "flat or tree" left open.

**The UI spec is flat.** It names a `root` element and holds every element in
one map keyed by id; an element's `children` are ids, not elements. The same
screen as a tree and as a map:

```json
{ "root": "page",
  "elements": {
    "page":   { "component": "Stack",  "children": ["filter", "books"] },
    "filter": { "component": "Select", "props": { "label": "Status" } },
    "books":  { "component": "Table",  "props": { "rows": { "$view": "books" } } } } }
```

Three reasons, in order of weight:

1. A change touches elements, not a branch: adding a column is one element
   added and one id appended. That is the diff a builder reads in slice step
   7, and the patch a model can emit.
2. Every provider's guaranteed-schema mode accepts a flat schema. Anthropic's
   accepts no recursive schema at all (ADR-0011); a tree would lose that
   guarantee there.
3. The renderer loses nothing: it rebuilds the tree from the map before it
   renders.

What flat costs: a JSON Schema cannot see a broken link. A child id that names
no element, an element with two parents, a loop and an element nothing reaches
are found by a refinement of the Zod schema in `packages/spec`, which runs
when a spec is parsed, not by the schema the model is held to.

**Elements are wired, not bound.** "Binding" is kept for an app's reference to
the ontology (ADR-0005). Inside a UI spec:

- A prop holds a plain JSON value, or a reference: `{"$view": "<view id>"}`
  for rows to show, `{"$state": "<key>"}` for a value the app keeps.
- `state` declares what the app keeps between events (the selected book, the
  chosen status, a form's draft) with its initial value. It lives in `core`,
  never in a component.
- `on` maps an event a component emits to a handler: `set` a state key, or
  `invoke` an action with its input built from the event and the state.
- A view names a type the app binds, with filters, a sort and a limit. A
  filter whose value is a state key that holds `null` is left out: that is
  how "every status" is said.

**A spec is validated in two parts, both in `packages/spec`.** Parsing it
checks everything the spec alone can show: its shape, a key nobody defined,
the four broken-link cases above, a view or a state key nobody declared, a
type or an action the app reads without binding it. A pure function,
`checkApp`, then checks what needs the ontology and the catalog's manifest
(ADR-0010), passed in as data: an unknown `ObjectType@version` or
`action@version`, an unknown component or event, a property a view or an
invocation names that its type or action does not have. `packages/spec`
still imports `zod` and nothing else.

**json-render is not a dependency in v1.** The renderer is ours and small.
json-render's "actions" are what a component does on an event; ours are
writes to the ontology. The two words must not be mixed in this code.

**Not decided yet:** how a component's props schema says that a prop accepts
a `$view` or a `$state` reference. It is settled with the catalog, in the plan
of the first slice.
