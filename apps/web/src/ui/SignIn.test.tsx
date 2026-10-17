import { describe, expect, it } from "vitest";

import { BUILDER, mountSignIn } from "./SignIn.page.tsx";

describe("the sign-in", () => {
  it("signs a new builder up, and signs them in at once", async () => {
    const page = mountSignIn();

    await page.signUp("reader@origamic.test", "a-long-password-1");

    expect(page.user()).toMatchObject({ email: "reader@origamic.test" });
    expect(page.problem()).toBeNull();
  });

  it("signs in a builder who has an account", async () => {
    const page = mountSignIn();

    await page.createAccount();
    await page.signIn(BUILDER.email, BUILDER.password);

    expect(page.user()).toMatchObject({ email: BUILDER.email });
  });

  it("says why a sign-in was refused, and signs nobody in", async () => {
    const page = mountSignIn();

    await page.createAccount();
    await page.signIn(BUILDER.email, "the-wrong-password");

    expect(page.problem()).toBe("The e-mail or the password is wrong.");
    expect(page.user()).toBeNull();
  });

  it("refuses a sign-up for an e-mail that has an account", async () => {
    const page = mountSignIn();

    await page.createAccount();
    await page.signUp(BUILDER.email, "another-password");

    expect(page.problem()).toBe("That e-mail has an account already.");
  });

  it("says why a sign-in failed when the session could not answer", async () => {
    const page = mountSignIn();

    page.failSignIns("Supabase could not be reached");
    await page.signIn(BUILDER.email, BUILDER.password);

    expect(page.problem()).toBe("Supabase could not be reached");
  });

  it("asks nothing of the session when the form is not filled in", async () => {
    const page = mountSignIn();

    await page.signUpEmpty();

    expect(page.user()).toBeNull();
    expect(page.problem()).toBeNull();
  });
});
