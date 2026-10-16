import { act, render } from "@testing-library/react";
import { type ReactElement, StrictMode } from "react";

import type {
  AppSession,
  BuilderState,
  LibraryEntry,
  User,
} from "@origamic/core";
import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";
import { App, AppDraft, Ontology, type Workspace } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import {
  createShellViewModel,
  type ShellViewModel,
} from "./createShellViewModel.ts";
import { ShellViewModelProvider } from "./ShellViewModelProvider.tsx";
import { useShellViewModel } from "./useShellViewModel.ts";

/** What a test varies of the shell: whether it shows the book tracker, and whether under StrictMode. */
export interface ShellPageOptions {
  showsApp?: boolean;
  strict?: boolean;
}

/** What a test can do with, and ask of, a shell that reads everything its view model offers. */
export interface ShellPage {
  user: () => User | null;
  /** The builder's state as the shell saw it on its first render. */
  firstBuilderState: () => BuilderState | undefined;
  workspace: () => Workspace | null;
  library: () => readonly LibraryEntry[];
  /** The session the shown app's view holds now. */
  appSession: () => AppSession;
  signUp: (email: string) => Promise<void>;
  openWorkspace: () => Promise<void>;
  saveBookApp: () => Promise<void>;
  /** Stops showing the app, as closing its panel does. */
  hideApp: () => Promise<void>;
  /** Shows the book tracker's next version in the same place, as moving a panel's pin does. */
  showNextVersion: () => Promise<void>;
  /** Lets what React and the view model put off until the current work is done run. */
  settle: () => Promise<void>;
}

/** Mounts a shell under the provider, on the core's simulators with the book tracker's ontology. */
export function mountShell({
  showsApp = false,
  strict = false,
}: ShellPageOptions = {}): ShellPage {
  const { core } = createCoreHarness({
    ontology: Ontology.parse(createBookOntology()),
  });
  const viewModel = createShellViewModel(core);
  const seen = createSeen();
  const first = App.parse({ ...createBookApp(), version: 1 });
  const next = App.parse({ ...createBookApp(), version: 2 });

  /** The shell showing `app`. StrictMode goes at the root: React runs a component's effects twice on mount only under a root in StrictMode. */
  function shellShowing(app: App | null): ReactElement {
    const shell = <Shell viewModel={viewModel} app={app} seen={seen} />;

    return strict ? <StrictMode>{shell}</StrictMode> : shell;
  }

  const rendered = render(shellShowing(showsApp ? first : null));

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function show(app: App | null): Promise<void> {
    await act(async () => {
      rendered.rerender(shellShowing(app));
    });
    await settle();
  }

  return {
    user: (): User | null => {
      return seen.user;
    },
    firstBuilderState: (): BuilderState | undefined => {
      return seen.builderStates[0];
    },
    workspace: (): Workspace | null => {
      return seen.workspace;
    },
    library: (): readonly LibraryEntry[] => {
      return seen.library;
    },
    appSession: (): AppSession => {
      if (seen.session === null) {
        throw new Error("the shell shows no app");
      }

      return seen.session;
    },
    signUp: async (email: string): Promise<void> => {
      await act(async () => {
        await core.session.signUp(email, "a long enough password");
      });
    },
    openWorkspace: async (): Promise<void> => {
      await act(async () => {
        await core.workspace.open();
      });
    },
    saveBookApp: async (): Promise<void> => {
      await act(async () => {
        await core.library.saveApp(AppDraft.parse(createBookApp()));
      });
    },
    hideApp: async (): Promise<void> => {
      await show(null);
    },
    showNextVersion: async (): Promise<void> => {
      await show(next);
    },
    settle,
  };
}

/** Mounts a component that reads the view model, with no provider above it. React reports what it threw. */
export function mountWithoutProvider(): void {
  render(<Reader seen={createSeen()} />);
}

interface Seen {
  user: User | null;
  builderStates: BuilderState[];
  workspace: Workspace | null;
  library: readonly LibraryEntry[];
  session: AppSession | null;
}

interface ShellProps {
  viewModel: ShellViewModel;
  app: App | null;
  seen: Seen;
}

function Shell({ viewModel, app, seen }: ShellProps): ReactElement {
  return (
    <ShellViewModelProvider viewModel={viewModel}>
      <Reader seen={seen} />
      {app === null ? null : <AppHolder app={app} seen={seen} />}
    </ShellViewModelProvider>
  );
}

interface ReaderProps {
  seen: Seen;
}

/** Reads every stream the view model offers, and notes what it saw. */
function Reader({ seen }: ReaderProps): ReactElement {
  const { useUser, useBuilder, useWorkspace, useLibrary } = useShellViewModel();

  seen.user = useUser();
  seen.builderStates.push(useBuilder());
  seen.workspace = useWorkspace();
  seen.library = useLibrary();

  return <output />;
}

interface AppHolderProps {
  app: App;
  seen: Seen;
}

/** Holds a session on the app, as an app's panel does. */
function AppHolder({ app, seen }: AppHolderProps): ReactElement {
  const { useAppSession } = useShellViewModel();

  seen.session = useAppSession(app);

  return <output />;
}

function createSeen(): Seen {
  return {
    user: null,
    builderStates: [],
    workspace: null,
    library: [],
    session: null,
  };
}
