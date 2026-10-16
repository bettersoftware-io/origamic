// Part of shadcn's table (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/table.json.
// Its footer and caption are not used, so they are not copied (ADR-0010).
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

export function TableHead({
  className,
  ...props
}: ComponentProps<"th">): ReactElement {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}
