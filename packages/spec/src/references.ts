import type { ActionType } from "./action.ts";
import { AppDraft } from "./binding.ts";
import type { ObjectType, Ontology } from "./ontology.ts";
import { problemsOf } from "./refine.ts";
import type { Element, View } from "./ui-spec.ts";

/** What a prop accepts (ADR-0002): a `fixed` one a value, a `state` one a value or a `$state`, a `view` one a `$view` and nothing else. */
type PropKind = "fixed" | "state" | "view";

/** What the reference checks need of a catalog component: its props by kind, and the events it emits. The props' schemas are the catalog's to check. */
interface CatalogComponent {
  props: Readonly<Record<string, PropKind>>;
  /** Event → the fields its payload carries; null when the fields come from the element's props (a Form's fields). */
  events: Readonly<Record<string, readonly string[] | null>>;
}

/** The catalog's manifest, as data: component name to its props and events (ADR-0010). */
export type CatalogManifest = Readonly<Record<string, CatalogComponent>>;

/** The catalog as `validateApp` takes it: the manifest, and the check of what only the components' schemas can judge. */
export interface Catalog {
  manifest: CatalogManifest;
  checkElement(id: string, element: Element): Problem[];
}

/** One thing a spec names that the ontology or the catalog does not have, worded for whoever fixes it. */
export interface Problem {
  path: string;
  message: string;
}

/** What `validateApp` gives: the app as parsed, or every problem found. */
export type Validated =
  | { kind: "valid"; app: AppDraft }
  | { kind: "invalid"; problems: Problem[] };

/**
 * The whole of what is checked before an app is saved or returned: its
 * schema, then `checkApp`, then the catalog's check of each element. A
 * schema error stops it there, since the others need a parsed app.
 */
export function validateApp(
  input: unknown,
  ontology: Ontology,
  catalog: Catalog,
): Validated {
  const parsed = AppDraft.safeParse(input);

  if (!parsed.success) {
    return { kind: "invalid", problems: problemsOf(parsed.error) };
  }

  const app = parsed.data;
  const problems = [
    ...checkApp(app, ontology, catalog.manifest),
    ...Object.entries(app.ui.elements).flatMap(([id, element]) => {
      return catalog.checkElement(id, element);
    }),
  ];

  return problems.length === 0
    ? { kind: "valid", app }
    : { kind: "invalid", problems };
}

/**
 * What an app names that only the ontology and the catalog can confirm: each
 * binding exists at its version, each component, prop and event exists, each
 * prop holds what its kind accepts, each `$event` names a field its event
 * carries, and each view and each invocation uses properties the ontology
 * has. What is left is the catalog's: the value of each prop, against its
 * schema (`validateApp` runs both).
 *
 * A binding to an older version of a type is known, not a problem: whether
 * the app still works against the newer one is the compatibility check's
 * question, in `core`.
 */
export function checkApp(
  app: AppDraft,
  ontology: Ontology,
  manifest: CatalogManifest,
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
    problems.push(...checkElement(id, element, manifest, actions));
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
  manifest: CatalogManifest,
  actions: ReadonlyMap<string, ActionType>,
): Problem[] {
  const component = own(manifest, element.component);

  if (component === undefined) {
    return [
      {
        path: `ui.elements.${id}.component`,
        message: `"${id}" is a "${element.component}", which is not in the catalog`,
      },
    ];
  }

  const problems: Problem[] = [];

  for (const [prop, value] of Object.entries(element.props)) {
    const message = misuseOf(prop, value, element.component, component);

    if (message !== undefined) {
      problems.push({ path: `ui.elements.${id}.props.${prop}`, message });
    }
  }

  for (const [event, handlers] of Object.entries(element.on)) {
    const carried = own(component.events, event);

    if (carried === undefined) {
      problems.push({
        path: `ui.elements.${id}.on.${event}`,
        message: `a "${element.component}" emits no "${event}"; it emits ${listed(Object.keys(component.events))}`,
      });
    }

    handlers.forEach((handler, index) => {
      const path = `ui.elements.${id}.on.${event}.${index}`;

      // A null list is the catalog's to check: a Form's fields are its props.
      if (carried) {
        for (const [where, field] of eventReadsOf(handler, path)) {
          if (!carried.includes(field)) {
            problems.push({
              path: where,
              message: `the "${event}" of a "${element.component}" carries ${listed(carried)}; it has no "${field}"`,
            });
          }
        }
      }

      const action =
        handler.do === "invoke" ? actions.get(handler.action) : undefined;

      if (handler.do !== "invoke" || action === undefined) {
        return;
      }

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

type PropValue = Element["props"][string];
type Handler = Element["on"][string][number];

/** What is wrong with what a prop holds, if anything: the component has no such prop, or the prop's kind does not accept that value. */
function misuseOf(
  prop: string,
  value: PropValue,
  name: string,
  component: CatalogComponent,
): string | undefined {
  const kind = own(component.props, prop);
  const which = `"${prop}" of a "${name}"`;

  if (kind === undefined) {
    return `a "${name}" has no prop "${prop}"; it takes ${listed(Object.keys(component.props))}`;
  }

  if (kind === "view") {
    return readOf(value, "$view") === undefined
      ? `${which} takes a $view and nothing else`
      : undefined;
  }

  if (readOf(value, "$view") !== undefined) {
    return `${which} is not a view prop; it takes no $view`;
  }

  if (kind === "fixed" && readOf(value, "$state") !== undefined) {
    return `${which} is fixed; it takes no $state`;
  }

  return undefined;
}

/** Each field of its event a handler reads, with where it reads it. */
function eventReadsOf(handler: Handler, path: string): [string, string][] {
  const expressions: [string, unknown][] =
    handler.do === "set"
      ? [[`${path}.to`, handler.to]]
      : [
          [`${path}.target`, handler.target],
          ...Object.entries(handler.input).map(
            ([field, value]): [string, unknown] => {
              return [`${path}.input.${field}`, value];
            },
          ),
        ];

  return expressions.flatMap(([where, value]): [string, string][] => {
    const field = readOf(value, "$event");

    return field === undefined ? [] : [[where, field]];
  });
}

/** The name a value reads by `key`, when it is that reference: `{"$view": "books"}` reads "books" by `$view`. A literal reads nothing, since no key of its starts with `$`. */
function readOf(
  value: unknown,
  key: "$view" | "$state" | "$event",
): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const name: unknown = Reflect.get(value, key);

  return typeof name === "string" ? name : undefined;
}

/** A record's own entry, so that a name every object inherits, such as `constructor`, is not taken for one. */
function own<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function listed(names: readonly string[]): string {
  return names.length === 0 ? "nothing" : names.join(", ");
}
