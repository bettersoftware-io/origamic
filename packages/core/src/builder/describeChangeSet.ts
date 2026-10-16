import type {
  ActionType,
  ChangeSet,
  ObjectType,
  Ontology,
} from "@origamic/spec";

/**
 * One line per operation of a change set, worded for the builder who
 * accepts or rejects it: "Book: add dateFinished (date, optional)".
 * `ontology` is the one the change set is written against; a replaced
 * action is described by what it changes there.
 */
export function describeChangeSet(
  change: ChangeSet,
  ontology: Ontology,
): readonly string[] {
  const actions = new Map(
    ontology.actionTypes.map((action) => {
      return [action.name, action];
    }),
  );

  return change.operations.map((operation) => {
    return describeOperation(operation, actions);
  });
}

function describeOperation(
  operation: Operation,
  actions: ReadonlyMap<string, ActionType>,
): string {
  switch (operation.op) {
    case "addObjectType": {
      const { name, properties } = operation.objectType;

      return `${name}: add type with ${namesOf(properties).join(", ")}`;
    }

    case "addProperty":
      return `${operation.type}: add ${operation.property.name} (${propertyTerms(operation.property)})`;
    case "deprecateProperty":
      return `${operation.type}: deprecate ${operation.property}`;

    case "addLinkType": {
      const { name, from, to, cardinality } = operation.linkType;

      return `${name}: add link from ${from} to ${to}, ${cardinality}`;
    }

    case "addActionType":
      return `${operation.actionType.name}: add action that ${whatItDoes(operation.actionType)}`;
    case "replaceActionType":
      return describeReplace(operation.actionType, actions);
  }
}

type Property = ObjectType["properties"][number];
type Operation = ChangeSet["operations"][number];
type ActionDraft = Extract<Operation, AddsAction>["actionType"];

type Rule = ActionDraft["rules"][number];

interface AddsAction {
  op: "addActionType";
}

interface Named {
  name: string;
}

/** The property's type, whether it is required, and its default: "date, optional". */
function propertyTerms(property: Property): string {
  const type =
    property.type === "enum"
      ? `enum of ${property.values.join(", ")}`
      : property.type;
  const terms = [type, property.required ? "required" : "optional"];

  if (property.default !== undefined) {
    terms.push(`default ${JSON.stringify(property.default)}`);
  }

  return terms.join(", ");
}

function whatItDoes(action: ActionDraft): string {
  switch (action.kind) {
    case "create":
      return `creates a ${action.type}, setting ${action.fields.join(", ")}`;
    case "update":
      return `updates a ${action.type}, setting ${action.fields.join(", ")}`;
    case "delete":
      return `deletes a ${action.type}`;
    case "link":
      return `links by ${action.linkType}`;
  }
}

/** What a new version of an action changes: the fields it sets, its rules, or what it does. */
function describeReplace(
  draft: ActionDraft,
  actions: ReadonlyMap<string, ActionType>,
): string {
  const before = actions.get(draft.name);

  if (before === undefined) {
    return `${draft.name}: replace an action the ontology does not have`;
  }

  const fieldsBefore = fieldsOf(before);
  const fieldsAfter = fieldsOf(draft);
  const added = fieldsAfter.filter((field) => {
    return !fieldsBefore.includes(field);
  });

  const removed = fieldsBefore.filter((field) => {
    return !fieldsAfter.includes(field);
  });
  const changes: string[] = [];

  if (actsOn(draft) !== actsOn(before)) {
    changes.push(`now ${whatItDoes(draft)}`);
  }

  if (added.length > 0) {
    changes.push(`now also sets ${added.join(", ")}`);
  }

  if (removed.length > 0) {
    changes.push(`no longer sets ${removed.join(", ")}`);
  }

  const rulesBefore = before.rules.map(ruleText);
  const rulesAfter = draft.rules.map(ruleText);
  const rulesAdded = rulesAfter.filter((rule) => {
    return !rulesBefore.includes(rule);
  });

  const rulesDropped = rulesBefore.filter((rule) => {
    return !rulesAfter.includes(rule);
  });

  if (rulesAdded.length > 0) {
    changes.push(`now requires ${rulesAdded.join(", ")}`);
  }

  if (rulesDropped.length > 0) {
    changes.push(`no longer requires ${rulesDropped.join(", ")}`);
  }

  return `${draft.name}: ${changes.length > 0 ? changes.join("; ") : "replaced, as it was"}`;
}

/** A rule as the builder reads it: "rating from 1 to 5", "author to be set". */
function ruleText(rule: Rule): string {
  if (rule.kind === "required") {
    return `${rule.property} to be set`;
  }

  if (rule.min !== undefined && rule.max !== undefined) {
    return `${rule.property} from ${rule.min} to ${rule.max}`;
  }

  if (rule.min !== undefined) {
    return `${rule.property} of at least ${rule.min}`;
  }

  return rule.max === undefined
    ? `${rule.property} to be a number`
    : `${rule.property} of at most ${rule.max}`;
}

/** What an action does, and to what: "update Book", "link Sequel". */
function actsOn(action: ActionDraft): string {
  return action.kind === "link"
    ? `link ${action.linkType}`
    : `${action.kind} ${action.type}`;
}

function fieldsOf(action: ActionDraft): readonly string[] {
  return action.kind === "create" || action.kind === "update"
    ? action.fields
    : [];
}

function namesOf(items: readonly Named[]): string[] {
  return items.map((item) => {
    return item.name;
  });
}
