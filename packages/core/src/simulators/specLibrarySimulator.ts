import { BehaviorSubject, type Observable } from "rxjs";

import {
  App,
  type AppDraft,
  Workspace,
  type WorkspaceDraft,
} from "@origamic/spec";

import type { LibraryEntry, SpecLibraryPort } from "#/ports/specLibraryPort.ts";

/** The SpecLibraryPort in memory, for one owner: every version of every app and workspace it saves, and nothing to begin with. */
export function createSpecLibrarySimulator(): SpecLibraryPort {
  const apps = createShelf((value) => {
    return App.parse(value);
  });

  const workspaces = createShelf((value) => {
    return Workspace.parse(value);
  });

  return {
    apps: (): Observable<readonly LibraryEntry[]> => {
      return apps.entries();
    },
    workspaces: (): Observable<readonly LibraryEntry[]> => {
      return workspaces.entries();
    },
    loadApp: (id: string, version?: number): Promise<App | null> => {
      return Promise.resolve(apps.load(id, version));
    },
    saveApp: (draft: AppDraft): Promise<App> => {
      return Promise.resolve(apps.save(draft));
    },
    loadWorkspace: (
      id: string,
      version?: number,
    ): Promise<Workspace | null> => {
      return Promise.resolve(workspaces.load(id, version));
    },
    saveWorkspace: (draft: WorkspaceDraft): Promise<Workspace> => {
      return Promise.resolve(workspaces.save(draft));
    },
  };
}

interface Draft {
  id: string;
  name: string;
}

interface Versioned extends Draft {
  version: number;
}

interface Shelf<T extends Versioned> {
  entries: () => Observable<readonly LibraryEntry[]>;
  load: (id: string, version: number | undefined) => T | null;
  save: (draft: Draft) => T;
}

/**
 * Every version of one kind of spec, by id. Each save is the next version of
 * its id. A version, once saved, is never changed: `parse`, the spec's own
 * schema, makes the copy that is kept and each copy that is handed out.
 */
function createShelf<T extends Versioned>(
  parse: (value: unknown) => T,
): Shelf<T> {
  const versions = new Map<string, T[]>();
  const latest = new Map<string, LibraryEntry>();
  const entries = new BehaviorSubject<readonly LibraryEntry[]>([]);

  return {
    entries: (): Observable<readonly LibraryEntry[]> => {
      return entries.asObservable();
    },
    load: (id: string, version: number | undefined): T | null => {
      const saved = versions.get(id) ?? [];
      const found = saved.find((candidate) => {
        return candidate.version === (version ?? saved.length);
      });

      return found === undefined ? null : parse(found);
    },
    save: (draft: Draft): T => {
      const saved = versions.get(draft.id) ?? [];
      const spec = parse({ ...draft, version: saved.length + 1 });

      versions.set(draft.id, [...saved, spec]);
      latest.set(draft.id, {
        id: draft.id,
        name: spec.name,
        latest: spec.version,
      });
      entries.next([...latest.values()]);

      return parse(spec);
    },
  };
}
