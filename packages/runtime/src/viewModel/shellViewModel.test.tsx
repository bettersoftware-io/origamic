import { firstValueFrom, NEVER, type Observable } from "rxjs";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import type { BuilderState } from "@origamic/core";
import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";

import { createShellViewModel } from "./createShellViewModel.ts";
import { mountShell, mountWithoutProvider } from "./shellViewModel.page.tsx";

describe("the shell's view model", () => {
  it("gives the shell who is signed in, and null when nobody is", async () => {
    const page = mountShell();

    expect(page.user()).toBeNull();

    await page.signUp("reader@example.com");

    expect(page.user()).toMatchObject({ email: "reader@example.com" });
  });

  it("subscribes to each stream of the core once", () => {
    const page = mountShell();

    expect(page.userSubscriptions()).toBe(1);
  });

  it("throws, on the next render, what a stream of the core failed with after its first value", async () => {
    // React prints the error it catches; the message is asserted below instead.
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});

    onTestFinished(() => {
      printed.mockRestore();
    });

    const page = mountShell();

    await expect(page.failUser("the session expired")).rejects.toThrow(
      "the session expired",
    );
  });

  it("gives the shell the builder's state from its first render", () => {
    const page = mountShell();

    expect(page.firstBuilderState()).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
  });

  it("gives the shell the signed-in owner's workspace as the core opens it, and none after the sign-out", async () => {
    const page = mountShell();

    expect(page.workspace()).toBeNull();

    await page.signUp("reader@example.com");
    await page.settle();

    expect(page.workspace()).toMatchObject({ id: "main", version: 1 });
    expect(page.workspaceProblem()).toBeNull();

    await page.signOut();

    expect(page.workspace()).toBeNull();
  });

  it("says why the workspace could not be opened at a sign-in", async () => {
    const page = mountShell({ openFails: "the library cannot be reached" });

    await page.signUp("reader@example.com");
    await page.settle();

    expect(page.workspaceProblem()).toBe(
      "Your workspace could not be opened: the library cannot be reached",
    );
  });

  it("gives a panel the app it pins, with its compatibility, and reads it again for another version", async () => {
    const page = mountShell({ pin: { id: "books", version: 2 } });

    expect(page.pinned()).toEqual({ kind: "loading" });

    await page.saveBookApp();
    await page.pinTo({ id: "books", version: 1 });
    await page.settle();

    expect(page.pinned()).toMatchObject({
      kind: "loaded",
      app: { id: "books", version: 1 },
      compatibility: { kind: "compatible" },
    });
  });

  it("says a pinned app is missing when the library has no such version", async () => {
    const page = mountShell({ pin: { id: "books", version: 3 } });

    await page.settle();

    expect(page.pinned()).toEqual({ kind: "missing" });
  });

  it("says why a pinned app could not be read", async () => {
    const page = mountShell({
      pin: { id: "books", version: 1 },
      loadFails: "the library cannot be reached",
    });

    await page.settle();

    expect(page.pinned()).toEqual({
      kind: "failed",
      message: "the library cannot be reached",
    });
  });

  it("says what a pinned app's load failed with, when it is not an Error", async () => {
    const page = mountShell({
      pin: { id: "books", version: 1 },
      loadRejectsWith: "the library cannot be reached",
    });

    await page.settle();

    expect(page.pinned()).toEqual({
      kind: "failed",
      message: "the library cannot be reached",
    });
  });

  it("gives the shell the signed-in user's apps as they are saved", async () => {
    const page = mountShell();

    await page.saveBookApp();

    expect(page.library()).toEqual([]);

    await page.signUp("reader@example.com");

    expect(page.library()).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);

    await page.saveBookApp();

    expect(page.library()).toEqual([
      { id: "books", name: "Books I'm reading", latest: 2 },
    ]);
  });

  it("opens an app's session when its view mounts, and closes it when it unmounts", async () => {
    const page = mountShell({ showsApp: true });
    const session = page.appSession();

    await expect(
      session.emit("statusFilter", "change", { value: "done" }),
    ).resolves.toBeUndefined();

    await page.hideApp();

    await expect(
      session.emit("statusFilter", "change", { value: "done" }),
    ).rejects.toThrow("the app session is closed");
  });

  it("keeps the session open through StrictMode's mount, unmount and mount again", async () => {
    const page = mountShell({ showsApp: true, strict: true });

    await page.settle();

    const after = page.appSession();

    await after.emit("statusFilter", "change", { value: "done" });
    await page.showEqualCopy();

    expect(page.appSession()).toBe(after);
    expect(await firstValueFrom(after.state())).toMatchObject({
      status: "done",
    });
  });

  it("opens a session for the next app it is given, and closes the one before", async () => {
    const page = mountShell({ showsApp: true });
    const before = page.appSession();

    await page.showNextVersion();

    expect(page.appSession()).not.toBe(before);
    await expect(
      before.emit("statusFilter", "change", { value: "done" }),
    ).rejects.toThrow("the app session is closed");
    const after = page.appSession();

    await after.emit("statusFilter", "change", { value: "done" });
    await page.showEqualCopy();

    expect(page.appSession()).toBe(after);
    expect(await firstValueFrom(after.state())).toMatchObject({
      status: "done",
    });
  });

  it("keeps the session, and the state it holds, when given an equal App of the same id and version", async () => {
    const page = mountShell({ showsApp: true });
    const before = page.appSession();

    await before.emit("statusFilter", "change", { value: "done" });
    await page.showEqualCopy();

    expect(page.appSession()).toBe(before);
    expect(await firstValueFrom(before.state())).toMatchObject({
      status: "done",
    });
  });

  it("refuses a core whose builder gives no state at once, rather than guess it", () => {
    const { core } = createCoreHarness();

    expect(() => {
      createShellViewModel({
        ...core,
        builder: { ...core.builder, state: createSilentBuilder },
      });
    }).toThrow("the core gave no value at once for the builder's state");
  });

  it("knows nobody until the session answers, as a session kept in the browser does when the app starts", async () => {
    const page = mountShell({ lateSession: true });

    expect(page.user()).toBeUndefined();

    await page.answerSession(null);

    expect(page.user()).toBeNull();
  });

  it("tells a component with no provider above it what is missing", () => {
    // React prints the error it catches; the message is asserted below instead.
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});

    onTestFinished(() => {
      printed.mockRestore();
    });

    expect(() => {
      mountWithoutProvider();
    }).toThrow(
      "useShellViewModel needs a <ShellViewModelProvider> above it in the tree",
    );
  });
});

/** A builder whose state has not answered yet, which no builder of the core does. */
function createSilentBuilder(): Observable<BuilderState> {
  return NEVER;
}
