import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { App, type Workspace, WorkspaceDraft } from "@origamic/spec";
import {
  createBookApp,
  createWorkspace,
} from "@origamic/spec/testing/bookTracker.ts";

import { type CoreHarness, createCoreHarness } from "#/testing/coreHarness.ts";

describe("the workspace presenter", () => {
  it("open() with none saved creates an empty one", async () => {
    const { core } = createCoreHarness();

    expect(await firstValueFrom(core.workspace.workspace())).toBeNull();

    await core.workspace.open();

    expect(await firstValueFrom(core.workspace.workspace())).toEqual({
      format: 1,
      id: "main",
      name: "My workspace",
      version: 1,
      panels: {},
      layout: null,
    });
    expect(await firstValueFrom(core.library.workspaces())).toEqual([
      { id: "main", name: "My workspace", latest: 1 },
    ]);
  });

  it("each of addPanel, closePanel and movePin saves a new version", async () => {
    const { core } = createCoreHarness();

    await core.workspace.open();
    await core.workspace.addPanel(createPinnedApp(1));

    expect(await current(core)).toMatchObject({
      version: 2,
      panels: { books: { app: "books", appVersion: 1 } },
      layout: { kind: "panel", panel: "books" },
    });

    await core.workspace.movePin("books", createPinnedApp(2));

    expect(await current(core)).toMatchObject({
      version: 3,
      panels: { books: { app: "books", appVersion: 2 } },
    });

    await core.workspace.closePanel("books");

    expect(await current(core)).toMatchObject({
      version: 4,
      panels: {},
      layout: null,
    });
    expect(await core.library.loadWorkspace("main", 2)).toMatchObject({
      panels: { books: { app: "books", appVersion: 1 } },
    });
  });

  it("open() loads the latest version, with the same pins", async () => {
    const { core, deps } = createCoreHarness();

    await core.workspace.open();
    await core.workspace.addPanel(createPinnedApp(1));
    await deps.library.saveWorkspace(
      WorkspaceDraft.parse({ ...createWorkspace(), id: "main" }),
    );
    await core.workspace.open();

    expect(await current(core)).toMatchObject({
      version: 3,
      panels: {
        books: { app: "books", appVersion: 1 },
        notes: { app: "notes", appVersion: 3 },
      },
    });
  });

  it("adding a panel before open() opens the workspace first", async () => {
    const { core } = createCoreHarness();

    await core.workspace.addPanel(createPinnedApp(1));

    expect(await current(core)).toMatchObject({
      version: 2,
      panels: { books: { app: "books", appVersion: 1 } },
    });
  });

  it("panels are added in a row, and an app opened twice gets a panel of its own", async () => {
    const { core } = createCoreHarness();

    await core.workspace.addPanel(createPinnedApp(1));
    await core.workspace.addPanel(createPinnedApp(2));
    await core.workspace.addPanel(createPinnedApp(1, "films"));

    expect(await current(core)).toMatchObject({
      panels: {
        books: { app: "books", appVersion: 1 },
        "books-2": { app: "books", appVersion: 2 },
        films: { app: "films", appVersion: 1 },
      },
      layout: {
        kind: "split",
        direction: "row",
        parts: [
          { size: 1, layout: { kind: "panel", panel: "books" } },
          { size: 1, layout: { kind: "panel", panel: "books-2" } },
          { size: 1, layout: { kind: "panel", panel: "films" } },
        ],
      },
    });
  });

  it("a panel beside a column or a tab group starts a row", async () => {
    const { core, deps } = createCoreHarness();

    await deps.library.saveWorkspace(
      WorkspaceDraft.parse({
        ...createWorkspace(),
        id: "main",
        panels: { notes: { app: "notes", appVersion: 3 } },
        layout: { kind: "tabs", panels: ["notes"], active: "notes" },
      }),
    );
    await core.workspace.addPanel(createPinnedApp(1));

    expect((await current(core))?.layout).toEqual({
      kind: "split",
      direction: "row",
      parts: [
        {
          size: 1,
          layout: { kind: "tabs", panels: ["notes"], active: "notes" },
        },
        { size: 1, layout: { kind: "panel", panel: "books" } },
      ],
    });
  });

  it("closing a panel closes up the layout around it", async () => {
    const { core, deps } = createCoreHarness();

    await deps.library.saveWorkspace(
      WorkspaceDraft.parse({
        ...createWorkspace(),
        id: "main",
        panels: {
          books: { app: "books", appVersion: 1 },
          notes: { app: "notes", appVersion: 3 },
          films: { app: "films", appVersion: 1 },
          plays: { app: "plays", appVersion: 1 },
        },
        layout: {
          kind: "split",
          direction: "row",
          parts: [
            { size: 2, layout: { kind: "panel", panel: "books" } },
            {
              size: 1,
              layout: {
                kind: "tabs",
                panels: ["notes", "films", "plays"],
                active: "notes",
              },
            },
          ],
        },
      }),
    );
    await core.workspace.closePanel("films");

    expect(tabsOf(await current(core))).toEqual({
      kind: "tabs",
      panels: ["notes", "plays"],
      active: "notes",
    });

    await core.workspace.closePanel("notes");

    expect(tabsOf(await current(core))).toEqual({
      kind: "tabs",
      panels: ["plays"],
      active: "plays",
    });

    await core.workspace.closePanel("plays");

    expect(await current(core)).toMatchObject({
      panels: { books: { app: "books", appVersion: 1 } },
      layout: { kind: "panel", panel: "books" },
    });
  });

  it("closing or moving the pin of a panel it does not have is refused, inherited names too", async () => {
    const { core } = createCoreHarness();

    await core.workspace.open();

    await expect(core.workspace.closePanel("toString")).rejects.toThrow(
      'the workspace has no panel "toString"',
    );
    await expect(
      core.workspace.movePin("toString", createPinnedApp(1)),
    ).rejects.toThrow('the workspace has no panel "toString"');
    expect(await current(core)).toMatchObject({ version: 1 });
  });

  it("changes made at once are saved one after another", async () => {
    const { core } = createCoreHarness();

    await Promise.all([
      core.workspace.addPanel(createPinnedApp(1)),
      core.workspace.addPanel(createPinnedApp(1, "films")),
    ]);

    expect(await current(core)).toMatchObject({
      version: 3,
      panels: {
        books: { app: "books", appVersion: 1 },
        films: { app: "films", appVersion: 1 },
      },
    });
  });

  it("a change that fails leaves the next one to run", async () => {
    const { core } = createCoreHarness();

    await expect(core.workspace.closePanel("books")).rejects.toThrow();
    await core.workspace.addPanel(createPinnedApp(1));

    expect(await current(core)).toMatchObject({ version: 2 });
  });
});

type Core = CoreHarness["core"];

function current(core: Core): Promise<Workspace | null> {
  return firstValueFrom(core.workspace.workspace());
}

/** The tab group in the second part of a split. */
function tabsOf(workspace: Workspace | null): unknown {
  const layout = workspace?.layout;

  return layout?.kind === "split" ? layout.parts[1]?.layout : undefined;
}

function createPinnedApp(version: number, id = "books"): App {
  return App.parse({ ...createBookApp(), id, version });
}
