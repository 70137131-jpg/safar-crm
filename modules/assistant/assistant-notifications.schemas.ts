import { z } from "zod";

export const notificationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("read"),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("read-all"),
  }),
]);
