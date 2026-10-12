import { describe, expect, it } from "vitest";

import {
  ActionEffect,
  ActionInvocation,
  AppSpec,
  LinkType,
  ObjectInstance,
  ObjectType,
  Ontology,
  OntologyMigration,
  PanelRef,
  Property,
  PropertyType,
  Rule,
  UiNode,
  ViewQuery,
  Workspace,
} from "./index.ts";

describe("the spec schemas", () => {
  it("accept an app and fill in what it left out", () => {
    const parsed = AppSpec.parse(app);

    expect(parsed.ui.views.open?.filter).toEqual([]);
    expect(parsed.ui.root.props).toEqual({});
    expect(parsed.ui.root.children).toHaveLength(1);
  });

  it("reject an app that carries no version", () => {
    const { version: _version, ...unversioned } = app;

    expect(AppSpec.safeParse(unversioned).success).toBe(false);
  });

  it("reject a type reference that names no version", () => {
    expect(
      AppSpec.safeParse({ ...app, binds: [{ type: "Task" }] }).success,
    ).toBe(false);
  });

  it("reject a node nested in the tree that names no component", () => {
    const ui = { ...app.ui, root: { ...app.ui.root, children: [{ id: "x" }] } };

    expect(AppSpec.safeParse({ ...app, ui }).success).toBe(false);
  });

  it("reject an action whose name is not camelCase", () => {
    const actions = [{ ...app.actions[0], name: "CreateTask" }];

    expect(AppSpec.safeParse({ ...app, actions }).success).toBe(false);
  });

  it("accept an ontology, and a migration only when its op is known", () => {
    const ontology = { version: 1, objectTypes: [task], linkTypes: [] };

    expect(Ontology.parse(ontology).objectTypes[0]?.name).toBe("Task");
    expect(
      OntologyMigration.safeParse({ op: "addObjectType", objectType: task })
        .success,
    ).toBe(true);
    expect(
      OntologyMigration.safeParse({ op: "dropObjectType", type: "Task" })
        .success,
    ).toBe(false);
  });

  it("accept an object instance, an action invocation and a workspace", () => {
    const ref = { type: "Task", version: 1 };

    expect(
      ObjectInstance.safeParse({ id: "t1", ref, data: { title: "Fold" } })
        .success,
    ).toBe(true);
    expect(
      ActionInvocation.safeParse({
        action: "createTask",
        actionVersion: 1,
        input: { title: "Fold" },
      }).success,
    ).toBe(true);
    expect(
      Workspace.safeParse({
        id: "w1",
        version: 1,
        name: "Desk",
        panels: { left: { appId: "tasks", appVersion: 1 } },
        layout: {},
      }).success,
    ).toBe(true);
  });
});

describe("the parts of a spec", () => {
  it("reject a rule and an effect of an unknown kind", () => {
    expect(
      Rule.safeParse({ kind: "range", property: "estimate", min: 0 }).success,
    ).toBe(true);
    expect(Rule.safeParse({ kind: "regex", property: "title" }).success).toBe(
      false,
    );
    expect(
      ActionEffect.safeParse({ kind: "link", linkType: "AssignedTo" }).success,
    ).toBe(true);
    expect(
      ActionEffect.safeParse({ kind: "archive", target: taskRef }).success,
    ).toBe(false);
  });

  it("hold an object type to one property at least, of a known type", () => {
    expect(PropertyType.safeParse("money").success).toBe(false);
    expect(Property.parse({ name: "title", type: "string" }).required).toBe(
      false,
    );
    expect(ObjectType.safeParse({ ...task, properties: [] }).success).toBe(
      false,
    );
  });

  it("reject a link whose cardinality is not one of the three", () => {
    const link = { name: "AssignedTo", from: "Task", to: "Person" };

    expect(
      LinkType.safeParse({ ...link, cardinality: "one-to-many" }).success,
    ).toBe(true);
    expect(
      LinkType.safeParse({ ...link, cardinality: "many-to-one" }).success,
    ).toBe(false);
  });

  it("read a view with no filter and no sort as unfiltered and unsorted", () => {
    expect(ViewQuery.parse({ source: taskRef })).toEqual({
      source: taskRef,
      filter: [],
      sort: [],
    });
    expect(ViewQuery.safeParse({ source: taskRef, limit: 0 }).success).toBe(
      false,
    );
  });

  it("reject a node with no id, and a panel that names no app version", () => {
    expect(UiNode.safeParse({ component: "Stack" }).success).toBe(false);
    expect(PanelRef.safeParse({ appId: "tasks" }).success).toBe(false);
  });
});

const taskRef = { type: "Task", version: 1 };

const task = {
  name: "Task",
  properties: [{ name: "title", type: "string", required: true }],
  titleProperty: "title",
};

const app = {
  id: "tasks",
  version: 1,
  name: "Tasks",
  ontologyVersion: 1,
  binds: [{ type: "Task", version: 1 }],
  actions: [
    {
      version: 1,
      name: "createTask",
      input: { title: "string" },
      rules: [{ kind: "required", property: "title" }],
      effect: { kind: "create", target: { type: "Task", version: 1 } },
    },
  ],
  ui: {
    version: 1,
    views: { open: { source: { type: "Task", version: 1 } } },
    root: {
      id: "root",
      component: "Stack",
      children: [
        {
          id: "list",
          component: "Table",
          bind: { view: "open", action: "createTask" },
        },
      ],
    },
  },
};
