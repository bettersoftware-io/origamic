import type { Workspace } from "@origamic/spec";

/** Where a workspace's panels are, in Origamic's own format (ADR-0003). */
type Layout = NonNullable<Workspace["layout"]>;

/** One panel to add to dockview, beside a panel added before it, or first. */
export type DockviewStep = {
  panel: string;
  title: string;
  position?: DockviewPosition;
};

/** Where a panel goes: to the right of, below, or in the tab group of a panel added before it. */
interface DockviewPosition {
  referencePanel: string;
  direction: "right" | "below" | "within";
}

/**
 * The panels of a layout as dockview adds them, in order: the translation of
 * Origamic's layout to dockview (ADR-0003), and the only place that knows
 * both. Dockview places a panel beside the group of the panel it names, so a
 * split is laid out before what is inside it: the first panel of each of its
 * parts beside the first panel of the part before, and only then each part's
 * own panels. A tab group is its first panel, and the others within it.
 *
 * A split's sizes and a tab group's active tab are not translated: v1 saves
 * neither from dockview (the plan's decision 11), so each part takes an equal
 * share and the last tab added is shown.
 */
export function toDockviewSteps(
  layout: Layout,
  titles: Readonly<Record<string, string>>,
): readonly DockviewStep[] {
  const steps: DockviewStep[] = [];

  function add(panel: string, position?: DockviewPosition): void {
    const title = Object.hasOwn(titles, panel) ? titles[panel] : undefined;

    steps.push({
      panel,
      title: title ?? panel,
      ...(position === undefined ? {} : { position }),
    });
  }

  /** Adds what is inside `layout`, whose first panel is already added. */
  function fill(inside: Layout): void {
    switch (inside.kind) {
      case "panel":
        return;

      case "tabs": {
        const [first, ...others] = inside.panels;

        for (const panel of others) {
          add(panel, { referencePanel: first, direction: "within" });
        }

        return;
      }

      case "split": {
        const direction = inside.direction === "row" ? "right" : "below";
        const firsts = inside.parts.map((part) => {
          return firstPanelOf(part.layout);
        });

        firsts.slice(1).forEach((panel, index) => {
          add(panel, { referencePanel: firsts[index], direction });
        });

        for (const part of inside.parts) {
          fill(part.layout);
        }
      }
    }
  }

  add(firstPanelOf(layout));
  fill(layout);

  return steps;
}

/** The panel a layout begins with: the one dockview adds first for it. */
function firstPanelOf(layout: Layout): string {
  switch (layout.kind) {
    case "panel":
      return layout.panel;

    case "tabs":
      return layout.panels[0];

    case "split":
      return firstPanelOf(layout.parts[0].layout);
  }
}
