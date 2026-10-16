import { type ReactElement, useId } from "react";

import type { Select as SelectContract } from "#/contract/components/select.ts";
import type { PropsOf } from "#/contract/defineComponent.ts";

import type { Envelope } from "./envelope.ts";
import { Label } from "./primitives/Label.tsx";
import { Select as SelectRoot } from "./primitives/select/Select.tsx";
import { SelectContent } from "./primitives/select/SelectContent.tsx";
import { SelectItem } from "./primitives/select/SelectItem.tsx";
import { SelectTrigger } from "./primitives/select/SelectTrigger.tsx";
import { SelectValue } from "./primitives/select/SelectValue.tsx";
import { PARTS, partTestId } from "./testIds.ts";

/** Choose one of a few options; emits the chosen value, or null for the empty choice. */
export function Select({
  props,
  emit,
  testId,
}: Envelope<SelectProps>): ReactElement {
  const id = useId();
  const choices = choicesOf(props);

  function choose(key: string): void {
    const chosen = choices.find((choice) => {
      return choice.key === key;
    });

    emit("change", { value: chosen?.value ?? null });
  }

  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <Label htmlFor={id}>{props.label}</Label>
      <SelectRoot value={keyOf(choices, props.value)} onValueChange={choose}>
        <SelectTrigger id={id} data-testid={partTestId(testId, PARTS.trigger)}>
          <SelectValue placeholder={props.label} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => {
            return (
              <SelectItem key={choice.key} value={choice.key}>
                {choice.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}

type SelectProps = PropsOf<typeof SelectContract>;

/** One choice the Select offers: the key its item carries, what it shows, and the value it emits. */
interface Choice {
  key: string;
  label: string;
  value: string | null;
}

/** The empty choice's key. An option's key is its index, so the two never meet. */
const EMPTY = "empty";

function choicesOf({ options, emptyLabel }: SelectProps): Choice[] {
  const offered = options.map((option, index) => {
    return { key: String(index), label: option, value: option };
  });

  return emptyLabel === undefined
    ? offered
    : [{ key: EMPTY, label: emptyLabel, value: null }, ...offered];
}

/** The key of the choice that holds `value`, or none, which shows the label. */
function keyOf(choices: readonly Choice[], value: string | null): string {
  const held = choices.find((choice) => {
    return choice.value === value;
  });

  return held?.key ?? "";
}
