import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { SessionPort } from "../sessionPort.ts";
import { createId } from "./fixtures.ts";

/** An account a session starts with. */
interface Credentials {
  email: string;
  password: string;
}

/** What a session starts with: the accounts that already exist, and nobody signed in. */
export interface SessionState {
  accounts: readonly Credentials[];
}

/**
 * The behaviour every SessionPort adapter owes its callers. Each adapter's
 * test calls this with a function that makes a fresh session, signed out,
 * where the accounts of `initial` exist. Every e-mail the contract uses is
 * new, so a store shared between runs can take them.
 */
export function describeSessionPortContract(
  label: string,
  createSession: (initial: SessionState) => Promise<SessionPort>,
): void {
  describe(`${label} :: SessionPort contract`, () => {
    it("signed out at first", async () => {
      const session = await createSession({ accounts: [] });

      expect(await firstValueFrom(session.user())).toBeNull();
    });

    it("sign-up signs in", async () => {
      const session = await createSession({ accounts: [] });
      const email = createEmail();

      const result = await session.signUp(email, PASSWORD);

      expect(result).toMatchObject({ kind: "signedIn", user: { email } });
      expect(await firstValueFrom(session.user())).toEqual(
        result.kind === "signedIn" ? result.user : undefined,
      );
    });

    it("an account that exists signs in with its password", async () => {
      const account = { email: createEmail(), password: PASSWORD };
      const session = await createSession({ accounts: [account] });

      const result = await session.signIn(account.email, account.password);

      expect(result).toMatchObject({
        kind: "signedIn",
        user: { email: account.email },
      });
      expect(await firstValueFrom(session.user())).toMatchObject({
        email: account.email,
      });
    });

    it("a wrong password is refused", async () => {
      const account = { email: createEmail(), password: PASSWORD };
      const session = await createSession({ accounts: [account] });

      const wrong = await session.signIn(account.email, `${PASSWORD}-wrong`);
      const unknown = await session.signIn(createEmail(), PASSWORD);

      expect(wrong).toMatchObject({ kind: "refused" });
      expect(unknown).toMatchObject({ kind: "refused" });
      expect(await firstValueFrom(session.user())).toBeNull();
    });

    it("signing up an e-mail that has an account is refused", async () => {
      const account = { email: createEmail(), password: PASSWORD };
      const session = await createSession({ accounts: [account] });

      const result = await session.signUp(account.email, PASSWORD);

      expect(result).toMatchObject({ kind: "refused" });
      expect(await firstValueFrom(session.user())).toBeNull();
    });

    it("sign-out emits null", async () => {
      const session = await createSession({ accounts: [] });

      await session.signUp(createEmail(), PASSWORD);
      await session.signOut();

      expect(await firstValueFrom(session.user())).toBeNull();
    });
  });
}

const PASSWORD = "correct horse battery staple";

function createEmail(): string {
  return `reader-${createId()}@example.com`;
}
