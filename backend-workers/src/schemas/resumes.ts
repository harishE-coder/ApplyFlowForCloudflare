import { z } from "zod";

export const CheckDuplicateFileItemSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  company: z.string().optional().nullable(),
  candidate_name: z.string().optional().nullable(),
  resume_id_tag: z.string().optional().nullable(),
  file_hash: z.string().length(64).optional().nullable(),
});

export const CheckDuplicatesSchema = z.object({
  client_id: z.string().uuid("Invalid client ID"),
  items: z.array(CheckDuplicateFileItemSchema).min(1, "At least one item required"),
});

export const ResumeUpdateSchema = z.object({
  candidate_name: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  client_id: z.string().uuid().optional(),
  requirement_id: z.string().uuid().optional().nullable(),
  resume_id_tag: z.string().optional().nullable(),
  resume_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional().nullable(),
  client_notes: z.string().optional().nullable(),
  is_note_shared: z.boolean().optional(),
});

export const ResumeQuerySchema = z.object({
  search: z.string().optional(),
  client_id: z.string().uuid().optional(),
  requirement_id: z.string().uuid().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  candidate_name: z.string().optional(),
  resume_id_tag: z.string().optional(),
  resume_date: z.string().optional(),
  date_filter: z.string().optional(),
  custom_date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
