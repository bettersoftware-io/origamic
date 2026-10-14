import type { ActionType } from "./action.ts";
import type { AppDraft } from "./binding.ts";
import type { ObjectType, Ontology } from "./ontology.ts";
import type { Element, View } from "./ui-spec.ts";

/** What the reference checks need of a catalog component: the events it emits. Its props are checked by the catalog (ADR-0002). */
interface CatalogComponent {
  events: readonly string[];
}

/** The catalog's manifest, as data: component name to what it emits (ADR-0010). */
export type CatalogManifest = Readonly<Record<string, CatalogComponent>>;

/** One thing a spec names that the ontology or the catalog does not have, worded for whoever fixes it. */
export interface Problem {
  path: string;
  message: string;
}

/**
 * What an app names that only the ontology and the catalog can confirm: each
 * binding exists at its version, each component and event exists, each view
 * and each invocation uses properties the ontology has. An app that passes
 * its schema and returns no problem here can be rendered.
 *
 * A binding to an older version of a type is known, not a problem: whether
 * the app still works against the newer one is the compatibility check's
 * question, in `core`.
 */
export function checkApp(
  app: AppDraft,
  ontology: Ontology,
  catalog: CatalogManifest,
): Problem[] {
  const problems: Problem[] = [];
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

  if (app.ontologyVersion > ontology.version) {
    problems.push({
      path: "ontologyVersion",
      message: `the app was built against ontology version ${app.ontologyVersion}, and the ontology is at ${ontology.version}`,
    });
  }

  app.bindings.types.forEach((ref, index) => {
    const type = types.get(ref.type);

    if (type === undefined || ref.version > type.version) {
      problems.push({
        path: `bindings.types.${index}`,
        message: `"${ref.type}@${ref.version}" is not a type the ontology has${type ? `; "${ref.type}" is at ${type.version}` : ""}`,
      });
    }
  });

  app.bindings.actions.forEach((ref, index) => {
    const action = actions.get(ref.action);

    if (action === undefined || ref.version > action.version) {
      problems.push({
        path: `bindings.actions.${index}`,
        message: `"${ref.action}@${ref.version}" is not an action the ontology has${action ? `; "${ref.action}" is at ${action.version}` : ""}`,
      });
    }
  });

  for (const [id, view] of Object.entries(app.ui.views)) {
    problems.push(...checkView(id, view, types.get(view.type)));
  }

  for (const [id, element] of Object.entries(app.ui.elements)) {
    problems.push(...checkElement(id, element, catalog, actions));
  }

  return problems;
}

function checkView(
  id: string,
  view: View,
  type: ObjectType | undefined,
): Problem[] {
  if (type === undefined) {
    return [];
  }

  const names = new Set(
    type.properties.map((property) => {
      return property.name;
    }),
  );

  const used = [
    ...view.filter.map((filter, index) => {
      return {
        path: `ui.views.${id}.filter.${index}.property`,
        property: filter.property,
      };
    }),
    ...view.sort.map((sort, index) => {
      return {
        path: `ui.views.${id}.sort.${index}.property`,
        property: sort.property,
      };
    }),
  ];

  return used
    .filter((use) => {
      return !names.has(use.property);
    })
    .map((use) => {
      return {
        path: use.path,
        message: `the view "${id}" uses "${use.property}", which "${type.name}" does not have`,
      };
    });
}

/** The fields an action's input may carry: the properties it sets, or the far end of a link. */
function inputFieldsOf(action: ActionType): readonly string[] {
  if (action.kind === "link") {
    return ["to"];
  }

  return "fields" in action ? action.fields : [];
}

function checkElement(
  id: string,
  element: Element,
  catalog: CatalogManifest,
  actions: ReadonlyMap<string, ActionType>,
): Problem[] {
  const component = catalog[element.component];

  if (component === undefined) {
    return [
      {
        path: `ui.elements.${id}.component`,
        message: `"${id}" is a "${element.component}", which is not in the catalog`,
      },
    ];
  }

  const problems: Problem[] = [];

  for (const [event, handlers] of Object.entries(element.on)) {
    if (!component.events.includes(event)) {
      problems.push({
        path: `ui.elements.${id}.on.${event}`,
        message: `a "${element.component}" emits no "${event}"; it emits ${component.events.length === 0 ? "nothing" : component.events.join(", ")}`,
      });
    }

    handlers.forEach((handler, index) => {
      const action =
        handler.do === "invoke" ? actions.get(handler.action) : undefined;

      if (handler.do !== "invoke" || action === undefined) {
        return;
      }

      const path = `ui.elements.${id}.on.${event}.${index}`;
      const fields = inputFieldsOf(action);

      for (const field of Object.keys(handler.input)) {
        if (!fields.includes(field)) {
          problems.push({
            path: `${path}.input.${field}`,
            message: `"${handler.action}" does not set "${field}"`,
          });
        }
      }

      if (action.kind !== "create" && handler.target === undefined) {
        problems.push({
          path,
          message: `"${handler.action}" acts on an object, and the handler names no target`,
        });
      }
    });
  }

  return problems;
}
