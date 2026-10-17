import { describeOntologyStorePortContract } from "#/ports/__contracts__/OntologyStorePortContract.ts";

import { createOntologyStoreSimulator } from "./ontologyStoreSimulator.ts";

describeOntologyStorePortContract("the ontology store simulator", (initial) => {
  return Promise.resolve(createOntologyStoreSimulator(initial));
});
