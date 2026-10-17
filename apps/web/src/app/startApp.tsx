import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createCore } from "@origamic/core";
import {
  createShellViewModel,
  ShellViewModelProvider,
} from "@origamic/runtime";

import { ErrorBoundary } from "../ui/ErrorBoundary.tsx";
import { Shell } from "../ui/Shell.tsx";
import { composePorts } from "./composePorts.ts";
import type { WebEnv } from "./env.ts";

/**
 * The composition root. It picks the adapters for the configuration, builds
 * the core and its view model once, and hands the view model to the shell.
 * Nothing else in the app does any of those things.
 */
export function startApp(env: WebEnv, root: HTMLElement): void {
  const viewModel = createShellViewModel(createCore(composePorts(env)));

  createRoot(root).render(
    <StrictMode>
      <ShellViewModelProvider viewModel={viewModel}>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </ShellViewModelProvider>
    </StrictMode>,
  );
}
