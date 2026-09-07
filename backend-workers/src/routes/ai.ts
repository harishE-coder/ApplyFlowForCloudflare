/**
 * AI Document & Email Intake Router for ApplyFlow Cloudflare Workers.
 * Implements two-phase intake with Groq AI entity extraction and confirmation.
 * Endpoints:
 * - GET /api/ai/inbox & GET /api/ai/history
 * - POST /api/ai/analyze-email
 * - POST /api/ai/analyze-file
 * - POST /api/ai/confirm-save
 * - POST /api/ai/process-email (legacy alias)
 */

import { Hono } from "hono";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import { GroqAnalysisSchema, type GroqAnalysis } from "../schemas/ai";
import type { Bindings, UserPayload, Variables } from "../types";

import { callAiGateway } from "../services/aiGateway";

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All AI endpoints require authentication
aiRouter.use("*", requireAuth);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

/**
 * Helper: Resolve permitted client IDs for scoping AI inbox
 */
async function getScopedClientIdsForAI(sql: any, user: UserPayload): Promise<string[] | null> {
  if (user.role === "super_admin" || user.role === "admin") {
    return null; // Global access
  }

  if (user.role === "sub_admin") {
    const assigned = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    return assigned.map((r: any) => String(r.client_id));
  }

  if (user.role === "employee" || user.role === "recruiter") {
    const assigned = await sql`
      SELECT client_id FROM employee_clients WHERE employee_id = ${user.id} AND active = true
    `;
    if (assigned.length > 0) {
      return assigned.map((r: any) => String(r.client_id));
    }
    const activeClients = await sql`SELECT id as client_id FROM clients WHERE status = 'active'`;
    return activeClients.map((r: any) => String(r.client_id));
  }

  if (user.role === "client") {
    return user.client_id ? [String(user.client_id)] : [];
  }

  return [];
}

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
 * Backward-compatibility wrapper for legacy callers and tests.
 * Internally delegates to the single source of truth: callAiGateway.
 */
export async function callGroqAi(
  apiKey: string,
  documentText: string,
  modelOverride?: string
): Promise<GroqAnalysis> {
  return callAiGateway({ GROQ_API_KEY: apiKey } as any, documentText, modelOverride);
}

/**
 * 1. GET /api/ai/inbox and GET /api/ai/history
 * Feeds the AI Response Inbox with card items, counts, and client breakdown.
 */
const getInboxHandler = async (c: any) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const clientId = c.req.query("client_id") || null;
  const status = c.req.query("status") || null;
  const search = c.req.query("search") || null;
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("page_size")) || 50));
  const offset = (page - 1) * pageSize;

  try {
    const scopedCids = await getScopedClientIdsForAI(sql, user);
    if (scopedCids !== null && scopedCids.length === 0) {
      return c.json({ items: [], total: 0, today_processed: 0, new_count: 0, followup_count: 0, client_breakdown: {} });
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (scopedCids !== null) {
      conditions.push(`a.client_id = ANY($${pIdx++})`);
      params.push(scopedCids);
    }
    if (clientId) {
      conditions.push(`a.client_id = $${pIdx++}`);
      params.push(clientId);
    }
    if (status && status !== "all") {
      conditions.push(`a.status = $${pIdx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(
        r.candidate_name ILIKE $${pIdx} OR
        a.candidate_name ILIKE $${pIdx} OR
        r.company ILIKE $${pIdx} OR
        a.company ILIKE $${pIdx} OR
        r.role ILIKE $${pIdx} OR
        a.role ILIKE $${pIdx} OR
        c.company_name ILIKE $${pIdx} OR
        a.current_round ILIKE $${pIdx}
      )`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Total count
    const countSql = `
      SELECT COUNT(a.id)::int as count
      FROM applications a
      LEFT JOIN resumes r ON a.resume_id = r.id
      LEFT JOIN clients c ON a.client_id = c.id
      ${whereSql}
    `;
    const countRes = await (sql as any)(countSql, params);
    const total = countRes[0]?.count || 0;

    // Paginated items
    const listParams = [...params, pageSize, offset];
    const fetchSql = `
      SELECT 
        a.id, a.candidate_name AS app_candidate_name, a.company AS app_company, a.role AS app_role,
        a.status, a.current_round, a.confidence, a.last_email_snippet, a.is_ai_processed,
        a.interview_date, a.applied_date, a.updated_at,
        r.candidate_name AS resume_candidate_name, r.company AS resume_company, r.role AS resume_role,
        r.resume_id_tag, r.display_seq,
        c.id AS client_id, c.company_name AS client_name,
        u.id AS employee_id, u.name AS employee_name
      FROM applications a
      LEFT JOIN resumes r ON a.resume_id = r.id
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.employee_id = u.id
      ${whereSql}
      ORDER BY COALESCE(a.updated_at, a.applied_date) DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    const rows = await (sql as any)(fetchSql, listParams);

    // Event counts in 1 query
    const appIds = rows.map((r: any) => r.id).filter(Boolean).map(String);
    let eventCounts: Record<string, number> = {};
    if (appIds.length > 0) {
      const evRows = await sql`
        SELECT application_id, COUNT(id)::int AS ev_count
        FROM application_events
        WHERE application_id = ANY(${appIds})
        GROUP BY application_id
      `;
      for (const e of evRows) {
        eventCounts[String(e.application_id)] = Number(e.ev_count);
      }
    }

    // Client breakdown
    const cbRows = await sql`
      SELECT c.company_name, COUNT(a.id)::int AS app_count
      FROM clients c
      JOIN applications a ON a.client_id = c.id
      GROUP BY c.company_name
    `;
    const clientBreakdown: Record<string, number> = {};
    for (const r of cbRows) {
      clientBreakdown[r.company_name] = Number(r.app_count);
    }

    let newCount = 0;
    let followupCount = 0;

    const items = rows.map((r: any) => {
      const aid = String(r.id);
      const evCnt = eventCounts[aid] || 1;
      const actionType = evCnt <= 2 ? "new" : "follow_up";
      if (actionType === "new") newCount++;
      else followupCount++;

      const candName = r.resume_candidate_name || r.app_candidate_name || "Candidate";
      const compName = r.resume_company || r.app_company || r.client_name || "Company";
      const roleName = r.resume_role || r.app_role || "Software Engineer";
      const resumeDisplayId =
        r.resume_id_tag ||
        (r.display_seq ? `RES${1000 + r.display_seq}` : candName.slice(0, 15) || "RES-000");

      return {
        id: r.id,
        application_id: r.id,
        candidate_name: candName,
        company: compName,
        role: roleName,
        resume_display_id: resumeDisplayId,
        client_id: r.client_id || null,
        client_name: r.client_name || "Client Account",
        employee_name: r.employee_name || user.name,
        status: r.status,
        round: r.current_round || "Shortlisted",
        interview_date: r.interview_date || null,
        action_type: actionType,
        raw_email_snippet:
          r.last_email_snippet || `Recruiter update: ${r.current_round || "Application processed"}`,
        created_at: r.updated_at || r.applied_date,
        events_count: evCnt,
      };
    });

    return c.json({
      items,
      total,
      today_processed: items.length,
      new_count: newCount || (items.length > 0 ? Math.ceil(items.length / 2) : 0),
      followup_count: followupCount || (items.length > 0 ? Math.floor(items.length / 2) : 0),
      client_breakdown: clientBreakdown,
    });
  } catch (err: any) {
    console.error("[AI Inbox Feed Error]", err);
    return c.json({ detail: `Failed to load AI inbox feed: ${err.message}` }, 500);
  }
};

aiRouter.get("/inbox", getInboxHandler);
aiRouter.get("/history", getInboxHandler);

/**
 * 2. POST /api/ai/analyze-email
 * Phase 1: Preview extraction from raw recruiter email text using Groq AI.
 */
aiRouter.post("/analyze-email", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const rawEmail = (body.raw_email || "").trim();
  const clientId = body.client_id || null;
  const sourceType = body.source_type || "paste";

  if (!rawEmail || rawEmail.length < 5) {
    return c.json({ detail: "raw_email is required (minimum 5 characters)." }, 400);
  }

  let analysis: GroqAnalysis;
  try {
    analysis = await callAiGateway(c.env, rawEmail, c.env.GROQ_MODEL);
  } catch (err: any) {
    console.error("[AI Analyze Email Error]", err.message);
    const prefix = err?.message?.includes("Groq") ? "Groq AI service failure" : "AI service failure";
    return c.json({ detail: `${prefix}: ${err.message}` }, 502);
  }

  if (analysis.is_interview_mail === false) {
    return c.json({
      is_interview_mail: false,
      decision: "not_related",
      decision_text: "This email is not a recruitment/interview update. Ignored.",
      candidate_name: "",
      company: "",
      role: "",
      status: "",
      round: "",
      interview_date: null,
      client_id: clientId,
      client_name: null,
      raw_email: rawEmail,
      source_type: sourceType,
      raw_filename: null,
      matched_application_id: null,
      current_round: null,
      current_status: null,
      matched_resume_id: null,
      matched_resume_name: null,
      matched_resume_candidate: null,
      matched_resume_company: null,
      matched_resume_role: null,
      matched_resume_tag: null,
      resume_matched: false,
      match_priority: null,
      match_reason: null,
    });
  }

  const candName = (analysis.candidate_name || "").trim();
  const companyName = (analysis.company || analysis.current_company || "").trim();
  const roleName = (analysis.role || "Software Engineer").trim();
  const statusStr = (analysis.status || "Shortlisted").trim();
  const roundStr = (analysis.round || "Round 1").trim();

  const sql = getDb(c.env.DATABASE_URL);

  let clientName: string | null = null;
  let matchedResume: any = null;
  let matchedApp: any = null;

  try {
    if (clientId) {
      const cl = await sql`SELECT id, company_name FROM clients WHERE id = ${clientId} LIMIT 1`;
      if (cl.length > 0) clientName = cl[0].company_name;
    }

    // Smart Resume Linking
    if (candName && candName.toLowerCase() !== "candidate") {
      let resumes: any[] = [];
      if (clientId) {
        resumes = await sql`
          SELECT id, original_filename, candidate_name, company, role, resume_id_tag, display_seq
          FROM resumes
          WHERE client_id = ${clientId} AND LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
          LIMIT 1
        `;
      } else {
        resumes = await sql`
          SELECT id, original_filename, candidate_name, company, role, resume_id_tag, display_seq
          FROM resumes
          WHERE LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
          LIMIT 1
        `;
      }
      if (resumes.length > 0) matchedResume = resumes[0];
    }

    // Check for existing application
    if (matchedResume) {
      const apps = await sql`
        SELECT id, current_round, status FROM applications
        WHERE resume_id = ${matchedResume.id}
        LIMIT 1
      `;
      if (apps.length > 0) matchedApp = apps[0];
    } else if (candName && candName.toLowerCase() !== "candidate") {
      const apps = await sql`
        SELECT id, current_round, status FROM applications
        WHERE LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
        LIMIT 1
      `;
      if (apps.length > 0) matchedApp = apps[0];
    }
  } catch (dbErr) {
    console.warn("[Smart Resume Match Warning]", dbErr);
  }

  const decision = matchedApp ? "existing_application" : "new_application";
  const decisionText = matchedApp
    ? `Existing application found: ${matchedApp.current_round || "In Process"}. Moving forward.`
    : `New candidate intake for ${candName || "Candidate"} at ${companyName || "Target Company"}.`;

  return c.json({
    is_interview_mail: true,
    decision,
    decision_text: decisionText,
    candidate_name: candName,
    company: companyName,
    role: roleName,
    status: statusStr,
    round: roundStr,
    interview_date: analysis.interview_date || null,
    client_id: clientId,
    client_name: clientName,
    raw_email: rawEmail,
    source_type: sourceType,
    raw_filename: null,
    matched_application_id: matchedApp ? String(matchedApp.id) : null,
    current_round: matchedApp ? matchedApp.current_round : null,
    current_status: matchedApp ? matchedApp.status : null,
    matched_resume_id: matchedResume ? String(matchedResume.id) : null,
    matched_resume_name: matchedResume ? matchedResume.original_filename : null,
    matched_resume_candidate: matchedResume ? matchedResume.candidate_name : null,
    matched_resume_company: matchedResume ? matchedResume.company : null,
    matched_resume_role: matchedResume ? matchedResume.role : null,
    matched_resume_tag: matchedResume ? matchedResume.resume_id_tag : null,
    resume_matched: !!matchedResume,
    match_priority: matchedResume ? 1 : null,
    match_reason: matchedResume ? "Candidate resume matched in client repository" : null,
  });
});

/**
 * 3. POST /api/ai/confirm-save and /api/ai/process-email
 * Phase 2: Persist verified application and log events.
 */
const confirmSaveHandler = async (c: any) => {
  const user = c.get("user");
  const payload = await c.req.json().catch(() => ({}));

  const candName = (payload.candidate_name || "Candidate").trim();
  const companyName = (payload.company || "Company").trim();
  const roleName = (payload.role || "Software Engineer").trim();
  const statusStr = (payload.status || "Shortlisted").trim();
  const roundStr = (payload.round || "Round 1").trim();
  const rawEmail = (payload.raw_email || "").trim();
  const sourceType = payload.source_type || "paste";
  const resumeId = payload.resume_id || payload.matched_resume_id || null;
  const interviewDate = payload.interview_date || null;
  const matchedAppId = payload.matched_application_id || null;

  const sql = getDb(c.env.DATABASE_URL);

  try {
    // 1. Target client resolution
    let targetClientId = payload.client_id || null;
    if (!targetClientId && companyName) {
      const clientMatch = await sql`
        SELECT id FROM clients WHERE LOWER(company_name) LIKE ${`%${companyName.toLowerCase()}%`} AND is_active = true LIMIT 1
      `;
      if (clientMatch.length > 0) targetClientId = clientMatch[0].id;
    }
    if (!targetClientId) {
      const firstClient = await sql`SELECT id FROM clients WHERE is_active = true LIMIT 1`;
      if (firstClient.length > 0) targetClientId = firstClient[0].id;
    }

    // 2. Audit in email_intake
    const intakeId = crypto.randomUUID();
    if (targetClientId) {
      await sql`
        INSERT INTO email_intake (id, uploaded_by, client_id, original_text, source_type, confidence, processed, created_at)
        VALUES (${intakeId}, ${user.id}, ${targetClientId}, ${rawEmail}, ${sourceType}, 95, true, NOW())
      `;
    }

    // 3. Find or Create Application
    let app: any = null;
    let actionType = "new";

    if (matchedAppId) {
      const apps = await sql`SELECT * FROM applications WHERE id = ${matchedAppId} LIMIT 1`;
      if (apps.length > 0) app = apps[0];
    }

    if (!app && resumeId && targetClientId) {
      const apps = await sql`
        SELECT * FROM applications WHERE resume_id = ${resumeId} AND client_id = ${targetClientId} LIMIT 1
      `;
      if (apps.length > 0) app = apps[0];
    }

    const parsedInterviewDate = interviewDate ? new Date(interviewDate).toISOString() : null;

    if (app) {
      actionType = "follow_up";
      const finalInterviewDate = parsedInterviewDate !== null ? parsedInterviewDate : (app.interview_date || null);
      const [updated] = await sql`
        UPDATE applications
        SET 
          status = ${statusStr},
          current_round = ${roundStr},
          interview_date = ${finalInterviewDate},
          last_email_snippet = ${rawEmail.slice(0, 300)},
          is_ai_processed = true,
          updated_at = NOW()
        WHERE id = ${app.id}
        RETURNING *
      `;
      app = updated;

      // Event
      const eventId = crypto.randomUUID();
      await sql`
        INSERT INTO application_events (
          id, application_id, event_type, round_name, event_date, email_id, raw_email,
          ai_json, confidence, interview_date, created_by, created_at
        )
        VALUES (
          ${eventId}, ${app.id}, ${roundStr}, ${roundStr}, NOW(), ${intakeId}, ${rawEmail},
          ${JSON.stringify({ status: statusStr, round: roundStr, confirmed_by: user.name })},
          95, ${parsedInterviewDate}, ${user.id}, NOW()
        )
      `;
    } else {
      actionType = "new";
      const newAppId = crypto.randomUUID();

      let effectiveEmployeeId = user.id;
      if ((user.role === "admin" || user.role === "super_admin") && targetClientId) {
        const assigned = await sql`
          SELECT employee_id FROM employee_clients WHERE client_id = ${targetClientId} AND active = true LIMIT 1
        `;
        if (assigned.length > 0 && assigned[0].employee_id) {
          effectiveEmployeeId = assigned[0].employee_id;
        }
      }

      const [created] = await sql`
        INSERT INTO applications (
          id, resume_id, client_id, employee_id, candidate_name, company, role,
          status, current_round, interview_date, last_email_snippet, is_ai_processed,
          applied_date, created_at, updated_at
        )
        VALUES (
          ${newAppId}, ${resumeId}, ${targetClientId}, ${effectiveEmployeeId}, ${candName}, ${companyName}, ${roleName},
          ${statusStr}, ${roundStr}, ${parsedInterviewDate},
          ${rawEmail.slice(0, 300)}, true, NOW(), NOW(), NOW()
        )
        RETURNING *
      `;
      app = created;

      // Initial submission event
      const subEventId = crypto.randomUUID();
      await sql`
        INSERT INTO application_events (
          id, application_id, event_type, round_name, event_date, email_id, raw_email,
          ai_json, confidence, interview_date, created_by, created_at
        )
        VALUES (
          ${subEventId}, ${app.id}, 'Submitted', 'Initial Submission', NOW(), ${intakeId},
          'Initial Candidate Intake via AI',
          ${JSON.stringify({ stage: 'Initial Submission', confirmed_by: user.name })},
          95, null, ${user.id}, NOW()
        )
      `;

      // Follow-up round event if not submitted
      if (roundStr.toLowerCase() !== "screening" && roundStr.toLowerCase() !== "initial application") {
        const roundEventId = crypto.randomUUID();
        await sql`
          INSERT INTO application_events (
            id, application_id, event_type, round_name, event_date, email_id, raw_email,
            ai_json, confidence, interview_date, created_by, created_at
          )
          VALUES (
            ${roundEventId}, ${app.id}, ${roundStr}, ${roundStr}, NOW(), ${intakeId}, ${rawEmail},
            ${JSON.stringify({ status: statusStr, round: roundStr, confirmed_by: user.name })},
            95, ${parsedInterviewDate}, ${user.id}, NOW()
          )
        `;
      }
    }

    // In-app notification
    await sql`
      INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${user.id},
        ${`AI Intake: ${candName}`},
        ${`${candName} (${companyName} - ${roleName}) confirmed for ${roundStr}.`},
        'application_update', false, NOW()
      )
    `;

    return c.json({
      action_type: actionType,
      extracted_data: {
        candidate_name: candName,
        company: companyName,
        role: roleName,
        round: roundStr,
        status: statusStr,
        interview_date: interviewDate,
      },
      application: app,
      event: null,
      raw_filename: null,
      message: "Candidate intake processed successfully",
    });
  } catch (err: any) {
    console.error("[Confirm Save Error]", err);
    return c.json({ detail: `Failed to confirm and save: ${err.message}` }, 500);
  }
};

aiRouter.post("/confirm-save", confirmSaveHandler);
aiRouter.post("/process-email", confirmSaveHandler);

/**
 * 4. POST /api/ai/analyze-file, /api/ai/parse-resume, /api/ai/intake
 */
const analyzeFileHandler = async (c: any) => {
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

    let analysis: GroqAnalysis;
    try {
      analysis = await callAiGateway(c.env, extractedText, c.env.GROQ_MODEL);
    } catch (err: any) {
      console.error("[AI Intake Error]", err.message);
      const prefix = err?.message?.includes("Groq") ? "Groq AI service failure" : "AI service failure";
      return c.json(
        {
          detail: `${prefix}: ${err.message}`,
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
            SELECT id, original_filename, candidate_name, company, role, resume_id_tag, display_seq
            FROM resumes
            WHERE client_id = ${requestedClientId}
              AND LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
            LIMIT 1
          `;
        } else {
          resumes = await sql`
            SELECT id, original_filename, candidate_name, company, role, resume_id_tag, display_seq
            FROM resumes
            WHERE LOWER(candidate_name) LIKE ${`%${candName.toLowerCase()}%`}
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
};

aiRouter.post("/analyze-file", analyzeFileHandler);
aiRouter.post("/parse-resume", analyzeFileHandler);
aiRouter.post("/intake", analyzeFileHandler);

export default aiRouter;
