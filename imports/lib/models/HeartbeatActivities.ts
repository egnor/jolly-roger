import { z } from "zod";
import type { ModelType } from "./Model";
import Model from "./Model";
import { foreignKey } from "./customTypes";

export const HeartbeatActivity = z.object({
  ts: z.date(), // Timestamp of the heartbeat
  hunt: foreignKey,
  puzzle: foreignKey,
  user: foreignKey,
});

const HeartbeatActivities = new Model(
  "jr_heartbeat_activities",
  HeartbeatActivity,
);
HeartbeatActivities.addIndex({ hunt: 1 });
HeartbeatActivities.addIndex({ puzzle: 1, ts: 1, user: 1 }, { unique: true }); // Add unique index

export type HeartbeatActivityType = ModelType<typeof HeartbeatActivities>;

export default HeartbeatActivities;