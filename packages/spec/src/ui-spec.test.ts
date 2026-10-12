import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { UiNode } from "./ui-spec.ts";

// Property tests: fast-check makes the trees, of any width and depth, and
// shrinks one that fails to the smallest that still does.
describe("a tree of nodes, whatever its shape", () => {
  it("parses, and parsing what came out changes nothing", () => {
    fc.assert(
      fc.property(tree, (node) => {
        const parsed = UiNode.parse(node);

        expect(UiNode.parse(parsed)).toEqual(parsed);
      }),
    );
  });

  it("is rejected when one node, anywhere in it, names no component", () => {
    fc.assert(
      fc.property(tree, fc.array(fc.nat()), (node, path) => {
        expect(UiNode.safeParse(withoutComponentAt(node, path)).success).toBe(
          false,
        );
      }),
    );
  });
});

interface TreeNode {
  id: string;
  component?: string;
  props?: Record<string, unknown>;
  children?: TreeNode[];
}

/** A tree at most `depth` levels below its root, each node with up to three children. */
function treeOf(depth: number): fc.Arbitrary<TreeNode> {
  const children =
    depth === 0
      ? fc.constant<TreeNode[]>([])
      : fc.array(treeOf(depth - 1), { maxLength: 3 });

  return fc.record(
    {
      id: fc.string({ minLength: 1 }),
      component: fc.string({ minLength: 1 }),
      props: fc.dictionary(fc.string(), fc.jsonValue()),
      children,
    },
    { requiredKeys: ["id", "component"] },
  );
}

const tree = treeOf(3);

/** The tree with the component taken off the node `path` leads to: each step picks a child, and the walk stops at a leaf. */
function withoutComponentAt(node: TreeNode, path: number[]): TreeNode {
  const [step, ...rest] = path;
  const children = node.children ?? [];

  if (step === undefined || children.length === 0) {
    const { component: _component, ...bare } = node;

    return bare;
  }

  const at = step % children.length;

  return {
    ...node,
    children: children.map((child, index) => {
      return index === at ? withoutComponentAt(child, rest) : child;
    }),
  };
}
