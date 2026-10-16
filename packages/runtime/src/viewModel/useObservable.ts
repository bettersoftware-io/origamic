import { useEffect, useState } from "react";
import type { Observable } from "rxjs";

/**
 * The latest value of the observable `open(...args)` returns, and `initial`
 * until it first emits. It is opened when the component mounts, opened afresh
 * when `open` or one of `args` changes (giving `initial` again until the new
 * one emits), and closed when the component unmounts. Give it a function
 * that keeps its identity between renders (one declared at a module's top,
 * or made once), and the values it is opened from. A failure it ends with
 * is thrown where the component renders, for an error boundary to catch.
 */
export function useObservable<T, A extends readonly unknown[]>(
  open: (...args: A) => Observable<T>,
  args: A,
  initial: T,
): T {
  const opened: readonly unknown[] = [open, ...args];
  const [latest, setLatest] = useState<Latest<T> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect reads `open` and each of `args`, which the list spreads; the rule reads `args` as one value
  useEffect(() => {
    const subscription = open(...args).subscribe({
      next: (value: T): void => {
        setLatest({ kind: "value", opened, value });
      },
      error: (error: unknown): void => {
        setLatest({
          kind: "failed",
          opened,
          failure: error instanceof Error ? error : new Error(String(error)),
        });
      },
    });

    return (): void => {
      subscription.unsubscribe();
    };
  }, [open, ...args]);

  // What the observable opened from other arguments gave is not this one's:
  // until this one emits, the component sees `initial`, never a value paired
  // with arguments it did not come from.
  if (latest === null || !sameAll(latest.opened, opened)) {
    return initial;
  }

  if (latest.kind === "failed") {
    throw latest.failure;
  }

  return latest.value;
}

/** The latest value or failure, with what the observable was opened from. Boxed, so a value that is itself a function is kept, not called as React's updater. */
type Latest<T> =
  | { kind: "value"; opened: readonly unknown[]; value: T }
  | { kind: "failed"; opened: readonly unknown[]; failure: Error };

function sameAll(left: readonly unknown[], right: readonly unknown[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => {
      return Object.is(value, right[index]);
    })
  );
}
