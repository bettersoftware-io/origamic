import {
  type DockviewApi,
  DockviewComponent,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  themeLight,
} from "dockview";
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { Break, LibraryEntry } from "@origamic/core";
import { AppView, type PinnedApp, useShellViewModel } from "@origamic/runtime";
import type { App, Workspace as WorkspaceSpec } from "@origamic/spec";

import { toDockviewSteps } from "./dockviewSteps.ts";
import { panelTestId, TESTIDS } from "./testids.ts";

/**
 * The owner's workspace in dockview: a panel for each app it pins, each
 * hosting the app at the version it pins (ADR-0003). Dockview holds where
 * the panels are while they are shown; the workspace saves a new version on
 * adding or closing a panel and on moving a pin, not on a drag or a resize
 * (the plan's decision 11). It reads the view model and hands plain props
 * to the dock, which the React Compiler compiles.
 */
export function Workspace({ onActivePanel }: WorkspaceProps): ReactElement {
  const { useWorkspace, useWorkspaceProblem, useLibrary, useIntents } =
    useShellViewModel();
  const { closePanel } = useIntents();
  const workspace = useWorkspace();
  const problem = useWorkspaceProblem();
  const library = useLibrary();

  if (problem !== null || workspace === null) {
    return (
      <p
        data-testid={TESTIDS.workspaceNotice}
        role={problem === null ? "status" : "alert"}
        className="p-6 text-sm text-muted-foreground"
      >
        {problem ?? "Opening your workspace…"}
      </p>
    );
  }

  return (
    <Dock
      workspace={workspace}
      library={library}
      onClosePanel={closePanel}
      onActivePanel={onActivePanel}
    />
  );
}

export interface WorkspaceProps {
  /** Told the panel that became active, or `null` when none is. */
  onActivePanel: (panel: string | null) => void;
}

/** What dockview names the one kind of panel the shell has. */
const APP_PANEL = "app";

interface DockProps {
  workspace: WorkspaceSpec;
  library: readonly LibraryEntry[];
  onClosePanel: (panel: string) => Promise<void>;
  onActivePanel: (panel: string | null) => void;
}

/**
 * Dockview, kept in step with the workspace: a panel the workspace no
 * longer has is removed, one it gained is added where the layout puts it,
 * and one whose pin moved is renamed. A panel stays mounted while its pin
 * moves, so what its app holds (a filter, a draft) is kept. Each panel's
 * content is drawn into the element dockview gives it, as a portal, so it
 * reads the view model like the rest of the shell.
 */
function Dock({
  workspace,
  library,
  onClosePanel,
  onActivePanel,
}: DockProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  /** Dockview, made once the element it fills is on the page. The effects below read it in the order they are written, after it is made. */
  const dock = useRef<DockviewApi | null>(null);
  const keeping = useRef(false);
  const [contents, setContents] = useState<ReadonlyMap<string, HTMLElement>>(
    () => {
      return new Map();
    },
  );
  useEffect(() => {
    const element = host.current;

    // React puts the element on the page before it runs an effect.
    if (element === null) {
      return undefined;
    }

    const created = new DockviewComponent(element, {
      theme: themeLight,
      disableFloatingGroups: true,
      createComponent: (): IContentRenderer => {
        const content = document.createElement("div");

        content.className = "panel-content";

        return {
          element: content,
          init: ({ api }: GroupPanelPartInitParameters): void => {
            const { id } = api;

            setContents((shown) => {
              return new Map(shown).set(id, content);
            });
          },
          dispose: (): void => {
            setContents((shown) => {
              return withoutElement(shown, content);
            });
          },
        };
      },
    });

    dock.current = created.api;

    return (): void => {
      created.dispose();
      dock.current = null;
    };
  }, []);

  useEffect(() => {
    const api = dock.current;

    if (api === null) {
      return undefined;
    }

    const activated = api.onDidActivePanelChange(({ panel }) => {
      onActivePanel(panel?.id ?? null);
    });

    // A panel closed from its tab: dockview has removed it, and the
    // workspace saves the version without it. A removal of the dock's own,
    // to keep in step, is not one, nor is a panel dragged elsewhere (dockview
    // says nothing of it).
    const removed = api.onDidRemovePanel((panel) => {
      if (!keeping.current) {
        // The workspace says how the close went: it no longer pins the
        // panel, or, when the save failed, still does.
        void onClosePanel(panel.id);
      }
    });

    return (): void => {
      activated.dispose();
      removed.dispose();
    };
  }, [onActivePanel, onClosePanel]);

  useEffect(() => {
    const api = dock.current;

    if (api !== null) {
      keepInStep({ dock: api, workspace, library, keeping });
    }
  }, [workspace, library]);

  return (
    <div className="relative h-full min-h-96" data-testid={TESTIDS.workspace}>
      {workspace.layout === null ? (
        <p
          data-testid={TESTIDS.workspaceNotice}
          className="absolute inset-0 z-10 p-6 text-sm text-muted-foreground"
        >
          No panel open. Ask the builder for an app, or open one from the
          library.
        </p>
      ) : null}
      <div ref={host} className="dock" />
      {[...contents].map(([panel, element]) => {
        const pin = Object.hasOwn(workspace.panels, panel)
          ? workspace.panels[panel]
          : undefined;

        return pin === undefined
          ? null
          : createPortal(
              <PanelContent
                panel={panel}
                app={pin.app}
                version={pin.appVersion}
              />,
              element,
              panel,
            );
      })}
    </div>
  );
}

interface PanelContentProps {
  panel: string;
  app: string;
  version: number;
}

/** A panel: the app it pins, read at that version. It reads the view model and hands plain props on. */
function PanelContent({
  panel,
  app,
  version,
}: PanelContentProps): ReactElement {
  const { usePinnedApp } = useShellViewModel();
  const pinned = usePinnedApp(app, version);

  return (
    <PinnedView panel={panel} app={app} version={version} pinned={pinned} />
  );
}

interface PinnedViewProps extends PanelContentProps {
  pinned: PinnedApp;
}

/** The app, under a caption that names it and its version; or its compatibility report in its place (ADR-0005); or why it is not shown. */
function PinnedView({
  panel,
  app,
  version,
  pinned,
}: PinnedViewProps): ReactElement {
  const name = pinned.kind === "loaded" ? pinned.app.name : app;

  return (
    <article
      data-testid={panelTestId(panel)}
      className="flex flex-col gap-3 p-4"
    >
      <p
        data-testid={TESTIDS.panelCaption}
        data-version={version}
        className="text-xs text-muted-foreground"
      >
        {name} · version {String(version)}
      </p>
      <PinnedBody pinned={pinned} app={app} version={version} />
    </article>
  );
}

interface PinnedBodyProps {
  pinned: PinnedApp;
  app: string;
  version: number;
}

function PinnedBody({ pinned, app, version }: PinnedBodyProps): ReactElement {
  switch (pinned.kind) {
    case "loading":
      return <Notice text="Loading…" />;

    case "missing":
      return (
        <Notice
          text={`The library has no ${app} at version ${String(version)}.`}
        />
      );

    case "failed":
      return <Notice text={`The app could not be read: ${pinned.message}`} />;

    case "loaded":
      return pinned.compatibility.kind === "compatible" ? (
        <OpenApp app={pinned.app} />
      ) : (
        <CompatibilityReport breaks={pinned.compatibility.breaks} />
      );
  }
}

interface NoticeProps {
  text: string;
}

function Notice({ text }: NoticeProps): ReactElement {
  return (
    <p
      data-testid={TESTIDS.panelNotice}
      role="status"
      className="text-sm text-muted-foreground"
    >
      {text}
    </p>
  );
}

interface OpenAppProps {
  app: App;
}

/** The app drawn over the catalog, on a session open while it is shown. */
function OpenApp({ app }: OpenAppProps): ReactElement {
  const { useAppSession } = useShellViewModel();
  const session = useAppSession(app);

  return <AppView app={app} session={session} />;
}

interface CompatibilityReportProps {
  breaks: readonly Break[];
}

/** What the app binds that the ontology no longer supports, shown in the app's place: the builder can ask for a revision from it. */
function CompatibilityReport({
  breaks,
}: CompatibilityReportProps): ReactElement {
  return (
    <section
      data-testid={TESTIDS.compatibilityReport}
      role="alert"
      className="flex flex-col gap-1 text-sm"
    >
      <p>
        This version of the app no longer fits your ontology. Ask the builder to
        revise it.
      </p>
      <ul className="list-disc pl-5">
        {breaks.map((each) => {
          const what =
            each.property === undefined
              ? each.binding
              : `${each.binding}: ${each.property}`;

          return (
            <li
              key={`${what} ${each.reason}`}
            >{`${what} is ${each.reason}`}</li>
          );
        })}
      </ul>
    </section>
  );
}

/** What keeping dockview in step with the workspace reads and writes. */
interface InStep {
  dock: DockviewApi;
  workspace: WorkspaceSpec;
  library: readonly LibraryEntry[];
  /** Set while the dock removes a panel of its own accord, so that the removal is not taken for a person's close. */
  keeping: RefObject<boolean>;
}

/** Removes the panels the workspace no longer has, adds those it gained where its layout puts them, and renames those whose pin moved. */
function keepInStep({ dock, workspace, library, keeping }: InStep): void {
  const steps =
    workspace.layout === null
      ? []
      : toDockviewSteps(workspace.layout, titlesOf(workspace, library));

  keeping.current = true;

  try {
    for (const panel of dock.panels) {
      if (!Object.hasOwn(workspace.panels, panel.id)) {
        dock.removePanel(panel);
      }
    }

    for (const step of steps) {
      const shown = dock.getPanel(step.panel);

      if (shown === undefined) {
        dock.addPanel({
          id: step.panel,
          component: APP_PANEL,
          title: step.title,
          ...(step.position === undefined ? {} : { position: step.position }),
        });
      } else if (shown.title !== step.title) {
        shown.api.setTitle(step.title);
      }
    }
  } finally {
    keeping.current = false;
  }
}

/** Each panel's title: its app's name and the version it pins. A name is the library's, at the app's latest version. */
function titlesOf(
  workspace: WorkspaceSpec,
  library: readonly LibraryEntry[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(workspace.panels).map(([panel, pin]) => {
      const name =
        library.find((entry) => {
          return entry.id === pin.app;
        })?.name ?? pin.app;

      return [panel, `${name} v${String(pin.appVersion)}`];
    }),
  );
}

/** The panels' elements without one dockview disposed of. */
function withoutElement(
  shown: ReadonlyMap<string, HTMLElement>,
  element: HTMLElement,
): ReadonlyMap<string, HTMLElement> {
  return new Map(
    [...shown].filter(([, each]) => {
      return each !== element;
    }),
  );
}
