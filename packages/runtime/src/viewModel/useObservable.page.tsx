import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { type Observable, Subject } from "rxjs";

import { useObservable } from "./useObservable.ts";

/** What a test can do with, and ask of, a component that watches one of several named sources. */
export interface WatcherPage {
  shown: () => string;
  emit: (source: string, value: string) => Promise<void>;
  /** Ends the source with `failure`. Rejects with what the component threw. */
  fail: (source: string, failure: unknown) => Promise<void>;
  /** Has the component watch another source. */
  watch: (source: string) => Promise<void>;
  isOpen: (source: string) => boolean;
  unmount: () => Promise<void>;
}

/** Mounts a component that shows the latest value of the source it is told to watch. */
export function mountWatcher(source: string): WatcherPage {
  const sources = new Map<string, Subject<string>>();

  function sourceOf(name: string): Subject<string> {
    const found = sources.get(name) ?? new Subject<string>();

    sources.set(name, found);

    return found;
  }

  function open(name: string): Observable<string> {
    return sourceOf(name).asObservable();
  }

  const rendered = render(<Watcher open={open} source={source} />);

  return {
    shown: (): string => {
      return rendered.container.textContent;
    },
    emit: async (name: string, value: string): Promise<void> => {
      await act(async () => {
        sourceOf(name).next(value);
      });
    },
    fail: async (name: string, failure: unknown): Promise<void> => {
      await act(async () => {
        sourceOf(name).error(failure);
      });
    },
    watch: async (name: string): Promise<void> => {
      await act(async () => {
        rendered.rerender(<Watcher open={open} source={name} />);
      });
    },
    isOpen: (name: string): boolean => {
      return sourceOf(name).observed;
    },
    unmount: async (): Promise<void> => {
      await act(async () => {
        rendered.unmount();
      });
    },
  };
}

interface WatcherProps {
  open: (source: string) => Observable<string>;
  source: string;
}

function Watcher({ open, source }: WatcherProps): ReactElement {
  return <output>{useObservable(open, [source], "nothing yet")}</output>;
}
