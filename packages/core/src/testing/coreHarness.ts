import type { Catalog, GenerationEvent, Ontology } from "@origamic/spec";
import { createCatalog } from "@origamic/spec/testing/bookTracker.ts";

import { type Core, type CoreDeps, createCore } from "../createCore.ts";
import type { StoredObject } from "../ports/objectStorePort.ts";
import { createLlmGatewaySimulator } from "../simulators/llmGatewaySimulator.ts";
import { createObjectStoreSimulator } from "../simulators/objectStoreSimulator.ts";
import { createOntologyStoreSimulator } from "../simulators/ontologyStoreSimulator.ts";
import {
  type Account,
  createSessionSimulator,
} from "../simulators/sessionSimulator.ts";
import { createSpecLibrarySimulator } from "../simulators/specLibrarySimulator.ts";

/** What a test starts the core with. Everything left out starts empty. */
export interface CoreHarnessOptions {
  /** The owner's ontology; an empty one at version 0 when left out. */
  ontology?: Ontology;
  objects?: readonly StoredObject[];
  /** The model's replies, one generation each, in order. */
  replies?: readonly (readonly GenerationEvent[])[];
  accounts?: readonly Account[];
  /** The catalog apps are checked against; the book tracker's five components, with no check of their props, when left out. */
  catalog?: Catalog;
  /** Ports to run on in place of a simulator, each one given: a store with a shelf for each owner, one that waits on the test. */
  ports?: Partial<Omit<CoreDeps, "catalog">>;
}

/** The core, and the simulators it runs on, for a test to arrange and to look at. */
export interface CoreHarness {
  core: Core;
  deps: CoreDeps;
}

/** The one place a test builds the whole core: every port a simulator, the model scripted, and a stub catalog. */
export function createCoreHarness(
  options: CoreHarnessOptions = {},
): CoreHarness {
  const ports = options.ports ?? {};
  const ontology =
    ports.ontology ?? createOntologyStoreSimulator(options.ontology);

  const deps: CoreDeps = {
    ontology,
    objects:
      ports.objects ?? createObjectStoreSimulator(ontology, options.objects),
    library: ports.library ?? createSpecLibrarySimulator(),
    llm: ports.llm ?? createLlmGatewaySimulator(options.replies ?? []),
    session: ports.session ?? createSessionSimulator(options.accounts),
    catalog: options.catalog ?? createCatalog(),
  };

  return { core: createCore(deps), deps };
}
