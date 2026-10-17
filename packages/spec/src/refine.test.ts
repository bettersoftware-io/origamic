import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { createWorkspace } from "./testing/bookTracker.ts";
import { problemsIn } from "./testing/issues.ts";
import { UiSpec } from "./ui-spec.ts";
import { WorkspaceDraft } from "./workspace.ts";

describe("every record of a spec", () => {
  it.each(createProtoCases())(
    "refuses a __proto__ key in $where",
    ({ schema, spec, path }) => {
      expect(problemsIn(schema, parsedWithProto(spec))).toEqual([
        { path, message: '"__proto__" is not a key a spec may use' },
      ]);
    },
  );
});

interface ProtoCase {
  where: string;
  schema: z.ZodType;
  /** The spec, with the key to refuse written `PROTO`. */
  spec: unknown;
  path: string;
}

function createProtoCases(): ProtoCase[] {
  const workspace = createWorkspace();

  return [
    {
      where: "elements",
      schema: UiSpec,
      spec: createSpec({ PROTO: { component: "Stack" } }),
      path: "elements.__proto__",
    },
    {
      where: "props",
      schema: UiSpec,
      spec: createSpec({}, { props: { PROTO: 1 } }),
      path: "elements.page.props.__proto__",
    },
    {
      where: "on",
      schema: UiSpec,
      spec: createSpec({}, { on: { PROTO: [createUnselect()] } }),
      path: "elements.page.on.__proto__",
    },
    {
      where: "an invocation's input",
      schema: UiSpec,
      spec: createSpec(
        {},
        {
          on: {
            change: [{ do: "invoke", action: "save", input: { PROTO: null } }],
          },
        },
      ),
      path: "elements.page.on.change.0.input.__proto__",
    },
    {
      where: "views",
      schema: UiSpec,
      spec: { ...createSpec({}), views: { PROTO: { type: "Book" } } },
      path: "views.__proto__",
    },
    {
      where: "state",
      schema: UiSpec,
      spec: { ...createSpec({}), state: { PROTO: {} } },
      path: "state.__proto__",
    },
    {
      where: "a workspace's panels",
      schema: WorkspaceDraft,
      spec: {
        ...workspace,
        panels: { ...workspace.panels, PROTO: { app: "x", appVersion: 1 } },
      },
      path: "panels.__proto__",
    },
  ];
}

/** A UI spec of one element, `page`, with `others` beside it and `page` given `fields`. */
function createSpec(others: object, fields: object = {}): object {
  return {
    root: "page",
    elements: { page: { component: "Stack", ...fields }, ...others },
    state: { selected: {} },
  };
}

function createUnselect(): object {
  return { do: "set", state: "selected", to: null };
}

/** `spec` as `JSON.parse` gives it with `PROTO` written as `__proto__`: an object literal cannot hold that key, and JSON can. */
function parsedWithProto(spec: unknown): unknown {
  return JSON.parse(JSON.stringify(spec).replace('"PROTO"', '"__proto__"'));
}
