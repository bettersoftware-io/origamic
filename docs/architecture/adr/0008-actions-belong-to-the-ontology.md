# ADR-0008: Actions belong to the ontology

Status: accepted · 2026-10-14

## Context
The glossary put `ActionType` in the ontology; the vision's table, the
definition of an app and the schema skeleton put actions in the app. An
invocation named an action without an app, which only works if actions are
global. The skeleton's action input had five types where the ontology has
eight, so a rating (an integer) and a status (an enum) could not be written,
and its rules restated what the ontology already says about a property
([review](../reviews/2026-10-14-first-reading.md), items 3 and 9).

## Decision
An action type is part of the ontology, defined once for every app that uses
it, and versioned on its own (ADR-0005).

- **It says what it writes:** its kind (`create`, `update`, `delete`,
  `link`), the object type or link type it writes, and which properties of
  that type its input sets. An `update` and a `delete` also take the id of
  the object.
- **Its input takes its types from those properties.** Whatever the
  ontology can say about a property (its type, its enum values, whether it is
  required) is not said again by the action.
- **Its rules say only what the ontology cannot:** a property optional on the
  type that this action requires, and a range for a number. A range for a
  date waits for a use that needs it.
- **An app lists the actions it invokes, as `name@version`.** Its UI spec
  invokes them by name, resolved through that list.
- **Inside one version of the ontology, definitions name each other by name:**
  an action its type, a link type its two ends. "Never a bare name" is the
  rule for anything outside the ontology that points into it.

## Consequences
Two apps over `Book` share `createBook`. The actions of an ontology are the
list of everything that can change, which is what makes them a candidate for
tools (MCP) later. A change to a type that an action sets, such as a property
deprecated, needs a new version of the action, by a `replaceActionType`
operation in the same change set.
