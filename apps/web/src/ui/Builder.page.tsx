import { act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { createLlmGatewaySimulator, type LibraryEntry } from "@origamic/core";
import type { GenerationRequest, Problem, Workspace } from "@origamic/spec";

import { Builder } from "./Builder.tsx";
import { TESTIDS } from "./testids.ts";
import { createShellHarness } from "./testing/shellHarness.tsx";

/** What a test can do with, and ask of, the builder. */
export interface BuilderPage {
  /** Signs a builder up, which opens their workspace. */
  signUp: () => Promise<void>;
  /** Types the intent and presses Ask, then waits until the model has answered or the builder says why it asked nothing. */
  ask: (intent: string) => Promise<void>;
  /** The proposal's change set, a line each. */
  changes: () => string[];
  /** The proposal's diff of the app, a line each. */
  diff: () => string[];
  /** Whether a proposal is shown. */
  proposes: () => boolean;
  /** Presses Accept, and waits until the save is over. */
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  /** What the builder says it works on. */
  target: () => string;
  /** Turns the builder to a panel, as the workspace does when the panel becomes active. */
  activate: (panel: string) => void;
  /** Presses the button that turns the builder to a new app. */
  newAppInstead: () => Promise<void>;
  /** Presses the button that turns it back to the active panel. */
  reviseInstead: () => Promise<void>;
  /** Why the model's last answer was not a proposal, with each problem. */
  failure: () => string | null;
  /** Why the builder asked nothing, or null. */
  refused: () => string | null;
  /** Asks, and reads the model's progress at once, before the model has answered anything. */
  progressOnAsking: (intent: string) => Promise<string[]>;
  /** Makes the model's next answer a failure with these problems, as a gateway gives when the model's app did not check twice. */
  modelFails: (message: string, problems: readonly Problem[]) => void;
  /** Makes the library lose every app it is asked for. */
  loseApps: () => void;
  /** The library's apps. */
  library: () => readonly LibraryEntry[];
  /** The workspace as last saved. */
  workspace: () => Workspace | null;
}

/** Mounts the builder on the shell's core, as `pnpm dev` composes it, holding what it works on as the shell does. */
export function mountBuilder(): BuilderPage {
  const harness = createShellHarness();
  const user = userEvent.setup();
  let library: readonly LibraryEntry[] = [];
  let workspace: Workspace | null = null;
  let active: string | null = null;
  let newApp = false;

  harness.core.library.apps().subscribe((apps) => {
    library = apps;
  });
  harness.core.workspace.workspace().subscribe((current) => {
    workspace = current;
  });

  function turnToNewApp(): void {
    newApp = true;
    draw();
  }

  function turnToActivePanel(): void {
    newApp = false;
    draw();
  }

  function builder(): ReactElement {
    return (
      <Builder
        target={newApp ? null : active}
        activePanel={active}
        onNewApp={turnToNewApp}
        onRevise={turnToActivePanel}
      />
    );
  }

  const shown = harness.show(builder());
  const view = within(shown.container);

  function draw(): void {
    shown.update(builder());
  }

  function proposal(): HTMLElement | null {
    return view.queryByTestId(TESTIDS.proposal);
  }

  function linesIn(element: HTMLElement | null): string[] {
    return element === null
      ? []
      : within(element)
          .queryAllByRole("listitem")
          .map((line) => {
            return line.textContent;
          });
  }

  return {
    signUp: harness.signUp,
    ask: async (intent: string): Promise<void> => {
      const field = view.getByTestId(TESTIDS.builderIntent);

      await user.clear(field);
      await user.type(field, intent);
      await user.click(view.getByTestId(TESTIDS.builderAsk));
      await waitFor(() => {
        if (
          proposal() === null &&
          view.queryByTestId(TESTIDS.builderProblem) === null &&
          view.queryByTestId(TESTIDS.builderRefused) === null &&
          view.queryByTestId(TESTIDS.builderProgress) === null
        ) {
          throw new Error("the model has not answered yet");
        }
      });
    },
    changes: (): string[] => {
      return view.queryAllByTestId(TESTIDS.proposalChange).map((line) => {
        return line.textContent;
      });
    },
    diff: (): string[] => {
      return linesIn(view.queryByTestId(TESTIDS.proposalDiff));
    },
    proposes: (): boolean => {
      return proposal() !== null;
    },
    accept: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.proposalAccept));
      await waitFor(() => {
        if (proposal() !== null || view.queryByText("Saving…") !== null) {
          throw new Error("the proposal is still being saved");
        }
      });
      await harness.settle();
    },
    reject: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.proposalReject));
    },
    target: (): string => {
      return view.getByTestId(TESTIDS.builderTarget).textContent;
    },
    activate: (panel: string): void => {
      active = panel;
      newApp = false;
      act(() => {
        draw();
      });
    },
    newAppInstead: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.builderNewApp));
    },
    reviseInstead: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.builderRevise));
    },
    failure: (): string | null => {
      const failed = view.queryByTestId(TESTIDS.builderProblem);

      return failed === null
        ? null
        : [
            failed.querySelector("p")?.textContent ?? "",
            ...linesIn(failed),
          ].join("\n");
    },
    refused: (): string | null => {
      return view.queryByTestId(TESTIDS.builderRefused)?.textContent ?? null;
    },
    progressOnAsking: async (intent: string): Promise<string[]> => {
      const field = view.getByTestId(TESTIDS.builderIntent);

      await user.type(field, intent);
      // Submitted in one step, with no wait after it: the model's events
      // come a moment later, so the builder still shows that it asks.
      fireEvent.submit(field.closest("form") ?? field);

      const shown = linesIn(view.queryByTestId(TESTIDS.builderProgress));

      await waitFor(() => {
        if (proposal() === null) {
          throw new Error("the model has not answered yet");
        }
      });

      return shown;
    },
    modelFails: (message: string, problems: readonly Problem[]): void => {
      const failing = createLlmGatewaySimulator([
        [{ kind: "failed", message, problems: [...problems] }],
      ]);

      vi.spyOn(harness.deps.llm, "generate").mockImplementation(
        (request: GenerationRequest) => {
          return failing.generate(request);
        },
      );
    },

    loseApps: (): void => {
      vi.spyOn(harness.deps.library, "loadApp").mockResolvedValue(null);
    },
    library: (): readonly LibraryEntry[] => {
      return library;
    },
    workspace: (): Workspace | null => {
      return workspace;
    },
  };
}
