import { firstValueFrom } from "rxjs";

import type { App, Catalog } from "@origamic/spec";

import { type AppSession, openAppSession } from "./apps/appSession.ts";
import {
  type Compatibility,
  checkCompatibility,
} from "./apps/compatibility.ts";
import { type Builder, createBuilder } from "./builder/builder.ts";
import type { LlmGatewayPort } from "./ports/llmGatewayPort.ts";
import type { ObjectStorePort } from "./ports/objectStorePort.ts";
import type { OntologyStorePort } from "./ports/ontologyStorePort.ts";
import type { SessionPort } from "./ports/sessionPort.ts";
import type { SpecLibraryPort } from "./ports/specLibraryPort.ts";
import {
  createWorkspacePresenter,
  type WorkspacePresenter,
} from "./workspace/workspacePresenter.ts";

/** Everything the core is handed: one adapter or simulator for each port, and the catalog it checks apps against. */
export interface CoreDeps {
  ontology: OntologyStorePort;
  objects: ObjectStorePort;
  library: SpecLibraryPort;
  llm: LlmGatewayPort;
  session: SessionPort;
  catalog: Catalog;
}

/** An app as loaded from the library, with whether it still works on the current ontology (ADR-0005). */
interface LoadedApp {
  app: App;
  compatibility: Compatibility;
}

/** The application, without a screen. */
export interface Core {
  /** Who is signed in, and signing in and out. */
  readonly session: SessionPort;
  /** The conversation with the model, and accepting what it proposes. */
  readonly builder: Builder;
  /** The owner's workspace: its panels and their pins. */
  readonly workspace: WorkspacePresenter;
  /** The owner's apps and workspaces, every version of each. */
  readonly library: SpecLibraryPort;
  /** Opens an app: its state, its views' rows, and its elements' events. Close it when it leaves the screen. */
  openApp(app: App): AppSession;
  /** The app at that version, with the compatibility check against the current ontology; `null` when the library has no such version. */
  loadApp(id: string, version: number): Promise<LoadedApp | null>;
}

/** Builds the core over its ports. Only `createCoreHarness` calls it in a test; the composition root calls it in the app. */
export function createCore(deps: CoreDeps): Core {
  const workspace = createWorkspacePresenter(deps.library);

  return {
    session: deps.session,
    builder: createBuilder({ ...deps, workspace }),
    workspace,
    library: deps.library,
    openApp: (app: App): AppSession => {
      return openAppSession(app, deps);
    },
    loadApp: async (id: string, version: number): Promise<LoadedApp | null> => {
      const app = await deps.library.loadApp(id, version);

      if (app === null) {
        return null;
      }

      const ontology = await firstValueFrom(deps.ontology.current());

      return { app, compatibility: checkCompatibility(app, ontology) };
    },
  };
}
