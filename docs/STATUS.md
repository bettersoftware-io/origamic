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

**Last updated: 2026-10-14**

## In progress

Work that has started and is not finished.

- **The schemas, step 2 of [HANDOVER.md](../HANDOVER.md).** `packages/spec`
  rewritten to the decisions of the first reading: flat UI spec, actions in
  the ontology, versions per type, the reference checks. The author reviews
  it line by line before anything consumes it.

## Designed, not built

A plan or a design is on the main branch, and nothing of it is built.

- **The product.** The documents under
  [docs/architecture/](architecture/ARCHITECTURE.md) describe it, as settled
  by [the first reading](architecture/reviews/2026-10-14-first-reading.md).
  Nothing of it is built but the schemas (above). Steps 3 and 4 of
  [HANDOVER.md](../HANDOVER.md) are below, each held.

## Planned, and held by something

It waits on a release, a decision or other work. Each entry says on what.

- **The dependency rule as gates, step 3 of the handover.** Held by two
  changes to the kit, made in `bettersoftware-io/skills` and then installed
  here: a package declared by its explicit edges, since Origamic's graph fits
  none of the kit's roles (`adapters` imports `core`); and ports found in any
  package, with none found where adapters are declared a failure, since the
  contract gate now looks only in a `domain` package and would skip
  Origamic's (ADR-0012). The table of imports to enforce is in
  [ARCHITECTURE.md](architecture/ARCHITECTURE.md).
- **The plan of the first slice, step 4.** Held by steps 2 and 3, and by
  what [FIRST-SLICE.md](architecture/FIRST-SLICE.md) lists under "Before the
  slice": the `e2e` add-on installed, a local Supabase the gate can start,
  and how a catalog prop accepts a `$view` or `$state` reference.

## Next, with no plan yet

The next step is known, and nobody has written a plan for it.

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

- **In v1 the client enforces the schemas and the actions.** The browser
  writes to Supabase itself, and row-level security checks whose rows it
  writes, not what it writes. A client that bypasses `core` can put anything
  into its own owner's rows. It moves to the server before a second person
  uses Origamic ([ADR-0009](architecture/adr/0009-validation-in-v1-is-the-clients.md)).

- **Two Scorecard alerts clear by themselves.** "Maintained" (alert 5) when
  the repository is 90 days old, which is 2027-01-10. "SAST" (alert 2) as
  more of the last commits have a CodeQL run: 4 of 6 on 2026-10-12.
- **Renovate opens the security fixes, against the add-on's default.**
  Dependabot's updater has Node 24 and this project asks for Node 26, so
  neither its updates nor its security updates can run. `vulnerabilityAlerts`
  is on in `.github/renovate.json5`, and the file says when to turn it off:
  when a Dependabot security update opens a pull request here.
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
- **The property tests of a tree of UI nodes go three levels deep.** A fault
  that needs a deeper tree is not found by them.
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
