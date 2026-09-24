"""
ApplyFlow Resume Filename Parser (Strict ServiceClient Filename Verification)

Filename formats:
1. Standard 4-part: ServiceClient_Company_RoleOrRoleID_ResumeIdentifier.pdf
   - ABCStaffing_TCS_JavaDeveloper_RES101.pdf
   - TalentHub_Amazon_SDEII_RES205.pdf
   - NextHire_Infosys_INF-PY-02_RahulKumar.pdf
2. Standard 3-part: ServiceClient_HiringCompany_Role.pdf
   - Teksystems_Google_Data Analyst.pdf
   - Infosys_Microsoft_Java Developer.pdf
3. Natural resumes:
   - Suresh_resume (2).pdf, Suresh_resume.pdf, John_Doe.pdf

Validation Rules:
- If structured filename with ServiceClient (segment 0):
  - ServiceClient is compared against selected ServiceClient.
  - If mismatch -> 'ServiceClient Mismatch' (blocked / needs review).
  - If match -> 'ServiceClient Verified' (valid).
- If natural candidate resume (e.g. Suresh_resume.pdf):
  - Inherits selected ServiceClient -> valid.
  - If no client selected -> 'Cannot detect ServiceClient from filename' (needs review).
"""

import re
from pathlib import Path


def _normalize_client_name(name: str | None) -> str:
    """Normalize client name for case-insensitive and whitespace-insensitive comparison."""
    if not name:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', name).lower()


def _clean_candidate_name(raw_name: str | None) -> str:
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
        return "General Role"

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
        return "Service Client"
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', client_raw)
    spaced = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', spaced)
    return spaced.strip()


def format_company_name(company_raw: str | None) -> str:
    if not company_raw or not company_raw.strip():
        return "General"
    raw = company_raw.strip()
    if len(raw) <= 4 and raw.isalpha():
        return raw.upper()
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', raw)
    spaced = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', spaced)
    spaced = re.sub(r'[-_]+', ' ', spaced).strip()
    return " ".join(w.capitalize() for w in spaced.split())


TRAILING_NOISE_PATTERN = re.compile(
    r'^(resume|cv|biodata|final|latest|updated|v\d+|version\d*|version|[\(\[\{]\d+[\)\]\}]|\d+)$',
    re.IGNORECASE
)


def parse_resume_filename(
    filename: str,
    selected_client_name: str | None = None,
    all_clients: list[str] | None = None,
) -> dict:
    """
    Parse resume filename supporting:
    1. 4-part: ServiceClient_Company_RoleOrRoleID_ResumeIdentifier.pdf
    2. 3-part: ServiceClient_Company_Role.pdf
    3. Natural candidate resumes: Suresh_resume (2).pdf, Suresh_resume.pdf
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

    has_noise = any(re.search(r'\b(resume|cv|biodata)\b|[\(\[\{]\d+[\)\]\}]', p, re.IGNORECASE) for p in parts)

    # 1. Natural candidate resumes
    if has_noise or (len(parts) <= 2 and any(TRAILING_NOISE_PATTERN.match(p) for p in parts[1:])):
        cand_name = _clean_candidate_name(parts[0])
        if selected_client_name:
            return {
                "success": True,
                "status": "valid",
                "service_client": selected_client_name,
                "company": "General",
                "role": "General Role",
                "candidate_name": cand_name,
                "resume_identifier": parts[-1] if len(parts) > 1 else stem,
                "resume_id_tag": None,
                "client_match": True,
                "confidence": "high",
                "error": None,
            }
        else:
            return {
                "success": False,
                "status": "needs_review",
                "service_client": "ServiceClient",
                "company": "General",
                "role": "General Role",
                "candidate_name": cand_name,
                "resume_identifier": stem,
                "resume_id_tag": None,
                "client_match": False,
                "confidence": "low",
                "error": "Cannot detect ServiceClient from filename",
            }

    # 2. Strict check: Less than 3 segments and not a natural resume -> Invalid format
    if len(parts) < 3:
        comp = format_company_name(parts[0]) if len(parts) >= 1 else "General"
        r_title = format_role_title(parts[1]) if len(parts) >= 2 else "General Role"
        return {
            "success": False,
            "status": "needs_review",
            "service_client": selected_client_name or (format_client_name(parts[0]) if len(parts) >= 1 else "Unknown Client"),
            "company": comp,
            "role": r_title,
            "resume_identifier": parts[-1] if len(parts) >= 1 else "",
            "resume_id_tag": None,
            "candidate_name": stem.replace("_", " ").title(),
            "client_match": False,
            "confidence": "low",
            "error": "Invalid filename format. Expected: ServiceClient_Company_RoleOrRoleID_ResumeIdentifier.pdf",
        }

    # 3. 4 or more segments: ServiceClient_Company_Role_Identifier
    if len(parts) >= 4:
        raw_client = parts[0]
        raw_company = parts[1]
        raw_role_parts = parts[2:-1]
        raw_identifier = parts[-1]

        service_client = format_client_name(raw_client)
        company = format_company_name(raw_company)
        role = format_role_title("_".join(raw_role_parts))
        resume_identifier = raw_identifier

        resume_id_tag = resume_identifier
        id_match = re.search(r'^(RES\d+|Resume\d+|\d+)$', resume_identifier, re.IGNORECASE)
        if id_match:
            resume_id_tag = id_match.group(0).upper()
            candidate_name = f"Candidate {resume_id_tag}"
        else:
            name_spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', resume_identifier)
            candidate_name = name_spaced.replace("_", " ").title()

        client_match = True
        error_msg = None
        if selected_client_name:
            norm_parsed = _normalize_client_name(raw_client)
            norm_selected = _normalize_client_name(selected_client_name)
            if norm_parsed != norm_selected:
                client_match = False
                error_msg = f"Filename client '{raw_client}' does not match selected Service Client '{selected_client_name}'."
            else:
                service_client = selected_client_name

        return {
            "success": client_match,
            "status": "valid" if client_match else "needs_review",
            "service_client": service_client,
            "company": company,
            "role": role,
            "resume_identifier": resume_identifier,
            "resume_id_tag": resume_id_tag,
            "candidate_name": candidate_name,
            "client_match": client_match,
            "confidence": "high" if client_match else "low",
            "error": error_msg,
        }

    # 4. Exactly 3 segments: ServiceClient_HiringCompany_Role.pdf
    raw_client = parts[0]
    raw_company = parts[1]
    raw_role = parts[2]

    service_client = format_client_name(raw_client)
    company = format_company_name(raw_company)
    role = format_role_title(raw_role)
    resume_identifier = parts[-1]

    client_match = True
    error_msg = None
    if selected_client_name:
        norm_parsed = _normalize_client_name(raw_client)
        norm_selected = _normalize_client_name(selected_client_name)
        if norm_parsed != norm_selected:
            client_match = False
            error_msg = "ServiceClient Mismatch"
        else:
            service_client = selected_client_name

    has_digits = bool(re.search(r'\d', resume_identifier))
    return {
        "success": client_match,
        "status": "valid" if client_match else "needs_review",
        "service_client": service_client,
        "company": company,
        "role": role,
        "resume_identifier": resume_identifier,
        "resume_id_tag": resume_identifier if has_digits else None,
        "candidate_name": _clean_candidate_name(raw_role) if (not has_digits and len(raw_role.split()) <= 2) else "Candidate",
        "client_match": client_match,
        "confidence": "high" if client_match else "low",
        "error": error_msg,
    }
