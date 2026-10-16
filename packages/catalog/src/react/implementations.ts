import type { ComponentType } from "react";

import type { Envelope } from "./envelope.ts";
import { Form } from "./Form.tsx";
import { Select } from "./Select.tsx";
import { Stack } from "./Stack.tsx";
import { Table } from "./Table.tsx";
import { Text } from "./Text.tsx";

/**
 * The React component that implements each contract, by the contract's name
 * (ADR-0010). Each takes its own props; the runtime hands it what its
 * contract's schemas accepted.
 */
export const implementations: Readonly<
  Record<string, ComponentType<Envelope<never>>>
> = { Stack, Text, Select, Table, Form };
