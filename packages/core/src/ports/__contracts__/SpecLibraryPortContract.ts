import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { LibraryEntry, SpecLibraryPort } from "../specLibraryPort.ts";
import { collect } from "./emissions.ts";
import { createAppDraft, createWorkspaceDraft } from "./fixtures.ts";

/**
 * The behaviour every SpecLibraryPort adapter owes its callers. Each
 * adapter's test calls this with a function that makes a fresh, empty
 * library for one owner.
 */
export function describeSpecLibraryPortContract(
  label: string,
  createLibrary: () => Promise<SpecLibraryPort>,
): void {
  describe(`${label} :: SpecLibraryPort contract`, () => {
    it("the first save of an app is version 1, the next 2", async () => {
      const library = await createLibrary();

      const first = await library.saveApp(
        createAppDraft("books", "Books I'm reading"),
      );

      const second = await library.saveApp(
        createAppDraft("books", "Books I'm reading", 2),
      );

      expect(first).toEqual({
        ...createAppDraft("books", "Books I'm reading"),
        version: 1,
      });
      expect(second).toEqual({
        ...createAppDraft("books", "Books I'm reading", 2),
        version: 2,
      });
    });

    it("the old version still loads, and no version is the latest", async () => {
      const library = await createLibrary();

      await library.saveApp(createAppDraft("books", "Books I'm reading"));
      await library.saveApp(createAppDraft("books", "Books I'm reading", 2));

      expect(await library.loadApp("books", 1)).toEqual({
        ...createAppDraft("books", "Books I'm reading"),
        version: 1,
      });
      expect(await library.loadApp("books")).toEqual({
        ...createAppDraft("books", "Books I'm reading", 2),
        version: 2,
      });
    });

    it("a missing id or version loads null", async () => {
      const library = await createLibrary();

      await library.saveApp(createAppDraft("books", "Books I'm reading"));
      await library.saveWorkspace(createWorkspaceDraft(1));

      expect(await library.loadApp("films")).toBeNull();
      expect(await library.loadApp("books", 2)).toBeNull();
      expect(await library.loadWorkspace("films")).toBeNull();
      expect(await library.loadWorkspace("reading", 2)).toBeNull();
    });

    it("apps() emits the latest of each", async () => {
      const library = await createLibrary();

      await library.saveApp(createAppDraft("books", "Books I'm reading"));
      await library.saveApp(createAppDraft("books", "Books I'm reading", 2));
      await library.saveApp(createAppDraft("films", "Films"));

      expect(byId(await firstValueFrom(library.apps()))).toEqual([
        { id: "books", name: "Books I'm reading", latest: 2 },
        { id: "films", name: "Films", latest: 1 },
      ]);
    });

    it("apps() emits again after a save through the same library", async () => {
      const library = await createLibrary();
      const seen = collect(library.apps());

      await seen.next();
      await library.saveApp(createAppDraft("books", "Books I'm reading"));
      await seen.next();
      seen.stop();

      expect(seen.emissions).toEqual([
        [],
        [{ id: "books", name: "Books I'm reading", latest: 1 }],
      ]);
    });

    it("a workspace is versioned as an app is, and workspaces() emits the latest of each", async () => {
      const library = await createLibrary();
      const seen = collect(library.workspaces());

      await seen.next();

      const first = await library.saveWorkspace(createWorkspaceDraft(1));

      await seen.next();

      const moved = createWorkspaceDraft(2);
      const second = await library.saveWorkspace(moved);

      await seen.next();
      seen.stop();

      expect(first.version).toBe(1);
      expect(second).toEqual({ ...moved, version: 2 });
      expect(await library.loadWorkspace("reading", 1)).toEqual(first);
      expect(await library.loadWorkspace("reading")).toEqual(second);
      expect(seen.emissions.at(-1)).toEqual([
        { id: "reading", name: "Reading", latest: 2 },
      ]);
    });
  });
}

function byId(entries: readonly LibraryEntry[]): LibraryEntry[] {
  return [...entries].sort((left, right) => {
    return left.id.localeCompare(right.id);
  });
}
