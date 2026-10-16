import { useEffect, useState } from "react";
import type { Observable } from "rxjs";

/**
 * The latest value of the observable `open(...args)` returns, and `initial`
 * until it first emits. It is opened when the component mounts, opened afresh
 * when `open` or one of `args` changes (the last value stays until the new
 * one emits), and closed when the component unmounts. Give it a function that keeps its identity between renders (one
 * declared at a module's top, or made once), and the values it is opened
 * from. A failure it ends with is thrown where the component renders, for an
 * error boundary to catch.
 */
export function useObservable<T, A extends readonly unknown[]>(
  open: (...args: A) => Observable<T>,
  args: A,
  initial: T,
): T {
  const [latest, setLatest] = useState<Latest<T>>({ value: initial });
  const [failure, setFailure] = useState<Error | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect reads `open` and each of `args`, which the list spreads; the rule reads `args` as one value
  useEffect(() => {
    const subscription = open(...args).subscribe({
      next: (value: T): void => {
        setLatest({ value });
      },
      error: (error: unknown): void => {
        setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    });

    return (): void => {
      subscription.unsubscribe();
    };
  }, [open, ...args]);

  if (failure !== null) {
    throw failure;
  }

  return latest.value;
}

/** The latest value, boxed, so a value that is itself a function is kept, not called as React's updater. */
interface Latest<T> {
  value: T;
}
