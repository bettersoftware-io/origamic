import { firstValueFrom, NEVER, type Observable } from "rxjs";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import type { BuilderState } from "@origamic/core";
import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";
import { type GenerationEvent, Proposal } from "@origamic/spec";
import {
  createBookApp,
  createBookChange,
} from "@origamic/spec/testing/bookTracker.ts";

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

  it("shows no workspace while nobody is signed in, even one the core has open", async () => {
    const page = mountShell();

    await page.openWorkspace();

    expect(page.workspace()).toBeNull();
  });

  it("forgets the owner's workspace at sign-out, and saves no change after it", async () => {
    const page = mountShell({ workspacePerOwner: true });

    await page.signUp("a@example.com");
    await page.settle();
    await page.saveBookApp();
    await page.addBookPanel();

    expect(page.workspace()?.panels).toEqual({
      books: { app: "books", appVersion: 1 },
    });

    await page.signOut();

    expect(page.workspace()).toBeNull();
    await expect(page.addBookPanel()).rejects.toThrow("no workspace is open");
  });

  it("shows the next owner only their own workspace", async () => {
    const page = mountShell({ workspacePerOwner: true });

    await page.signUp("a@example.com");
    await page.settle();
    await page.saveBookApp();
    await page.addBookPanel();
    await page.signOut();
    await page.signUp("b@example.com");
    await page.settle();

    expect(page.workspace()).toMatchObject({ version: 1, panels: {} });
  });

  it("does not save a change the owner before had queued at the sign-out", async () => {
    const page = mountShell({ workspacePerOwner: true });

    await page.signUp("a@example.com");
    await page.settle();
    await page.saveBookApp();

    const outcome = await page.addBookPanelWhileSigningOut();

    expect(outcome).toMatchObject({
      status: "rejected",
      reason: new Error(
        "the workspace was closed before this change was saved",
      ),
    });

    await page.signIn("a@example.com");
    await page.settle();

    expect(page.workspace()).toMatchObject({ version: 1, panels: {} });
  });

  it("an accept under way when the owner changes writes nothing into the next owner's stores", async () => {
    const page = mountShell({
      workspacePerOwner: true,
      replies: [createBookReply()],
    });

    await page.signUp("a@example.com");
    await page.settle();
    await page.askForBookTracker();

    const next = await page.acceptWhileOwnerChanges("b@example.com");

    expect(next).toEqual({
      ontologyVersion: 0,
      apps: [],
      workspace: expect.objectContaining({ version: 1, panels: {} }),
    });
    expect(page.builderState()).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("The accept was stopped"),
    });
  });

  it("drops the builder's proposal at sign-out", async () => {
    const page = mountShell({ replies: [createBookReply()] });

    await page.signUp("a@example.com");
    await page.askForBookTracker();

    expect(page.builderState()?.kind).toBe("proposed");

    await page.signOut();

    expect(page.builderState()).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
  });

  it("opens the workspace of whoever signs in", async () => {
    const page = mountShell();

    await page.signUp("reader@example.com");
    await page.settle();

    expect(page.workspace()).toMatchObject({ id: "main", version: 1 });
    expect(page.workspaceProblem()).toBeNull();
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

    await page.signUp("reader@example.com");

    expect(page.library()).toEqual([]);

    await page.saveBookApp();

    expect(page.library()).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);
  });

  it("asks the library nothing while nobody is signed in, and reads it again at the next sign-in", async () => {
    const page = mountShell();

    await page.saveBookApp();

    expect(page.library()).toEqual([]);
    expect(page.libraryReads()).toBe(0);

    await page.signUp("reader@example.com");

    expect(page.library()).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);

    await page.signOut();

    expect(page.library()).toEqual([]);

    await page.signIn("reader@example.com");

    expect(page.libraryReads()).toBe(2);
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

/** The model's reply to "a tracker for the books I'm reading". */
function createBookReply(): GenerationEvent[] {
  return [
    {
      kind: "proposal",
      proposal: Proposal.parse({
        explanation: "A tracker for your books.",
        changeSet: createBookChange(),
        app: createBookApp(),
      }),
    },
  ];
}

/** A builder whose state has not answered yet, which no builder of the core does. */
function createSilentBuilder(): Observable<BuilderState> {
  return NEVER;
}
