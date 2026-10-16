# Origamic — handover to Claude Code

Paste this file's contents as the first message of a Claude Code session in the
`origamic` repo, after the bettersoftware starter has been created and
`pnpm gate:full` passes.

---

You are picking up a new project called **Origamic** (origamic.ai). The repo was
created from the bettersoftware starter and the gates already pass. Nothing
product-specific exists yet except the documents under `docs/architecture/`,
the ADRs under `docs/architecture/adr/`, and a schema skeleton under
`packages/spec/`.

Work in this order and do not skip ahead:

1. Read `docs/architecture/VISION.md`, `docs/architecture/ARCHITECTURE.md`
   and every ADR. Then argue with them: list the places where the documents
   are vague, contradictory, or where the starter's conventions conflict with
   what they ask for. Do not write code yet. Stop and show me the list.

2. Once we have resolved that list, complete `packages/spec`. It holds the
   five Zod schemas (`ontology`, `ui-spec`, `action`, `binding`, `workspace`)
   and, since the review of step 1, the pure functions that check a spec's
   references (ADR-0002): no runtime dependencies beyond `zod`, no imports
   from any other package. Every root schema carries a `version`. Write the schemas,
   their tests (including a test that proves an invalid spec is rejected), and
   stop. I will review them line by line before anything consumes them.

3. Add the dependency rules from `ARCHITECTURE.md` to `tools/arch` as import
   bans, so the gates enforce them rather than prose. Prove the gate fails on
   a deliberately wrong import, then remove the wrong import.

4. Only then: plan the first vertical slice from
   `docs/architecture/FIRST-SLICE.md`, as a plan I approve before you build.

Rules that hold throughout:

- The library stores specs; the runtime interprets them. Never generate
  application code to be deployed. If a feature seems to need generated
  code, stop and raise it.
- UI binds to the ontology only. Writes happen only through named actions.
  Nothing references a table, a column or a raw query outside the
  persistence adapter.
- Specs are versioned from the first commit. Bindings reference
  `ObjectType@version`, never a bare name.
- No `any`, no schema bypass, no hand-written component where a catalog
  entry would do.
- Use the plugin's `reviewing-architecture` skill in a fresh session, not
  the one that wrote the code, before any slice is called done.
- Keep `docs/architecture/` true: when a decision changes, change the ADR
  (or add a superseding one) in the same change.

Start with step 1.
