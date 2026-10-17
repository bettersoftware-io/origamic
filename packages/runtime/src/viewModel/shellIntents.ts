import { firstValueFrom } from "rxjs";

import type { Core, SignInResult } from "@origamic/core";

/**
 * What the shell can do: sign in and out, ask the builder and answer its
 * proposal, open an app from the library in a panel, and close a panel. Each
 * passes the person's intent to the core; what it changes comes back through
 * the view model's hooks.
 */
export interface ShellIntents {
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Makes an account and signs it in (the plan's decision 12). */
  signUp(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /**
   * Asks the model, for a new app when `panel` is `null` and otherwise for a
   * revision of the app the panel pins, at the version it pins. Rejects, and
   * asks nothing, when the workspace has no such panel or the library no
   * longer has its app.
   */
  ask(intent: string, panel: string | null): Promise<void>;
  /** Accepts the proposal shown: the builder says how it went. */
  accept(): Promise<void>;
  /** Drops the proposal shown, or what is being generated. */
  reject(): void;
  /** Opens the latest version of a library's app in a new panel. Rejects when the library has no such app. */
  openApp(id: string): Promise<void>;
  closePanel(panel: string): Promise<void>;
}

/** The shell's intents over the core. Made once, with the view model. */
export function createShellIntents(core: Core): ShellIntents {
  return {
    signIn: (email: string, password: string): Promise<SignInResult> => {
      return core.session.signIn(email, password);
    },
    signUp: (email: string, password: string): Promise<SignInResult> => {
      return core.session.signUp(email, password);
    },
    signOut: (): Promise<void> => {
      return core.session.signOut();
    },
    ask: async (intent: string, panel: string | null): Promise<void> => {
      if (panel === null) {
        core.builder.target({ kind: "new" });
        core.builder.ask(intent);

        return;
      }

      const workspace = await firstValueFrom(core.workspace.workspace());
      const pin = Object.hasOwn(workspace?.panels ?? {}, panel)
        ? workspace?.panels[panel]
        : undefined;

      if (pin === undefined) {
        throw new Error(`The workspace has no panel "${panel}" to revise.`);
      }

      const app = await core.library.loadApp(pin.app, pin.appVersion);

      if (app === null) {
        throw new Error(
          `The library has no ${pin.app} at version ${String(pin.appVersion)} to revise.`,
        );
      }

      core.builder.target({ kind: "revise", panel, app });
      core.builder.ask(intent);
    },
    accept: (): Promise<void> => {
      return core.builder.accept();
    },
    reject: (): void => {
      core.builder.reject();
    },
    openApp: async (id: string): Promise<void> => {
      const app = await core.library.loadApp(id);

      if (app === null) {
        throw new Error(`The library has no app "${id}".`);
      }

      await core.workspace.addPanel(app);
    },
    closePanel: (panel: string): Promise<void> => {
      return core.workspace.closePanel(panel);
    },
  };
}
