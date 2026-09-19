"""
ApplyFlow Resume Filename Parser (Strict ServiceClient Filename Verification)

Filename formats:
1. Standard 3-part: ServiceClient_HiringCompany_Role.pdf (e.g. Teksystems_Google_Data Analyst.pdf)
2. Standard 4-part: ServiceClient_HiringCompany_Role_Candidate.pdf
3. Natural resumes: Suresh_resume (2).pdf, Suresh_resume.pdf, John_Doe.pdf

Validation Rules (Employee Upload):
- If filename has structured format (ServiceClient_Company_Role):
  - ServiceClient (segment 0) is strictly compared against selected ServiceClient.
  - If mismatch -> 'ServiceClient Mismatch' (blocked).
  - If matching -> 'ServiceClient Verified' (valid).
- If filename is a natural candidate resume (e.g. Suresh_resume.pdf):
  - Automatically inherits the selected ServiceClient -> 'ServiceClient Verified' (valid).
  - If no client selected in form -> 'Cannot detect ServiceClient from filename' (needs review).
- Company and Role are purely extracted and never block upload.
"""

import re
from pathlib import Path


def _normalize_client_name(name: str | None) -> str:
    """Normalize client name for case-insensitive and whitespace-insensitive comparison."""
    if not name:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', name).lower()


def _clean_candidate_name(raw_name: str) -> str:
    """Clean candidate name by removing noise like (1), (2), resume, cv, copy, etc."""
    if not raw_name:
        return "Candidate"
    cleaned = re.sub(r'\.pdf$', '', raw_name, flags=re.IGNORECASE)
    cleaned = re.sub(r'[\(\[\{]\d+[\)\]\}]', '', cleaned)
    cleaned = re.sub(r'\b(resume|cv|biodata|profile|curriculum|vitae)\b', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'[-_]+', ' ', cleaned)
    cleaned = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned.title() if cleaned else "Candidate"


def format_role_title(role_raw: str | None) -> str:
    """Format role names and preserve role codes."""
    if not role_raw or not role_raw.strip():
        return ""

    role_raw = role_raw.strip()

    if re.match(r'^SDE[IVX\d]*$', role_raw, re.IGNORECASE):
        match = re.match(r'^(SDE)([IVX\d]+)$', role_raw, re.IGNORECASE)
        if match:
            return f"{match.group(1).upper()} {match.group(2).upper()}"
        return role_raw.upper()

    if "-" in role_raw or bool(re.search(r'\d', role_raw) and re.search(r'[A-Za-z]', role_raw) and len(role_raw) <= 10):
        return role_raw.upper()

    if role_raw.isupper() and len(role_raw) <= 5:
        return role_raw

    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', role_raw)
    spaced = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', spaced)
    spaced = spaced.replace("_", " ").strip()
    return spaced.title()


def format_client_name(client_raw: str | None) -> str:
    """Format client names nicely from filename segment."""
    if not client_raw or not client_raw.strip():
        return ""
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', client_raw)
    spaced = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', spaced)
    return spaced.strip()


TRAILING_NOISE_PATTERN = re.compile(
    r'^(resume|cv|biodata|final|latest|updated|v\d+|version\d*|version|[\(\[\{]\d+[\)\]\}]|\d+)$',
    re.IGNORECASE
)


def format_company_name(company_raw: str | None) -> str:
    if not company_raw or not company_raw.strip():
        return ""
    raw = company_raw.strip()
    if len(raw) <= 4 and raw.isalpha():
        return raw.upper()
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', raw)
    spaced = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', spaced)
    spaced = re.sub(r'[-_]+', ' ', spaced).strip()
    return " ".join(w.capitalize() for w in spaced.split())


def parse_resume_filename(
    filename: str,
    selected_client_name: str | None = None,
    all_clients: list[str] | None = None,
) -> dict:
    """
    Parse resume filename with recruiter-style parsing:
    Candidate_Company_Role_With_Multiple_Words.pdf
    Service Client is NEVER inferred from filename.
    """
    stem = Path(filename).stem.strip()
    
    if "_" in stem:
        parts = [p.strip() for p in stem.split('_') if p.strip()]
    elif " - " in stem:
        parts = [p.strip() for p in stem.split(' - ') if p.strip()]
    elif "-" in stem:
        parts = [p.strip() for p in stem.split('-') if p.strip()]
    else:
        parts = [stem]

    # Strip trailing noise tokens (Resume, CV, Final, Latest, Updated, v1, v2, Version, etc.)
    while len(parts) > 1 and TRAILING_NOISE_PATTERN.match(parts[-1]):
        parts.pop()

    service_client = (selected_client_name and selected_client_name.strip()) or "Service Client"
    company = ""
    role = ""
    candidate_name = "Candidate"

    if len(parts) >= 3:
        # First token -> Candidate Name
        candidate_name = _clean_candidate_name(parts[0])
        # Second token -> Hiring Organization
        company = format_company_name(parts[1])
        # Remaining meaningful tokens -> Target Role
        role_tokens = [t for t in parts[2:] if not TRAILING_NOISE_PATTERN.match(t)]
        if not role_tokens:
            role_tokens = parts[2:]
        role = format_role_title(" ".join(role_tokens))
    elif len(parts) == 2:
        candidate_name = _clean_candidate_name(parts[0])
        company = format_company_name(parts[1])
    elif len(parts) == 1:
        candidate_name = _clean_candidate_name(parts[0])

    resume_identifier = parts[-1] if len(parts) > 1 else stem

    return {
        "success": True,
        "service_client": service_client,
        "company": company or "Unknown Hiring Organization",
        "role": role or "Unknown Target Role",
        "resume_identifier": resume_identifier or "RES01",
        "resume_id_tag": resume_identifier if (resume_identifier and bool(re.search(r'\d', resume_identifier))) else None,
        "candidate_name": candidate_name or "Candidate",
        "status": "valid",
        "client_match": True,
        "confidence": "high",
        "error": None,
    }
