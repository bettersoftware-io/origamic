import type { z } from "zod";

import type { Problem } from "./references.ts";

// What the schemas' own checks share, and how their issues become problems.
// Not exported from the package: a caller sees only the issues and the
// problems.

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

/** A schema's issues as problems, so that a caller gets one kind of answer whichever check found them. */
export function problemsOf(error: z.ZodError): Problem[] {
  return error.issues.map((issue) => {
    return { path: issue.path.map(String).join("."), message: issue.message };
  });
}
