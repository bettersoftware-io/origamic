import type { z } from "zod";

import type { AppDraft } from "../binding.ts";
import type { Problem } from "../references.ts";
import { problemsOf } from "../refine.ts";

type AppInput = z.input<typeof AppDraft>;
type ElementInput = AppInput["ui"]["elements"][string];

/** The messages a schema gives for `input`: none when it accepts it. */
export function issuesOf(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);

  return result.success
    ? []
    : result.error.issues.map((issue) => {
        return issue.message;
      });
}

/** The issues a schema gives for `input`, each with its path, as `validateApp` words them. */
export function problemsIn(schema: z.ZodType, input: unknown): Problem[] {
  const result = schema.safeParse(input);

  return result.success ? [] : problemsOf(result.error);
}

/** An element of a fixture app, to change in place. */
export function elementOf(app: AppInput, id: string): ElementInput {
  const element = app.ui.elements[id];

  if (element === undefined) {
    throw new Error(`the fixture app has no element "${id}"`);
  }

  return element;
}
