import type { Observable } from "rxjs";

import type { App, AppDraft, Workspace, WorkspaceDraft } from "@origamic/spec";

/** One app or workspace of the library, at its latest version. */
export interface LibraryEntry {
  id: string;
  name: string;
  latest: number;
}

/**
 * The store of apps and workspaces. It assigns their versions (ADR-0005):
 * each save of an id is the next version of it, and an old version is never
 * changed.
 */
export interface SpecLibraryPort {
  /** The latest of each app. Emits at once, and again after each save through this library. */
  apps(): Observable<readonly LibraryEntry[]>;
  /** The latest of each workspace. Emits at once, and again after each save through this library. */
  workspaces(): Observable<readonly LibraryEntry[]>;
  /** The app at that version, or at its latest; `null` when there is none. */
  loadApp(id: string, version?: number): Promise<App | null>;
  saveApp(draft: AppDraft): Promise<App>;
  /** The workspace at that version, or at its latest; `null` when there is none. */
  loadWorkspace(id: string, version?: number): Promise<Workspace | null>;
  saveWorkspace(draft: WorkspaceDraft): Promise<Workspace>;
}
