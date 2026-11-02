# Changelog

What reached the main branch, week by week, written for a person catching up.
It is not a list of commits. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with two changes:

- **A version is an ISO week** (`2026-W40` is Monday 28 September to Sunday
  4 October). A pull request belongs to the week of its merge time in UTC.
- **A week is grouped by theme, then by kind.** It opens with a short summary,
  then `Added`, `Changed` and `Fixed` for what a user or a developer would
  notice, `Decisions` for the choices worth remembering, and `Under the hood`
  for tests, gates, tooling, docs and dependency updates.

Every merged pull request is cited by its number in square brackets, with a
`#` before the number. Each citation has a link definition at the bottom of
this file, in ascending order, and `pnpm changelog defs --write` writes them.
`pnpm changelog check <week>` proves both. The newest week comes first. A
session starts with a note of the finished weeks that are due, and
`pnpm changelog due` lists them.

Each finished week is also a git tag of the same name, on the last commit
that reached the main branch before Monday 00:00 UTC. So
`git diff 2026-W39 2026-W40` is exactly the change the W40 section describes.
The `Weekly tag` workflow creates the tag and opens an issue that asks for
the entry.

## 2026-W44 — 26 Oct – 1 Nov

A quiet week: only the update bot's pull requests merged. The app and the
project's own tooling did not change.

### Under the hood

- Dependency updates from Renovate: the Claude Code action used by the
  changelog writer, CodeQL's action, and the minor and patch releases of
  `typescript-eslint`, `dependency-cruiser`, `knip` and `dockview` [#44]
  [#45] [#47].

## 2026-W43 — 19 Oct – 25 Oct

Upkeep. Three of the week's update pull requests were stuck behind two
problems the bot could not fix by itself. Once those were fixed, the
project took the newer kit and add-ons, which brought this changelog, its
weekly tag and the reminder of the weeks that are due.

### Added

- **The weekly changelog.** This file, the `Weekly tag` workflow that tags
  each finished week and opens an issue asking for its entry, a reminder at
  the start of a session of the weeks that are due, and
  `/workflow:changelog` to write one. The workflows that write an entry or
  copy it to a GitHub release are installed but stay off until switched on
  [#43].

### Fixed

- **Tests no longer fail at random with `ENOTEMPTY`.** vitest 5.0.5 started
  sharing one module cache across every package, and deleting it whenever
  the lockfile changes. Packages tested side by side could delete it under
  each other. Every `test` script now runs with `--no-fsModuleCache`, and a
  new gate fails a script that leaves the flag out [#42].
- **The update pull requests can merge again.** Renovate now moves the
  workflows' Playwright image with `@playwright/test`, so the
  `playwright-pin` gate passes. Playwright updates wait until someone asks
  for them on the Dependency Dashboard. zod is lifted past
  [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
  which had failed `pnpm audit --prod` on every pull request, with a scoped
  override for the copy the Anthropic SDK brings in [#41].

### Under the hood

- **The kit and add-ons from bettersoftware-skills 0.19.2 and 0.21.2**,
  with a new `lockfile` gate and the agent hook's shell-parser fix. The
  project's own end-to-end section of `AGENTS.md` was kept rather than
  replaced by the starter's text [#42] [#43].
- Dependency updates from Renovate: vite 8.3.3 (a security fix for
  `launch-editor` on Windows), the GitHub Actions (`setup-node`,
  `upload-artifact`, CodeQL, Scorecard), and a group of minor and patch
  releases [#38] [#39] [#40].

## 2026-W42 — 12 Oct – 18 Oct

The week the starter became Origamic. It opened on tooling: how a change
leaves the machine, and a page of what is left. Midweek the architecture was
read against itself and settled in decision records, the spec's schemas were
written to them, and the gates were set to hold the dependency rule. Friday
and Saturday the first slice landed in ten parts, from the spec to a web app
where a person asks for a book tracker, accepts it and uses it. The
starter's price list example went with it.

### Added

- **The first slice, end to end.** The web app signs a person in, lets them
  ask the builder for an app, shows the proposed change to the ontology and
  the app's diff with Accept and Reject, and opens the result in a panel of a
  dockview workspace; the library lists every app at every version, and an
  app pinned to an older version shows a compatibility report instead of
  breaking. `pnpm dev` runs it all on simulators with a scripted model;
  `pnpm dev:stack` runs it on a local Supabase and, when an API key is set,
  the real gateway [#33].
- **The spec, in `packages/spec`.** Schemas for the ontology (object, link and
  action types, each at its own version, changed only by whole change sets),
  a flat UI spec whose props read a view or a state key and whose events set
  state or invoke an action, apps that bind exact versions, and workspaces
  [#17]. Then each catalog prop's kind (`fixed`, `state`, `view`),
  `validateApp`, `applyChangeSet`, and the messages the builder and the
  gateway exchange [#23]. Every check reports where and what to fix, because
  the model reads those messages when it retries.
- **The core.** Five ports, each with a contract and a simulator: the ontology
  store, the object store, the spec library, the model gateway and the
  session. `planWrite` is the one place an action's input is checked, and
  `checkCompatibility` says whether an app still fits a newer ontology [#25].
  On top of them: the session of an open app, the builder's ask, proposal,
  accept and reject, and the workspace that saves a new version on each
  change [#27].
- **The catalog and the runtime.** Five components a spec can name (`Stack`,
  `Text`, `Select`, `Table`, `Form`), each a contract the model sees and a
  React implementation on shadcn primitives, plus the schema the model's
  reply is held to [#28]. `AppView` draws a spec from its flat map over those
  components, and the shell's view model turns the core's streams into hooks
  [#30].
- **Storage on Supabase.** A local Supabase with the first migration, where
  every row belongs to an owner and row-level security keeps one owner out of
  another's data; a link can only join two objects of the same owner [#22].
  The four storage ports then run on it, each passing the same contract as
  its simulator, with views read through a SQL function so numbers compare as
  numbers and text compares the same way as in the simulator [#26].
- **The gateway.** `apps/gateway` is the one caller of the model: it checks
  the caller's Supabase token, asks once, checks the reply against the
  catalog and the ontology, sends the problems back for one retry, and
  streams progress and the proposal as lines of JSON. `createHttpLlmGateway`
  is the browser's client of it [#31].
- **A way to ship from many sessions at once.** Every change starts in its
  own worktree cut from `origin`'s main, and a hook makes each push or pull
  request step a command of its own [#1]. `docs/STATUS.md` holds what is left
  and `docs/IDEAS.md` what nobody has committed to [#9]. Commands report where
  the project stands, write a session's findings into the docs [#11], and say
  which worktrees are finished (`pnpm worktree:audit`) [#12].
  `pnpm repo:settings` names the GitHub settings the checks depend on that
  are off [#8].

### Changed

- **The price list is gone, and `AGENTS.md` describes Origamic.** The
  starter's worked example and its six packages were deleted once Origamic's
  own packages showed every pattern. `AGENTS.md` now lists the nine packages,
  what each may import, and a real file of Origamic's for each pattern [#34].
- **The core follows the signed-in owner.** When the owner changes, the core
  itself closes the builder and the workspace and opens the next owner's, so
  nothing decided for one owner is written after another signs in. This used
  to live in the runtime's view model, where any other caller of the core
  would have missed it [#36].
- **Tests run on their own local Supabase.** The tests start a separate test
  stack on other ports, reset it when its migrations differ from the
  checkout's, and take turns on it through a lock. The dev stack that
  `pnpm supabase:dev` starts is never reset by a test run. Before this,
  checkouts on one machine shared one database and turned each other's gates
  red [#32].

### Fixed

- **Pushes that ran without a question.** A permission rule meant to ask
  about a `source:target` push matched nothing, and Claude Code warned about
  it at each start; the hook now asks instead [#10]. A review found five more
  shapes of push that an `allow` rule would let through (a wrapper program,
  `xargs`, a quoted option, a shortened option, the Monitor tool); the hook
  now asks about any push not written plainly [#13], and its check says so
  [#15]. The workflow commands had granted all of `git` and `gh` while they
  ran; each now grants only what it uses, and nothing outward [#11].
- **Main went red on coverage.** The ontology store's answer to a change
  stored first by someone else was reached only by a race in a concurrent
  test, so coverage passed on one merge and failed on the next. A test now
  reaches it on purpose [#29].
- **Smaller fixes.** The kit's import alias replaced only the first star of
  its target, which CodeQL reported [#2]. The README said Node 24 where the
  project needs Node 26 [#6].

### Decisions

- **The first reading of the architecture.** The vision, the architecture and
  the decision records were read against each other and the starter's gates.
  ADR-0001 to ADR-0006 were amended and ADR-0008 to ADR-0012 written: actions
  belong to the ontology, the client enforces the schemas in v1, the catalog
  is a contract that shadcn implements, Anthropic first behind the gateway
  port, and ports live in the core with contracts and simulators. Every
  finding and how it was settled is in
  [the review](docs/architecture/reviews/2026-10-14-first-reading.md) [#16].
- **The plan of the first slice.** Twelve pull requests, each with its
  interfaces and tests, and twelve choices the documents had left open, in
  [the plan](docs/architecture/plans/2026-10-16-first-slice.md) [#20].
- **Which model, and how it may fail.** The gateway asks `claude-opus-5-5` at
  high effort, with structured outputs and Anthropic's server-side fallback
  when the model refuses, and gives the model one retry with its problems
  quoted; see [ADR-0011](docs/architecture/adr/0011-anthropic-first-behind-the-gateway-port.md)
  [#31].
- **A test database apart from the author's.** The test stack is throwaway
  and reset when it differs; the dev stack is never reset by a tool; see
  [ADR-0004](docs/architecture/adr/0004-supabase-persistence-fly-gateway.md)
  [#32].
- **Renovate in place of Dependabot.** Dependabot's updater runs Node 24 and
  pnpm refused every run on a project that asks for Node 26. Renovate
  installs the Node a project asks for, and it opens the security fixes too
  [#5].

### Under the hood

- **The dependency rule is held by the gates.** `architecture.config.mts`
  now carries the table from `ARCHITECTURE.md`, and the gate fails an import
  that points outward or a library used outside the packages allowed it
  [#18]; two leftovers of that step are on the status page [#19].
- **Tests.** Property tests with fast-check for the recursive tree of UI nodes
  [#3]. The end-to-end add-on, with Playwright, installed as it comes [#21],
  and a local Supabase started by `pnpm gate:full` and by CI [#22]. Fixture
  factories renamed to `create…` after the first slice's architecture
  review, whose notes went to the status page [#35].
- **Kit and add-on updates** from bettersoftware-skills: the agent-workflow
  section of `AGENTS.md` grew to cover a change from first edit to main
  [#2] [#4], and 0.18.1 added `pnpm check:status` to `gate:fast` [#24].
- **Known limits recorded.** A red gate at a session's end can come from
  another session emptying the coverage folder in the same checkout; the
  status page says to run it once more [#14].

[#1]: https://github.com/bettersoftware-io/origamic/pull/1
[#2]: https://github.com/bettersoftware-io/origamic/pull/2
[#3]: https://github.com/bettersoftware-io/origamic/pull/3
[#4]: https://github.com/bettersoftware-io/origamic/pull/4
[#5]: https://github.com/bettersoftware-io/origamic/pull/5
[#6]: https://github.com/bettersoftware-io/origamic/pull/6
[#8]: https://github.com/bettersoftware-io/origamic/pull/8
[#9]: https://github.com/bettersoftware-io/origamic/pull/9
[#10]: https://github.com/bettersoftware-io/origamic/pull/10
[#11]: https://github.com/bettersoftware-io/origamic/pull/11
[#12]: https://github.com/bettersoftware-io/origamic/pull/12
[#13]: https://github.com/bettersoftware-io/origamic/pull/13
[#14]: https://github.com/bettersoftware-io/origamic/pull/14
[#15]: https://github.com/bettersoftware-io/origamic/pull/15
[#16]: https://github.com/bettersoftware-io/origamic/pull/16
[#17]: https://github.com/bettersoftware-io/origamic/pull/17
[#18]: https://github.com/bettersoftware-io/origamic/pull/18
[#19]: https://github.com/bettersoftware-io/origamic/pull/19
[#20]: https://github.com/bettersoftware-io/origamic/pull/20
[#21]: https://github.com/bettersoftware-io/origamic/pull/21
[#22]: https://github.com/bettersoftware-io/origamic/pull/22
[#23]: https://github.com/bettersoftware-io/origamic/pull/23
[#24]: https://github.com/bettersoftware-io/origamic/pull/24
[#25]: https://github.com/bettersoftware-io/origamic/pull/25
[#26]: https://github.com/bettersoftware-io/origamic/pull/26
[#27]: https://github.com/bettersoftware-io/origamic/pull/27
[#28]: https://github.com/bettersoftware-io/origamic/pull/28
[#29]: https://github.com/bettersoftware-io/origamic/pull/29
[#30]: https://github.com/bettersoftware-io/origamic/pull/30
[#31]: https://github.com/bettersoftware-io/origamic/pull/31
[#32]: https://github.com/bettersoftware-io/origamic/pull/32
[#33]: https://github.com/bettersoftware-io/origamic/pull/33
[#34]: https://github.com/bettersoftware-io/origamic/pull/34
[#35]: https://github.com/bettersoftware-io/origamic/pull/35
[#36]: https://github.com/bettersoftware-io/origamic/pull/36
[#38]: https://github.com/bettersoftware-io/origamic/pull/38
[#39]: https://github.com/bettersoftware-io/origamic/pull/39
[#40]: https://github.com/bettersoftware-io/origamic/pull/40
[#41]: https://github.com/bettersoftware-io/origamic/pull/41
[#42]: https://github.com/bettersoftware-io/origamic/pull/42
[#43]: https://github.com/bettersoftware-io/origamic/pull/43
[#44]: https://github.com/bettersoftware-io/origamic/pull/44
[#45]: https://github.com/bettersoftware-io/origamic/pull/45
[#47]: https://github.com/bettersoftware-io/origamic/pull/47
