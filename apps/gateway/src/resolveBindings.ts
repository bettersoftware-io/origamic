import type { AppDraft, Ontology, Problem } from "@origamic/spec";

/** What the model named, each type and action by name alone. */
export interface Named {
  types: readonly string[];
  actions: readonly string[];
}

/** The bindings, each name at its version in the ontology, or where a name is one the ontology does not have. */
export type Resolved =
  | { kind: "resolved"; bindings: AppDraft["bindings"] }
  | { kind: "unknown"; problems: Problem[] };

/**
 * Each type and action the model named, at the version it has in `ontology`,
 * the ontology the change set yields (decision 3 of the first slice's plan).
 * The model names; the gateway writes the version, so a binding is never left
 * without one and never names a version that does not exist.
 */
export function resolveBindings(named: Named, ontology: Ontology): Resolved {
  const types = resolve(
    named.types,
    versionsOf(ontology.objectTypes),
    "app.types",
    "type",
  );

  const actions = resolve(
    named.actions,
    versionsOf(ontology.actionTypes),
    "app.actions",
    "action",
  );
  const problems = [...types.problems, ...actions.problems];

  if (problems.length > 0) {
    return { kind: "unknown", problems };
  }

  return {
    kind: "resolved",
    bindings: {
      types: types.found.map(([type, version]) => {
        return { type, version };
      }),
      actions: actions.found.map(([action, version]) => {
        return { action, version };
      }),
    },
  };
}

interface Versioned {
  name: string;
  version: number;
}

/** Each name with its version, and a problem for each name the ontology does not have. */
interface Found {
  found: [string, number][];
  problems: Problem[];
}

/** Name to version. A `Map`, so a name such as `constructor` finds nothing it does not hold. */
function versionsOf(items: readonly Versioned[]): ReadonlyMap<string, number> {
  return new Map(
    items.map(({ name, version }) => {
      return [name, version];
    }),
  );
}

function resolve(
  names: readonly string[],
  versions: ReadonlyMap<string, number>,
  path: string,
  what: string,
): Found {
  const result: Found = { found: [], problems: [] };

  names.forEach((name, index) => {
    const version = versions.get(name);

    if (version === undefined) {
      result.problems.push({
        path: `${path}.${index}`,
        message: `the ontology, after the change set, has no ${what} named "${name}"; it has ${listed([...versions.keys()])}`,
      });
    } else {
      result.found.push([name, version]);
    }
  });

  return result;
}

function listed(names: readonly string[]): string {
  return names.length === 0
    ? "none"
    : names
        .map((name) => {
          return `"${name}"`;
        })
        .join(", ");
}
