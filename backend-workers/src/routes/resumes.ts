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
  deleteResume,
  getDownloadUrl,
  getPreviewUrl,
  uploadResume,
} from "../services/googleAppsScript";
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

  const { client_id, items: fileItems } = parseResult.data;
  const sql = getDb(c.env.DATABASE_URL);

  const clientRows = await sql`
    SELECT id, company_name FROM clients WHERE id = ${client_id} LIMIT 1
  `;
  if (clientRows.length === 0) {
    return c.json({ detail: "Client not found" }, 404);
  }

  const clientName = clientRows[0].company_name;
  const duplicates = [];

  for (const item of fileItems) {
    const filename = item.filename;
    const parsed = parseResumeFilename(filename, clientName);
    const candidateName = item.candidate_name || parsed.candidate_name;
    const company = item.company || parsed.company;

    if (!candidateName && !item.file_hash) continue;

    let existing: any[] = [];
    if (item.file_hash) {
      existing = await sql`
        SELECT id, candidate_name, company, role, resume_id_tag, original_filename
        FROM resumes
        WHERE client_id = ${client_id} AND file_hash = ${item.file_hash}
        LIMIT 1
      `;
    }

    if (existing.length === 0 && candidateName && company) {
      existing = await sql`
        SELECT id, candidate_name, company, role, resume_id_tag, original_filename
        FROM resumes
        WHERE client_id = ${client_id}
          AND LOWER(candidate_name) = ${candidateName.toLowerCase()}
          AND LOWER(company) = ${company.toLowerCase()}
        LIMIT 1
      `;
    }

    if (existing.length > 0) {
      duplicates.push({
        filename,
        is_duplicate: true,
        candidate_name: candidateName,
        company: company,
        role: item.resume_id_tag || parsed.role,
        existing_resume: existing[0],
      });
    }
  }

  return c.json({
    duplicates_found: duplicates.length,
    items: duplicates,
  });
});

// 3. GET /api/resumes/find-match
resumesRouter.get("/find-match", async (c) => {
  const clientId = c.req.query("client_id");
  const candidateName = (c.req.query("candidate_name") || "").trim();
  const company = (c.req.query("company") || "").trim();
  const role = (c.req.query("role") || "").trim();
  const tag = (c.req.query("tag") || "").trim();

  if (!clientId) {
    return c.json({ detail: "client_id is required" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  let match = null;

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
      r.file_name,
      r.original_filename,
      r.resume_date,
      r.client_notes,
      r.is_note_shared,
      r.drive_file_id,
      r.drive_view_url,
      r.drive_download_url,
      r.drive_web_view_link,
      r.drive_download_link,
      r.file_size,
      r.mime_type,
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

  const items = rows.map((r: any) => {
    const viewUrl = r.drive_view_url || r.drive_web_view_link || (r.drive_file_id ? getPreviewUrl(r.drive_file_id) : null);
    const downloadUrl = r.drive_download_url || r.drive_download_link || (r.drive_file_id ? getDownloadUrl(r.drive_file_id) : null);
    const fileName = r.file_name || r.original_filename;
    const mimeType = r.mime_type || r.content_type || "application/pdf";

    return {
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
      file_name: fileName,
      original_filename: fileName,
      resume_date: r.resume_date,
      client_notes: r.client_notes,
      is_note_shared: r.is_note_shared || false,
      drive_file_id: r.drive_file_id,
      drive_view_url: viewUrl,
      drive_download_url: downloadUrl,
      drive_web_view_link: viewUrl,
      drive_download_link: downloadUrl,
      file_size: r.file_size,
      mime_type: mimeType,
      content_type: mimeType,
      upload_date: r.upload_date,
      has_application: Boolean(r.has_application),
    };
  });

  return c.json({
    items,
    total,
    page,
    page_size,
    total_pages: total > 0 ? Math.ceil(total / page_size) : 1,
  });
});

// 5. POST /api/resumes/upload (Upload to Google Apps Script -> Google Drive -> Neon)
resumesRouter.post("/upload", async (c) => {
  const user = c.get("user");

  // Only employees/recruiters can upload (matching ApplyFlow RBAC policy)
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
    return c.json({ detail: "No resume file uploaded" }, 400);
  }

  const files: File[] = Array.isArray(rawFiles)
    ? (rawFiles.filter((f) => f instanceof File) as File[])
    : rawFiles instanceof File
    ? [rawFiles]
    : [];

  if (files.length === 0) {
    return c.json({ detail: "No valid files found in payload" }, 400);
  }

  // Phase 1 Validation: validate file extensions and sizes upfront
  for (const file of files) {
    const lower = (file.name || "").toLowerCase();
    const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";
    const isDocx =
      lower.endsWith(".docx") ||
      lower.endsWith(".doc") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/msword";

    if (!isPdf && !isDocx) {
      return c.json(
        { detail: `Unsupported file type for '${file.name}'. Only PDF and DOCX files are allowed.` },
        400
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return c.json(
        { detail: `File '${file.name}' exceeds the maximum allowed size of 10MB.` },
        400
      );
    }
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
  const createdDriveFileIds: string[] = [];

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

    // Step 1: Upload to Google Apps Script -> Google Drive
    let uploadRes;
    try {
      uploadRes = await uploadResume(fileBuffer, filename, clientName, c.env, file.type);
      createdDriveFileIds.push(uploadRes.fileId);
    } catch (uploadErr) {
      // Rollback any files uploaded earlier in this batch if batch fails
      for (const fId of createdDriveFileIds) {
        await deleteResume(fId, c.env);
      }
      return c.json(
        { detail: `Google Drive upload failed for '${filename}': ${(uploadErr as Error).message}` },
        502
      );
    }

    // Step 2: Insert row into Neon only after successful Drive upload
    const resumeId = crypto.randomUUID();
    try {
      await sql`
        INSERT INTO resumes (
          id, candidate_name, company, role, resume_id_tag,
          requirement_id, client_id, uploaded_by,
          drive_file_id, drive_view_url, drive_download_url,
          drive_web_view_link, drive_download_link,
          file_name, original_filename,
          mime_type, content_type,
          file_hash, file_size,
          resume_date, upload_date
        ) VALUES (
          ${resumeId}, ${parsed.candidate_name}, ${parsed.company}, ${parsed.role}, ${parsed.resume_id_tag},
          ${requirementId}, ${clientId}, ${user.id},
          ${uploadRes.fileId}, ${uploadRes.viewUrl}, ${uploadRes.downloadUrl},
          ${uploadRes.viewUrl}, ${uploadRes.downloadUrl},
          ${uploadRes.name}, ${uploadRes.name},
          ${uploadRes.mimeType}, ${uploadRes.mimeType},
          ${fileHash}, ${fileBuffer.byteLength},
          ${resumeDate}, NOW()
        )
      `;

      savedCount++;
      items.push({
        filename,
        status: "saved",
        message: "Successfully uploaded to Google Drive via Apps Script and saved",
        saved_resume_id: resumeId,
        candidate_name: parsed.candidate_name,
        company: parsed.company,
        role: parsed.role,
        resume_id_tag: parsed.resume_id_tag,
        drive_file_id: uploadRes.fileId,
        drive_view_url: uploadRes.viewUrl,
        drive_download_url: uploadRes.downloadUrl,
        file_name: uploadRes.name,
        mime_type: uploadRes.mimeType,
        drive_web_view_link: uploadRes.viewUrl,
        drive_download_link: uploadRes.downloadUrl,
        original_filename: uploadRes.name,
        content_type: uploadRes.mimeType,
        file_size: fileBuffer.byteLength,
      });
    } catch (err) {
      // COMPENSATION PATTERN: Delete orphaned Google Drive file if DB insertion fails
      await deleteResume(uploadRes.fileId, c.env);
      return c.json(
        { detail: `Database insertion failed for '${filename}': ${(err as any).message}` },
        500
      );
    }
  }

  return c.json(
    {
      success: true,
      fileId: items[0]?.drive_file_id,
      viewUrl: items[0]?.drive_view_url,
      downloadUrl: items[0]?.drive_download_url,
      name: items[0]?.file_name,
      mimeType: items[0]?.mime_type,
      drive_file_id: items[0]?.drive_file_id,
      drive_view_url: items[0]?.drive_view_url,
      drive_download_url: items[0]?.drive_download_url,
      file_name: items[0]?.file_name,
      mime_type: items[0]?.mime_type,
      total_files: files.length,
      saved_count: savedCount,
      uploaded: savedCount,
      needs_review_count: needsReviewCount,
      rejected_count: rejectedCount,
      client_synced: true,
      items,
    },
    201
  );
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

  const viewUrl = r.drive_view_url || r.drive_web_view_link || (r.drive_file_id ? getPreviewUrl(r.drive_file_id) : null);
  const downloadUrl = r.drive_download_url || r.drive_download_link || (r.drive_file_id ? getDownloadUrl(r.drive_file_id) : null);
  const fileName = r.file_name || r.original_filename;
  const mimeType = r.mime_type || r.content_type || "application/pdf";

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
    file_name: fileName,
    original_filename: fileName,
    resume_date: r.resume_date,
    client_notes: r.client_notes,
    is_note_shared: r.is_note_shared || false,
    drive_file_id: r.drive_file_id,
    drive_view_url: viewUrl,
    drive_download_url: downloadUrl,
    drive_web_view_link: viewUrl,
    drive_download_link: downloadUrl,
    file_size: r.file_size,
    mime_type: mimeType,
    content_type: mimeType,
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
    SELECT id, client_id, drive_file_id, drive_view_url, drive_web_view_link, file_name, original_filename
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

  const fileId = resume.drive_file_id;
  const webViewLink = resume.drive_view_url || resume.drive_web_view_link || (fileId ? getPreviewUrl(fileId) : null);

  if (!webViewLink) {
    return c.json({ detail: "File not available in Google Drive storage" }, 404);
  }

  // Authorization check passed: HTTP 302 redirect to Google Drive web view link
  return c.redirect(webViewLink, 302);
});

// 8. GET /api/resumes/:id/download
resumesRouter.get("/:id/download", async (c) => {
  const resumeId = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT id, client_id, drive_file_id, drive_download_url, drive_download_link, file_name, original_filename
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

  const fileId = resume.drive_file_id;
  const downloadLink = resume.drive_download_url || resume.drive_download_link || (fileId ? getDownloadUrl(fileId) : null);

  if (!downloadLink) {
    return c.json({ detail: "File not available in Google Drive storage" }, 404);
  }

  // Authorization check passed: HTTP 302 redirect to Google Drive direct download link
  return c.redirect(downloadLink, 302);
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
    drive_file_id: r.drive_file_id,
    drive_web_view_link: r.drive_web_view_link || (r.drive_file_id ? getPreviewUrl(r.drive_file_id) : null),
    drive_download_link: r.drive_download_link || (r.drive_file_id ? getDownloadUrl(r.drive_file_id) : null),
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
      SELECT id, client_id, drive_file_id FROM resumes WHERE id = ${resumeId} LIMIT 1
    `;

    if (rows.length === 0) {
      return c.json({ detail: "Resume not found" }, 404);
    }

    const resume = rows[0];
    const allowed = await getAllowedClientIds(sql, user);
    if (allowed !== null && !allowed.includes(String(resume.client_id))) {
      return c.json({ detail: "Forbidden" }, 403);
    }

    // Delete from Google Drive via Google Apps Script
    if (resume.drive_file_id) {
      await deleteResume(resume.drive_file_id, c.env);
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
    SELECT id, drive_file_id FROM resumes
    WHERE upload_date < NOW() - (${retentionDays} || ' days')::interval
  `;

  for (const row of expiredRows) {
    if (row.drive_file_id) {
      await deleteResume(row.drive_file_id, c.env);
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
