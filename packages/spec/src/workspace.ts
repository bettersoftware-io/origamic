import { z } from "zod";
import { Id, SemVerish } from "./common";

export const PanelRef = z.object({ appId: Id, appVersion: SemVerish });

export const Workspace = z.object({
  id: Id,
  version: SemVerish,
  name: z.string().min(1),
  panels: z.record(Id, PanelRef),
  /** dockview's serialised layout; opaque to everything but the shell. */
  layout: z.unknown(),
});
export type Workspace = z.infer<typeof Workspace>;
