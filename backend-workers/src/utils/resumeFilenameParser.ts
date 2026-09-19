/**
 * Shared Resume Filename Parser for ApplyFlow
 * Extracts Candidate Name, Hiring Organization, and Target Role from recruiter filenames.
 */

const TRAILING_NOISE_REGEX =
  /^((resume|cv|biodata|final|latest|updated|version\d*|v\d+|\d+)[\(\)\[\]\{\}\d\-_ ]*|[\(\[\{]\d+[\)\]\}]|\d+)$/i;

export interface ParsedFilenameMetadata {
  candidateName: string;
  hiringOrganization: string;
  targetRole: string;
  confidence: "high" | "medium" | "low";
}

export function cleanCandidateName(raw?: string | null): string {
  if (!raw || !raw.trim()) return "Candidate";
  let cleaned = raw.replace(/\.[^/.]+$/i, "");
  cleaned = cleaned.replace(/[\(\[\{]\d+[\)\]\}]/g, "");
  cleaned = cleaned.replace(/\b(resume|cv|biodata|profile|curriculum|vitae)\b/gi, "");
  cleaned = cleaned.replace(/[-_]+/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (!cleaned) return "Candidate";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export function formatCompanyName(companyRaw?: string | null): string {
  if (!companyRaw || !companyRaw.trim()) return "";
  const raw = companyRaw.trim();

  // Acronyms like TCS, AWS, IBM
  if (raw.length <= 4 && /^[a-zA-Z]+$/.test(raw)) {
    return raw.toUpperCase();
  }

  // Preserve PascalCase without separators (e.g. SpatialFront)
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

export function formatRoleTitle(roleRaw?: string | null): string {
  if (!roleRaw || !roleRaw.trim()) return "";
  const raw = roleRaw.trim();

  // SDE2 -> SDE 2
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
      // SDE2 in multi-word role
      if (/^SDE[IVX\d]*$/i.test(w)) {
        const match = w.match(/^(SDE)([IVX\d]+)$/i);
        if (match) {
          return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
        }
        return w.toUpperCase();
      }
      if (w === w.toUpperCase() && w.length <= 5) {
        return w;
      }
      if (w === w.toLowerCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      // Preserve PascalCase (e.g. ServiceNow, DevOps)
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Parses recruiter-style resume filenames:
 * Candidate_Company_Role_With_Multiple_Words.pdf
 */
export function parseResumeFilename(filename: string): ParsedFilenameMetadata {
  if (!filename || !filename.trim()) {
    return {
      candidateName: "Candidate",
      hiringOrganization: "Unknown Hiring Organization",
      targetRole: "Unknown Target Role",
      confidence: "low",
    };
  }

  // Normalize: Strip extension and path
  const baseName = filename.split(/[/\\]/).pop() || filename;
  const stem = baseName.replace(/\.[^/.]+$/, "").trim();

  // Split by common delimiters
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

  // Strip trailing noise words (Resume, CV, Final, Updated, Latest, Version, V1, V2, etc.)
  while (parts.length > 1 && TRAILING_NOISE_REGEX.test(parts[parts.length - 1])) {
    parts.pop();
  }

  // Case: filename was purely noise like Resume.pdf or CV.pdf
  if (parts.length === 1 && TRAILING_NOISE_REGEX.test(parts[0])) {
    return {
      candidateName: "Candidate",
      hiringOrganization: "Unknown Hiring Organization",
      targetRole: "Unknown Target Role",
      confidence: "low",
    };
  }

  if (parts.length >= 3) {
    // 1st token -> Candidate Name
    const candidateName = cleanCandidateName(parts[0]);
    // 2nd token -> Hiring Organization
    const hiringOrganization = formatCompanyName(parts[1]);
    // 3rd+ tokens -> Target Role
    const roleTokens = parts.slice(2).filter((t) => !TRAILING_NOISE_REGEX.test(t));
    const targetRole = formatRoleTitle(
      (roleTokens.length > 0 ? roleTokens : parts.slice(2)).join(" ")
    );

    return {
      candidateName: candidateName || "Candidate",
      hiringOrganization: hiringOrganization || "Unknown Hiring Organization",
      targetRole: targetRole || "Unknown Target Role",
      confidence: "high",
    };
  }

  if (parts.length === 2) {
    const candidateName = cleanCandidateName(parts[0]);
    const hiringOrganization = formatCompanyName(parts[1]);

    return {
      candidateName: candidateName || "Candidate",
      hiringOrganization: hiringOrganization || "Unknown Hiring Organization",
      targetRole: "Unknown Target Role",
      confidence: "medium",
    };
  }

  if (parts.length === 1) {
    const candidateName = cleanCandidateName(parts[0]);
    return {
      candidateName: candidateName || "Candidate",
      hiringOrganization: "Unknown Hiring Organization",
      targetRole: "Unknown Target Role",
      confidence: "low",
    };
  }

  return {
    candidateName: "Candidate",
    hiringOrganization: "Unknown Hiring Organization",
    targetRole: "Unknown Target Role",
    confidence: "low",
  };
}
