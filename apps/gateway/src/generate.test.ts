import { describe, expect, it } from "vitest";

import type { GenerationEvent, GenerationRequest } from "@origamic/spec";

import { generate } from "./generate.ts";
import type { ModelClient, ModelReply } from "./model.ts";
import {
  createDateFinishedReply,
  createFirstReply,
  createFirstRequest,
  createRevisionRequest,
  type WrittenReply,
} from "./testing/bookTracker.ts";
import { createScriptedModel } from "./testing/scriptedModel.ts";

describe("a generation", () => {
  it("a valid reply becomes one proposal with versions in its bindings", async () => {
    const model = createScriptedModel([json(createFirstReply())]);

    const proposal = proposalOf(await eventsOf(createFirstRequest(), model));

    expect(proposal.changeSet?.baseVersion).toBe(0);
    expect(proposal.app.ontologyVersion).toBe(1);
    expect(proposal.app.bindings).toEqual({
      types: [{ type: "Book", version: 1 }],
      actions: [
        { action: "createBook", version: 1 },
        { action: "updateBook", version: 1 },
      ],
    });
    expect(proposal.app.id).toMatch(UUID);
  });

  it("a revision binds the versions the change set makes", async () => {
    const model = createScriptedModel([json(createDateFinishedReply())]);

    const proposal = proposalOf(await eventsOf(createRevisionRequest(), model));

    expect(proposal.changeSet?.baseVersion).toBe(1);
    expect(proposal.app.ontologyVersion).toBe(2);
    expect(proposal.app.bindings).toEqual({
      types: [{ type: "Book", version: 2 }],
      actions: [
        { action: "createBook", version: 1 },
        { action: "updateBook", version: 2 },
      ],
    });
    expect(proposal.app.id).toBe("books");
  });

  it("a reply with a problem is retried once, with the problems in the second request", async () => {
    const model = createScriptedModel([
      json(createReplyReadingNoSuchField()),
      json(createFirstReply()),
    ]);

    const events = await eventsOf(createFirstRequest(), model);
    const [first, second] = model.requests.map((request) => {
      return JSON.stringify(request.messages);
    });

    expect(events.at(-1)?.kind).toBe("proposal");
    expect(first).not.toContain(BAD_PATH);
    expect(second).toContain(BAD_PATH);
  });

  it("a second bad reply is a failed event with the problems", async () => {
    const model = createScriptedModel([
      json(createReplyReadingNoSuchField()),
      json(createReplyReadingNoSuchField()),
      json(createFirstReply()),
    ]);

    const events = await eventsOf(createFirstRequest(), model);

    expect(model.requests).toHaveLength(2);
    expect(events.at(-1)).toEqual({
      kind: "failed",
      message: expect.stringContaining("after one retry"),
      problems: [{ path: BAD_PATH, message: expect.stringContaining('"row"') }],
    });
  });

  it("a refusal and a reply cut short are failed events that say which", async () => {
    const refusing = createScriptedModel([
      { kind: "refused", category: "cyber" },
    ]);

    const cutting = createScriptedModel([
      { kind: "cut", reason: "max_tokens" },
    ]);

    const refused = await eventsOf(createFirstRequest(), refusing);
    const cut = await eventsOf(createFirstRequest(), cutting);

    expect(refused.at(-1)).toEqual({
      kind: "failed",
      message: expect.stringMatching(/declined.*cyber/),
      problems: [],
    });
    expect(cut.at(-1)).toEqual({
      kind: "failed",
      message: expect.stringMatching(/cut short.*max_tokens/),
      problems: [],
    });
    expect([refusing.requests, cutting.requests]).toEqual([
      [expect.anything()],
      [expect.anything()],
    ]);
  });

  it("progress comes before the proposal", async () => {
    const model = createScriptedModel([json(createFirstReply())]);

    const events = await eventsOf(createFirstRequest(), model);

    expect(
      events.map((event) => {
        return event.kind;
      }),
    ).toEqual(["progress", "progress", "proposal"]);
  });
});

describe("what goes back to the model", () => {
  it("a reply the schema refuses is retried with where it is wrong", async () => {
    const reply = createFirstReply();

    reply.app.ui.elements[0] = { id: "page", component: "Stack", size: 3 };

    expect(await secondRequestAfter(reply)).toContain("app.ui.elements.0");
  });

  it("a type or an action the ontology does not have is retried with where it is named", async () => {
    const reply = createFirstReply();

    reply.app.types = ["Book", "Author"];
    reply.app.actions = ["createBook", "updateBook", "deleteBook"];

    const second = await secondRequestAfter(reply);

    expect(second).toContain("app.types.1");
    expect(second).toContain("app.actions.2");
  });

  it("an app with no change set, on an ontology with nothing, is told the ontology has none", async () => {
    const reply = createFirstReply();

    reply.operations = null;

    const second = await secondRequestAfter(reply);

    expect(second).toContain("app.types.0");
    expect(second).toContain("it has none");
  });

  it("a change set that does not apply is retried with its problems", async () => {
    const reply = createFirstReply();

    reply.operations = [
      ...(reply.operations ?? []),
      {
        op: "addProperty",
        type: "Author",
        property: { name: "born", type: "date" },
      },
    ];

    expect(await secondRequestAfter(reply)).toContain("operations.3");
  });

  it("the instructions carry the catalog's schema and the request's ontology", async () => {
    const model = createScriptedModel([json(createDateFinishedReply())]);

    await eventsOf(createRevisionRequest(), model);

    const [request] = model.requests;

    expect(request?.schema).toHaveProperty("properties.app");
    const messages = JSON.stringify(request?.messages);

    expect(messages).toContain("add a 'date finished' field");
    expect(messages).toContain("updateBook");
    expect(messages).toContain("editForm");
  });
});

describe("a model that cannot be asked", () => {
  it("is a failed event, not a thrown error", async () => {
    const events = await eventsOf(
      createFirstRequest(),
      createScriptedModel([]),
    );

    expect(events.at(-1)).toEqual({
      kind: "failed",
      message: expect.stringContaining("could not be reached"),
      problems: [],
    });
  });
});

/** Where the table's select handler reads a field the event does not carry. */
const BAD_PATH = "ui.elements.table.on.select.0.to";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ProposalKind {
  kind: "proposal";
}

type Proposal = Extract<GenerationEvent, ProposalKind>["proposal"];

function json(value: WrittenReply): ModelReply {
  return { kind: "json", value };
}

/** The book tracker, with the table's select reading a `row` the event does not carry (review focus 2). */
function createReplyReadingNoSuchField(): WrittenReply {
  const reply = createFirstReply();

  reply.app.ui.elements = reply.app.ui.elements.map((element) => {
    return element.id === "table"
      ? {
          ...element,
          on: {
            select: [{ do: "set", state: "selected", to: { $event: "row" } }],
          },
        }
      : element;
  });

  return reply;
}

async function eventsOf(
  request: GenerationRequest,
  model: ModelClient,
): Promise<GenerationEvent[]> {
  const events: GenerationEvent[] = [];

  for await (const event of generate(request, model)) {
    events.push(event);
  }

  return events;
}

function proposalOf(events: readonly GenerationEvent[]): Proposal {
  const last = events.at(-1);

  if (last?.kind !== "proposal") {
    throw new Error(`the generation ended with ${JSON.stringify(last)}`);
  }

  return last.proposal;
}

/** The messages of the second request, after `reply` and then a valid one. */
async function secondRequestAfter(reply: WrittenReply): Promise<string> {
  const model = createScriptedModel([json(reply), json(createFirstReply())]);

  await eventsOf(createFirstRequest(), model);

  return JSON.stringify(model.requests[1]?.messages);
}
