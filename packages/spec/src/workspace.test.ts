import { describe, expect, it } from "vitest";

import { createWorkspace } from "./testing/bookTracker.ts";
import { issuesOf } from "./testing/issues.ts";
import { Workspace, WorkspaceDraft } from "./workspace.ts";

describe("a workspace", () => {
  it("is accepted as a draft with no version, and saved only with one", () => {
    expect(issuesOf(WorkspaceDraft, createWorkspace())).toEqual([]);
    expect(issuesOf(Workspace, createWorkspace())).not.toEqual([]);
    expect(issuesOf(Workspace, { ...createWorkspace(), version: 1 })).toEqual(
      [],
    );
  });

  it("places every panel it has, once, and no other", () => {
    const workspace = createWorkspace();

    workspace.panels = {
      ...workspace.panels,
      draft: { app: "draft", appVersion: 1 },
    };
    workspace.layout = {
      kind: "split",
      direction: "column",
      parts: [
        { size: 1, layout: { kind: "panel", panel: "books" } },
        {
          size: 1,
          layout: { kind: "tabs", panels: ["books", "ghost"], active: "notes" },
        },
      ],
    };

    expect(issuesOf(WorkspaceDraft, workspace)).toEqual([
      'the active tab "notes" is not one of the group\'s panels',
      'the layout places "books" twice',
      'the layout places "ghost", which is not a panel',
      'the panel "notes" is not placed in the layout',
      'the panel "draft" is not placed in the layout',
    ]);
  });

  it("splits into two parts at least, each of a size", () => {
    const workspace = createWorkspace();

    workspace.layout = {
      kind: "split",
      direction: "row",
      parts: [{ size: 0, layout: { kind: "panel", panel: "books" } }],
    };

    expect(issuesOf(WorkspaceDraft, workspace)).not.toEqual([]);
  });
});
