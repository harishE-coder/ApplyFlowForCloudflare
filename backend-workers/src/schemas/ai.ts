import { z } from "zod";

/**
 * Zod Schema for Groq AI Resume/Document Extraction Output
 */
export const GroqAnalysisSchema = z.object({
  candidate_name: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience_years: z.number().default(0),
  education: z.string().default(""),
  current_company: z.string().default(""),
  summary: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.92),
  role: z.string().default(""),
  company: z.string().default(""),
  round: z.string().default(""),
  status: z.string().default("applied"),
  interview_date: z.string().default(""),
  is_interview_mail: z.boolean().default(true),
});

export type GroqAnalysis = z.infer<typeof GroqAnalysisSchema>;

export const AiAnalyzeFileResponseSchema = z.object({
  success: z.boolean(),
  analysis: GroqAnalysisSchema,
  candidate_name: z.string(),
  company: z.string(),
  role: z.string(),
  round: z.string(),
  status: z.string(),
  interview_date: z.string(),
  confidence: z.number(),
  client_id: z.string().nullable(),
  client_name: z.string().nullable(),
  raw_filename: z.string(),
  is_interview_mail: z.boolean(),
  matched_resume_id: z.string().nullable(),
  matched_resume_name: z.string().nullable(),
  matched_resume_candidate: z.string().nullable(),
  matched_resume_company: z.string().nullable(),
  matched_resume_role: z.string().nullable(),
  matched_resume_tag: z.string().nullable(),
  resume_matched: z.boolean(),
  match_priority: z.number().nullable(),
  match_reason: z.string().nullable(),
  request_id: z.string().optional(),
});

export type AiAnalyzeFileResponse = z.infer<typeof AiAnalyzeFileResponseSchema>;
