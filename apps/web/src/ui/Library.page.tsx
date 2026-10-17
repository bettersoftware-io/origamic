import { act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Workspace } from "@origamic/spec";

import { Library } from "./Library.tsx";
import { libraryEntryTestId, TESTIDS } from "./testids.ts";
import { createShellHarness } from "./testing/shellHarness.tsx";

/** What a test can do with, and ask of, the library. Apps are named by their ids. */
export interface LibraryPage {
  /** What the library says when it has no app, or null when it lists some. */
  empty: () => string | null;
  /** Each app as listed: its name and its latest version. */
  entries: () => string[];
  /** Signs a builder up and saves the book tracker, with no panel showing it. */
  saveBookTracker: () => Promise<void>;
  /** Chooses the version (the latest when left out), presses the app's "Open", and waits until the workspace pins it or the library says why not. */
  open: (app: string, version?: number) => Promise<void>;
  /** Saves a second version of the book tracker. */
  saveNextVersion: () => Promise<void>;
  /** The workspace as last saved. */
  workspace: () => Workspace | null;
  /** Why the last app could not be opened, or null. */
  problem: () => string | null;
  /** Makes the library lose every app between listing and opening it. */
  loseApps: () => void;
}

/** Mounts the library on the shell's core, as `pnpm dev` composes it. */
export function mountLibrary(): LibraryPage {
  const harness = createShellHarness();
  const user = userEvent.setup();
  const view = within(harness.show(<Library />).container);
  let workspace: Workspace | null = null;

  harness.core.workspace.workspace().subscribe((current) => {
    workspace = current;
  });

  function problem(): string | null {
    return view.queryByTestId(TESTIDS.libraryProblem)?.textContent ?? null;
  }

  return {
    empty: (): string | null => {
      return view.queryByText("No app saved yet.")?.textContent ?? null;
    },
    entries: (): string[] => {
      const prefix = `${TESTIDS.libraryEntry}.`;

      return view
        .queryAllByTestId((id) => {
          return id.startsWith(prefix);
        })
        .map((entry) => {
          return entry.firstElementChild?.textContent ?? "";
        });
    },
    saveBookTracker: async (): Promise<void> => {
      await harness.signUp();
      await harness.saveBookTracker();
    },
    open: async (app: string, version?: number): Promise<void> => {
      const entry = within(view.getByTestId(libraryEntryTestId(app)));

      if (version !== undefined) {
        await user.selectOptions(
          entry.getByTestId(TESTIDS.libraryVersion),
          String(version),
        );
      }

      await user.click(entry.getByTestId(TESTIDS.libraryOpen));
      await waitFor(() => {
        const pinned =
          workspace !== null && Object.hasOwn(workspace.panels, app);

        if (!pinned && problem() === null) {
          throw new Error(`"${app}" is neither pinned nor refused`);
        }
      });
    },
    saveNextVersion: async (): Promise<void> => {
      const app = await harness.core.library.loadApp("books");

      if (app === null) {
        throw new Error("the book tracker is not saved");
      }

      const { version: _version, ...draft } = app;

      await act(async () => {
        await harness.core.library.saveApp(draft);
      });
    },
    workspace: (): Workspace | null => {
      return workspace;
    },
    problem,
    loseApps: (): void => {
      vi.spyOn(harness.deps.library, "loadApp").mockResolvedValue(null);
    },
  };
}
