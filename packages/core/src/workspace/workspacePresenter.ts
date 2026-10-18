import { BehaviorSubject, type Observable } from "rxjs";

import type { App, Workspace, WorkspaceDraft } from "@origamic/spec";

import { OWNER_CHANGED } from "#/ownerChanged.ts";
import type { SpecLibraryPort } from "#/ports/specLibraryPort.ts";

/**
 * The owner's workspace: the panels open, the app version each pins, and
 * where they are. Adding or closing a panel and moving a pin each save a new
 * version of it (the plan's decision 11); dragging or resizing a panel is
 * not saved in v1.
 */
export interface WorkspacePresenter {
  /** The workspace as last opened or saved; `null` until `open()`. */
  workspace(): Observable<Workspace | null>;
  /** Loads the latest version of the owner's workspace, or saves a new empty one when there is none. */
  open(): Promise<void>;
  /**
   * Opens the app in a new panel, beside the others in a row. The panel's id
   * is the app's, or the app's with a number when that is taken.
   *
   * Each change takes, as `asOf`, the `epoch()` it was decided under, when
   * it was decided before an await (an app loaded, a proposal accepted): a
   * close since then refuses it, so a change decided for one owner never
   * lands in the next one's workspace. Left out, it is the epoch now.
   */
  addPanel(app: App, asOf?: number): Promise<void>;
  /**
   * Opens the library's app in a new panel, at `version` or the latest.
   * Rejects when the library has no such app, and opens nothing when the
   * workspace was closed while the app was read (another signed in, or the
   * owner signed out): the app read was the owner before's.
   */
  openFromLibrary(id: string, version?: number): Promise<void>;
  /** Closes the panel, and closes up the layout around it. */
  closePanel(panel: string, asOf?: number): Promise<void>;
  /** Pins the panel to another version of an app: what accepting a revision does (ADR-0005). */
  movePin(panel: string, app: App, asOf?: number): Promise<void>;
  /** Counts the closes: what `asOf` takes. */
  epoch(): number;
  /**
   * Forgets the workspace, as when its owner signs out or another signs in:
   * it is `null` from now on, a change queued or under way before is dropped
   * (it rejects and saves nothing more), and a change made after is refused
   * until `open()` loads the next owner's.
   */
  close(): void;
}

/** In v1 an owner has one workspace, by this id. */
const WORKSPACE_ID = "main";
const WORKSPACE_NAME = "My workspace";

/**
 * The workspace over the library. Each change waits for the one before it,
 * so two made at once both land, one version after the other. Adding,
 * closing or moving a pin before the first `open()` opens the workspace
 * first; after `close()`, only `open()` does.
 */
export function createWorkspacePresenter(
  library: SpecLibraryPort,
): WorkspacePresenter {
  const current = new BehaviorSubject<Workspace | null>(null);
  let queue: Promise<void> = Promise.resolve();
  /** Counts the closes: a change made before one is not the next owner's. */
  let closes = 0;
  let closed = false;

  /** Throws when a close came after `since`: what the change was about to show or save belonged to the owner before. */
  function assertStillOpen(since: number): void {
    if (since !== closes) {
      throw new Error("the workspace was closed before this change was saved");
    }
  }

  /** Runs one change after those before it; a change that fails does not stop the next. A change made before a close does nothing when its turn comes. */
  function enqueue(
    change: (since: number) => Promise<void>,
    since: number = closes,
  ): Promise<void> {
    const done = queue.then(() => {
      assertStillOpen(since);

      return change(since);
    });

    queue = done.catch(() => {
      return undefined;
    });

    return done;
  }

  async function load(since: number): Promise<Workspace> {
    const saved =
      (await library.loadWorkspace(WORKSPACE_ID)) ??
      (await library.saveWorkspace(createEmpty()));

    assertStillOpen(since);
    current.next(saved);

    return saved;
  }

  /** Saves the next version of the workspace, as `change` makes it from the latest. */
  function save(
    change: (workspace: Workspace) => WorkspaceDraft,
    asOf: number = closes,
  ): Promise<void> {
    if (asOf !== closes) {
      return Promise.reject(
        new Error(
          "the workspace was closed since this change was decided: it belonged to whoever was signed in then",
        ),
      );
    }

    if (closed) {
      return Promise.reject(
        new Error("no workspace is open: it was closed, and not opened since"),
      );
    }

    return enqueue(async (since) => {
      const workspace = current.getValue() ?? (await load(since));
      const next = change(workspace);

      assertStillOpen(since);

      const saved = await library.saveWorkspace(next);

      assertStillOpen(since);
      current.next(saved);
    });
  }

  function addPanel(app: App, asOf?: number): Promise<void> {
    return save((workspace) => {
      const panel = freeId(workspace, app.id);

      return {
        ...withoutVersion(workspace),
        panels: {
          ...workspace.panels,
          [panel]: { app: app.id, appVersion: app.version },
        },
        layout: besides(workspace.layout, { kind: "panel", panel }),
      };
    }, asOf);
  }

  return {
    workspace: (): Observable<Workspace | null> => {
      return current.asObservable();
    },
    open: (): Promise<void> => {
      closed = false;

      return enqueue(async (since) => {
        await load(since);
      });
    },
    addPanel,
    openFromLibrary: async (id: string, version?: number): Promise<void> => {
      const asOf = closes;
      const app = await library.loadApp(id, version);

      if (asOf !== closes) {
        throw new Error(OWNER_CHANGED);
      }

      if (app === null) {
        throw new Error(
          version === undefined
            ? `The library has no app "${id}".`
            : `The library has no app "${id}" at version ${String(version)}.`,
        );
      }

      await addPanel(app, asOf);
    },
    closePanel: (panel: string, asOf?: number): Promise<void> => {
      return save((workspace) => {
        assertHas(workspace, panel);

        return {
          ...withoutVersion(workspace),
          panels: Object.fromEntries(
            Object.entries(workspace.panels).filter(([id]) => {
              return id !== panel;
            }),
          ),
          layout:
            workspace.layout === null ? null : without(workspace.layout, panel),
        };
      }, asOf);
    },
    movePin: (panel: string, app: App, asOf?: number): Promise<void> => {
      return save((workspace) => {
        assertHas(workspace, panel);

        return {
          ...withoutVersion(workspace),
          panels: {
            ...workspace.panels,
            [panel]: { app: app.id, appVersion: app.version },
          },
        };
      }, asOf);
    },
    epoch: (): number => {
      return closes;
    },
    close: (): void => {
      closes += 1;
      closed = true;
      current.next(null);
    },
  };
}

type Layout = NonNullable<Workspace["layout"]>;
type Split = Extract<Layout, SplitKind>;

interface SplitKind {
  kind: "split";
}

function createEmpty(): WorkspaceDraft {
  return {
    format: 1,
    id: WORKSPACE_ID,
    name: WORKSPACE_NAME,
    panels: {},
    layout: null,
  };
}

function withoutVersion(workspace: Workspace): WorkspaceDraft {
  const { version: _version, ...draft } = workspace;

  return draft;
}

function assertHas(workspace: Workspace, panel: string): void {
  if (!Object.hasOwn(workspace.panels, panel)) {
    throw new Error(`the workspace has no panel "${panel}"`);
  }
}

/** The app's id, or the app's id with the first number from 2 that no panel has. */
function freeId(workspace: Workspace, id: string): string {
  let candidate = id;

  for (let n = 2; Object.hasOwn(workspace.panels, candidate); n += 1) {
    candidate = `${id}-${n}`;
  }

  return candidate;
}

/** The layout with `added` at the end of a row: the row the layout is, or a new one around it. */
function besides(layout: Layout | null, added: Layout): Layout {
  if (layout === null) {
    return added;
  }

  if (layout.kind === "split" && layout.direction === "row") {
    return { ...layout, parts: [...layout.parts, { size: 1, layout: added }] };
  }

  return {
    kind: "split",
    direction: "row",
    parts: [
      { size: 1, layout },
      { size: 1, layout: added },
    ],
  };
}

/** The layout with the panel taken out. A tab group or a split left empty goes, and a split left with one part becomes that part. */
function without(layout: Layout, panel: string): Layout | null {
  switch (layout.kind) {
    case "panel":
      return layout.panel === panel ? null : layout;

    case "tabs": {
      const panels = layout.panels.filter((id) => {
        return id !== panel;
      });
      const [first] = panels;

      if (first === undefined) {
        return null;
      }

      return {
        kind: "tabs",
        panels,
        active: panels.includes(layout.active) ? layout.active : first,
      };
    }

    case "split":
      return withoutInSplit(layout, panel);
  }
}

/** A split loses at most one part to a panel closed: each part holds a panel, and a split has two parts at least. */
function withoutInSplit(split: Split, panel: string): Layout {
  const parts = split.parts.flatMap((part) => {
    const layout = without(part.layout, panel);

    return layout === null ? [] : [{ ...part, layout }];
  });
  const [only, ...others] = parts;

  return only !== undefined && others.length === 0
    ? only.layout
    : { ...split, parts };
}
