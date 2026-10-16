// Part of shadcn's table (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/table.json.
// Its footer and caption are not used, so they are not copied (ADR-0010).
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

export function TableRow({
  className,
  ...props
}: ComponentProps<"tr">): ReactElement {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
