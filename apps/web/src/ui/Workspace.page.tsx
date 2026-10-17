import { act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { App, Workspace as WorkspaceSpec } from "@origamic/spec";

import { panelTestId, TESTIDS } from "./testids.ts";
import { type PanelsReader, readPanels } from "./testing/panels.ts";
import { createShellHarness } from "./testing/shellHarness.tsx";
import { Workspace } from "./Workspace.tsx";

/** What a test can do with, and ask of, the workspace. Panels are named by their ids. */
export interface WorkspacePage extends PanelsReader {
  /** What the workspace says in place of its panels, or null when it says nothing. */
  notice: () => string | null;
  /** Signs a builder up, which opens their workspace. */
  signUp: () => Promise<void>;
  /** Saves the book tracker and opens it in a panel, as the library's Open does. */
  openBookTracker: () => Promise<void>;
  /** Saves the book tracker, with no panel showing it. */
  saveBookTracker: () => Promise<void>;
  /** Opens the saved book tracker in a panel, as the library's Open does. */
  openSaved: () => Promise<void>;
  /** Accepts the dev script's second proposal for the panel, as the builder does: the ontology and the app move to version 2, and the pin with them. */
  reviseToDateFinished: (panel: string) => Promise<void>;
  /** The title of each panel's tab, as dockview shows it. */
  tabTitles: () => string[];
  /** Closes a panel from its tab, by the tab's title, as a person does. */
  closeFromTab: (title: string) => Promise<void>;
  /** The workspace as last saved. */
  saved: () => WorkspaceSpec | null;
  /** Each panel the workspace said became active, in order. */
  activated: () => readonly (string | null)[];
  /** What the panel shows in its app's place. Waits until it shows something. */
  panelNotice: (panel: string) => Promise<string>;
  /** What the panel says of the app's compatibility in the app's place. Waits until it says it. */
  compatibility: (panel: string) => Promise<string>;
  /** Pins the panel to a version of the app the library does not have. */
  pinMissingVersion: (panel: string) => Promise<void>;
  /** Pins the panel to an app the library does not have at all. */
  pinUnknownApp: (panel: string) => Promise<void>;
  /** Makes the library fail to open the workspace at the next sign-in. */
  failOpening: (message: string) => void;
  /** Makes the library fail to read any app at a pinned version. */
  failLoading: (message: string) => void;
  /** Closes a panel elsewhere than in its tab (another shell, the builder), as the workspace saves it. */
  closeElsewhere: (panel: string) => Promise<void>;
  /** Saves a revision of the book tracker ahead of the ontology, which no longer fits it. */
  saveRevisionAhead: () => Promise<void>;
  /** Drops the book tracker's rating from the ontology, so the app no longer fits it. */
  dropRating: () => Promise<void>;
}

/** Mounts the workspace on the shell's core, as `pnpm dev` composes it. */
export function mountWorkspace(): WorkspacePage {
  const harness = createShellHarness();
  const user = userEvent.setup();
  const activated: (string | null)[] = [];
  let saved: WorkspaceSpec | null = null;

  harness.core.workspace.workspace().subscribe((workspace) => {
    saved = workspace;
  });

  function recordActive(panel: string | null): void {
    activated.push(panel);
  }

  const { container } = harness.show(
    <Workspace onActivePanel={recordActive} />,
  );
  const view = within(container);
  const panels = readPanels(container, user);

  function panelOf(panel: string): HTMLElement {
    return view.getByTestId(panelTestId(panel));
  }

  async function openSaved(): Promise<void> {
    await act(async () => {
      await harness.core.workspace.addPanel(await bookTracker());
    });
    await harness.settle();
  }

  async function bookTracker(): Promise<App> {
    const app = await harness.core.library.loadApp("books");

    if (app === null) {
      throw new Error("the book tracker was not saved");
    }

    return app;
  }

  return {
    notice: (): string | null => {
      return view.queryByTestId(TESTIDS.workspaceNotice)?.textContent ?? null;
    },
    signUp: harness.signUp,
    openBookTracker: async (): Promise<void> => {
      await harness.saveBookTracker();
      await openSaved();
    },
    saveBookTracker: harness.saveBookTracker,
    openSaved,
    ...panels,
    reviseToDateFinished: (panel: string): Promise<void> => {
      return harness.reviseBookTracker(panel);
    },
    tabTitles: (): string[] => {
      return view.queryAllByRole("tab").map((tab) => {
        return tab.getAttribute("aria-label") ?? "";
      });
    },
    closeFromTab: async (title: string): Promise<void> => {
      await user.click(view.getByLabelText(`Close ${title}`));
      await harness.settle();
    },
    saved: (): WorkspaceSpec | null => {
      return saved;
    },
    activated: (): readonly (string | null)[] => {
      return activated;
    },
    panelNotice: async (panel: string): Promise<string> => {
      return (await within(panelOf(panel)).findByTestId(TESTIDS.panelNotice))
        .textContent;
    },
    compatibility: async (panel: string): Promise<string> => {
      return (
        await within(panelOf(panel)).findByTestId(TESTIDS.compatibilityReport)
      ).textContent;
    },
    pinUnknownApp: async (panel: string): Promise<void> => {
      const app = await bookTracker();

      await act(async () => {
        await harness.core.workspace.movePin(panel, { ...app, id: "films" });
      });
      await harness.settle();
    },
    failOpening: (message: string): void => {
      vi.spyOn(harness.deps.library, "loadWorkspace").mockRejectedValue(
        new Error(message),
      );
    },
    failLoading: (message: string): void => {
      const { library } = harness.deps;
      const loadLatest = library.loadApp.bind(library);

      // A pinned version fails; the latest, which opening a panel reads, does not.
      vi.spyOn(library, "loadApp").mockImplementation(
        (id: string, version?: number) => {
          return version === undefined
            ? loadLatest(id)
            : Promise.reject(new Error(message));
        },
      );
    },
    closeElsewhere: async (panel: string): Promise<void> => {
      await act(async () => {
        await harness.core.workspace.closePanel(panel);
      });
      await harness.settle();
    },
    saveRevisionAhead: harness.saveRevisionAhead,
    pinMissingVersion: async (panel: string): Promise<void> => {
      const app = await bookTracker();

      await act(async () => {
        await harness.core.workspace.movePin(panel, { ...app, version: 9 });
      });
      await harness.settle();
    },
    dropRating: harness.dropRating,
  };
}
