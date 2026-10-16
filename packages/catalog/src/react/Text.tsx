import type { ReactElement } from "react";

import type { Text as TextContract } from "#/contract/components/text.ts";
import type { PropsOf } from "#/contract/defineComponent.ts";

import type { Envelope } from "./envelope.ts";

/** Plain text: a heading, or a paragraph in the body's tone or a muted one. */
export function Text({ props, testId }: Envelope<TextProps>): ReactElement {
  const tone = props.tone ?? "body";

  if (tone === "heading") {
    return (
      <h2
        data-testid={testId}
        data-tone={tone}
        className="text-lg font-semibold"
      >
        {props.text}
      </h2>
    );
  }

  return (
    <p
      data-testid={testId}
      data-tone={tone}
      className={tone === "muted" ? "text-sm text-muted-foreground" : "text-sm"}
    >
      {props.text}
    </p>
  );
}

type TextProps = PropsOf<typeof TextContract>;
