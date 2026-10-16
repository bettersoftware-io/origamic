import type { ReactElement } from "react";

import type { JsonValue } from "@origamic/spec";

import type { Table as TableContract } from "#/contract/components/table.ts";
import type { PropsOf } from "#/contract/defineComponent.ts";
import type { Row } from "#/contract/props.ts";

import type { Envelope } from "./envelope.ts";
import { Table as TableRoot } from "./primitives/table/Table.tsx";
import { TableBody } from "./primitives/table/TableBody.tsx";
import { TableCell } from "./primitives/table/TableCell.tsx";
import { TableHead } from "./primitives/table/TableHead.tsx";
import { TableHeader } from "./primitives/table/TableHeader.tsx";
import { TableRow } from "./primitives/table/TableRow.tsx";
import { PARTS, partTestId } from "./testIds.ts";

/** The rows of a view, a column per property; clicking a row emits its id and values. */
export function Table({
  props,
  emit,
  testId,
}: Envelope<TableProps>): ReactElement {
  function selectRow(row: Row): void {
    emit("select", { id: row.id, values: row.values });
  }

  return (
    <TableRoot data-testid={testId}>
      <TableHeader>
        <TableRow>
          {props.columns.map((column) => {
            return <TableHead key={column.property}>{column.label}</TableHead>;
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row) => {
          return (
            <RowView
              key={row.id}
              row={row}
              columns={props.columns}
              selected={row.id === props.selected}
              testId={partTestId(partTestId(testId, PARTS.row), row.id)}
              onSelect={selectRow}
            />
          );
        })}
      </TableBody>
    </TableRoot>
  );
}

type TableProps = PropsOf<typeof TableContract>;
type Column = TableProps["columns"][number];

interface RowViewProps {
  row: Row;
  columns: readonly Column[];
  selected: boolean;
  testId: string;
  onSelect: (row: Row) => void;
}

function RowView({
  row,
  columns,
  selected,
  testId,
  onSelect,
}: RowViewProps): ReactElement {
  function selectRow(): void {
    onSelect(row);
  }

  return (
    <TableRow
      data-testid={testId}
      data-state={selected ? "selected" : undefined}
      aria-selected={selected}
      onClick={selectRow}
    >
      {columns.map((column) => {
        return (
          <TableCell key={column.property}>
            {shown(
              Object.hasOwn(row.values, column.property)
                ? row.values[column.property]
                : null,
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/** A value as a cell shows it. A value the row lacks shows nothing: an object written before its type had the property (review focus 5). */
function shown(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }

  return value === null ? "" : JSON.stringify(value);
}
