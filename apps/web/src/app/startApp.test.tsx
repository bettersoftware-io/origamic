import { describe, expect, it } from "vitest";

import { startAppOnPage } from "./startApp.page.tsx";

describe("starting the app", () => {
  it("draws the sign-in into the root, on the simulators when nothing is configured", async () => {
    const page = startAppOnPage({});

    expect(await page.showsSignIn()).toBe(true);
  });

  it("checks who is signed in on Supabase before it shows the sign-in", async () => {
    // Nothing answers at this address: with no session kept in the browser,
    // Supabase's client says nobody is signed in without asking it.
    const page = startAppOnPage({
      supabase: { url: "http://127.0.0.1:1", anonKey: "anon" },
    });

    expect(page.checksWhoIsSignedIn()).toBe(true);
    expect(await page.showsSignIn()).toBe(true);
  });
});
