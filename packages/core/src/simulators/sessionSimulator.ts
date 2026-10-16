import { BehaviorSubject, type Observable } from "rxjs";

import type { SessionPort, SignInResult, User } from "#/ports/sessionPort.ts";

/** An account the simulator starts with, as `pnpm dev` signs in to it. */
export interface Account {
  email: string;
  password: string;
}

/**
 * The SessionPort in memory: the accounts it starts with and those signed up
 * through it, and nobody signed in at first. Like a local Supabase, it
 * confirms no e-mail, so a sign-up signs in at once.
 */
export function createSessionSimulator(
  accounts: readonly Account[] = [],
): SessionPort {
  const known = new Map<string, Known>(
    accounts.map((account, index) => {
      return [account.email, { ...account, id: `user-${index + 1}` }];
    }),
  );
  const user = new BehaviorSubject<User | null>(null);

  function signInAs(account: Known): SignInResult {
    const signedIn = { id: account.id, email: account.email };

    user.next(signedIn);

    return { kind: "signedIn", user: signedIn };
  }

  return {
    user: (): Observable<User | null> => {
      return user.asObservable();
    },
    signIn: (email: string, password: string): Promise<SignInResult> => {
      const account = known.get(email);

      return Promise.resolve(
        account?.password === password
          ? signInAs(account)
          : refused("The e-mail or the password is wrong."),
      );
    },
    signUp: (email: string, password: string): Promise<SignInResult> => {
      if (known.has(email)) {
        return Promise.resolve(refused("That e-mail has an account already."));
      }

      const account = { email, password, id: `user-${known.size + 1}` };

      known.set(email, account);

      return Promise.resolve(signInAs(account));
    },
    signOut: (): Promise<void> => {
      user.next(null);

      return Promise.resolve();
    },
  };
}

interface Known extends Account {
  id: string;
}

function refused(message: string): SignInResult {
  return { kind: "refused", message };
}
