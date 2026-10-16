// The entry `@origamic/catalog/manifest`: the catalog as data and as checks,
// and what the model is held to. It imports spec and zod and nothing else, so
// the gateway can read it without the React side (ADR-0010).
import type {
  Catalog,
  CatalogComponent,
  CatalogManifest,
  Element,
  Problem,
} from "@origamic/spec";

import { checkElementAgainst } from "./contract/check.ts";
import { contracts } from "./contract/contracts.ts";
import type { ComponentContract } from "./contract/defineComponent.ts";

export { contracts } from "./contract/contracts.ts";
export {
  type Generated,
  generationSchema,
  type JsonSchema,
  readGenerated,
} from "./generation.ts";

const all: readonly ComponentContract[] = Object.values(contracts);

/** The catalog as `validateApp` takes it: each component's props by kind and its events, and the check of each element against the contracts' schemas. */
export const catalog: Catalog = {
  manifest: manifestOf(all),
  checkElement: (id: string, element: Element): Problem[] => {
    return checkElementAgainst(
      all.find((contract) => {
        return contract.name === element.component;
      }),
      id,
      element,
    );
  },
};

function manifestOf(components: readonly ComponentContract[]): CatalogManifest {
  return Object.fromEntries(
    components.map((contract) => {
      return [contract.name, entryOf(contract)];
    }),
  );
}

/** A component as spec's reference checks read it: props by kind, and each event's fields, or null when the element's props name them. */
function entryOf({ props, events }: ComponentContract): CatalogComponent {
  return {
    props: Object.fromEntries(
      Object.entries(props).map(([name, prop]) => {
        return [name, prop.kind];
      }),
    ),
    events: Object.fromEntries(
      Object.entries(events).map(([name, carried]) => {
        return [name, "fieldsOf" in carried ? null : carried];
      }),
    ),
  };
}
