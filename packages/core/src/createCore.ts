import { firstValueFrom, type Observable } from "rxjs";

import {
  type App,
  type Catalog,
  type Ontology,
  type Problem,
  validateApp,
} from "@origamic/spec";

import type { LlmGatewayPort } from "./ports/llmGatewayPort.ts";
import type { ObjectStorePort } from "./ports/objectStorePort.ts";
import type { OntologyStorePort } from "./ports/ontologyStorePort.ts";
import type { SessionPort } from "./ports/sessionPort.ts";
import type { LibraryEntry, SpecLibraryPort } from "./ports/specLibraryPort.ts";

/** Everything the core is handed: one adapter or simulator for each port, and the catalog it checks apps against. */
export interface CoreDeps {
  ontology: OntologyStorePort;
  objects: ObjectStorePort;
  library: SpecLibraryPort;
  llm: LlmGatewayPort;
  session: SessionPort;
  catalog: Catalog;
}

/** What saving an app gives: the app at its new version, or every problem `validateApp` found, with nothing saved. */
type SavedApp =
  | { kind: "saved"; app: App }
  | { kind: "invalid"; problems: readonly Problem[] };

/** The application, without a screen. The app session and the builder join it in part 4 of the first slice. */
export interface Core {
  /** Who is signed in, and signing in and out. */
  readonly session: SessionPort;
  /** The owner's ontology, as it moves. */
  ontology(): Observable<Ontology>;
  /** The latest of each app in the library. */
  apps(): Observable<readonly LibraryEntry[]>;
  /** The latest of each workspace in the library. */
  workspaces(): Observable<readonly LibraryEntry[]>;
  /** Saves an app once `validateApp` passes it against the current ontology and the catalog: the client validates every spec it saves (ADR-0009). */
  saveApp(draft: unknown): Promise<SavedApp>;
}

/** Builds the core over its ports. Only `createCoreHarness` calls it in a test; the composition root calls it in the app. */
export function createCore(deps: CoreDeps): Core {
  return {
    session: deps.session,
    ontology: (): Observable<Ontology> => {
      return deps.ontology.current();
    },
    apps: (): Observable<readonly LibraryEntry[]> => {
      return deps.library.apps();
    },
    workspaces: (): Observable<readonly LibraryEntry[]> => {
      return deps.library.workspaces();
    },
    saveApp: async (draft: unknown): Promise<SavedApp> => {
      const ontology = await firstValueFrom(deps.ontology.current());
      const validated = validateApp(draft, ontology, deps.catalog);

      if (validated.kind === "invalid") {
        return validated;
      }

      return { kind: "saved", app: await deps.library.saveApp(validated.app) };
    },
  };
}
