import type { GenerationRequest, Problem } from "@origamic/spec";

// What the model is told. The instructions stay the same from request to
// request, so a provider can cache them; what changes (the intent, the
// ontology, the app) goes in the first message.

/** The model's instructions: what Origamic is, and what its reply must be. */
export const SYSTEM_PROMPT = `You build small apps in Origamic. An app is data, never code: a runtime interprets it.

Your reply is one JSON object, held to the schema you are given:

- "explanation": one or two plain sentences for the builder about what you propose.
- "operations": a change set to the owner's ontology, or null when the ontology already has what the app needs. It is applied whole to the ontology you are shown. An object type, once added, keeps its properties: add a property, deprecate one, or replace an action whole under its own name. A required property you add needs a default, since stored objects lack it.
- "app": its name, the object types it reads and the actions it invokes, each by name alone, and its UI.

The UI is flat. Every element names a catalog component and has an id; a Stack lists the ids of its children, and "root" is the id of the element drawn first. A view reads objects of one type, with an optional filter, sort and limit. A state key holds a value the elements share: a selection, a filter's choice, a form's values. A prop reads a view with {"$view": id} and a state key with {"$state": key}, where its component allows. An event runs handlers in order: "set" writes a state key, "invoke" runs an action. In a handler, {"$event": field} reads a field the event carries, and only one it carries.

Every write is an action of the ontology. An app binds the types its views read and the actions its handlers invoke, and nothing else. Write no version anywhere: the gateway adds each one's version from the ontology your change set yields.

When you revise an app, keep the ids of what stays, and change only what the builder asked for.`;

/** The first message: what the builder asked, against which ontology, and the app it revises if any. */
export function requestMessage(request: GenerationRequest): string {
  const parts = [
    `The builder asks: ${request.intent}`,
    `The owner's ontology, at version ${request.ontology.version}:\n${fenced(request.ontology)}`,
  ];

  if (request.app !== undefined) {
    parts.push(
      `The app to revise, as it is saved. Its elements, views and state are maps keyed by id; your reply writes them as lists, each entry with its id or key:\n${fenced(request.app)}`,
    );
  }

  return parts.join("\n\n");
}

/** What goes back to the model after a reply that cannot be used: the reply, and each problem with where it is. */
export function retryMessage(
  reply: unknown,
  problems: readonly Problem[],
): string {
  const listed = problems.map(({ path, message }) => {
    return `- \`${path}\`: ${message}`;
  });

  return [
    `Your reply was:\n${fenced(reply)}`,
    `It cannot be used, for these reasons:\n${listed.join("\n")}`,
    'A path that starts with "app." or "operations." points into your reply. Any other points into the app as it would be saved, where elements, views and state are maps keyed by id or key, and "bindings" holds the types and actions you named.',
    "Write the whole reply again, with every one of these fixed.",
  ].join("\n\n");
}

function fenced(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}
