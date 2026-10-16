import type { ComponentType } from "react";

import { contracts } from "#/contract/contracts.ts";
import type { Unchecked } from "#/contract/fits.ts";

import { checked } from "./checked.tsx";
import type { Envelope } from "./envelope.ts";
import { Form } from "./Form.tsx";
import { Select } from "./Select.tsx";
import { Stack } from "./Stack.tsx";
import { Table } from "./Table.tsx";
import { Text } from "./Text.tsx";

/**
 * The React component that implements each contract, by the contract's name
 * (ADR-0010). Each takes props as the runtime resolves them from a spec, and
 * draws its component only with what its contract's schemas accept: that
 * check is what turns a spec's values into a component's typed props.
 */
export const implementations: Readonly<
  Record<string, ComponentType<Envelope<Unchecked>>>
> = {
  Stack: checked(contracts.Stack, Stack),
  Text: checked(contracts.Text, Text),
  Select: checked(contracts.Select, Select),
  Table: checked(contracts.Table, Table),
  Form: checked(contracts.Form, Form),
};
