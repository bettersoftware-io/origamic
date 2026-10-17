import { act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { User } from "@origamic/core";

import { SignIn } from "./SignIn.tsx";
import { TESTIDS } from "./testids.ts";
import { BUILDER, createShellHarness } from "./testing/shellHarness.tsx";

/** What a test can do with, and ask of, the sign-in. */
export interface SignInPage {
  /** Fills the form and presses "Sign up", then waits until someone is signed in or the form says why not. */
  signUp: (email: string, password: string) => Promise<void>;
  /** Fills the form and presses "Sign in", then waits the same way. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Presses "Sign up" with the form left empty. */
  signUpEmpty: () => Promise<void>;
  /** Who is signed in, as the session says. */
  user: () => User | null;
  /** Why the last way in was refused, or null. */
  problem: () => string | null;
  /** Makes an account the form can sign in to, and leaves nobody signed in. */
  createAccount: () => Promise<void>;
  /** Makes the session fail every sign-in, as one that cannot be reached does. */
  failSignIns: (message: string) => void;
}

/** Mounts the sign-in on the shell's core, as `pnpm dev` composes it. */
export function mountSignIn(): SignInPage {
  const harness = createShellHarness();
  const user = userEvent.setup();
  const view = within(harness.show(<SignIn />).container);
  let signedIn: User | null = null;

  harness.core.session.user().subscribe((current) => {
    signedIn = current;
  });

  async function submitWith(
    button: string,
    email: string,
    password: string,
  ): Promise<void> {
    await user.clear(view.getByTestId(TESTIDS.signInEmail));
    await user.clear(view.getByTestId(TESTIDS.signInPassword));
    await user.type(view.getByTestId(TESTIDS.signInEmail), email);
    await user.type(view.getByTestId(TESTIDS.signInPassword), password);
    await user.click(view.getByTestId(button));
    await waitFor(() => {
      if (
        signedIn === null &&
        view.queryByTestId(TESTIDS.signInProblem) === null
      ) {
        throw new Error("nobody is signed in, and the form says nothing");
      }
    });
  }

  return {
    signUp: (email: string, password: string): Promise<void> => {
      return submitWith(TESTIDS.signUpSubmit, email, password);
    },
    signIn: (email: string, password: string): Promise<void> => {
      return submitWith(TESTIDS.signInSubmit, email, password);
    },
    signUpEmpty: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.signUpSubmit));
      await harness.settle();
    },
    user: (): User | null => {
      return signedIn;
    },
    problem: (): string | null => {
      return view.queryByTestId(TESTIDS.signInProblem)?.textContent ?? null;
    },
    createAccount: async (): Promise<void> => {
      await harness.signUp();
      await act(async () => {
        await harness.core.session.signOut();
      });
    },
    failSignIns: (message: string): void => {
      vi.spyOn(harness.deps.session, "signIn").mockRejectedValue(
        new Error(message),
      );
    },
  };
}

export { BUILDER };
