import type { Observable } from "rxjs";

/** Every emission of a stream so far, and a way to wait for the next one. */
export interface Collected<T> {
  emissions: T[];
  /** Resolves once the stream has emitted one more time than the calls before this one waited for; rejects, saying so, when the stream fails or completes first. */
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
  let ended: Error | undefined;
  let wake: (() => void) | undefined;
  const subscription = source.subscribe({
    next: (value: T): void => {
      emissions.push(value);
      wake?.();
    },
    error: (error: unknown): void => {
      ended = new Error(
        `the stream failed after ${emissions.length} emission(s): ${String(error)}`,
      );
      wake?.();
    },
    complete: (): void => {
      ended = new Error(
        `the stream completed after ${emissions.length} emission(s), and a contract waited for another`,
      );
      wake?.();
    },
  });

  return {
    emissions,
    next: async (): Promise<void> => {
      while (emissions.length <= awaited) {
        if (ended !== undefined) {
          throw ended;
        }

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
