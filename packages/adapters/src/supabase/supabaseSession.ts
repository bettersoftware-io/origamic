import type {
  AuthError,
  User as AuthUser,
  Session,
} from "@supabase/supabase-js";
import { distinctUntilChanged, Observable } from "rxjs";

import type { SessionPort, SignInResult, User } from "@origamic/core";

import type { Client } from "./rows.ts";

/**
 * The SessionPort on Supabase's auth, by e-mail and password. The local
 * Supabase confirms no e-mail, so a sign-up signs in at once (the slice's
 * decision 12).
 */
export function createSupabaseSession(client: Client): SessionPort {
  return {
    user: (): Observable<User | null> => {
      return new Observable<User | null>((subscriber) => {
        // Supabase calls this at once with the session it has, and again on
        // each change.
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          subscriber.next(sessionUserOf(session));
        });

        return (): void => {
          data.subscription.unsubscribe();
        };
      }).pipe(distinctUntilChanged(sameUser));
    },
    signIn: (email: string, password: string): Promise<SignInResult> => {
      return signIn(client, email, password);
    },
    signUp: async (email: string, password: string): Promise<SignInResult> => {
      const { error } = await client.auth.signUp({ email, password });

      // Signing in after a sign-up is what tells a project that confirms
      // e-mails (the local one does not) from one that signs in at once.
      return error ? refused(error) : signIn(client, email, password);
    },
    signOut: async (): Promise<void> => {
      // This client only: the user's other devices stay signed in. Supabase
      // forgets the session here whatever the auth server answers, and
      // `user()` emits null either way; an error says only that the server
      // did not hear of it, and the refresh token it would have revoked is
      // gone from this client. So the sign-out has happened, and the error
      // is not the caller's to handle.
      await client.auth.signOut({ scope: "local" });
    },
  };
}

async function signIn(
  client: Client,
  email: string,
  password: string,
): Promise<SignInResult> {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return error ? refused(error) : { kind: "signedIn", user: userOf(data.user) };
}

function sessionUserOf(session: Session | null): User | null {
  return session === null ? null : userOf(session.user);
}

/** A user of this project signs in by e-mail, so every one has an e-mail. */
function userOf(user: AuthUser): User {
  return { id: user.id, email: user.email ?? "" };
}

/** Why signing in or up was refused, worded for the person signing in. */
function refused(error: AuthError): SignInResult {
  return {
    kind: "refused",
    message: MESSAGES.get(error.code) ?? error.message,
  };
}

/** Supabase's words for the refusals a person can do something about, by its error code. */
const MESSAGES: ReadonlyMap<string | undefined, string> = new Map([
  ["invalid_credentials", "The e-mail or the password is wrong."],
  ["user_already_exists", "That e-mail has an account already."],
  ["email_exists", "That e-mail has an account already."],
  ["weak_password", "The password is too weak."],
]);

function sameUser(left: User | null, right: User | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
