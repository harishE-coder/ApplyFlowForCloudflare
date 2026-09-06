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

  if (raw.includes("-") || (/\d/.test(raw) && /[A-Za-z]/.test(raw) && raw.length <= 10)) {
    return raw.toUpperCase();
  }

  if (raw === raw.toUpperCase() && raw.length <= 5) {
    return raw;
  }

  let spaced = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
  spaced = spaced.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  spaced = spaced.replace(/_/g, " ").trim();

  return spaced
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export function formatClientName(clientRaw?: string | null): string {
  if (!clientRaw || !clientRaw.trim()) return "";
  let spaced = clientRaw.trim().replace(/([a-z])([A-Z])/g, "$1 $2");
  spaced = spaced.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return spaced.trim();
}

export function parseResumeFilename(
  filename: string,
  selectedClientName?: string | null
): ParsedResumeResult {
  // Strip extension
  const stem = filename.replace(/\.[^/.]+$/, "").trim();
  const parts = stem.split("_").map((p) => p.trim()).filter(Boolean);

  const rawFirst = parts[0] || "";
  const normFirst = normalizeClientName(rawFirst);
  const normSelected = normalizeClientName(selectedClientName);

  const hasNoise = parts.some((p) =>
    /\b(resume|cv|biodata)\b|[\(\[\{]\d+[\)\]\}]/i.test(p)
  );

  let serviceClient =
    selectedClientName || (rawFirst ? formatClientName(rawFirst) : "ServiceClient");
  let company = "";
  let role = "";
  const resumeIdentifier = parts.length > 1 ? parts[parts.length - 1] : stem;
  let candidateName = "Candidate";
  let status: "valid" | "needs_review" = "valid";
  let error: string | null = null;
  let clientMatch = true;

  // 1. Standard structured format without noise (e.g. Teksystems_Google_Data Analyst.pdf)
  if (parts.length >= 2 && !hasNoise) {
    company = parts[1].length <= 4 ? parts[1].toUpperCase() : formatRoleTitle(parts[1]);
    if (parts.length >= 3) {
      const roleRaw = parts.length === 3 ? parts.slice(2).join("_") : parts.slice(2, -1).join("_");
      role = formatRoleTitle(roleRaw);
      candidateName = cleanCandidateName(parts.length >= 4 ? parts[parts.length - 1] : parts[0]);
    } else {
      candidateName = cleanCandidateName(parts[0]);
    }

    if (selectedClientName) {
      if (normFirst === normSelected) {
        serviceClient = selectedClientName;
        status = "valid";
        clientMatch = true;
        error = null;
      } else {
        status = "needs_review";
        clientMatch = false;
        error = "ServiceClient Mismatch";
      }
    } else {
      serviceClient = formatClientName(parts[0]);
      status = "valid";
      clientMatch = true;
    }
  } else {
    // 2. Natural candidate filenames (e.g. Suresh_resume (2).pdf, John_Doe.pdf)
    candidateName = cleanCandidateName(rawFirst || stem);
    if (selectedClientName) {
      serviceClient = selectedClientName;
      status = "valid";
      clientMatch = true;
      error = null;
    } else {
      serviceClient = "ServiceClient";
      status = "needs_review";
      clientMatch = false;
      error = "Cannot detect ServiceClient from filename";
    }
  }

  const hasDigits = resumeIdentifier ? /\d/.test(resumeIdentifier) : false;
  const resumeIdTag = hasDigits ? resumeIdentifier : null;

  return {
    success: status === "valid",
    service_client: serviceClient,
    company: company || "General",
    role: role || "General Role",
    resume_identifier: resumeIdentifier || "RES01",
    resume_id_tag: resumeIdTag,
    candidate_name: candidateName || "Candidate",
    status,
    client_match: clientMatch,
    confidence: status === "valid" ? "high" : "low",
    error,
  };
}
