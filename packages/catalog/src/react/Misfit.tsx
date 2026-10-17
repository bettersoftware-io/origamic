import type { ReactElement } from "react";

import type { Problem } from "@origamic/spec";

/** What is drawn in place of a component whose props do not fit its contract. */
export function Misfit({ name, misfits, testId }: MisfitProps): ReactElement {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      <p>A &quot;{name}&quot; cannot show what it was given:</p>
      <ul className="list-disc pl-5">
        {misfits.map((misfit, index) => {
          return (
            <li key={`${misfit.path}#${String(index)}`}>
              {misfit.path}: {misfit.message}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface MisfitProps {
  name: string;
  misfits: readonly Problem[];
  testId: string;
}
