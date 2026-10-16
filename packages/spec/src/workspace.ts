import { z } from "zod";

import { Format, Id, Version } from "./common.ts";
import { type Path, report } from "./refine.ts";

/** A panel hosts one app at one version. Accepting a revision of that app moves the pin (ADR-0005). */
const Panel = z.strictObject({ app: Id, appVersion: Version });

interface PanelLeaf {
  kind: "panel";
  panel: string;
}

interface SplitPart {
  /** A share of the split, relative to the other parts. */
  size: number;
  layout: LayoutShape;
}

interface Split {
  kind: "split";
  direction: "row" | "column";
  parts: SplitPart[];
}

interface Tabs {
  kind: "tabs";
  panels: string[];
  active: string;
}

type LayoutShape = PanelLeaf | Split | Tabs;

/**
 * Where the panels are: Origamic's own format, which the shell translates
 * to dockview and back (ADR-0003). A tree, because no model writes a layout
 * in v1.
 */
const Layout: z.ZodType<LayoutShape> = z.lazy(() => {
  return z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("panel"), panel: Id }),
    z.strictObject({
      kind: z.literal("split"),
      direction: z.enum(["row", "column"]),
      parts: z
        .array(z.strictObject({ size: z.number().positive(), layout: Layout }))
        .min(2),
    }),
    z.strictObject({
      kind: z.literal("tabs"),
      panels: z.array(Id).min(1),
      active: Id,
    }),
  ]);
});

const WorkspaceFields = z.strictObject({
  format: Format,
  id: Id,
  name: z.string().min(1),
  panels: z.record(Id, Panel),
  layout: Layout,
});

type WorkspaceFields = z.infer<typeof WorkspaceFields>;

/** A workspace before the library has saved it. */
export const WorkspaceDraft = WorkspaceFields.superRefine(checkPlacement);

/** A saved layout of apps in panels, itself a spec. */
export const Workspace = WorkspaceFields.extend({
  version: Version,
}).superRefine(checkPlacement);
export type Workspace = z.infer<typeof Workspace>;

/** Every panel is placed once, the layout places only panels that exist, and a tab group shows one of its own. */
function checkPlacement(
  workspace: WorkspaceFields,
  ctx: z.RefinementCtx,
): void {
  const placed = new Set<string>();

  place(workspace.layout, ["layout"]);

  for (const id of Object.keys(workspace.panels)) {
    if (!placed.has(id)) {
      report(
        ctx,
        ["panels", id],
        `the panel "${id}" is not placed in the layout`,
      );
    }
  }

  function place(layout: LayoutShape, path: Path): void {
    if (layout.kind === "split") {
      layout.parts.forEach((part, index) => {
        place(part.layout, [...path, "parts", index, "layout"]);
      });

      return;
    }

    const panels = layout.kind === "panel" ? [layout.panel] : layout.panels;

    if (layout.kind === "tabs" && !layout.panels.includes(layout.active)) {
      report(
        ctx,
        [...path, "active"],
        `the active tab "${layout.active}" is not one of the group's panels`,
      );
    }

    for (const panel of panels) {
      if (!(panel in workspace.panels)) {
        report(ctx, path, `the layout places "${panel}", which is not a panel`);
      } else if (placed.has(panel)) {
        report(ctx, path, `the layout places "${panel}" twice`);
      }

      placed.add(panel);
    }
  }
}
