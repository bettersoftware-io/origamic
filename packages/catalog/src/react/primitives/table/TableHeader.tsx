// Part of shadcn's table (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/table.json.
// Its footer and caption are not used, so they are not copied (ADR-0010).
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

export function TableHeader({
  className,
  ...props
}: ComponentProps<"thead">): ReactElement {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}
