import { filter, firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { BuilderState, Core } from "@origamic/core";
import {
  type CoreHarness,
  createCoreHarness,
} from "@origamic/core/testing/coreHarness.ts";
import {
  AppDraft,
  ChangeSet,
  type GenerationEvent,
  Ontology,
  Proposal,
} from "@origamic/spec";
import {
  createBookApp,
  createBookChange,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import { createShellIntents } from "./shellIntents.ts";

describe("the shell's intents", () => {
  // The rules behind them (whose workspace, what a change of owner refuses)
  // are the core's, and tested there: each intent here passes through.
  it("signs up, signs out and signs in again through the session", async () => {
    const { core } = createCoreHarness();
    const intents = createShellIntents(core);

    await expect(
      intents.signUp("reader@example.com", "a long password"),
    ).resolves.toMatchObject({ kind: "signedIn" });
    await intents.signOut();
    expect(await firstValueFrom(core.session.user())).toBeNull();
    await expect(
      intents.signIn("reader@example.com", "a long password"),
    ).resolves.toMatchObject({
      kind: "signedIn",
      user: { email: "reader@example.com" },
    });
  });

  it("asks for a new app when no panel is named, and accepts what is proposed", async () => {
    const { core } = createCoreHarness({ replies: [createNewBookReply()] });
    const intents = createShellIntents(core);

    await core.workspace.open();
    await intents.ask("a tracker for the books I'm reading", null);
    await until(core, "proposed");
    await intents.accept();

    expect(await core.library.loadApp("books")).toMatchObject({ version: 1 });
    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
  });

  it("asks for a revision of the app a panel pins, at the version it pins", async () => {
    const harness = await createBookHarness();
    const intents = createShellIntents(harness.core);
    const generate = vi.spyOn(harness.deps.llm, "generate");

    await intents.openApp("books");
    await intents.ask("add a 'date finished' field", "books");

    expect(await currentState(harness.core)).toMatchObject({
      target: { kind: "revise", panel: "books", app: { version: 1 } },
    });
    expect(generate.mock.calls[0]?.[0].app).toMatchObject({
      id: "books",
      version: 1,
    });
  });

  it("refuses to revise a panel the workspace does not have, and asks nothing", async () => {
    const harness = await createBookHarness();
    const intents = createShellIntents(harness.core);
    const generate = vi.spyOn(harness.deps.llm, "generate");

    await harness.core.workspace.open();

    await expect(intents.ask("add a field", "books")).rejects.toThrow(
      'The workspace has no panel "books" to revise.',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("drops a proposal on reject, and stores nothing", async () => {
    const { core } = createCoreHarness({ replies: [createNewBookReply()] });
    const intents = createShellIntents(core);

    await intents.ask("a tracker for the books I'm reading", null);
    await until(core, "proposed");
    intents.reject();

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
    expect(await core.library.loadApp("books")).toBeNull();
  });

  it("opens the latest version of a library's app in a panel, and closes the panel again", async () => {
    const harness = await createBookHarness();
    const intents = createShellIntents(harness.core);

    await intents.openApp("books");

    expect(await currentWorkspace(harness.core)).toMatchObject({
      panels: { books: { app: "books", appVersion: 1 } },
    });

    await intents.closePanel("books");

    expect(await currentWorkspace(harness.core)).toMatchObject({
      panels: {},
      layout: null,
    });
  });

  it("opens an app at the version asked for, and says when the library has none", async () => {
    const harness = await createBookHarness();
    const intents = createShellIntents(harness.core);

    await intents.openApp("books", 1);

    expect(await currentWorkspace(harness.core)).toMatchObject({
      panels: { books: { app: "books", appVersion: 1 } },
    });
    await expect(intents.openApp("books", 4)).rejects.toThrow(
      'The library has no app "books" at version 4.',
    );
  });

  it("refuses to open an app the library does not have", async () => {
    const { core } = createCoreHarness();
    const intents = createShellIntents(core);

    await expect(intents.openApp("books")).rejects.toThrow(
      'The library has no app "books".',
    );
  });
});

/** The book tracker's ontology, and its app saved at version 1. */
async function createBookHarness(): Promise<CoreHarness> {
  const harness = createCoreHarness({
    ontology: Ontology.parse(createBookOntology()),
    replies: [[]],
  });

  await harness.deps.library.saveApp(AppDraft.parse(createBookApp()));

  return harness;
}

/** What a model replies to "a tracker for the books I'm reading". */
function createNewBookReply(): GenerationEvent[] {
  return [
    {
      kind: "proposal",
      proposal: Proposal.parse({
        explanation: "A tracker for your books.",
        changeSet: ChangeSet.parse(createBookChange()),
        app: createBookApp(),
      }),
    },
  ];
}

function currentState(core: Core): Promise<BuilderState> {
  return firstValueFrom(core.builder.state());
}

function currentWorkspace(core: Core): Promise<unknown> {
  return firstValueFrom(core.workspace.workspace());
}

function until(core: Core, kind: BuilderState["kind"]): Promise<BuilderState> {
  return firstValueFrom(
    core.builder.state().pipe(
      filter((state) => {
        return state.kind === kind;
      }),
    ),
  );
}
