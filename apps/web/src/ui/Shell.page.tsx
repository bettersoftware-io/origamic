import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { Shell } from "./Shell.tsx";
import { TESTIDS } from "./testids.ts";
import { type PanelsReader, readPanels } from "./testing/panels.ts";
import { BUILDER, createShellHarness } from "./testing/shellHarness.tsx";

/** What a test can do with, and ask of, the whole shell, as a person uses it. */
export interface ShellPage extends PanelsReader {
  /** Whether the sign-in is shown. */
  signingIn: () => boolean;

  /** Signs up through the form, and waits for the shell. */
  signUp: () => Promise<void>;
  /** Who the shell says is signed in. */
  signedInAs: () => string | null;
  /** Presses "Sign out", and waits for the sign-in. */
  signOut: () => Promise<void>;
  /** Asks the builder, and waits for its proposal. */
  ask: (intent: string) => Promise<void>;
  /** The proposal's change set, a line each. */
  changes: () => string[];
  /** Presses Accept, and waits until the save is over. */
  accept: () => Promise<void>;
  /** What the builder says it works on. */
  target: () => string;
  /** Presses the button that turns the builder to a new app. */
  newAppInstead: () => Promise<void>;
  /** Holds the next accept at its change set until `releaseAccept`. */
  holdAccept: () => void;
  /** Lets a held accept go on, and waits until it is over. */
  releaseAccept: () => Promise<void>;
  /** Presses Accept, and waits until the builder says it is saving. */
  startAccept: () => Promise<void>;
  /** Whether "Sign out" can be pressed. */
  canSignOut: () => boolean;
  /** Presses the button that turns it back to the active panel. */
  reviseInstead: () => Promise<void>;
}

/** Mounts the shell on the core `pnpm dev` composes: every port a simulator, the model the dev script. */
export function mountShell(): ShellPage {
  const harness = createShellHarness();
  const user = userEvent.setup();
  const { container } = harness.show(<Shell />);
  const view = within(container);
  const held = createHold();

  function signingIn(): boolean {
    return view.queryByTestId(TESTIDS.signIn) !== null;
  }

  return {
    ...readPanels(container, user),
    signingIn,
    signUp: async (): Promise<void> => {
      await user.type(view.getByTestId(TESTIDS.signInEmail), BUILDER.email);
      await user.type(
        view.getByTestId(TESTIDS.signInPassword),
        BUILDER.password,
      );
      await user.click(view.getByTestId(TESTIDS.signUpSubmit));
      await view.findByTestId(TESTIDS.builder);
    },
    signedInAs: (): string | null => {
      return view.queryByTestId(TESTIDS.signedInAs)?.textContent ?? null;
    },
    signOut: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.signOut));
      await view.findByTestId(TESTIDS.signIn);
    },
    ask: async (intent: string): Promise<void> => {
      await user.type(view.getByTestId(TESTIDS.builderIntent), intent);
      await user.click(view.getByTestId(TESTIDS.builderAsk));
      await view.findByTestId(TESTIDS.proposal);
    },
    changes: (): string[] => {
      return view.queryAllByTestId(TESTIDS.proposalChange).map((line) => {
        return line.textContent;
      });
    },
    accept: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.proposalAccept));
      await waitFor(() => {
        if (
          view.queryByTestId(TESTIDS.proposal) !== null ||
          view.queryByText("Saving…") !== null
        ) {
          throw new Error("the proposal is still being saved");
        }
      });
      await harness.settle();
    },
    target: (): string => {
      return view.getByTestId(TESTIDS.builderTarget).textContent;
    },
    newAppInstead: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.builderNewApp));
    },
    holdAccept: (): void => {
      const { ontology } = harness.deps;
      const apply = ontology.apply.bind(ontology);

      vi.spyOn(ontology, "apply").mockImplementation(async (change) => {
        await held.promise;

        return apply(change);
      });
    },
    releaseAccept: async (): Promise<void> => {
      held.release();
      await waitFor(() => {
        if (view.queryByText("Saving…") !== null) {
          throw new Error("the accept is still under way");
        }
      });
      await harness.settle();
    },
    startAccept: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.proposalAccept));
      await view.findByText("Saving…");
    },
    canSignOut: (): boolean => {
      const button = view.getByTestId(TESTIDS.signOut);

      return !(button instanceof HTMLButtonElement && button.disabled);
    },
    reviseInstead: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.builderRevise));
    },
  };
}

/** A promise a test settles when it chooses. */
interface Hold {
  promise: Promise<void>;
  release: () => void;
}

function createHold(): Hold {
  const settles: (() => void)[] = [];
  const promise = new Promise<void>((resolve) => {
    settles.push(resolve);
  });

  return {
    promise,
    release: (): void => {
      for (const settle of settles) {
        settle();
      }
    },
  };
}
