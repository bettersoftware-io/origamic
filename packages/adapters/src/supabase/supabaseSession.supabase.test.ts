import { afterAll, describe, expect, it } from "vitest";

import type { SessionPort, SignInResult } from "@origamic/core";
import { collect } from "@origamic/core/ports/__contracts__/emissions.ts";
import { describeSessionPortContract } from "@origamic/core/ports/__contracts__/SessionPortContract.ts";

import { createOwners } from "#/testing/owners.ts";

const owners = createOwners();

afterAll(async () => {
  await owners.remove();
});

describeSessionPortContract("Supabase", async ({ accounts }) => {
  for (const account of accounts) {
    await owners.createAccount(account.email, account.password);
  }

  return createRemovingSignUps(owners.createSignedOut().session);
});

describe("the Supabase session, against the auth server", () => {
  it("user() emits once for each change of who is signed in", async () => {
    const owner = await owners.create();
    const adapters = owners.createSignedOut();
    const seen = collect(adapters.session.user());

    await seen.next();
    await adapters.session.signIn(owner.email, owner.password);
    await seen.next();
    await adapters.session.signOut();
    await seen.next();
    seen.stop();

    expect(seen.emissions).toEqual([
      null,
      { id: owner.id, email: owner.email },
      null,
    ]);
  });

  it("a refusal with no words of its own is given in Supabase's", async () => {
    const { session } = owners.createSignedOut();

    const weak = await session.signUp(
      `${crypto.randomUUID()}@origamic.test`,
      "abc",
    );
    const malformed = await session.signUp("not an e-mail", "correct horse");

    expect(weak).toEqual({
      kind: "refused",
      message: "The password is too weak.",
    });
    expect(malformed).toEqual({
      kind: "refused",
      message: expect.stringMatching(/email/i),
    });
  });
});

describe("the access token the gateway is called with", () => {
  it("is null signed out, and the session's own token signed in", async () => {
    const adapters = owners.createSignedOut();
    const before = await adapters.accessToken();
    const owner = await owners.create();
    const token = await owner.adapters.accessToken();

    await owner.adapters.session.signOut();

    expect(before).toBeNull();
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(await owner.adapters.accessToken()).toBeNull();
  });
});

/**
 * The session as it is, with each user it signs up marked for removal when
 * the file is done. It changes nothing the contract sees.
 */
function createRemovingSignUps(session: SessionPort): SessionPort {
  return {
    user: session.user.bind(session),
    signIn: session.signIn.bind(session),
    signOut: session.signOut.bind(session),
    signUp: async (email: string, password: string): Promise<SignInResult> => {
      const result = await session.signUp(email, password);

      if (result.kind === "signedIn") {
        owners.track(result.user.id);
      }

      return result;
    },
  };
}
