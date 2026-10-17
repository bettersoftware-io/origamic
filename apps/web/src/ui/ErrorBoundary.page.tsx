import { render, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { TESTIDS } from "./testids.ts";

/** What a test varies: whether what the boundary holds fails to draw, and with what. */
export interface ErrorBoundaryPageProps {
  fails?: string;
}

/** What a test can ask of the boundary. */
export interface ErrorBoundaryPage {
  /** What it says in place of what it holds, or null when it says nothing. */
  failure: () => string | null;
  /** Whether what it holds is drawn. */
  showsChild: () => boolean;
}

export function mountErrorBoundary({
  fails,
}: ErrorBoundaryPageProps = {}): ErrorBoundaryPage {
  // React prints the error a boundary catches; the page reads it instead.
  vi.spyOn(console, "error").mockImplementation(() => {});

  const view = within(
    render(
      <ErrorBoundary>
        <Child fails={fails} />
      </ErrorBoundary>,
    ).container,
  );

  return {
    failure: (): string | null => {
      return view.queryByTestId(TESTIDS.failure)?.textContent ?? null;
    },
    showsChild: (): boolean => {
      return view.queryByText("the shell") !== null;
    },
  };
}

interface ChildProps {
  fails: string | undefined;
}

/** Stands for the shell: it draws, or throws as a view model's hook does when its stream failed. */
function Child({ fails }: ChildProps): ReactElement {
  if (fails !== undefined) {
    throw new Error(fails);
  }

  return <p>the shell</p>;
}
