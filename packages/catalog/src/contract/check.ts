import { z } from "zod";

import type { Element, Problem } from "@origamic/spec";

import type { ComponentContract, FieldsOf } from "./defineComponent.ts";

type Handler = Element["on"][string][number];

/** The entries of a prop an event's fields come from: each has a name. */
const Named = z.array(z.looseObject({ name: z.string() })).min(1);

/** What a handler reads from the event that runs it. */
const EventRead = z.object({ $event: z.string() });

/**
 * What only the contract's schemas can judge of one element (ADR-0002): each
 * value written for a `fixed` or a `state` prop against the prop's schema, a
 * required prop that is missing, and each `$event` of an event whose fields
 * come from the element's props (a Form's submit). What `checkApp` judges
 * from the manifest (an unknown component or prop, a reference on a prop
 * whose kind refuses it) is left to it, so nothing is reported twice.
 */
export function checkElementAgainst(
  contract: ComponentContract | undefined,
  id: string,
  element: Element,
): Problem[] {
  if (contract === undefined) {
    return [];
  }

  return [
    ...propProblems(contract, id, element),
    ...eventProblems(contract, id, element),
  ];
}

function propProblems(
  contract: ComponentContract,
  id: string,
  element: Element,
): Problem[] {
  return Object.entries(contract.props).flatMap(([name, prop]) => {
    const path = `ui.elements.${id}.props.${name}`;

    if (!Object.hasOwn(element.props, name)) {
      return prop.required
        ? [{ path, message: `a "${contract.name}" needs "${name}"` }]
        : [];
    }

    const value = element.props[name];

    if (prop.kind === "view" || isReference(value)) {
      return [];
    }

    const parsed = prop.schema.safeParse(value);

    return parsed.success
      ? []
      : parsed.error.issues.map((issue) => {
          return {
            path: [path, ...issue.path.map(String)].join("."),
            message: `the "${name}" of a "${contract.name}": ${issue.message}`,
          };
        });
  });
}

function eventProblems(
  contract: ComponentContract,
  id: string,
  element: Element,
): Problem[] {
  return Object.entries(contract.events).flatMap(([event, carried]) => {
    const fields =
      "fieldsOf" in carried ? fieldNamesOf(element, carried) : undefined;

    if (fields === undefined) {
      return [];
    }

    return (ownOf(element.on, event) ?? []).flatMap((handler, index) => {
      return eventReadsOf(handler, `ui.elements.${id}.on.${event}.${index}`)
        .filter(([, field]) => {
          return !fields.includes(field);
        })
        .map(([path, field]) => {
          return {
            path,
            message: `the "${event}" of a "${contract.name}" carries its fields: ${fields.join(", ")}; it has no "${field}"`,
          };
        });
    });
  });
}

/** The names of the entries of the prop an event's fields come from, when that prop holds a list the schema reads. */
function fieldNamesOf(
  element: Element,
  { fieldsOf }: FieldsOf,
): string[] | undefined {
  const entries = Named.safeParse(element.props[fieldsOf]);

  return entries.success
    ? entries.data.map((entry) => {
        return entry.name;
      })
    : undefined;
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
    const read = EventRead.safeParse(value);

    return read.success ? [[where, read.data.$event]] : [];
  });
}

/** A `$view` or a `$state`: what a prop reads rather than holds. A literal has no key that starts with `$`, so it is never one. */
function isReference(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    ("$view" in value || "$state" in value)
  );
}

/** A record's own entry, so that a name every object inherits, such as `constructor`, is not taken for one. */
function ownOf<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
