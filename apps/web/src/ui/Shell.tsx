import { type ReactElement, useState } from "react";

import { useShellViewModel } from "@origamic/runtime";

import { Builder } from "./Builder.tsx";
import { Library } from "./Library.tsx";
import { SignIn } from "./SignIn.tsx";
import { TESTIDS } from "./testids.ts";
import { Workspace } from "./Workspace.tsx";

/**
 * The shell: the sign-in, or the builder and the library beside the
 * workspace. What the builder works on follows the active panel, unless the
 * person turns it to a new app. Until the session has said who is signed in
 * (it reads a session the browser kept), it says only that.
 */
export function Shell(): ReactElement {
  const { useUser } = useShellViewModel();
  const user = useUser();

  if (user === undefined) {
    return (
      <p
        data-testid={TESTIDS.signingIn}
        role="status"
        className="p-6 text-sm text-muted-foreground"
      >
        Checking who is signed in…
      </p>
    );
  }

  return user === null ? <SignIn /> : <SignedIn email={user.email} />;
}

interface SignedInProps {
  email: string;
}

function SignedIn({ email }: SignedInProps): ReactElement {
  const { useIntents } = useShellViewModel();
  const { signOut } = useIntents();
  const [focus, setFocus] = useState<Focus>(NO_PANEL);

  /** The builder follows a panel that becomes active; dockview says so again on focus alone, which changes nothing. */
  function followPanel(panel: string | null): void {
    setFocus((before) => {
      return before.activePanel === panel
        ? before
        : { activePanel: panel, newApp: false };
    });
  }

  function workOnNewApp(): void {
    setFocus((before) => {
      return { ...before, newApp: true };
    });
  }

  function reviseActivePanel(): void {
    setFocus((before) => {
      return { ...before, newApp: false };
    });
  }

  function signOutNow(): void {
    // Who is signed in arrives through the view model: the sign-in shows
    // again once the session says nobody is.
    void signOut();
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="font-semibold">Origamic</span>
        <span className="flex items-center gap-2 text-sm">
          <span data-testid={TESTIDS.signedInAs}>{email}</span>
          <button
            data-testid={TESTIDS.signOut}
            className="button button-small"
            type="button"
            onClick={signOutNow}
          >
            Sign out
          </button>
        </span>
      </header>
      <aside className="shell-side">
        <Builder
          target={focus.newApp ? null : focus.activePanel}
          activePanel={focus.activePanel}
          onNewApp={workOnNewApp}
          onRevise={reviseActivePanel}
        />
        <Library />
      </aside>
      <main className="shell-main">
        <Workspace onActivePanel={followPanel} />
      </main>
    </div>
  );
}

/** The panel that is active, and whether the builder works on a new app in spite of it. */
interface Focus {
  activePanel: string | null;
  newApp: boolean;
}

const NO_PANEL: Focus = { activePanel: null, newApp: false };
