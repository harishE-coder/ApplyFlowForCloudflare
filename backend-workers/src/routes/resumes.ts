import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import {
  CheckDuplicatesSchema,
  ResumeQuerySchema,
  ResumeUpdateSchema,
} from "../schemas/resumes";
import {
  computeFileHash,
  deleteResumeFile,
  generateResumeObjectKey,
  getResumeFile,
  putResumeFile,
} from "../services/r2";
import type { Bindings, UserPayload, Variables } from "../types";
import { parseResumeFilename } from "../utils/resumeParser";

export const resumesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All resume routes require authentication
resumesRouter.use("*", requireAuth);

/**
 * Helper to build allowed client IDs based on caller role.
 * Returns null if user has unrestricted access (admin / super_admin).
 */
async function getAllowedClientIds(
  sql: any,
  user: UserPayload
): Promise<string[] | null> {
  if (user.role === "super_admin" || user.role === "admin") {
    return null;
  }

  if (user.role === "client") {
    return user.client_id ? [user.client_id] : [];
  }

  if (user.role === "sub_admin") {
    const rows = await sql`
      SELECT client_id FROM sub_admin_clients WHERE user_id = ${user.id}
    `;
    return rows.map((r: any) => String(r.client_id));
  }

  if (user.role === "employee" || user.role === "recruiter") {
    const rows = await sql`
      SELECT client_id FROM employee_clients
      WHERE employee_id = ${user.id} AND active = true
    `;
    const assigned = rows.map((r: any) => String(r.client_id));
    if (assigned.length > 0) return assigned;

    // Fallback to active clients
    const activeClients = await sql`SELECT id FROM clients WHERE status = 'active'`;
    return activeClients.map((r: any) => String(r.id));
  }

  return [];
}

// 1. GET /api/resumes/companies
resumesRouter.get("/companies", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const allowed = await getAllowedClientIds(sql, user);

  let rows: any[];
  if (allowed === null) {
    rows = await sql`
      SELECT DISTINCT company FROM resumes
      WHERE company IS NOT NULL AND TRIM(company) != ''
      ORDER BY company ASC
    `;
  } else if (allowed.length === 0) {
    return c.json([]);
  } else {
    rows = await sql`
      SELECT DISTINCT company FROM resumes
      WHERE client_id = ANY(${allowed})
        AND company IS NOT NULL AND TRIM(company) != ''
      ORDER BY company ASC
    `;
  }

  const companies = rows.map((r: any) => String(r.company)).filter(Boolean);
  return c.json(companies);
});

// 2. POST /api/resumes/check-duplicates
resumesRouter.post("/check-duplicates", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parseResult = CheckDuplicatesSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      { detail: parseResult.error.issues[0]?.message || "Validation error" },
      400
    );
  }

  const { client_id, items } = parseResult.data;
  const sql = getDb(c.env.DATABASE_URL);

  const results = [];

  for (const item of items) {
    const company = (item.company || "").trim();
    const candidate = (item.candidate_name || "").trim();
    const tag = (item.resume_id_tag || "").trim() || null;
    const fileHash = item.file_hash || null;

    let existing: any[] = [];

    // Priority 1: Exact binary file hash match
    if (fileHash) {
      existing = await sql`
        SELECT id, candidate_name, company, resume_id_tag
        FROM resumes
        WHERE client_id = ${client_id} AND file_hash = ${fileHash}
        LIMIT 1
      `;
    }

    // Priority 2: Resume Tag match
    if (existing.length === 0 && tag) {
      existing = await sql`
        SELECT id, candidate_name, company, resume_id_tag
        FROM resumes
        WHERE client_id = ${client_id} AND LOWER(resume_id_tag) = ${tag.toLowerCase()}
        LIMIT 1
      `;
    }

    // Priority 3: Candidate name + Company match
    if (existing.length === 0 && candidate && company) {
      existing = await sql`
        SELECT id, candidate_name, company, resume_id_tag
        FROM resumes
        WHERE client_id = ${client_id}
          AND LOWER(candidate_name) = ${candidate.toLowerCase()}
          AND LOWER(company) = ${company.toLowerCase()}
        LIMIT 1
      `;
    }

    if (existing.length > 0) {
      const match = existing[0];
      results.push({
        filename: item.filename,
        is_duplicate: true,
        duplicate_type: fileHash && match.file_hash === fileHash ? "exact_file_hash" : "metadata",
        existing_resume_id: match.id,
        candidate_name: match.candidate_name,
        company: match.company,
        resume_id_tag: match.resume_id_tag,
      });
    } else {
      results.push({
        filename: item.filename,
        is_duplicate: false,
      });
    }
  }

  return c.json({ results });
});

// 3. GET /api/resumes/find-match (Intake smart linking)
resumesRouter.get("/find-match", async (c) => {
  const clientId = c.req.query("client_id");
  if (!clientId) {
    return c.json({ detail: "client_id is required" }, 400);
  }

  const candidateName = (c.req.query("candidate_name") || "").trim();
  const company = (c.req.query("company") || "").trim();
  const role = (c.req.query("role") || "").trim();
  const tag = (c.req.query("resume_id_tag") || "").trim();

  const sql = getDb(c.env.DATABASE_URL);

  let match: any = null;

  // 1. Tag match
  if (tag) {
    const rows = await sql`
      SELECT id, candidate_name, company, role, resume_id_tag, original_filename
      FROM resumes
      WHERE client_id = ${clientId} AND LOWER(resume_id_tag) = ${tag.toLowerCase()}
      LIMIT 1
    `;
    if (rows.length > 0) match = rows[0];
  }

  // 2. Candidate + Company
  if (!match && candidateName && company) {
    const rows = await sql`
      SELECT id, candidate_name, company, role, resume_id_tag, original_filename
      FROM resumes
      WHERE client_id = ${clientId}
        AND LOWER(candidate_name) = ${candidateName.toLowerCase()}
        AND LOWER(company) = ${company.toLowerCase()}
      LIMIT 1
    `;
    if (rows.length > 0) match = rows[0];
  }

  // 3. Candidate + Role
  if (!match && candidateName && role) {
    const rows = await sql`
      SELECT id, candidate_name, company, role, resume_id_tag, original_filename
      FROM resumes
      WHERE client_id = ${clientId}
        AND LOWER(candidate_name) = ${candidateName.toLowerCase()}
        AND LOWER(role) = ${role.toLowerCase()}
      LIMIT 1
    `;
    if (rows.length > 0) match = rows[0];
  }

  // 4. Candidate only
  if (!match && candidateName) {
    const rows = await sql`
      SELECT id, candidate_name, company, role, resume_id_tag, original_filename
      FROM resumes
      WHERE client_id = ${clientId}
        AND LOWER(candidate_name) = ${candidateName.toLowerCase()}
      LIMIT 1
    `;
    if (rows.length > 0) match = rows[0];
  }

  return c.json(match || null);
});

// 4. GET /api/resumes (List / Search)
resumesRouter.get("/", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const allowed = await getAllowedClientIds(sql, user);

  if (allowed !== null && allowed.length === 0) {
    return c.json({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
  }

  const queryParams = c.req.query();
  const parsed = ResumeQuerySchema.safeParse(queryParams);
  const {
    search,
    client_id,
    requirement_id,
    company,
    role,
    candidate_name,
    resume_id_tag,
    resume_date,
    date_filter,
    custom_date,
    start_date,
    end_date,
    page,
    page_size,
  } = parsed.success ? parsed.data : { page: 1, page_size: 20 } as any;

  const offset = (page - 1) * page_size;

  // Base conditions
  const conditions = ["1=1"];
  const params: any[] = [];

  if (allowed !== null) {
    params.push(allowed);
    conditions.push(`r.client_id = ANY($${params.length})`);
  }

  if (client_id) {
    params.push(client_id);
    conditions.push(`r.client_id = $${params.length}`);
  }

  if (requirement_id) {
    params.push(requirement_id);
    conditions.push(`r.requirement_id = $${params.length}`);
  }

  if (company) {
    params.push(company);
    conditions.push(`LOWER(r.company) = LOWER($${params.length})`);
  }

  if (role) {
    params.push(`%${role.toLowerCase()}%`);
    conditions.push(`LOWER(r.role) LIKE $${params.length}`);
  }

  if (candidate_name) {
    params.push(`%${candidate_name.toLowerCase()}%`);
    conditions.push(`LOWER(r.candidate_name) LIKE $${params.length}`);
  }

  if (resume_id_tag) {
    params.push(resume_id_tag);
    conditions.push(`(LOWER(r.resume_id_tag) = LOWER($${params.length}) OR r.id::text = $${params.length})`);
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const idx = params.length;
    conditions.push(
      `(LOWER(r.candidate_name) LIKE $${idx} OR LOWER(r.company) LIKE $${idx} OR LOWER(r.role) LIKE $${idx} OR LOWER(r.original_filename) LIKE $${idx} OR LOWER(r.resume_id_tag) LIKE $${idx})`
    );
  }

  // Date filters
  if (resume_date) {
    params.push(resume_date);
    conditions.push(`r.resume_date = $${params.length}`);
  } else if (date_filter === "today") {
    conditions.push(`r.resume_date = CURRENT_DATE`);
  } else if (date_filter === "yesterday") {
    conditions.push(`r.resume_date = CURRENT_DATE - INTERVAL '1 day'`);
  } else if (date_filter === "this_week") {
    conditions.push(`r.resume_date >= date_trunc('week', CURRENT_DATE)`);
  } else if (date_filter === "this_month") {
    conditions.push(`r.resume_date >= date_trunc('month', CURRENT_DATE)`);
  } else if (custom_date) {
    params.push(custom_date);
    conditions.push(`r.resume_date = $${params.length}`);
  } else if (start_date && end_date) {
    params.push(start_date);
    const sIdx = params.length;
    params.push(end_date);
    const eIdx = params.length;
    conditions.push(`r.resume_date >= $${sIdx} AND r.resume_date <= $${eIdx}`);
  }

  const whereClause = conditions.join(" AND ");

  // Count query
  const countSql = `SELECT count(*)::int as count FROM resumes r WHERE ${whereClause}`;
  const countRows = await sql(countSql, params);
  const total = countRows[0]?.count || 0;

  // Data query
  params.push(page_size);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const dataSql = `
    SELECT
      r.id,
      r.display_seq,
      r.candidate_name,
      r.company,
      r.role,
      r.resume_id_tag,
      r.requirement_id,
      req.role_code as requirement_code,
      r.client_id,
      c.company_name as client_name,
      r.uploaded_by,
      u.name as uploader_name,
      r.original_filename,
      r.resume_date,
      r.client_notes,
      r.is_note_shared,
      r.r2_key,
      r.file_size,
      r.content_type,
      r.upload_date,
      EXISTS(SELECT 1 FROM applications a WHERE a.resume_id = r.id) as has_application
    FROM resumes r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN requirements req ON req.id = r.requirement_id
    WHERE ${whereClause}
    ORDER BY r.upload_date DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const rows = await sql(dataSql, params);

  const items = rows.map((r: any) => ({
    id: r.id,
    display_id: r.resume_id_tag || (r.display_seq ? `RES${1000 + r.display_seq}` : `RES1000`),
    candidate_name: r.candidate_name,
    company: r.company,
    role: r.role,
    resume_id_tag: r.resume_id_tag,
    requirement_id: r.requirement_id,
    requirement_code: r.requirement_code,
    client_id: r.client_id,
    client_name: r.client_name || "Client",
    uploaded_by: r.uploaded_by,
    uploader_name: r.uploader_name || "Recruiter",
    original_filename: r.original_filename,
    resume_date: r.resume_date,
    client_notes: r.client_notes,
    is_note_shared: r.is_note_shared || false,
    r2_key: r.r2_key,
    file_size: r.file_size,
    content_type: r.content_type || "application/pdf",
    upload_date: r.upload_date,
    has_application: Boolean(r.has_application),
  }));

  return c.json({
    items,
    total,
    page,
    page_size,
    total_pages: total > 0 ? Math.ceil(total / page_size) : 1,
  });
});

// 5. POST /api/resumes/upload (Multipart upload to Cloudflare R2 with compensation rollback)
resumesRouter.post("/upload", async (c) => {
  const user = c.get("user");

  // Only employees/recruiters can upload (matching FastAPI policy)
  if (user.role !== "employee" && user.role !== "recruiter") {
    return c.json({ detail: "Forbidden: Only Recruiters can upload resumes." }, 403);
  }

  const body = await c.req.parseBody({ all: true }).catch(() => null);
  if (!body) {
    return c.json({ detail: "Invalid multipart form data" }, 400);
  }

  const clientId = String(body["client_id"] || "").trim();
  if (!clientId) {
    return c.json({ detail: "client_id is required" }, 400);
  }

  const resumeDate = body["resume_date"] ? String(body["resume_date"]).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const requirementId = body["requirement_id"] ? String(body["requirement_id"]).trim() : null;

  const rawFiles = body["files"] || body["file"];
  if (!rawFiles) {
    return c.json({ detail: "No files uploaded" }, 400);
  }

  const files: File[] = Array.isArray(rawFiles)
    ? (rawFiles.filter((f) => f instanceof File) as File[])
    : rawFiles instanceof File
    ? [rawFiles]
    : [];

  if (files.length === 0) {
    return c.json({ detail: "No valid files found in payload" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);

  // Verify client exists
  const clientRows = await sql`
    SELECT id, company_name FROM clients WHERE id = ${clientId} LIMIT 1
  `;
  if (clientRows.length === 0) {
    return c.json({ detail: "Client not found" }, 404);
  }
  const clientName = clientRows[0].company_name;

  const items = [];
  let savedCount = 0;
  let needsReviewCount = 0;
  let rejectedCount = 0;

  for (const file of files) {
    const filename = file.name;
    const parsed = parseResumeFilename(filename, clientName);

    if (parsed.status === "needs_review") {
      needsReviewCount++;
      items.push({
        filename,
        status: "needs_review",
        message: parsed.error || "File requires manual review",
        client_name: clientName,
        client_id: clientId,
        candidate_name: parsed.candidate_name,
        company: parsed.company,
        role: parsed.role,
        resume_id_tag: parsed.resume_id_tag,
      });
      continue;
    }

    const fileBuffer = await file.arrayBuffer();
    const fileHash = await computeFileHash(fileBuffer);

    // Duplicate detection by hash or (client_id + candidate + company)
    const duplicateRows = await sql`
      SELECT id, candidate_name, company, resume_id_tag
      FROM resumes
      WHERE client_id = ${clientId}
        AND (
          file_hash = ${fileHash}
          OR (LOWER(candidate_name) = ${parsed.candidate_name.toLowerCase()} AND LOWER(company) = ${parsed.company.toLowerCase()})
        )
      LIMIT 1
    `;

    if (duplicateRows.length > 0) {
      rejectedCount++;
      items.push({
        filename,
        status: "duplicate",
        message: "Duplicate resume already exists for candidate and company",
        is_duplicate: true,
        candidate_name: parsed.candidate_name,
        company: parsed.company,
        role: parsed.role,
        saved_resume_id: duplicateRows[0].id,
      });
      continue;
    }

    // Step 1: Upload to Cloudflare R2
    const r2Key = generateResumeObjectKey(clientName, filename);
    await putResumeFile(
      c.env.RESUMES_BUCKET,
      r2Key,
      fileBuffer,
      file.type || "application/pdf",
      filename,
      {
        clientId,
        uploadedBy: user.id,
        fileHash,
      }
    );

    // Step 2: Insert row into Neon with Compensation Pattern
    const resumeId = crypto.randomUUID();
    try {
      await sql`
        INSERT INTO resumes (
          id, candidate_name, company, role, resume_id_tag,
          requirement_id, client_id, uploaded_by,
          r2_key, file_hash, file_size, content_type,
          original_filename, resume_date, upload_date
        ) VALUES (
          ${resumeId}, ${parsed.candidate_name}, ${parsed.company}, ${parsed.role}, ${parsed.resume_id_tag},
          ${requirementId}, ${clientId}, ${user.id},
          ${r2Key}, ${fileHash}, ${fileBuffer.byteLength}, ${file.type || "application/pdf"},
          ${filename}, ${resumeDate}, NOW()
        )
      `;

      savedCount++;
      items.push({
        filename,
        status: "saved",
        message: "Successfully uploaded to Cloudflare R2 and saved",
        saved_resume_id: resumeId,
        candidate_name: parsed.candidate_name,
        company: parsed.company,
        role: parsed.role,
        resume_id_tag: parsed.resume_id_tag,
        r2_key: r2Key,
        file_size: fileBuffer.byteLength,
      });
    } catch (err) {
      // COMPENSATION PATTERN: Delete orphaned R2 object if DB insertion fails
      await deleteResumeFile(c.env.RESUMES_BUCKET, r2Key);
      rejectedCount++;
      items.push({
        filename,
        status: "rejected",
        message: `Database failure: ${(err as any).message}`,
      });
    }
  }

  return c.json({
    success: true,
    total_files: files.length,
    saved_count: savedCount,
    uploaded: savedCount,
    needs_review_count: needsReviewCount,
    rejected_count: rejectedCount,
    client_synced: true,
    items,
  });
});

// 6. GET /api/resumes/:id
resumesRouter.get("/:id", async (c) => {
  const resumeId = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT
      r.*,
      c.company_name as client_name,
      u.name as uploader_name,
      req.role_code as requirement_code,
      EXISTS(SELECT 1 FROM applications a WHERE a.resume_id = r.id) as has_application
    FROM resumes r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN requirements req ON req.id = r.requirement_id
    WHERE r.id = ${resumeId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }

  const r = rows[0];
  const allowed = await getAllowedClientIds(sql, user);
  if (allowed !== null && !allowed.includes(String(r.client_id))) {
    return c.json({ detail: "Forbidden: Not authorized for this client" }, 403);
  }

  return c.json({
    id: r.id,
    display_id: r.resume_id_tag || (r.display_seq ? `RES${1000 + r.display_seq}` : "RES1000"),
    candidate_name: r.candidate_name,
    company: r.company,
    role: r.role,
    resume_id_tag: r.resume_id_tag,
    requirement_id: r.requirement_id,
    requirement_code: r.requirement_code,
    client_id: r.client_id,
    client_name: r.client_name || "Client",
    uploaded_by: r.uploaded_by,
    uploader_name: r.uploader_name || "Recruiter",
    original_filename: r.original_filename,
    resume_date: r.resume_date,
    client_notes: r.client_notes,
    is_note_shared: r.is_note_shared || false,
    r2_key: r.r2_key,
    file_size: r.file_size,
    content_type: r.content_type || "application/pdf",
    upload_date: r.upload_date,
    has_application: Boolean(r.has_application),
  });
});

// 7. GET /api/resumes/:id/preview
resumesRouter.get("/:id/preview", async (c) => {
  const resumeId = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT id, client_id, r2_key, original_filename, content_type
    FROM resumes
    WHERE id = ${resumeId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }

  const resume = rows[0];
  const allowed = await getAllowedClientIds(sql, user);
  if (allowed !== null && !allowed.includes(String(resume.client_id))) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const streamRequested = c.req.query("stream") === "true";

  // If R2 public custom domain configured and stream not requested -> 307 Redirect
  if (c.env.R2_PUBLIC_URL && !streamRequested && resume.r2_key) {
    const publicUrl = `${c.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/${resume.r2_key}`;
    return c.redirect(publicUrl, 307);
  }

  // Direct zero-egress stream via R2 binding
  if (!resume.r2_key) {
    return c.json({ detail: "File not available in R2 storage" }, 404);
  }

  const r2Object = await getResumeFile(c.env.RESUMES_BUCKET, resume.r2_key);
  if (!r2Object) {
    return c.json({ detail: "Object not found in R2 bucket" }, 404);
  }

  const headers = new Headers();
  r2Object.writeHttpMetadata(headers);
  headers.set("Content-Type", r2Object.httpMetadata?.contentType || "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${resume.original_filename}"`);
  headers.set("Cache-Control", "public, max-age=3600");

  return new Response(r2Object.body, { headers });
});

// 8. GET /api/resumes/:id/download
resumesRouter.get("/:id/download", async (c) => {
  const resumeId = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT id, client_id, r2_key, original_filename, content_type
    FROM resumes
    WHERE id = ${resumeId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }

  const resume = rows[0];
  const allowed = await getAllowedClientIds(sql, user);
  if (allowed !== null && !allowed.includes(String(resume.client_id))) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const streamRequested = c.req.query("stream") === "true";

  // If R2 public custom domain configured and stream not requested -> 307 Redirect
  if (c.env.R2_PUBLIC_URL && !streamRequested && resume.r2_key) {
    const publicUrl = `${c.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/${resume.r2_key}`;
    return c.redirect(publicUrl, 307);
  }

  if (!resume.r2_key) {
    return c.json({ detail: "File not available in R2 storage" }, 404);
  }

  const r2Object = await getResumeFile(c.env.RESUMES_BUCKET, resume.r2_key);
  if (!r2Object) {
    return c.json({ detail: "Object not found in R2 bucket" }, 404);
  }

  const headers = new Headers();
  r2Object.writeHttpMetadata(headers);
  headers.set("Content-Type", r2Object.httpMetadata?.contentType || "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${resume.original_filename}"`);

  return new Response(r2Object.body, { headers });
});

// 9. PUT / PATCH /api/resumes/:id
const updateHandler = async (c: any) => {
  const resumeId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ResumeUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      { detail: parseResult.error.issues[0]?.message || "Validation error" },
      400
    );
  }

  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`SELECT * FROM resumes WHERE id = ${resumeId} LIMIT 1`;
  if (rows.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }

  const existing = rows[0];
  const allowed = await getAllowedClientIds(sql, user);
  if (allowed !== null && !allowed.includes(String(existing.client_id))) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const data = parseResult.data;
  await sql`
    UPDATE resumes
    SET
      candidate_name = COALESCE(${data.candidate_name ?? null}, candidate_name),
      company = COALESCE(${data.company ?? null}, company),
      role = COALESCE(${data.role ?? null}, role),
      client_id = COALESCE(${data.client_id ?? null}, client_id),
      requirement_id = ${data.requirement_id !== undefined ? data.requirement_id : existing.requirement_id},
      resume_id_tag = ${data.resume_id_tag !== undefined ? data.resume_id_tag : existing.resume_id_tag},
      resume_date = ${data.resume_date !== undefined ? data.resume_date : existing.resume_date},
      client_notes = ${data.client_notes !== undefined ? data.client_notes : existing.client_notes},
      is_note_shared = COALESCE(${data.is_note_shared ?? null}, is_note_shared)
    WHERE id = ${resumeId}
  `;

  // Return updated record
  const updatedRows = await sql`
    SELECT
      r.*,
      c.company_name as client_name,
      u.name as uploader_name,
      req.role_code as requirement_code,
      EXISTS(SELECT 1 FROM applications a WHERE a.resume_id = r.id) as has_application
    FROM resumes r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN requirements req ON req.id = r.requirement_id
    WHERE r.id = ${resumeId}
    LIMIT 1
  `;

  const r = updatedRows[0];
  return c.json({
    id: r.id,
    display_id: r.resume_id_tag || (r.display_seq ? `RES${1000 + r.display_seq}` : "RES1000"),
    candidate_name: r.candidate_name,
    company: r.company,
    role: r.role,
    resume_id_tag: r.resume_id_tag,
    requirement_id: r.requirement_id,
    requirement_code: r.requirement_code,
    client_id: r.client_id,
    client_name: r.client_name || "Client",
    uploaded_by: r.uploaded_by,
    uploader_name: r.uploader_name || "Recruiter",
    original_filename: r.original_filename,
    resume_date: r.resume_date,
    client_notes: r.client_notes,
    is_note_shared: r.is_note_shared || false,
    r2_key: r.r2_key,
    file_size: r.file_size,
    content_type: r.content_type || "application/pdf",
    upload_date: r.upload_date,
    has_application: Boolean(r.has_application),
  });
};

resumesRouter.put("/:id", requireRoles("super_admin", "admin", "sub_admin", "employee", "recruiter"), updateHandler);
resumesRouter.patch("/:id", requireRoles("super_admin", "admin", "sub_admin", "employee", "recruiter"), updateHandler);

// 10. DELETE /api/resumes/:id
resumesRouter.delete(
  "/:id",
  requireRoles("super_admin", "admin", "sub_admin", "employee", "recruiter"),
  async (c) => {
    const resumeId = c.req.param("id");
    const user = c.get("user");
    const sql = getDb(c.env.DATABASE_URL);

    const rows = await sql`
      SELECT id, client_id, r2_key FROM resumes WHERE id = ${resumeId} LIMIT 1
    `;

    if (rows.length === 0) {
      return c.json({ detail: "Resume not found" }, 404);
    }

    const resume = rows[0];
    const allowed = await getAllowedClientIds(sql, user);
    if (allowed !== null && !allowed.includes(String(resume.client_id))) {
      return c.json({ detail: "Forbidden" }, 403);
    }

    // Delete from Cloudflare R2
    if (resume.r2_key) {
      await deleteResumeFile(c.env.RESUMES_BUCKET, resume.r2_key);
    }

    // Delete from database
    await sql`DELETE FROM resumes WHERE id = ${resumeId}`;

    return c.json({ success: true, message: "Resume deleted successfully" });
  }
);

// 11. POST /api/resumes/cleanup (Super Admin retention cleanup)
resumesRouter.post("/cleanup", requireRoles("super_admin", "admin"), async (c) => {
  const retentionDays = Number(c.req.query("retention_days") || c.env.RESUME_RETENTION_DAYS || 120);
  const sql = getDb(c.env.DATABASE_URL);

  const expiredRows = await sql`
    SELECT id, r2_key FROM resumes
    WHERE upload_date < NOW() - (${retentionDays} || ' days')::interval
  `;

  for (const row of expiredRows) {
    if (row.r2_key) {
      await deleteResumeFile(c.env.RESUMES_BUCKET, row.r2_key);
    }
  }

  if (expiredRows.length > 0) {
    const expiredIds = expiredRows.map((r: any) => r.id);
    await sql`DELETE FROM resumes WHERE id = ANY(${expiredIds})`;
  }

  return c.json({
    success: true,
    retention_days: retentionDays,
    cleaned_count: expiredRows.length,
  });
});
