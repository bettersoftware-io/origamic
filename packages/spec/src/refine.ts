import type { z } from "zod";

// What the schemas' own checks share. Not exported from the package: a
// caller sees only the issues they add.

export type Path = (string | number)[];

/** Adds an issue at `path`, worded for the person or the model that has to fix it. */
export function report(
  ctx: z.RefinementCtx,
  path: Path,
  message: string,
): void {
  ctx.addIssue({ code: "custom", path, message });
}

/** The first name that occurs twice in `names`, if one does. */
export function firstDuplicate(names: readonly string[]): string | undefined {
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) {
      return name;
    }

    seen.add(name);
  }

  return undefined;
}
