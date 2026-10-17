import { Component, type ReactNode } from "react";

import { messageOf } from "./forms.ts";
import { TESTIDS } from "./testids.ts";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  /** Why the shell could not be drawn, or `null` while it can. */
  failure: string | null;
}

/**
 * What the shell shows when a stream of the core fails: the view model
 * throws the failure where its value is read, and this says why in place of
 * a blank page. Reloading starts the streams afresh.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failure: messageOf(error) };
  }

  override render(): ReactNode {
    if (this.state.failure === null) {
      return this.props.children;
    }

    return (
      <p
        data-testid={TESTIDS.failure}
        role="alert"
        className="p-6 text-sm text-destructive"
      >
        Origamic stopped: {this.state.failure}. Reload the page to start again.
      </p>
    );
  }
}
