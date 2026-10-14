import { z } from "zod";

import {
  Format,
  Id,
  OntologyVersion,
  PropName,
  TypeRef,
  Version,
} from "./common.ts";
import { firstDuplicate, report } from "./refine.ts";
import { UiSpec } from "./ui-spec.ts";

/** A binding to an action at one of its own versions: `createBook@1`. */
const ActionRef = z.strictObject({ action: PropName, version: Version });

/** Everything an app touches in the ontology, each at a version. The UI spec reaches the ontology only through these. */
const Bindings = z.strictObject({
  types: z.array(TypeRef).min(1),
  actions: z.array(ActionRef).default([]),
});

const AppFields = z.strictObject({
  format: Format,
  id: Id,
  name: z.string().min(1),
  /** The ontology version the app was built against. Loading it against a newer one runs the compatibility check. */
  ontologyVersion: OntologyVersion,
  bindings: Bindings,
  ui: UiSpec,
});

type AppFields = z.infer<typeof AppFields>;

/** An app before the library has saved it, which is what gives it a version. */
export const AppDraft = AppFields.superRefine(checkBindingsCover);
export type AppDraft = z.infer<typeof AppDraft>;

/** An app as the library stores it: a bundle of specs at one version. */
export const App = AppFields.extend({ version: Version }).superRefine(
  checkBindingsCover,
);
export type App = z.infer<typeof App>;

/** The app binds each type and action once, and its UI spec reads and invokes only what it binds. */
function checkBindingsCover(app: AppFields, ctx: z.RefinementCtx): void {
  const types = app.bindings.types.map((ref) => {
    return ref.type;
  });

  const actions = app.bindings.actions.map((ref) => {
    return ref.action;
  });
  const twiceType = firstDuplicate(types);
  const twiceAction = firstDuplicate(actions);

  if (twiceType !== undefined) {
    report(
      ctx,
      ["bindings", "types"],
      `"${twiceType}" is bound twice; an app binds one version of a type`,
    );
  }

  if (twiceAction !== undefined) {
    report(
      ctx,
      ["bindings", "actions"],
      `"${twiceAction}" is bound twice; an app binds one version of an action`,
    );
  }

  for (const [id, view] of Object.entries(app.ui.views)) {
    if (!types.includes(view.type)) {
      report(
        ctx,
        ["ui", "views", id, "type"],
        `the view "${id}" reads "${view.type}", which the app does not bind`,
      );
    }
  }

  for (const [id, element] of Object.entries(app.ui.elements)) {
    for (const [event, handlers] of Object.entries(element.on)) {
      handlers.forEach((handler, index) => {
        if (handler.do === "invoke" && !actions.includes(handler.action)) {
          report(
            ctx,
            ["ui", "elements", id, "on", event, index, "action"],
            `"${id}" invokes "${handler.action}", which the app does not bind`,
          );
        }
      });
    }
  }
}
