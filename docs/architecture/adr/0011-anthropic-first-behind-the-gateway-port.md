# ADR-0011: Anthropic's models first, behind the `LlmGateway` port

Status: accepted · 2026-10-14

## Context
No document named the model. The provider matters before any code is
written, because its guaranteed-schema mode limits the shapes the model can
be held to, and so the shapes of the specs
([review](../reviews/2026-10-14-first-reading.md), item 27).

## Decision
Origamic starts on Anthropic's models, called from the gateway with the
official SDK (`@anthropic-ai/sdk`). The model is the gateway's configuration,
not code; it starts on `claude-opus-5-5`. The port `LlmGateway` names no
provider, so a second one is an adapter on the gateway's side, not a change
above it.

The gateway asks for a spec through structured outputs
(`output_config.format`), not by forcing a tool call: the current Opus
models refuse a forced `tool_choice`.

### What Anthropic's structured outputs accept (read 2026-10-14)

From [the structured outputs page](https://platform.claude.com/docs/en/build-with-claude/structured-outputs):

- **No recursive schema.** A schema whose definition refers to itself, such
  as a node whose `children` are nodes, is not accepted.
- **Every object has `additionalProperties: false`.** An open record (props
  as "any key, any value", a layout as "unknown") cannot be required.
- `anyOf`, `enum`, `const`, and `$ref` to a definition that does not refer to
  itself are accepted.
- Numeric and length limits (`minimum`, `maxLength`, …) are not part of what
  the API holds the model to. The SDK checks them on the reply.

The limit applies to the guaranteed mode only. Without it a model writes a
tree when asked, and the reply is checked afterwards.

How the other two large providers compared, the same day:
[OpenAI's structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
accept a recursive schema (its own UI-generation example is one).
[Gemini](https://blog.google/technology/developers/gemini-api-structured-outputs/)
added recursive `$ref` in November 2025, only on a property that is not
required, and unrolled to a limited depth; that is from Google's announcement
and its developer forum, not its main documentation, which was not read.

### How the gateway asks (decided in the first slice)

Decision 10 of [the first slice's plan](../plans/2026-10-16-first-slice.md):
the gateway asks `claude-opus-5-5` at effort `high`, with adaptive thinking
and structured outputs, streamed (`client.beta.messages.stream`, then
`finalMessage()`), with Anthropic's server-side fallback when the model
declines (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
The model and the effort are the gateway's configuration
(`GATEWAY_MODEL`, `GATEWAY_EFFORT`), not code. The reply's stop reason is
read before its content: a refusal or a reply cut short is a `failed`
event that says which, and is not retried. After a fallback, only the text
after the last `fallback` block is the reply. A generation has a deadline
(`GATEWAY_DEADLINE_SECONDS`, five minutes when unset), and its model call
is aborted when the deadline passes or the caller leaves. An error the API
answers with is logged by the gateway (status, type, request id) and told
to the builder as one of two things: a request the API refuses (a 4xx: a
bad key, an unknown model, a schema it does not take) means the gateway is
misconfigured; a connection that fails, a 429 or a 5xx means try again.
The gateway asks the API for its model when it starts, so a wrong key or
model stops it there.

Decision 3: the model names the types and actions an app binds, without
versions. The gateway applies the change set to get the ontology the app
will run on, and binds each name at its version there. The stored app
carries versions as before; only the model's half of the wire has none.

The schema the API is sent is the catalog's (`generationSchema()`) with
what the API does not hold left out (`apps/gateway/src/anthropicSchema.ts`):
a length, a bound, a pattern, a default, a `minItems` above 1 and a format
it does not know go into the node's description instead, where the model
still reads them, and a type written as a list becomes an `anyOf`.
`readGenerated` checks every one of them on the reply. The SDK's own
`transformJSONSchema` is not used: it also moves `const` and `enum` into the
description, which would free the `component` and `do` that tell elements
and handlers apart.

A reply with problems goes back once as a user message that quotes the reply
and each problem with its path, not as an assistant turn: a replayed
assistant turn without the thinking blocks of the reply it stands for may be
refused by a model that checks them.

## Consequences
- The UI spec is flat (ADR-0002), and the schema the model is held to is
  built from the catalog's contracts, one closed object per component
  (ADR-0006, ADR-0010).
- The reference checks still run on every reply, and the gateway retries
  once: no provider's schema mode can know whether `Book@2` exists.
- No test in the gate calls a model. Tests use a simulator of `LlmGateway`
  that replays scripted replies (ADR-0012); how well the real model builds
  is measured by an evaluation of its own, outside the gate.
- What each provider accepts changes between releases. This record keeps the
  reasons as well as the limit, so that the choice of a flat spec can be
  weighed again when it does.
