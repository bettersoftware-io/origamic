import {
  defer,
  firstValueFrom,
  from,
  type Observable,
  Subject,
  switchMap,
} from "rxjs";

import type {
  App,
  AppDraft,
  Applied,
  ChangeSet,
  Ontology,
  Workspace,
  WorkspaceDraft,
} from "@origamic/spec";

import type { CoreDeps } from "../createCore.ts";
import type { OntologyStorePort } from "../ports/ontologyStorePort.ts";
import type { SessionPort } from "../ports/sessionPort.ts";
import type {
  LibraryEntry,
  SpecLibraryPort,
} from "../ports/specLibraryPort.ts";
import { createOntologyStoreSimulator } from "../simulators/ontologyStoreSimulator.ts";
import { createSessionSimulator } from "../simulators/sessionSimulator.ts";
import { createSpecLibrarySimulator } from "../simulators/specLibrarySimulator.ts";

/** Holds the ontology's reads, once armed, until the test opens it. */
interface Gate {
  armed: boolean;
  open: () => void;
}

/** Ports for `createCoreHarness` that keep each owner's rows apart, and the gate on their ontology's reads. */
export interface StoresPerOwner {
  ports: Partial<Omit<CoreDeps, "catalog">>;
  gate: Gate;
}

/**
 * The session, and an ontology and a library with a shelf of their own for
 * each signed-in user, as Supabase keeps each owner's rows apart: the
 * simulators have one shelf for everyone. Like Supabase's, they answer
 * whoever is signed in when they are called, not whoever was when the
 * caller began. Nobody signed in has a shelf too, which no owner sees. Once
 * the gate is armed, a read of the ontology waits for it.
 */
export function createStoresPerOwner(): StoresPerOwner {
  const session: SessionPort = createSessionSimulator();
  const opening = new Subject<undefined>();
  const opened = firstValueFrom(opening);
  const gate: Gate = {
    armed: false,
    open: (): void => {
      opening.next(undefined);
    },
  };
  const libraries = new Map<string, SpecLibraryPort>();
  const ontologies = new Map<string, OntologyStorePort>();
  let owner = "";

  session.user().subscribe((user) => {
    owner = user?.id ?? "";
  });

  function library(): SpecLibraryPort {
    const found = libraries.get(owner) ?? createSpecLibrarySimulator();

    libraries.set(owner, found);

    return found;
  }

  function ontology(): OntologyStorePort {
    const found = ontologies.get(owner) ?? createOntologyStoreSimulator();

    ontologies.set(owner, found);

    return found;
  }

  return {
    gate,
    ports: {
      session,
      ontology: {
        current: (): Observable<Ontology> => {
          return defer(() => {
            return gate.armed
              ? from(opened).pipe(
                  switchMap(() => {
                    return ontology().current();
                  }),
                )
              : ontology().current();
          });
        },
        apply: (change: ChangeSet): Promise<Applied> => {
          return ontology().apply(change);
        },
      },
      library: {
        apps: (): Observable<readonly LibraryEntry[]> => {
          return library().apps();
        },
        workspaces: (): Observable<readonly LibraryEntry[]> => {
          return library().workspaces();
        },
        loadApp: (id: string, version?: number): Promise<App | null> => {
          return library().loadApp(id, version);
        },
        saveApp: (draft: AppDraft): Promise<App> => {
          return library().saveApp(draft);
        },
        loadWorkspace: (
          id: string,
          version?: number,
        ): Promise<Workspace | null> => {
          return library().loadWorkspace(id, version);
        },
        saveWorkspace: (draft: WorkspaceDraft): Promise<Workspace> => {
          return library().saveWorkspace(draft);
        },
      },
    },
  };
}
