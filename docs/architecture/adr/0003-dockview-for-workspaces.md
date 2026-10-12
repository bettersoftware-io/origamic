# ADR-0003: Workspaces are dockview layouts

Status: accepted · 2026-10-11

## Decision
A workspace is a saved dockview layout whose panels each host one app spec.
The layout itself is a spec in `packages/spec` (`workspace.ts`), serialised
from dockview's own layout model.

## Consequences
Composition of apps comes for free. Cross-panel state is not provided by
dockview and is deferred to an FDC3-style channel layer in `core`.
