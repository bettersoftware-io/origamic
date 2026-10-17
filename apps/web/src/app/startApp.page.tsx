import { act, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import { TESTIDS } from "#/ui/testids.ts";

import type { WebEnv } from "./env.ts";
import { startApp } from "./startApp.tsx";

/** What a test can ask of the app started into a page's root. */
export interface StartedApp {
  /** Whether the sign-in is drawn. Waits until it, or the shell, is. */
  showsSignIn: () => Promise<boolean>;
  /** Whether the shell says it is checking who is signed in, as it does before the session answers. */
  checksWhoIsSignedIn: () => boolean;
}

/** Gives the page a root, as index.html does, and starts the app in it with this configuration. */
export function startAppOnPage(env: WebEnv): StartedApp {
  // The composition says which ports it chose; a test does not print it.
  vi.spyOn(console, "info").mockImplementation(() => {});

  const root = document.createElement("div");

  document.body.replaceChildren(root);
  // Drawn at once, before any store has answered.
  act(() => {
    startApp(env, root);
  });

  return {
    showsSignIn: async (): Promise<boolean> => {
      await waitFor(() => {
        if (
          root.childElementCount === 0 ||
          within(root).queryByTestId(TESTIDS.signingIn) !== null
        ) {
          throw new Error(
            "nothing but the check of who is signed in is drawn yet",
          );
        }
      });

      return within(root).queryByTestId(TESTIDS.signIn) !== null;
    },
    checksWhoIsSignedIn: (): boolean => {
      return within(root).queryByTestId(TESTIDS.signingIn) !== null;
    },
  };
}
