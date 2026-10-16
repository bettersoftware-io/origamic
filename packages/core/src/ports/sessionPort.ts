import type { Observable } from "rxjs";

/** Who is signed in. Every store keys what it holds on this user (ADR-0004). */
export interface User {
  id: string;
  email: string;
}

/** What signing in or up gives: the user, or why not, worded for the person signing in. */
export type SignInResult =
  | { kind: "signedIn"; user: User }
  | { kind: "refused"; message: string };

/** Who is signed in, by e-mail and password (the plan's decision 12). */
export interface SessionPort {
  /** The signed-in user, or `null`. Emits at once, and again after each change. */
  user(): Observable<User | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Makes an account and signs it in. An e-mail that has an account is refused. */
  signUp(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
}

/** The port by the name the rest of Origamic uses. The file and the interface carry `Port` for the contract gate. */
export type Session = SessionPort;
