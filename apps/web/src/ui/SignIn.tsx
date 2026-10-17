import { type FormEvent, type ReactElement, useRef, useState } from "react";

import type { SignInResult } from "@origamic/core";
import { useShellViewModel } from "@origamic/runtime";

import { messageOf, textOf } from "./forms.ts";
import { TESTIDS } from "./testids.ts";

/**
 * Sign in, or make an account, by e-mail and password (the plan's decision
 * 12). It reads the view model and hands plain props to the form, which the
 * React Compiler compiles.
 */
export function SignIn(): ReactElement {
  const { useIntents } = useShellViewModel();
  const { signIn, signUp } = useIntents();

  return <SignInForm onSignIn={signIn} onSignUp={signUp} />;
}

/** The two ways in. */
type WayIn = "signIn" | "signUp";

/** Signing in or up with what the form holds. */
type Credentials = (email: string, password: string) => Promise<SignInResult>;

interface SignInFormProps {
  onSignIn: Credentials;
  onSignUp: Credentials;
}

/** The form: an e-mail, a password, and a button for each way in. It says why a way in was refused. */
function SignInForm({ onSignIn, onSignUp }: SignInFormProps): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);
  /** Which button submitted the form; the browser checks the fields first either way. */
  const wayIn = useRef<WayIn>("signIn");

  function chooseSignIn(): void {
    wayIn.current = "signIn";
  }

  function chooseSignUp(): void {
    wayIn.current = "signUp";
  }

  function enter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const form = event.currentTarget;
    const credentials = wayIn.current === "signUp" ? onSignUp : onSignIn;

    setProblem(null);
    // Nothing waits: who is signed in arrives through the view model, and
    // a refusal or a failure is shown here.
    void credentials(textOf(form, "email"), textOf(form, "password")).then(
      (result) => {
        if (result.kind === "refused") {
          setProblem(result.message);
        }
      },
      (error: unknown) => {
        setProblem(messageOf(error));
      },
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <form
        data-testid={TESTIDS.signIn}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm"
        onSubmit={enter}
      >
        <h1 className="text-lg font-semibold">Origamic</h1>
        <label className="flex flex-col gap-1 text-sm">
          E-mail
          <input
            data-testid={TESTIDS.signInEmail}
            className="field"
            name="email"
            type="email"
            autoComplete="email"
            required={true}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            data-testid={TESTIDS.signInPassword}
            className="field"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={6}
            required={true}
          />
        </label>
        {problem === null ? null : (
          <p
            data-testid={TESTIDS.signInProblem}
            role="alert"
            className="text-sm text-destructive"
          >
            {problem}
          </p>
        )}
        <div className="flex gap-2">
          <button
            data-testid={TESTIDS.signInSubmit}
            className="button button-primary"
            type="submit"
            onClick={chooseSignIn}
          >
            Sign in
          </button>
          <button
            data-testid={TESTIDS.signUpSubmit}
            className="button"
            type="submit"
            onClick={chooseSignUp}
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
