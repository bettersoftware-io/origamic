# ADR-0003: Workspaces are dockview layouts

Status: accepted · 2026-10-11

## Decision
A workspace is a saved dockview layout whose panels each host one app spec.
The layout itself is a spec in `packages/spec` (`workspace.ts`), serialised
from dockview's own layout model.

## Consequences
Composition of apps comes for free. Cross-panel state is not provided by
dockview and is deferred to an FDC3-style channel layer in `core`.

## Amended 2026-10-14: the layout is ours

The first reading ([review](../reviews/2026-10-14-first-reading.md), item 11)
found that storing dockview's own serialised layout would put another
library's format, at another library's version, inside a versioned spec that
nothing can validate.

The workspace's layout is a schema of ours in `packages/spec`: a tree of
splits (a direction and sized children), tab groups and panels, each panel
naming the app and the app version it hosts. The shell in `apps/web`
translates it to dockview and back, and only `apps/web` imports dockview.
Replacing dockview changes that translation alone.

The layout is a tree, where the UI spec is flat (ADR-0002), because no model
writes a layout in v1. When one does, it is flattened the same way.
