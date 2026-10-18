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

**Last updated: 2026-10-18**

## In progress

Work that has started and is not finished.

- **The first slice.** Planned in
  [plans/2026-10-16-first-slice.md](architecture/plans/2026-10-16-first-slice.md).
  Parts 1 to 10 are on main: the `e2e` add-on and the local Supabase (part
  1), the spec's additions (2), `core`'s ports, simulators and rules (3),
  its app session, builder and workspace (4), the catalog (5), the runtime
  (6), the Supabase adapters (7), the gateway and its client (8), the web
  app (9), and the starter's price list removed, with `AGENTS.md`'s tables
  rewritten for Origamic's packages (10). Left: part 11, which is what
  FIRST-SLICE.md's "Done means" asks for. Its review ran on 2026-10-18: a
  fresh agent ran `reviewing-architecture` over the diff from `fcbbd02`
  (main before the slice's plan merged) to main, and found nothing in the
  dependency rule or the three non-negotiables to object to. Of its two
  findings, the fixture factories' names are fixed; the other, that the
  owner's hand-over and two of the shell's intents live in `runtime` rather
  than `core`, is being fixed in a pull request of its own. Its notes are
  under "Next" and "Waiting on a person". Then the author walks the loop
  with the real model on a clean database (see "Waiting on a person").

## Designed, not built

A plan or a design is on the main branch, and nothing of it is built.

- **The product.** The documents under
  [docs/architecture/](architecture/ARCHITECTURE.md) describe it, as settled
  by [the first reading](architecture/reviews/2026-10-14-first-reading.md).
  Built: the schemas in `packages/spec`, reviewed by the author on
  2026-10-16, `core`'s ports, simulators and rules (part 3 of the slice),
  its app session, builder and workspace (part 4), the catalog (part 5), the
  runtime (part 6), the Supabase adapters (part 7), the gateway (part 8), the
  web app (part 9), and the dependency rule, held by `architecture.config.mts`
  over every package.

## Planned, and held by something

It waits on a release, a decision or other work. Each entry says on what.


## Next, with no plan yet

The next step is known, and nobody has written a plan for it.

- **The plugin's files still speak of the starter's price list.** The fix
  is in `bettersoftware-io/skills`, then an update brings it here; these
  files are the installer's, not the project's. What matters most:
  `tools/arch/docs/review.md:22-32`, the seven questions `AGENTS.md` makes
  every review answer, says a port is OK in "the domain package's ports
  folder"; Origamic's ports are in `core` (ADR-0012), so a fresh review can
  report that as a finding. The kit should say "the package that declares
  `ports`". Then `packages/e2e/notStarted.setup.ts:8` and
  `tools/e2e/lib/arguments.mts:26` give `src/sim/priceList.spec.ts` as the
  example of one spec, and `packages/e2e/playwright.config.ts:52` gives that
  deleted spec as the reason for the timeout. And `tools/installed.json`'s
  e2e "starting" list names five deleted files
  (`src/fullstack/serverPrices.spec.ts`, `src/pages/PriceList.page.ts`,
  `src/pages/ServerFeed.page.ts`, `src/sim/priceList.spec.ts`,
  `src/sim/selection.spec.ts`, under `packages/e2e`): whether an update
  seeds them again is the add-on's to say.
- **Keep a store call to the owner it began for.** In the client, each
  adapter call reads the access token once and sends it with every request
  of the call, so a call that began as A ends as A; or `apply` and `save`
  each become one database function, one request each. That narrows the
  window of the known limit "A store call in flight when the owner
  changes". The full fix is the server's check (ADR-0009): a write names
  its owner and the server refuses it for any other.
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
- **Every open view reads the ontology again at each change.** The Supabase
  stores' streams are cold: each subscriber gets its own read
  (`supabaseOntologyStore.ts`, `supabaseObjectStore.ts`,
  `supabaseSpecLibrary.ts`), and `AppSession.rows()` subscribes to
  `ontology.current()` once per view. With N views open, an apply reads the
  ontology N times, and an action reads every open view again, of any type.
  Requests, not connections. The fix: one shared ontology stream in
  `createCore` (`shareReplay({ bufferSize: 1, refCount: true })`) handed to
  the app sessions, and each store's stream shared inside its adapter.
- **The request to Anthropic is built where no test runs.**
  `apps/gateway/src/anthropicModel.ts` is left out of coverage (ADR-0011),
  and it assembles the model, `max_tokens`, `thinking`, `output_config` and
  `betas` inline. The reply's and the schema's mappings are tested; the
  request's shape is not. The fix: a pure `anthropicParamsOf(config,
  request)` with its own test, as `replyOfMessage` has.
- **Merges on main have two kinds of subject.** "Merge PR #5: …" and GitHub's
  own "Merge pull request #6 from …". `AGENTS.md` names no subject. Pick one,
  or leave GitHub's.

## Waiting on a person

A step or a decision an agent cannot take: a setting, an account, a choice
between options. Each entry says who, and gives the command or the question.

- **Whether to fix the agent-workflow hook's shell parser.** The author
  decides: `AGENTS.md` says the hook changes only when the author asks. The
  parser does not see a `$(…)` inside `${…}`, and ends a `$'…'` at an
  escaped quote, so an outward step chained to another can pass the hook
  unsplit. The host's own permission prompt still asks. The fix belongs in
  the plugin's agent-workflow add-on, in `bettersoftware-io/skills`.

- **Ask the real model once, by hand (the slice's part 8, step 6).** The
  author, with an Anthropic API key; no test in the gate calls a model
  (ADR-0011). Expected: progress lines, then one `proposal` whose app binds
  `Book@1`, `createBook@1` and `updateBook@1`. Write the outcome into this
  page (remove this entry, or say what failed), or into the pull request of
  the next part. With the dev Supabase running (`pnpm supabase:dev`), from the
  project's folder:

  ```bash
  eval "$(pnpm --silent --filter @origamic/adapters supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"
  ANTHROPIC_API_KEY=… SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" node apps/gateway/src/main.ts
  # in a second shell, with API_URL and ANON_KEY read the same way:
  TOKEN=$(curl -s "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'content-type: application/json' \
    -d '{"email":"builder@origamic.test","password":"a-long-password-1"}' | node -p 'JSON.parse(require("fs").readFileSync(0)).access_token')
  curl -N http://localhost:8787/generate -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"format":1,"intent":"a simple tracker for the books I am reading, with title, author, status (want / reading / done) and a rating","ontology":{"format":1,"version":0,"objectTypes":[]}}'
  ```

- **Walk the first slice's loop with the real model (the slice's part 9,
  step 5).** The author, with an Anthropic API key, on a clean database; no
  test in the gate calls a model (ADR-0011). `pnpm dev` and both end-to-end
  modes walk the loop with the scripted model. From the project's folder:

  ```bash
  pnpm --filter @origamic/adapters supabase db reset --local   # empties the dev database: the author's data
  ANTHROPIC_API_KEY=… pnpm dev:stack
  # open http://localhost:5173, sign up, and walk FIRST-SLICE.md's seven steps:
  # ask for the book tracker, accept, add two books, reload, then ask for
  # "add a 'date finished' field" and accept
  ```

  Write what happened at each of the seven steps into this page (remove this
  entry, or say what failed), or into the pull request of the next part.
  `pnpm dev:stack` starts the dev stack (`origamic`, 54321) and never resets
  it; the `db reset` above is the author's choice, and touches the dev
  stack only, not the tests' (`origamic-test`).

- **Whether a tightened action rule breaks an app.** The author decides. A
  binding's action version is a floor, not a pin: an app bound to
  `createBook@1` runs the ontology's current `createBook@N` whenever that
  version still sets every field the app passes
  (`packages/core/src/actions/planWrite.ts`). So when a later version adds a
  `required` or a `range` rule, the compatibility check
  (`packages/core/src/apps/compatibility.ts`) reports nothing, and the
  app's writes are refused, with the problem shown on the element. That
  matches ADR-0005's list of what breaks an app. The question: should a
  tightened rule count as a break, and be reported when the app is opened?
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

- **The dependency rule is held for whole packages and their imports
  only.** A `fetch` written by hand outside `adapters` is not caught, nor are rules 1,
  4 and 5 of [ARCHITECTURE.md](architecture/ARCHITECTURE.md), which are
  questions for a review. Nor is "the gateway imports the catalog's
  manifest only": `mayImport` names a whole package, so once `apps/gateway`
  names `packages/catalog`, an import of its React side passes the gate.
- **Dragging or resizing a panel is not saved** (the plan's decision 11).
  The workspace saves a version when a panel is added or closed and when a
  pin moves; where a person dragged a panel, and the sizes of a split, last
  until the page is loaded again. Nor does the shell give dockview a saved
  split's sizes or a tab group's active tab (`apps/web/src/ui/dockviewSteps.ts`):
  v1 saves neither, so every part takes an equal share.
- **A panel checks its app's compatibility when it opens it, not again.**
  The app a panel pins is read with its compatibility once for each pinned
  version; a change set accepted for another app does not make an open panel
  check again until its pin moves or the page is loaded again.
- **The web app is one script of 1.1 MB** (300 kB compressed), and its build
  says so. Nothing splits it yet.
- **AGENTS.md's end-to-end section is the add-on's.** Part 9 pointed it at
  Origamic's modes and specs (the `agent-docs` gate requires a named file to
  exist); the add-on's next update rewrites the section from its template,
  and its references then need the same care again.
- **A form drawn afresh after a submit loses the keyboard's focus.** The
  runtime remounts an element whose event wrote through an action and was
  not refused, which is how a create Form starts empty again; the focus
  that was on its button goes back to the page. Nothing puts it back on the
  form's first field.
- **Every prop is checked against its schema on every render.** Each
  catalog component is behind its contract (`checked`), which parses each
  prop it is handed, a Table's rows included, each time it draws: linear in
  rows times values. That is nothing at the slice's sizes; a view of
  thousands of rows would want the rows checked once, where they arrive.
- **A stream that fails ends the app's view until it is drawn again.**
  `AppView` shows why in the panel's place, and does not retry; the view
  comes back when it is mounted afresh or given another session or app
  version.
- **An app shows "Loading…" until each view its elements read has rows.**
  `AppView` draws nothing of the app before every one of them has emitted
  once, so a view whose store never answers keeps the whole panel waiting.
  A view that fails is shown in the panel's place, with why.
- **pnpm 12 writes no importer for a package with no dependency.** Its
  frozen install (what CI runs) then refuses the lockfile. No package is in
  that state today; a new one with no dependency needs `packages/<name>: {}`
  added to `pnpm-lock.yaml` by hand. Run `pnpm install --frozen-lockfile`
  before pushing, since `gate:full` stays green without it.
- **Where Docker is not running, `pnpm gate:full` fails on
  `packages/adapters`'s coverage.** Its `*.supabase.test.ts` files are left
  out there (with a `SKIP` line), and the coverage gate knows only port tests
  as a reason not to judge a package, so it measures the adapters without
  the tests that reach them and fails the bar for a reason that is not in
  the code. CI always has Docker. The fix is the coverage add-on's, in
  `bettersoftware-io/skills`: a package whose tests were left out is not
  judged.
- **Every checkout on a machine shares one test stack, one run at a time.**
  The adapters' tests run against the local Supabase `origamic-test` (the API
  on 54421, Postgres on 54422), apart from the dev stack `origamic` that
  `pnpm supabase:dev` starts (ADR-0004). A run holds
  `/tmp/origamic-<uid>/origamic-test-supabase.lock` until its tests end, so
  a second checkout's run waits, up to ten minutes for one holder, and then
  fails; a vitest left in watch mode holds it until it is stopped. Anything
  else that starts the test stack must open it as
  `tools/supabase/testDatabase.mts` does, lock and port check included: the
  e2e `stack` mode does (`tools/supabase/e2eDatabase.mts`), and holds the
  lock for its whole run, so a gate started meanwhile waits for it. A
  lock left by a process that is gone is taken over; but if its pid has been
  given to another live process meanwhile, the next run waits the ten
  minutes and fails naming the file: delete it. Both stacks' ports are
  published on every interface with the CLI's default password. A migration
  edited in place is not applied again to a running stack: `migration up`
  skips a version the database has recorded. Reset the test stack after
  editing one, with `pnpm --filter @origamic/adapters supabase db reset
  --local --workdir .supabase-test`; the dev stack's `db reset --local`
  drops its data.
- **The gateway limits no caller's rate or spend.** Any token Supabase
  accepts may ask the model as often as it likes; with one user in v1
  that is the author. A limit per caller comes before a second user, with
  the move to Fly.io.
- **What the API holds of the schema was read, not tried.** The keywords
  `anthropicSchemaOf` keeps are the documented ones and the SDK's own
  helper's (ADR-0011); no request in the gate reaches Anthropic, so the
  first run of step 6 above is the first that would show a refusal of the
  schema.
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
- **A view's filter and sort do not see a property's `default`.** A row
  shows the default for a property its object lacks (ADR-0005), but the
  store compares and sorts that object as having no value, so `status eq
  "want"` leaves out a book written before `status` existed. Nothing
  affects the book tracker; it matters once a change set adds a property
  with a default that a view filters on.
- **A store call in flight when the owner changes can write into the next
  owner's rows.** At each change of owner the shell hands the core over
  (`core.handOver()`): the workspace closes, the builder drops what it was
  asked or proposed, an accept under way stops before its next store, and
  a workspace change decided before is refused. Each check is made right
  before a store is called. But a call already under way when the owner
  changes in another tab (a sign-out there, or a token refresh that fails;
  a sign-out in this tab waits for an accept) goes on, and the Supabase
  client sends B's token on its next request as soon as it has switched,
  before `onAuthStateChange` reaches `handOver`. So it can write A's next
  ontology version (`apply` reads, then writes), A's app (`saveApp` reads
  the latest version, then writes), or an object an app's action plans
  (`execute`) into B's rows. The window is one read's round trip plus that
  delay. The narrowing and the fix are under "Next, with no plan yet".
- **The workspace presenter saves each change from the copy it holds,**
  not from the library's latest, so a version saved elsewhere since (another
  tab) is overwritten by the next panel added or closed or pin moved here.
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
  `packages/react-bindings` (since removed), on a commit that was green in CI, and passed
  when run again with nothing changed. The likely cause, not proven: both
  sessions' stop hooks run the gate in this one checkout, and one empties
  the `coverage/` folder the other is reading. When that message is the
  only failure, run the gate once more before you change anything; a second
  red is the code's. The fix is the plugin's, and its `docs/STATUS.md` in
  `bettersoftware-io/skills` has the entry.
