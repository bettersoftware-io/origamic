# ADR-0012: Ports live in `core`, each with a contract, a simulator and an adapter

Status: accepted · 2026-10-14

## Context
The starter's convention is that every port has a contract test, an
in-memory simulator and a real adapter, and that the contract runs against
both; `pnpm dev` runs on the simulators. `ARCHITECTURE.md` named four ports
and only their real adapters. The starter keeps ports in a package of role
`domain`; Origamic keeps them in `core`
([review](../reviews/2026-10-14-first-reading.md), items 14, 15, 21 and 23).

## Decision
- **The ports are in `packages/core/src/ports`**: `OntologyStore`,
  `ObjectStore`, `SpecLibrary`, `LlmGateway`, and `Session` (who is signed
  in). Each has its contract beside it, in `__contracts__`.
- **Each has an in-memory simulator in `core`**, the `LlmGateway` one
  replaying scripted replies. Each real adapter is in `packages/adapters` and
  runs the same contract. The whole slice runs on simulators in tests and in
  `pnpm dev`, with no database and no model.
- **`OntologyStore` applies, it does not propose.** A proposal is a value in
  `core` (a change set, an app revision) until the builder accepts it; then
  `apply(changeSet)` stores it. Accepting a change to both applies the
  ontology's first and saves the app second: if the second fails, the first
  was compatible and harms nothing.
- **`SpecLibrary` stores apps and workspaces**, and assigns their versions.
- **`ObjectStore.view` emits again after every action executed through the
  same store.** There is no live subscription to the database in v1, and a
  page is bounded by the view's limit only.
- **The builder's conversation is a state machine in `core`**: the request,
  the generation in progress, the proposal and its diff, accept or reject.

## Consequences
The kit's port-contract gate looks for ports only in packages of role
`domain`. With the ports in `core` it prints
`SKIP port-contracts — no port interfaces were found` and the run still ends
"all gates passed." The kit is changed in `bettersoftware-io/skills` before
step 3 of the handover: any package may declare its ports, and finding none
where adapters are declared fails. Until then `requiredRoles` is not changed
to hide the missing `domain` package: the loud failure is the reminder.
