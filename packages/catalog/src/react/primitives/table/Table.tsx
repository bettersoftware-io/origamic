// Part of shadcn's table (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/table.json.
// Its footer and caption are not used, so they are not copied (ADR-0010).
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

export function Table({
  className,
  ...props
}: ComponentProps<"table">): ReactElement {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}
