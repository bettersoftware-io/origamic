# ADR-0009: In v1, the client enforces the schemas and the actions

Status: accepted · 2026-10-14

## Context
`ARCHITECTURE.md` said the gateway validates specs on save, "so a client
cannot store an invalid spec". ADR-0004 has the browser write to Supabase
directly, so no save passes the gateway. Row-level security keyed on the owner
decides whose rows a client may touch, not what it writes into them. The same
holds for objects: "every write is a named action" is kept by the code in the
client, not by the database
([review](../reviews/2026-10-14-first-reading.md), item 17).

## Decision
In v1 the client validates every spec it saves and every action it executes,
in `core`, and the gateway validates every spec the model returns. Nothing on
the server checks what a signed-in client writes to its own rows.

Saving a spec and executing an action each go through one method of one
adapter (`SpecLibrary`, `ObjectStore`), so that moving the enforcement to the
server (a database function, an edge function, or the gateway) before a
second person uses Origamic changes those adapters and no port.

## Consequences
With one builder, a client that bypasses the checks can only damage its own
data. The three non-negotiables hold for the code Origamic runs, not against a
hostile client of the owner's own account. `docs/STATUS.md` keeps this as a
known limit until it moves.

## Amended 2026-10-16: where an action is checked

The first slice's plan (decision 4) puts the check in the adapter. Each
`ObjectStorePort`'s `execute` calls `planWrite`, a pure function in `core`
(`packages/core/src/actions/planWrite.ts`), with the ontology as the store
holds it and the object the invocation names, and writes what it returns, or
nothing. The simulator and the Supabase adapter call the same function, and
the port's contract holds both to it. A link's far end and its cardinality
need the other rows, so the store checks those itself, as the contract
says. Moving the check to the server later changes the adapter, and no port
and no caller.
