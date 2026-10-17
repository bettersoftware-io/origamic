import type { ActionType, App, ObjectType, Ontology } from "@origamic/spec";

/** One thing an app binds that the ontology no longer supports as the app uses it. */
interface Break {
  /** The binding, as the app writes it: `Book@1`, `updateBook@1`. */
  binding: string;
  /** The property of that binding the app uses, when the break is about one. */
  property?: string;
  /**
   * `deprecated`: the app reads or writes a property the type has
   * deprecated. `missing`: the ontology has no such type, action or
   * property, or not at that version. `no longer set`: the app passes a
   * field to an action whose current version does not set it.
   */
  reason: "deprecated" | "missing" | "no longer set";
}

/** Whether an app built against an older ontology still works on this one, and if not, each break: the report the model revises the app from (ADR-0005). */
export type Compatibility =
  | { kind: "compatible" }
  | { kind: "report"; breaks: readonly Break[] };

/**
 * The compatibility check of loading an app against a newer ontology
 * (ADR-0005). A change the app does not use is compatible: an added type,
 * property or action, and a new version of an action that still sets every
 * field the app passes it. A deprecated property the app's views read or its
 * handlers set, and a field an action no longer sets, are breaks.
 *
 * What the app uses is what `core` can read without the catalog: its views'
 * filters and sorts, and the fields its handlers pass to actions. A
 * property only a component's props name (a table's column) is the
 * catalog's to judge.
 */
export function checkCompatibility(
  app: App,
  ontology: Ontology,
): Compatibility {
  const types = new Map(
    ontology.objectTypes.map((type) => {
      return [type.name, type];
    }),
  );

  const actions = new Map(
    ontology.actionTypes.map((action) => {
      return [action.name, action];
    }),
  );
  const used = usedByApp(app, actions);
  const breaks: Break[] = [];

  for (const ref of app.bindings.types) {
    const binding = `${ref.type}@${ref.version}`;
    const type = types.get(ref.type);

    if (type === undefined || ref.version > type.version) {
      breaks.push({ binding, reason: "missing" });
      continue;
    }

    breaks.push(...propertyBreaks(binding, type, used.get(ref.type) ?? []));
  }

  for (const ref of app.bindings.actions) {
    const binding = `${ref.action}@${ref.version}`;
    const action = actions.get(ref.action);

    if (action === undefined || ref.version > action.version) {
      breaks.push({ binding, reason: "missing" });
      continue;
    }

    for (const field of fieldsPassedTo(app, ref.action)) {
      if (!fieldsOf(action).includes(field)) {
        breaks.push({ binding, property: field, reason: "no longer set" });
      }
    }
  }

  return breaks.length === 0
    ? { kind: "compatible" }
    : { kind: "report", breaks };
}

/** Each property the app uses, by the name of its type, once each and in the order the app first uses it. */
function usedByApp(
  app: App,
  actions: ReadonlyMap<string, ActionType>,
): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();

  function use(type: string, property: string): void {
    const properties = used.get(type) ?? new Set<string>();

    properties.add(property);
    used.set(type, properties);
  }

  for (const view of Object.values(app.ui.views)) {
    for (const { property } of [...view.filter, ...view.sort]) {
      use(view.type, property);
    }
  }

  for (const ref of app.bindings.actions) {
    const action = actions.get(ref.action);

    if (action !== undefined && action.kind !== "link") {
      for (const field of fieldsPassedTo(app, ref.action)) {
        use(action.type, field);
      }
    }
  }

  return used;
}

function propertyBreaks(
  binding: string,
  type: ObjectType,
  used: Iterable<string>,
): Break[] {
  const properties = new Map(
    type.properties.map((property) => {
      return [property.name, property];
    }),
  );

  return [...used].flatMap((name): Break[] => {
    const property = properties.get(name);

    if (property === undefined) {
      return [{ binding, property: name, reason: "missing" }];
    }

    return property.deprecated
      ? [{ binding, property: name, reason: "deprecated" }]
      : [];
  });
}

/** The fields the app's handlers pass to an action, once each. */
function fieldsPassedTo(app: App, action: string): Set<string> {
  const fields = new Set<string>();

  for (const element of Object.values(app.ui.elements)) {
    for (const handlers of Object.values(element.on)) {
      for (const handler of handlers) {
        if (handler.do === "invoke" && handler.action === action) {
          for (const field of Object.keys(handler.input)) {
            fields.add(field);
          }
        }
      }
    }
  }

  return fields;
}

/** What an action's input may carry: the properties it sets, or the far end of a link. */
function fieldsOf(action: ActionType): readonly string[] {
  switch (action.kind) {
    case "create":
    case "update":
      return action.fields;
    case "delete":
      return [];
    case "link":
      return ["to"];
  }
}
