# ADR-0005: Every spec is versioned from the first commit

Status: accepted · 2026-10-11

## Decision
Every root schema in `packages/spec` carries `version`. The ontology is a
sequence of migrations. App bindings reference `ObjectType@version`. Loading
an app against a newer ontology runs a compatibility check and, on a breaking
mismatch, produces a migration proposal rather than failing silently.

## Consequences
Ceremony while a single builder is the only user; avoids a rewrite the first
time an ontology change breaks three saved apps.

## Amended 2026-10-14: what each version counts

The first reading of these documents
([review](../reviews/2026-10-14-first-reading.md), items 1, 2, 5, 10 and 12)
found "version" used for three things. They are now separate.

- **The ontology's version** counts change sets. It is 0 for an empty
  ontology and goes up by one for each change set applied. A change set is a
  list of operations with the `baseVersion` it was written against; it is
  applied only if the ontology is still at that version, so two proposals
  cannot both land on the same base.
- **A type's version, and an action's version**, are their own. An object
  type or an action type is at version 1 when it is added and goes up by one
  when a change set changes it. A type no change set touched keeps its
  version while the ontology's moves. `ObjectType@version` names this
  version, never the ontology's.
- **An app's version, and a workspace's,** are assigned by the store when it
  is saved. A draft has none. Saving a new version never changes an old one.
- **`format`** on every root schema is the version of the spec language
  itself. A change to `packages/spec` that would reject a stored spec raises
  it and comes with the upgrade of stored specs.

What a change does to data and to saved apps:

- **Objects are never rewritten by a change set.** An object records the
  version of its type it was written at. A view reads the objects of every
  version of its type; a property an object does not have reads as the
  property's `default`, or as absent.
- **Compatible** (an app built before it still works): adding an object
  type, a link type or an action type, and adding a property that is
  optional or has a default.
- **Breaking** for an app that uses it: deprecating a property, and changing
  an action so that a property it sets no longer exists.
- **Removing is deprecating.** The property stays in the data and leaves new
  specs. Renaming is not offered in v1: a property's name is its key in the
  stored data.
- **Loading an app against a newer ontology** runs the compatibility check in
  `core`. It returns either "compatible" or a *compatibility report* naming
  each break. The report, not an error, is what the model is given to propose
  a revision of the app.
- **A workspace panel pins an app version.** Accepting a revision of the app
  in that panel moves the pin and saves a new version of the workspace.
