/**
 * ApplyFlow Resume Filename Parser for Cloudflare Workers.
 * TypeScript port of parser.py with strict ServiceClient verification.
 */

export interface ParsedResumeResult {
  success: boolean;
  service_client: string;
  company: string;
  role: string;
  resume_identifier: string;
  resume_id_tag: string | null;
  candidate_name: string;
  status: "valid" | "needs_review";
  client_match: boolean;
  confidence: "high" | "low";
  error: string | null;
}

export function normalizeClientName(name?: string | null): string {
  if (!name) return "";
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function cleanCandidateName(rawName?: string | null): string {
  if (!rawName) return "Candidate";
  let cleaned = rawName.replace(/\.pdf$/i, "");
  cleaned = cleaned.replace(/[\(\[\{]\d+[\)\]\}]/g, "");
  cleaned = cleaned.replace(/[-_]+/g, " ");
  cleaned = cleaned.replace(/\b(resume|cv|biodata|profile|curriculum|vitae)\b/gi, "");
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (!cleaned) return "Candidate";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export function formatRoleTitle(roleRaw?: string | null): string {
  if (!roleRaw || !roleRaw.trim()) return "";
  const raw = roleRaw.trim();

  if (/^SDE[IVX\d]*$/i.test(raw)) {
    const match = raw.match(/^(SDE)([IVX\d]+)$/i);
    if (match) {
      return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
    }
    return raw.toUpperCase();
  }

  if (raw === raw.toUpperCase() && raw.length <= 5) {
    return raw;
  }

  // Split on delimiters: underscores, hyphens, or spaces
  const words = raw.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);

  return words
    .map((w) => {
      if (w === w.toUpperCase() && w.length <= 5) {
        return w;
      }
      if (w === w.toLowerCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      // If already has mixed case / PascalCase (e.g. ServiceNow, DevOps, CloudEngineer), preserve it!
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function formatCompanyName(companyRaw?: string | null): string {
  if (!companyRaw || !companyRaw.trim()) return "";
  const raw = companyRaw.trim();
  // Short acronyms like TCS, AWS, IBM, Wipro
  if (raw.length <= 4 && /^[a-zA-Z]+$/.test(raw)) {
    return raw.toUpperCase();
  }
  // If already PascalCase / mixed case without separators (e.g. SpatialFront)
  if (!raw.includes("_") && !raw.includes(" ") && !raw.includes("-")) {
    if (raw === raw.toLowerCase()) {
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return raw;
  }
  const spaced = raw.replace(/[-_]+/g, " ").trim();
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (w.length <= 4 && /^[a-zA-Z]+$/.test(w) && w === w.toUpperCase()) {
        return w;
      }
      if (w === w.toLowerCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function formatClientName(clientRaw?: string | null): string {
  if (!clientRaw || !clientRaw.trim()) return "";
  let spaced = clientRaw.trim().replace(/([a-z])([A-Z])/g, "$1 $2");
  spaced = spaced.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return spaced.trim();
}

const TRAILING_NOISE_REGEX = /^(resume|cv|biodata|final|latest|updated|v\d+|version\d*|version|[\(\[\{]\d+[\)\]\}]|\d+)$/i;

export function parseResumeFilename(
  filename: string,
  selectedClientName?: string | null
): ParsedResumeResult {
  // Strip extension
  const stem = filename.replace(/\.[^/.]+$/, "").trim();

  // Split primarily by underscore (recruiter format: Candidate_Company_Role)
  // If no underscore, split by hyphen or double space
  let parts: string[] = [];
  if (stem.includes("_")) {
    parts = stem.split("_").map((p) => p.trim()).filter(Boolean);
  } else if (stem.includes(" - ")) {
    parts = stem.split(" - ").map((p) => p.trim()).filter(Boolean);
  } else if (stem.includes("-")) {
    parts = stem.split("-").map((p) => p.trim()).filter(Boolean);
  } else {
    parts = [stem];
  }

  // Strip trailing noise tokens (Resume, CV, Final, Latest, Updated, v1, v2, Version, etc.)
  while (parts.length > 1 && TRAILING_NOISE_REGEX.test(parts[parts.length - 1])) {
    parts.pop();
  }

  // Service Client: NEVER inferred from filename. Always the selected client.
  const serviceClient = (selectedClientName && selectedClientName.trim()) || "Service Client";

  let candidateName = "Candidate";
  let company = "";
  let role = "";

  if (parts.length >= 3) {
    // Format: Candidate_Company_Role_With_Multiple_Words
    // First token -> Candidate Name
    candidateName = cleanCandidateName(parts[0]);
    // Second token -> Hiring Organization
    company = formatCompanyName(parts[1]);
    // Remaining meaningful tokens -> Target Role
    const roleTokens = parts.slice(2);
    // Filter out any interior noise tokens from role
    const filteredRoleTokens = roleTokens.filter((t) => !TRAILING_NOISE_REGEX.test(t));
    const roleRaw = (filteredRoleTokens.length > 0 ? filteredRoleTokens : roleTokens).join(" ");
    role = formatRoleTitle(roleRaw);
  } else if (parts.length === 2) {
    // Format: Candidate_Company or Candidate_Role
    candidateName = cleanCandidateName(parts[0]);
    company = formatCompanyName(parts[1]);
  } else if (parts.length === 1) {
    // Single token: Candidate Name
    candidateName = cleanCandidateName(parts[0]);
  }

  const resumeIdentifier = parts.length > 1 ? parts[parts.length - 1] : stem;
  const hasDigits = resumeIdentifier ? /\d/.test(resumeIdentifier) : false;
  const resumeIdTag = hasDigits ? resumeIdentifier : null;

  return {
    success: true,
    service_client: serviceClient,
    company: company || "Unknown Hiring Organization",
    role: role || "Unknown Target Role",
    resume_identifier: resumeIdentifier || "RES01",
    resume_id_tag: resumeIdTag,
    candidate_name: candidateName || "Candidate",
    status: "valid",
    client_match: true,
    confidence: "high",
    error: null,
  };
}

export interface ResolvedMetadata {
  candidate_name: string;
  company: string;
  role: string;
  service_client: string;
}

export function isPlaceholderCompany(val?: string | null): boolean {
  if (!val) return true;
  const v = val.trim().toLowerCase();
  return ["general", "unknown", "unknown hiring organization", "n/a", "none", "company"].includes(v);
}

export function isPlaceholderRole(val?: string | null): boolean {
  if (!val) return true;
  const v = val.trim().toLowerCase();
  return ["general", "general role", "unknown", "unknown target role", "n/a", "none", "role"].includes(v);
}

export function isPlaceholderCandidate(val?: string | null): boolean {
  if (!val) return true;
  const v = val.trim().toLowerCase();
  return ["candidate", "unknown", "resume", "cv", "name"].includes(v);
}

/**
 * Resolves metadata using the strict priority hierarchy:
 * 1. Service Client: Upload form selection (highest priority, never inferred from filename)
 * 2. Candidate Name: AI extraction -> Filename fallback -> "Candidate"
 * 3. Hiring Organization: AI extraction -> Filename fallback -> "Unknown Hiring Organization" (never "General")
 * 4. Target Role: AI extraction -> Filename fallback -> "Unknown Target Role" (never "General Role")
 */
export function resolveResumeMetadata(
  aiExtracted?: { candidate_name?: string | null; company?: string | null; role?: string | null } | null,
  filenameParsed?: { candidate_name?: string | null; company?: string | null; role?: string | null } | null,
  selectedClientName?: string | null
): ResolvedMetadata {
  // Candidate Name
  let candidate_name = "Candidate";
  if (aiExtracted?.candidate_name && !isPlaceholderCandidate(aiExtracted.candidate_name)) {
    candidate_name = aiExtracted.candidate_name.trim();
  } else if (filenameParsed?.candidate_name && !isPlaceholderCandidate(filenameParsed.candidate_name)) {
    candidate_name = filenameParsed.candidate_name.trim();
  }

  // Hiring Organization
  let company = "Unknown Hiring Organization";
  if (aiExtracted?.company && !isPlaceholderCompany(aiExtracted.company)) {
    company = aiExtracted.company.trim();
  } else if (filenameParsed?.company && !isPlaceholderCompany(filenameParsed.company)) {
    company = filenameParsed.company.trim();
  }

  // Target Role
  let role = "Unknown Target Role";
  if (aiExtracted?.role && !isPlaceholderRole(aiExtracted.role)) {
    role = aiExtracted.role.trim();
  } else if (filenameParsed?.role && !isPlaceholderRole(filenameParsed.role)) {
    role = filenameParsed.role.trim();
  }

  // Service Client: Single source of truth is the selected client
  const service_client = (selectedClientName && selectedClientName.trim()) || "Service Client";

  return {
    candidate_name,
    company,
    role,
    service_client,
  };
}
