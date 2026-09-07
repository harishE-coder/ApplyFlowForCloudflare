import { z } from "zod";

export const SendMessageRequestSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
  client_id: z.string().optional().nullable(),
  client_message_id: z.string().optional().nullable(),
  attachment_type: z.string().optional().nullable(),
  attachment_reference: z.string().optional().nullable(),
  attachment_filename: z.string().optional().nullable(),
});

export const ShareResumeRequestSchema = z.object({
  resume_id: z.string().uuid("Invalid resume ID"),
  caption: z.string().trim().optional().nullable(),
});

export const ShareJobRequestSchema = z.object({
  requirement_id: z.string().uuid("Invalid requirement ID"),
  caption: z.string().trim().optional().nullable(),
});

export const MarkReadRequestSchema = z.object({
  message_id: z.string().uuid("Invalid message ID").optional().nullable(),
});

export const PushSubscriptionCreateSchema = z.object({
  endpoint: z.string().url("Invalid push endpoint URL"),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh key required"),
    auth: z.string().min(1, "auth key required"),
  }),
});

export const PushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url("Invalid push endpoint URL"),
});

export const NotificationPreferencesUpdateSchema = z.object({
  chat_notifications_enabled: z.boolean().optional(),
  sound_enabled: z.boolean().optional(),
});
