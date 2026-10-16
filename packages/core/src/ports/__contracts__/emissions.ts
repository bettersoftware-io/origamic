import type { Observable } from "rxjs";

/** Every emission of a stream so far, and a way to wait for the next one. */
export interface Collected<T> {
  emissions: T[];
  /** Resolves once the stream has emitted one more time than the calls before this one waited for. */
  next: () => Promise<void>;
  stop: () => void;
}

/**
 * Keeps every emission of `source`, so a contract can wait for each in turn
 * and then look at all of them. An adapter may emit later than a simulator
 * (after a query), so a contract waits rather than reading at once.
 */
export function collect<T>(source: Observable<T>): Collected<T> {
  const emissions: T[] = [];
  let awaited = 0;
  let wake: (() => void) | undefined;
  const subscription = source.subscribe((value) => {
    emissions.push(value);
    wake?.();
  });

  return {
    emissions,
    next: async (): Promise<void> => {
      while (emissions.length <= awaited) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }

      awaited += 1;
    },
    stop: (): void => {
      subscription.unsubscribe();
    },
  };
}
