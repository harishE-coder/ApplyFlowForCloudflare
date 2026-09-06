import { z } from "zod";

export const NotificationResponseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  is_read: z.boolean(),
  created_at: z.string().or(z.date()),
});

export const NotificationListResponseSchema = z.object({
  unread_count: z.number().int().nonnegative(),
  items: z.array(NotificationResponseSchema),
});
