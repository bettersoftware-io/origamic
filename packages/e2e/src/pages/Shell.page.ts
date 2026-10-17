import type { Page } from "@playwright/test";

import { panelTestId, TESTIDS } from "@origamic/web/src/ui/testids.ts";

/** What a spec can do with, and ask of, Origamic's shell, in the words of a builder. */
export interface ShellPage {
  open: () => Promise<void>;
  /** Makes an account and signs it in, and waits for the shell. */
  signUp: (email: string, password: string) => Promise<void>;
  /** Signs in when the sign-in is shown, and waits for the shell either way. */
  signInIfAsked: (email: string, password: string) => Promise<void>;
  /** Asks the builder, and waits for the model's proposal. */
  ask: (intent: string) => Promise<void>;
  /** The proposal's change set, a line each. */
  proposedChanges: () => Promise<string[]>;
  /** Accepts the proposal, and waits until the builder has saved it. */
  accept: () => Promise<void>;
  /** The panel's caption, its app's name and the version it pins, or null while the panel is not shown. */
  caption: (panel: string) => Promise<string | null>;
  /** Loads the page again, as a builder does who closes the workspace and comes back. */
  reload: () => Promise<void>;
}

export function createShellPage(page: Page): ShellPage {
  const builder = page.getByTestId(TESTIDS.builder);
  const signIn = page.getByTestId(TESTIDS.signIn);

  async function fillSignIn(email: string, password: string): Promise<void> {
    await signIn.getByTestId(TESTIDS.signInEmail).fill(email);
    await signIn.getByTestId(TESTIDS.signInPassword).fill(password);
  }

  return {
    open: async (): Promise<void> => {
      await page.goto("/");
      await signIn.or(builder).waitFor();
    },
    signUp: async (email: string, password: string): Promise<void> => {
      await fillSignIn(email, password);
      await signIn.getByTestId(TESTIDS.signUpSubmit).click();
      await builder.waitFor();
    },
    signInIfAsked: async (email: string, password: string): Promise<void> => {
      await signIn.or(builder).waitFor();

      if (await signIn.isVisible()) {
        await fillSignIn(email, password);
        await signIn.getByTestId(TESTIDS.signInSubmit).click();
      }

      await builder.waitFor();
    },
    ask: async (intent: string): Promise<void> => {
      await builder.getByTestId(TESTIDS.builderIntent).fill(intent);
      await builder.getByTestId(TESTIDS.builderAsk).click();
      await builder.getByTestId(TESTIDS.proposal).waitFor();
    },
    proposedChanges: (): Promise<string[]> => {
      return builder.getByTestId(TESTIDS.proposalChange).allTextContents();
    },
    accept: async (): Promise<void> => {
      await builder.getByTestId(TESTIDS.proposalAccept).click();
      await builder
        .getByTestId(TESTIDS.proposal)
        .waitFor({ state: "detached" });
    },
    caption: async (panel: string): Promise<string | null> => {
      const caption = page
        .getByTestId(panelTestId(panel))
        .getByTestId(TESTIDS.panelCaption);

      return (await caption.count()) === 0 ? null : caption.textContent();
    },
    reload: async (): Promise<void> => {
      await page.reload();
    },
  };
}
