/**
 * AI Resume & Document Intake Router for ApplyFlow Cloudflare Workers.
 * Endpoint: POST /api/ai/analyze-file
 */

import { Hono } from "hono";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import { GroqAnalysisSchema, type GroqAnalysis } from "../schemas/ai";
import type { Bindings, Variables } from "../types";

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All AI endpoints require authentication
aiRouter.use("*", requireAuth);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

function extractRawPdfFallback(buffer: Uint8Array): string {
  try {
    const str = new TextDecoder("latin1").decode(buffer);
    const textPieces: string[] = [];
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = tjRegex.exec(str)) !== null) {
      if (match[1] && match[1].trim()) {
        textPieces.push(match[1].trim());
      }
    }
    return textPieces.join(" ").trim();
  } catch {
    return "";
  }
}

/**
 * Worker-compatible text extraction for PDF, DOCX, TXT, and EML files.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const rawBytes = await file.arrayBuffer();
  const fileBytes = new Uint8Array(rawBytes);

  // 1. PDF Extraction
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const result = await extractText(fileBytes.slice());
      const pagesText = Array.isArray(result.text)
        ? result.text.join("\n\n").trim()
        : String(result.text || "").trim();
      if (pagesText && pagesText.length >= 10) {
        return pagesText;
      }
    } catch {
      // Fall through to raw stream extraction
    }

    const rawFallback = extractRawPdfFallback(fileBytes);
    if (rawFallback && rawFallback.length >= 10) {
      return rawFallback;
    }

    // Try basic string extraction if structured pdf failed
    try {
      const rawText = new TextDecoder("utf-8").decode(fileBytes);
      const cleaned = rawText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      if (cleaned && cleaned.length >= 20) {
        return cleaned;
      }
    } catch {}

    throw new Error("Unable to extract readable text from PDF.");
  }

  // 2. DOCX Extraction via mammoth
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const arrayBuffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      ) as ArrayBuffer;

      const result = await mammoth.extractRawText({
        arrayBuffer,
        buffer: Buffer.from(fileBytes),
      });
      const text = (result?.value || "").trim();
      if (text && text.length >= 10) {
        return text;
      }
    } catch (docxErr: any) {
      throw new Error(`Failed to extract text from DOCX: ${docxErr?.message || "Corrupted file"}`);
    }

    throw new Error("Unable to extract readable text from DOCX.");
  }

  // 3. Plain Text Files
  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    const text = new TextDecoder("utf-8").decode(fileBytes).trim();
    if (!text) {
      throw new Error("Text file is empty.");
    }
    return text;
  }

  // 4. Email (.eml) Files
  if (name.endsWith(".eml") || file.type === "message/rfc822") {
    const text = new TextDecoder("utf-8").decode(fileBytes).trim();
    if (!text) {
      throw new Error("Email file is empty.");
    }
    return text;
  }

  throw new Error("Unsupported file format.");
}

/**
 * Calls Groq AI with model fallback and JSON mode.
 */
export async function callGroqAi(
  apiKey: string,
  documentText: string,
  modelOverride?: string
): Promise<GroqAnalysis> {
  const modelsToTry = [
    modelOverride,
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
  ].filter(Boolean) as string[];

  const prompt = `You are an expert ATS recruitment and resume parser AI. Analyze the following document (resume or interview update email) and extract candidate, skill, and interview details.

Return ONLY valid JSON matching this schema with no markdown formatting, no code fences, and no extra text:
{
  "candidate_name": "Full name of candidate",
  "email": "Email address or empty string",
  "phone": "Phone number or empty string",
  "skills": ["Array", "of", "skills"],
  "experience_years": 0,
  "education": "Highest degree or university or empty string",
  "current_company": "Current or latest employer or hiring company",
  "summary": "Brief 1-2 sentence executive summary",
  "confidence": 0.92,
  "role": "Role or designation or title",
  "company": "Target company name or hiring company",
  "round": "Interview round (e.g. Screening, Technical, HR, Final)",
  "status": "applied or interview or offer or rejected",
  "interview_date": "YYYY-MM-DD if scheduled, else empty string",
  "is_interview_mail": true
}

Document Content:
${documentText.slice(0, 8000)}`;

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are a specialized recruitment information extraction engine that strictly returns valid JSON matching the requested schema with no markdown.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = new Error(`GROQ API responded with HTTP ${res.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const json: any = await res.json();
      const rawContent = json?.choices?.[0]?.message?.content || "{}";
      let parsed: any;

      try {
        parsed = JSON.parse(rawContent);
      } catch {
        // Strip fences if any
        const clean = rawContent.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(clean);
      }

      // Validate with Zod schema
      return GroqAnalysisSchema.parse(parsed);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to communicate with Groq AI service.");
}

// POST /api/ai/analyze-file
aiRouter.post("/analyze-file", async (c) => {
  const reqId = c.get("requestId") || c.req.header("X-Request-Id") || "unknown";

  try {
    const user = c.get("user");
    const allowedRoles = ["super_admin", "admin", "sub_admin", "recruiter", "employee"];
    if (user && !allowedRoles.includes(user.role)) {
      return c.json(
        {
          detail: "Forbidden: insufficient permissions.",
          request_id: reqId,
        },
        403
      );
    }

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json(
        {
          detail: "Invalid multipart/form-data request.",
          request_id: reqId,
        },
        400
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File) || typeof file.arrayBuffer !== "function") {
      return c.json(
        {
          detail: "Missing file. Please provide a file in the 'file' field.",
          request_id: reqId,
        },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json(
        {
          detail: "File size exceeds 10MB limit.",
          request_id: reqId,
        },
        400
      );
    }

    if (file.size === 0) {
      return c.json(
        {
          detail: "File is empty.",
          request_id: reqId,
        },
        400
      );
    }

    const name = (file.name || "").toLowerCase();
    const isSupported =
      name.endsWith(".pdf") ||
      name.endsWith(".docx") ||
      name.endsWith(".txt") ||
      name.endsWith(".eml") ||
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type.startsWith("text/") ||
      file.type === "message/rfc822";

    if (!isSupported) {
      return c.json(
        {
          detail: "Unsupported file type. Please upload a PDF or DOCX file.",
          request_id: reqId,
        },
        400
      );
    }

    let extractedText: string;
    try {
      extractedText = await extractTextFromFile(file);
    } catch (err: any) {
      return c.json(
        {
          detail: `Extraction failed: ${err.message || "Unable to extract readable text from document."}`,
          request_id: reqId,
        },
        422
      );
    }

    if (!extractedText || extractedText.trim().length < 5) {
      return c.json(
        {
          detail: "Extraction failed: Document contains insufficient readable text.",
          request_id: reqId,
        },
        422
      );
    }

    const groqApiKey = c.env.GROQ_API_KEY;
    if (!groqApiKey || typeof groqApiKey !== "string" || !groqApiKey.trim()) {
      return c.json(
        {
          detail: "Groq AI service is not configured (missing GROQ_API_KEY).",
          request_id: reqId,
        },
        502
      );
    }

    let analysis: GroqAnalysis;
    try {
      analysis = await callGroqAi(groqApiKey.trim(), extractedText, c.env.GROQ_MODEL);
    } catch (err: any) {
      console.error("[Groq AI Intake Error]", err.message);
      return c.json(
        {
          detail: `Groq AI service failure: ${err.message}`,
          request_id: reqId,
        },
        502
      );
    }

    const rawClientId = formData.get("client_id");
    const requestedClientId =
      rawClientId && typeof rawClientId === "string" ? rawClientId.trim() : null;

    let clientName: string | null = null;
    let matchedResume: any = null;

    try {
      const sql = getDb(c.env.DATABASE_URL);

      if (requestedClientId) {
        const clients = await sql`
          SELECT id, company_name FROM clients WHERE id = ${requestedClientId} LIMIT 1
        `;
        if (clients && clients.length > 0) {
          clientName = clients[0].company_name;
        }
      }

      const candName = (analysis.candidate_name || "").trim();
      if (candName && candName.toLowerCase() !== "candidate") {
        let resumes: any[] = [];
        if (requestedClientId) {
          resumes = await sql`
            SELECT id, original_filename, candidate_name, company, role, resume_id_tag
            FROM resumes
            WHERE client_id = ${requestedClientId}
              AND LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
              AND is_deleted = false
            LIMIT 1
          `;
        } else {
          resumes = await sql`
            SELECT id, original_filename, candidate_name, company, role, resume_id_tag
            FROM resumes
            WHERE LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
              AND is_deleted = false
            LIMIT 1
          `;
        }

        if (resumes && resumes.length > 0) {
          matchedResume = resumes[0];
        }
      }
    } catch (dbErr) {
      console.warn("[AI Intake DB Check Warning]", dbErr);
    }

    const normalizedAnalysis = {
      candidate_name: analysis.candidate_name || "",
      email: analysis.email || "",
      phone: analysis.phone || "",
      skills: Array.isArray(analysis.skills) ? analysis.skills : [],
      experience_years: typeof analysis.experience_years === "number" ? analysis.experience_years : 0,
      education: analysis.education || "",
      summary: analysis.summary || "",
      confidence: typeof analysis.confidence === "number" ? analysis.confidence : 0.92,
    };

    return c.json({
      success: true,
      analysis: normalizedAnalysis,
      // Compatibility fields for existing React AI Intake page
      candidate_name: normalizedAnalysis.candidate_name,
      company: analysis.company || analysis.current_company || "",
      role: analysis.role || "Software Engineer",
      round: analysis.round || "Screening",
      status: analysis.status || "applied",
      interview_date: analysis.interview_date || "",
      confidence: normalizedAnalysis.confidence,
      client_id: requestedClientId || null,
      client_name: clientName,
      raw_filename: file.name,
      is_interview_mail: analysis.is_interview_mail !== false,
      matched_resume_id: matchedResume ? String(matchedResume.id) : null,
      matched_resume_name: matchedResume ? matchedResume.original_filename : null,
      matched_resume_candidate: matchedResume ? matchedResume.candidate_name : null,
      matched_resume_company: matchedResume ? matchedResume.company : null,
      matched_resume_role: matchedResume ? matchedResume.role : null,
      matched_resume_tag: matchedResume ? matchedResume.resume_id_tag : null,
      resume_matched: !!matchedResume,
      match_priority: matchedResume ? 1 : null,
      match_reason: matchedResume ? "Existing candidate resume match" : null,
      request_id: reqId,
    });
  } catch (err: any) {
    console.error("[Unexpected AI Error]", err);
    return c.json(
      {
        detail: err?.message || "Unexpected server error during document analysis.",
        request_id: reqId,
      },
      500
    );
  }
});

export default aiRouter;
