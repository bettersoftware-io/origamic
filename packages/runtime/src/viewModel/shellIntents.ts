import type { Core, SignInResult } from "@origamic/core";

/**
 * What the shell can do: sign in and out, ask the builder and answer its
 * proposal, open an app from the library in a panel, and close a panel. Each
 * passes the person's intent to the core, which holds the rules (whose
 * workspace it is, what a change of owner refuses); what it changes comes
 * back through the view model's hooks.
 */
export interface ShellIntents {
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Makes an account and signs it in (the plan's decision 12). */
  signUp(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /**
   * Asks the model, for a new app when `panel` is `null` and otherwise for a
   * revision of the app the panel pins, at the version it pins
   * (`Builder.askForRevision`, which says when it rejects).
   */
  ask(intent: string, panel: string | null): Promise<void>;
  /** Accepts the proposal shown: the builder says how it went. */
  accept(): Promise<void>;
  /** Drops the proposal shown, or what is being generated. */
  reject(): void;
  /** Opens a library's app in a new panel, at `version` or the latest (`WorkspacePresenter.openFromLibrary`, which says when it rejects). */
  openApp(id: string, version?: number): Promise<void>;
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
    ask: (intent: string, panel: string | null): Promise<void> => {
      if (panel !== null) {
        return core.builder.askForRevision(panel, intent);
      }

      core.builder.askForNew(intent);

      return Promise.resolve();
    },
    accept: (): Promise<void> => {
      return core.builder.accept();
    },
    reject: (): void => {
      core.builder.reject();
    },
    openApp: (id: string, version?: number): Promise<void> => {
      return core.workspace.openFromLibrary(id, version);
    },
    closePanel: (panel: string): Promise<void> => {
      return core.workspace.closePanel(panel);
    },
  };
}
