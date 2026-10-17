# Status: what is left

What is not done yet, across the whole project. Finished work is removed from
this page, not archived: the git log and [the changelog](../CHANGELOG.md) say
what was done. So an entry that is not here is done, or was never started. Do
not read progress into its absence.

An idea nobody has committed to is not here. It is in [IDEAS.md](IDEAS.md),
and moves here when it gets a plan.

One bullet for each entry: its name in bold, what is left, and a link to its
plan when it has one. `AGENTS.md` says when an entry is added, moved and
removed.

**Last updated: 2026-10-17**

## In progress

Work that has started and is not finished.

- **The first slice.** Planned in
  [plans/2026-10-16-first-slice.md](architecture/plans/2026-10-16-first-slice.md):
  twelve pull requests in Origamic and two in the plugin, in the order its
  graph gives. Built: part 1a, the `e2e` add-on, whose five specs still test
  the price list (removed in part 10, modes replaced in part 9); part 1b, a
  local Supabase that `pnpm gate:full` and CI start, with the first migration.
  Part 2, the spec's additions, is built and waits for the author's review
  before it merges. Part 3, `core`'s five ports with their contracts and
  simulators, `planWrite`, `valueSchema`, `checkCompatibility`, `createCore`
  and `createCoreHarness`, is built on part 2 and waits likewise; it added
  `Row` to `packages/spec`. Some exports wait for their first importer,
  since knip refuses an export nobody imports: `PropKind` and
  `CatalogComponent`, private to `references.ts`, are exported by part 5;
  `Break` (in `apps/compatibility.ts`) and `SavedApp` (in `createCore.ts`)
  by the part that first names them, likely part 4. Part 7, the Supabase
  adapters of the session, the ontology, the objects and the library, each
  passing its port's contract against the local Supabase, with
  `createSupabaseAdapters` and a second migration, is built on part 3 and
  waits likewise. The client of the LLM gateway, which the plan put in part
  7, comes with the gateway in part 8.

## Designed, not built

A plan or a design is on the main branch, and nothing of it is built.

- **The product.** The documents under
  [docs/architecture/](architecture/ARCHITECTURE.md) describe it, as settled
  by [the first reading](architecture/reviews/2026-10-14-first-reading.md).
  Built: the schemas in `packages/spec`, reviewed by the author on
  2026-10-16, `core`'s ports, simulators and rules (part 3 of the slice),
  and the dependency rule, held by `architecture.config.mts` over two
  packages that are still empty of code (`catalog`, `runtime`).

## Planned, and held by something

It waits on a release, a decision or other work. Each entry says on what.


## Next, with no plan yet

The next step is known, and nobody has written a plan for it.

- **Nothing holds "a required property is added with a `default`".**
  `ontology.ts` states it, and neither `ChangeSet` nor `applyChangeSet`
  checks it, so a change set can add a required property that every stored
  object lacks.
- **The kit counts a port's contract as production code.** Its
  `no-test-scaffolding-in-production` rule does not treat `__contracts__`
  as test code, though the coverage add-on does, so a contract may not
  import `packages/spec/src/testing/bookTracker.ts`.
  `packages/core/src/ports/__contracts__/fixtures.ts` keeps a small copy of
  the book tracker for the contracts instead. The fix is the kit's, in
  `bettersoftware-io/skills`; then the copy goes.
- **Merges on main have two kinds of subject.** "Merge PR #5: …" and GitHub's
  own "Merge pull request #6 from …". `AGENTS.md` names no subject. Pick one,
  or leave GitHub's.

## Waiting on a person

A step or a decision an agent cannot take: a setting, an account, a choice
between options. Each entry says who, and gives the command or the question.

- **Two Scorecard alerts to dismiss, or to accept as open.** "Code review"
  (alert 4) and "Branch protection" (alert 1) ask for a second person to
  approve every pull request. That is against merging a green change at
  once, with one maintainer. To dismiss: Security → Code scanning → the
  alert → Dismiss → "Won't fix", with that reason.
- **The best-practices badge.** Scorecard alert 6. A maintainer signs in at
  <https://www.bestpractices.dev> with GitHub, adds this repository and
  answers the questions. The alert eases as soon as the entry exists.
- **Two things `SECURITY.md` asks its maintainers for**, in the comment at
  its top: the two times under "What to expect" (an answer in 7 days,
  disclosure within 90) are the add-on's, not times anyone here chose, and
  "Supported versions" waits for a first release.

## Known limits

What is true of the project and will not be fixed soon: a thing that was not
verified, a case that is not covered.

- **A `__proto__` key inside a JSON literal is dropped without a word.** A
  prop's value or a state key's `initial` is parsed by `z.json()`, which
  leaves the key out, as `JSON.parse` input can carry it. It cannot leave a
  reference dangling, since a literal names nothing; it only loses part of
  the literal. Every record of a spec refuses the key instead.

- **The dependency rule is held only where a package exists.** `apps/web`
  and `apps/gateway` get their lines in `architecture.config.mts` when they
  are made, in the first slice. Until the price list is removed, the roles of
  `core` and `runtime` also let them import its `domain` and `shared`. A
  `fetch` written by hand outside `adapters` is not caught, nor are rules 1,
  4 and 5 of [ARCHITECTURE.md](architecture/ARCHITECTURE.md), which are
  questions for a review. Nor is "the gateway imports the catalog's
  manifest only": `mayImport` names a whole package, so once `apps/gateway`
  names `packages/catalog`, an import of its React side passes the gate.
- **The role `explicit` carries none of React's lint rules.** When
  `packages/catalog` first imports React, `pnpm check:react-policies` will
  ask for it under `reactWithoutPolicies` with a reason, or for a change to
  the kit that gives it a role's rules.
- **Two importers in `pnpm-lock.yaml` are written by hand.**
  `packages/catalog` and `runtime` have no dependency,
  and pnpm 12 writes no importer for such a package, while its frozen
  install (what CI runs) refuses a lockfile without one. Each has
  `packages/<name>: {}`, added by hand on 2026-10-16; a plain `pnpm install`
  keeps them, and they go when the package gets a dependency. A new package
  with no dependency needs the same: run `pnpm install --frozen-lockfile`
  before pushing, since `gate:full` stays green without it.
- **Where Docker is not running, `pnpm gate:full` fails on
  `packages/adapters`'s coverage.** Its `*.supabase.test.ts` files are left
  out there (with a `SKIP` line), and the coverage gate knows only port tests
  as a reason not to judge a package, so it measures the adapters without
  the tests that reach them and fails the bar for a reason that is not in
  the code. CI always has Docker. The fix is the coverage add-on's, in
  `bettersoftware-io/skills`: a package whose tests were left out is not
  judged.
- **Every checkout on a machine shares one local Supabase.** Its project id
  is `origamic`, on ports 54321 (the API) and 54322 (Postgres), which
  Docker publishes on every interface with the CLI's default password. A
  checkout whose `supabase/migrations/` lacks a migration another checkout
  applied fails the global setup with `MigrationMissingLocalError`. Bring
  that checkout up to main, or reset the database to its own migrations:
  `pnpm --filter @origamic/adapters supabase db reset --local`. The other
  checkout applies its own again on its next run. Nor is a migration edited in
  place applied again to a running stack: `migration up` skips a version the
  database has recorded, so the stack keeps the old tables. Run the same
  `db reset --local` after editing one.
- **The Supabase object store reads a view in pages, each a query of its
  own.** The API cuts every answer at `max_rows` (1000, in
  `packages/adapters/supabase/config.toml`), so a view of more objects is
  read 1000 at a time. A write between two pages can move an object across
  the boundary, so it is read twice or not at all in that one emission; the
  next action re-reads. Raising `max_rows` past the page size changes
  nothing; lowering it below 1000 needs the page size lowered with it.
- **The Supabase object store's text order and `contains` can differ from
  the simulator's outside ASCII.** Postgres's `COLLATE "C"` orders by UTF-8
  bytes, which is code point order: a supplementary character (U+10000 and
  above) sorts after U+E000 to U+FFFF there, and before them in the
  simulator's UTF-16 code units. `contains` is ILIKE, which lowercases by the
  database's ctype (en_US.UTF-8), where the simulator uses JavaScript's
  `toLowerCase`; the two can differ on other scripts' case folding.
- **Two updates of one object at once: the last wins.** The Supabase object
  store's update writes every value `planWrite` planned from the object
  as it was read, so of two updates of one object at once the last wins
  whole. One builder does not meet it; it moves with the checks to the
  server (ADR-0009).
- **A link keeps the cardinality its type had when it was written.** The
  unique indexes that hold a link to its cardinality read it from the link's
  own row, since the database does not read the ontology. A change set that
  changed a link type's cardinality would leave the links written before it
  held to the old one; no change set operation does so today.
- **`packages/adapters` is typechecked with Node's types over all of
  `src`.** Its code runs in the browser, and only its tests need Node (they
  read the stack's keys from `process.env`). The typed lint reads each file
  with the `tsconfig.json` nearest to it, so a second tsconfig for the tests
  would leave them read by none. `noNodeBuiltins` holds the imports; a Node
  global (`process`, `Buffer`) in the adapters' own code is caught by no
  check, only by review.
- **A port is `<Name>Port`, in `<name>Port.ts`.** The kit's contract gate
  finds a port, and an adapter that implements it, only by that name.
- **The compatibility check reads only what `core` can read.** It finds a
  deprecated or missing property that an app's views filter or sort on, or
  that its handlers pass to an action. A property only a component's props
  name (a table's column, a form's field) is not checked: that needs the
  catalog's knowledge of its props.
- **In v1 the client enforces the schemas and the actions.** The browser
  writes to Supabase itself, and row-level security checks whose rows it
  writes, not what it writes. A client that bypasses `core` can put anything
  into its own owner's rows. It moves to the server before a second person
  uses Origamic ([ADR-0009](architecture/adr/0009-validation-in-v1-is-the-clients.md)).
- **Two Scorecard alerts clear by themselves.** "Maintained" (alert 5) when
  the repository is 90 days old, which is 2027-01-10. "SAST" (alert 2) as
  more of the last commits have a CodeQL run: 4 of 6 on 2026-10-12.
- **The shipping rules were followed cold once, on a change that went
  right.** A red check, a conflict, two sessions merging at the same time and
  a failure on main after a merge have not been met. The rules for them are
  in `AGENTS.md` and unproven here.
- **The hook before a shell command copies what one version of Claude Code
  does.** It refuses an outward step joined to others, and asks about a push
  that is not written plainly. To see such a push it looks past the words
  Claude Code 2.1.296 looks past (`nice`, `timeout`, `xargs` and the rest),
  and it is registered for the two tools that version runs a shell command
  with, `Bash` and `Monitor`. A later version that looks past another word,
  or gains another such tool, opens a way past it, and nothing here fails
  when it does. It was watched on 2026-10-13 in headless sessions of Claude
  Code and of Codex, in a scratch repository with a rule that allows every
  push; not in front of a person. This project has no such rule, so every
  push here asks whatever the hook says. The add-on's own page, in
  `bettersoftware-io/skills`, holds the two reviews and the runs.
- **A red `gate:full` when a session stops may be another session's
  doing.** Seen once, on 2026-10-13, while two sessions worked here: the
  coverage stage failed with "vitest wrote no coverage summary" for
  `packages/react-bindings`, on a commit that was green in CI, and passed
  when run again with nothing changed. The likely cause, not proven: both
  sessions' stop hooks run the gate in this one checkout, and one empties
  the `coverage/` folder the other is reading. When that message is the
  only failure, run the gate once more before you change anything; a second
  red is the code's. The fix is the plugin's, and its `docs/STATUS.md` in
  `bettersoftware-io/skills` has the entry.
