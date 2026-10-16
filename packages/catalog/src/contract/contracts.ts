import { Form } from "./components/form.ts";
import { Select } from "./components/select.ts";
import { Stack } from "./components/stack.ts";
import { Table } from "./components/table.ts";
import { Text } from "./components/text.ts";

/** The five components a UI spec may name (ADR-0010), by name. */
export const contracts = { Stack, Text, Select, Table, Form } as const;
