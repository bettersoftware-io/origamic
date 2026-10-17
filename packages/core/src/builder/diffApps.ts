import type { AppDraft } from "@origamic/spec";

/** What a revision does to an app, one line per thing it touches: "element table", "view books", "binding Book@1 → Book@2". */
export interface AppDiff {
  added: readonly string[];
  removed: readonly string[];
  changed: readonly string[];
}

/**
 * The difference between an app and a revision of it, by its name, its
 * root, its bindings, and its elements, views and state keys, each by id.
 * A binding whose version moves is changed, not removed and added. A new
 * app (`before` is `null`) adds everything it has. The order of keys in a
 * spec is not a difference.
 */
export function diffApps(before: AppDraft | null, after: AppDraft): AppDiff {
  const diff: Diff = { added: [], removed: [], changed: [] };

  if (before !== null && before.name !== after.name) {
    diff.changed.push(`name ${before.name} → ${after.name}`);
  }

  if (before !== null && before.ui.root !== after.ui.root) {
    diff.changed.push(`root ${before.ui.root} → ${after.ui.root}`);
  }

  compareBindings(
    diff,
    typeVersions(before?.bindings.types ?? []),
    typeVersions(after.bindings.types),
  );
  compareBindings(
    diff,
    actionVersions(before?.bindings.actions ?? []),
    actionVersions(after.bindings.actions),
  );
  compareRecords(diff, "element", before?.ui.elements ?? {}, after.ui.elements);
  compareRecords(diff, "view", before?.ui.views ?? {}, after.ui.views);
  compareRecords(diff, "state", before?.ui.state ?? {}, after.ui.state);

  return diff;
}

interface Diff {
  added: string[];
  removed: string[];
  changed: string[];
}

type Versions = ReadonlyMap<string, number>;

interface TypeBinding {
  type: string;
  version: number;
}

interface ActionBinding {
  action: string;
  version: number;
}

function typeVersions(refs: readonly TypeBinding[]): Versions {
  return new Map(
    refs.map((ref) => {
      return [ref.type, ref.version];
    }),
  );
}

function actionVersions(refs: readonly ActionBinding[]): Versions {
  return new Map(
    refs.map((ref) => {
      return [ref.action, ref.version];
    }),
  );
}

function compareBindings(diff: Diff, before: Versions, after: Versions): void {
  for (const [name, version] of after) {
    const old = before.get(name);

    if (old === undefined) {
      diff.added.push(`binding ${name}@${version}`);
    } else if (old !== version) {
      diff.changed.push(`binding ${name}@${old} → ${name}@${version}`);
    }
  }

  for (const [name, version] of before) {
    if (!after.has(name)) {
      diff.removed.push(`binding ${name}@${version}`);
    }
  }
}

/** Each entry of two records by key: added, removed, or changed when its value differs. */
function compareRecords<T>(
  diff: Diff,
  what: string,
  before: Readonly<Record<string, T>>,
  after: Readonly<Record<string, T>>,
): void {
  for (const [id, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, id)) {
      diff.added.push(`${what} ${id}`);
    } else if (!sameJson(before[id], value)) {
      diff.changed.push(`${what} ${id}`);
    }
  }

  for (const id of Object.keys(before)) {
    if (!Object.hasOwn(after, id)) {
      diff.removed.push(`${what} ${id}`);
    }
  }
}

/** Two parsed specs are the same when their JSON is, whatever the order of their keys. */
function sameJson(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown): unknown => {
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
      return inner;
    }

    return Object.fromEntries(
      Object.entries(inner).sort(([left], [right]) => {
        return left < right ? -1 : left > right ? 1 : 0;
      }),
    );
  });
}
