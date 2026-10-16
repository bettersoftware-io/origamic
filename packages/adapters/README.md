# @origamic/adapters

The real implementations of the core's ports: Supabase, and the client of the LLM gateway. The only package that knows a table.

Empty until the first slice
([FIRST-SLICE.md](../../docs/architecture/FIRST-SLICE.md)). What it may
import is in [ARCHITECTURE.md](../../docs/architecture/ARCHITECTURE.md) and
is held by `architecture.config.mts`.

`supabase/` holds the local Supabase's config and the SQL migrations. The
tests named `*.supabase.test.ts` run against it, and need Docker: see
`tools/supabase/localSupabase.mts`. `pnpm --filter @origamic/adapters
supabase <command>` runs the pinned CLI on it, such as `stop` or `db reset
--local`.
