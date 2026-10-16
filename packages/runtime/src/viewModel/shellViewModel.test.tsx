import { describe, expect, it, onTestFinished, vi } from "vitest";

import { mountShell, mountWithoutProvider } from "./shellViewModel.page.tsx";

describe("the shell's view model", () => {
  it("gives the shell who is signed in, and null when nobody is", async () => {
    const page = mountShell();

    expect(page.user()).toBeNull();

    await page.signUp("reader@example.com");

    expect(page.user()).toMatchObject({ email: "reader@example.com" });
  });

  it("gives the shell the builder's state from its first render", () => {
    const page = mountShell();

    expect(page.firstBuilderState()).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
  });

  it("gives the shell the workspace once it is opened", async () => {
    const page = mountShell();

    expect(page.workspace()).toBeNull();

    await page.openWorkspace();

    expect(page.workspace()).toMatchObject({ id: "main", version: 1 });
  });

  it("gives the shell the library's apps as they are saved", async () => {
    const page = mountShell();

    expect(page.library()).toEqual([]);

    await page.saveBookApp();

    expect(page.library()).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
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

    await expect(
      page.appSession().emit("statusFilter", "change", { value: "done" }),
    ).resolves.toBeUndefined();
  });

  it("opens a session for the next app it is given, and closes the one before", async () => {
    const page = mountShell({ showsApp: true });
    const before = page.appSession();

    await page.showNextVersion();

    expect(page.appSession()).not.toBe(before);
    await expect(
      before.emit("statusFilter", "change", { value: "done" }),
    ).rejects.toThrow("the app session is closed");
    await expect(
      page.appSession().emit("statusFilter", "change", { value: "done" }),
    ).resolves.toBeUndefined();
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
