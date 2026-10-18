import { act, render } from "@testing-library/react";
import { type ReactElement, type ReactNode, StrictMode } from "react";

import type { Core, CoreDeps, OntologyStorePort } from "@origamic/core";
import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";
import {
  catalog,
  createShellViewModel,
  ShellViewModelProvider,
} from "@origamic/runtime";
import {
  AppDraft,
  ChangeSet,
  type GenerationEvent,
  type Ontology,
  Proposal,
} from "@origamic/spec";
import {
  createBookApp,
  createBookChange,
  createDateFinishedApp,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

/** The core a shell's page object drives, as `pnpm dev` composes it, and what it can arrange on it. */
export interface ShellHarness {
  core: Core;
  deps: CoreDeps;
  /** Renders `children` under the view model, in StrictMode as the app does. */
  show: (children: ReactNode) => Shown;
  /** Signs a builder up, as the sign-in would. */
  signUp: () => Promise<void>;
  /** Opens the workspace, applies the book tracker's change set and saves its app at version 1: an app the library has and no panel shows. */
  saveBookTracker: () => Promise<void>;
  /** Saves the book tracker's revision, which binds `Book@2`, without the change set that makes `Book@2`: an app ahead of the ontology. */
  saveRevisionAhead: () => Promise<void>;
  /** Applies the date finished's change set, saves the book tracker's revision at version 2, and moves the panel's pin to it, as accepting that proposal does. */
  reviseBookTracker: (panel: string) => Promise<void>;
  /** Deprecates the book tracker's rating, and replaces both its actions with ones that no longer set it: a change its app does not fit. */
  dropRating: () => Promise<void>;
  /** Lets what React and the core put off until the current work is done run. */
  settle: () => Promise<void>;
}

/**
 * The shell's core as the composition root makes it with no configuration
 * (src/app/composePorts.ts, which the UI may not import): every port a
 * simulator, the runtime's catalog, and a model that answers the book
 * tracker, then its date finished, as the dev script does.
 */
export function createShellHarness(): ShellHarness {
  const { core, deps } = createCoreHarness({
    catalog,
    replies: [createReply(createProposal(0)), createReply(createProposal(1))],
  });
  const viewModel = createShellViewModel(core);

  async function settle(): Promise<void> {
    await act(async () => {
      for (let turn = 0; turn < SETTLING_TURNS; turn += 1) {
        await Promise.resolve();
      }
    });
  }

  return {
    core,
    deps,
    show: (children: ReactNode): Shown => {
      function underViewModel(shown: ReactNode): ReactElement {
        return (
          <StrictMode>
            <ShellViewModelProvider viewModel={viewModel}>
              {shown}
            </ShellViewModelProvider>
          </StrictMode>
        );
      }

      const rendered = render(underViewModel(children));

      return {
        container: rendered.container,
        update: (next: ReactNode): void => {
          rendered.rerender(underViewModel(next));
        },
      };
    },
    signUp: async (): Promise<void> => {
      await act(async () => {
        await core.session.signUp(BUILDER.email, BUILDER.password);
      });
      await settle();
    },
    saveBookTracker: async (): Promise<void> => {
      await act(async () => {
        await core.workspace.open();
        await deps.ontology.apply(changeSetOf(createProposal(0)));
        await core.library.saveApp(AppDraft.parse(createProposal(0).app));
      });
      await settle();
    },
    saveRevisionAhead: async (): Promise<void> => {
      await act(async () => {
        await core.library.saveApp(AppDraft.parse(createProposal(1).app));
      });
      await settle();
    },
    reviseBookTracker: async (panel: string): Promise<void> => {
      await act(async () => {
        await deps.ontology.apply(changeSetOf(createProposal(1)));

        const app = await core.library.saveApp(
          AppDraft.parse(createProposal(1).app),
        );

        await core.workspace.movePin(panel, app);
      });
      await settle();
    },
    dropRating: async (): Promise<void> => {
      await act(async () => {
        const { version } = await currentOf(deps.ontology);
        const applied = await deps.ontology.apply(
          ChangeSet.parse({
            format: 1,
            baseVersion: version,
            operations: [
              { op: "deprecateProperty", type: "Book", property: "rating" },
              ...["createBook", "updateBook"].map((name) => {
                return {
                  op: "replaceActionType",
                  actionType: {
                    name,
                    kind: name === "createBook" ? "create" : "update",
                    type: "Book",
                    fields: ["title", "author", "status"],
                  },
                };
              }),
            ],
          }),
        );

        if (applied.kind !== "applied") {
          throw new Error(
            `dropping the rating was refused: ${JSON.stringify(applied)}`,
          );
        }
      });
      await settle();
    },
    settle,
  };
}

/** What a harness drew, and a way to draw it again with other props. */
interface Shown {
  container: HTMLElement;
  update: (children: ReactNode) => void;
}

/** How many turns of the microtask queue a settle lets run: enough for a store's answer to reach the screen. */
const SETTLING_TURNS = 10;

/** Who signs up in a shell's test. */
export const BUILDER = {
  email: "builder@origamic.test",
  password: "a-long-password-1",
};

/** The book tracker's proposal at `index`: 0 the app, 1 its date finished. */
function createProposal(index: number): Proposal {
  return index === 0
    ? Proposal.parse({
        explanation: "A tracker for your books.",
        changeSet: createBookChange(),
        app: createBookApp(),
      })
    : Proposal.parse({
        explanation: "A date finished on Book.",
        changeSet: createDateFinishedChange(),
        app: createDateFinishedApp(),
      });
}

/** What the model sends for a proposal: its progress, then the proposal. */
function createReply(proposal: Proposal): GenerationEvent[] {
  return [
    { kind: "progress", message: "Reading your ontology" },
    { kind: "proposal", proposal },
  ];
}

function changeSetOf(proposal: Proposal): ChangeSet {
  if (proposal.changeSet === null) {
    throw new Error("the proposal changes no ontology");
  }

  return proposal.changeSet;
}

/** The ontology as the store holds it now. */
function currentOf(store: OntologyStorePort): Promise<Ontology> {
  return new Promise((resolve, reject) => {
    const subscription = store.current().subscribe({
      next: (ontology: Ontology): void => {
        resolve(ontology);
        queueMicrotask(() => {
          subscription.unsubscribe();
        });
      },
      error: reject,
    });
  });
}
