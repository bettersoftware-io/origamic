// Part of shadcn's table (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/table.json.
// Its footer and caption are not used, so they are not copied (ADR-0010).
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

export function TableCell({
  className,
  ...props
}: ComponentProps<"td">): ReactElement {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}
