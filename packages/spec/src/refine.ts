import { z } from "zod";

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

/**
 * `schema`, a record, refusing a `__proto__` key. `JSON.parse` keeps one as
 * an own key, and Zod leaves it out of what it parses without a word (its
 * key schema never sees it), so it is refused here, before the record runs.
 */
export function withoutProtoKey<Output, Input>(
  schema: z.ZodType<Output, Input>,
): z.ZodPipe<z.ZodCustom<Input, Input>, z.ZodType<Output, Input>> {
  return z
    .custom<Input>(hasNoProtoKey, {
      message: '"__proto__" is not a key a spec may use',
      path: ["__proto__"],
    })
    .pipe(schema);
}

function hasNoProtoKey(value: unknown): boolean {
  return !(
    typeof value === "object" &&
    value !== null &&
    Object.hasOwn(value, "__proto__")
  );
}
