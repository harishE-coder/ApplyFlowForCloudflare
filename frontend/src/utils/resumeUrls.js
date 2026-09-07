/**
 * Shared Single-Source Resume URL Helpers for ApplyFlow ATS.
 * Used across:
 * 1. Admin Candidate Bank (ResumesPage.jsx)
 * 2. Employee Uploaded Resumes (EmployeeDashboard.jsx / UploadPage.jsx)
 * 3. Client Candidate Preview (ClientDashboard.jsx)
 * 4. Applications and Chat Modals (ApplicationsPage.jsx / ResumePreviewModal.jsx)
 */

/**
 * Accurately extracts a Google Drive File ID from various shapes:
 * string ID, URL (e.g. /file/d/..., ?id=..., lh3.googleusercontent.com/d/...), or object.
 */
export function extractDriveFileId(source) {
  if (!source) return null;
  if (typeof source === 'object') {
    if (source.drive_file_id) return extractDriveFileId(source.drive_file_id);
    if (source.fileId) return extractDriveFileId(source.fileId);
    if (source.attachment_reference && !source.attachment_reference.includes('/') && !source.attachment_reference.includes(' ')) {
      return extractDriveFileId(source.attachment_reference);
    }
    const candidate = source.drive_view_url || source.attachment_url || source.drive_download_url || source.attachment_download_url || source.attachment_thumbnail_url;
    if (candidate) return extractDriveFileId(candidate);
    return null;
  }
  if (typeof source !== 'string') return null;

  // Check for /file/d/{id} pattern
  const fileDMatch = source.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // Check for id={id} query parameter
  const idMatch = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];

  // Check for googleusercontent.com/d/{id}
  const lh3Match = source.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  // Check if it's already a raw Drive File ID (typical length 20-50, alphanumeric, underscores, hyphens)
  // UUIDs are 36 chars with 4 hyphens (8-4-4-4-12)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source);
  if (!isUuid && /^[a-zA-Z0-9_-]{20,50}$/.test(source)) {
    return source;
  }

  return null;
}

/**
 * Returns raw image URL suitable for <img> tags.
 * For Drive files: uses high-speed direct content URL https://lh3.googleusercontent.com/d/{fileId}.
 */
export function getImageDirectUrl(source) {
  if (!source) return '';
  const fileId = extractDriveFileId(source);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }
  if (typeof source === 'object') {
    return source.attachment_thumbnail_url || source.attachment_url || source.attachment_download_url || '';
  }
  return typeof source === 'string' ? source : '';
}

/**
 * Returns fast thumbnail image URL for responsive preview.
 */
export function getImageThumbnailUrl(source) {
  if (!source) return '';
  const fileId = extractDriveFileId(source);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }
  if (typeof source === 'object') {
    return source.attachment_thumbnail_url || source.attachment_url || '';
  }
  return typeof source === 'string' ? source : '';
}

/**
 * Returns embeddable document URL suitable for <iframe>.
 * For Drive files: uses https://drive.google.com/file/d/{fileId}/preview.
 */
export function getDocumentEmbedUrl(source) {
  if (!source) return '';
  const fileId = extractDriveFileId(source);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  if (typeof source === 'object') {
    const raw = source.drive_view_url || source.attachment_url || '';
    if (raw.includes('/view')) {
      return raw.replace('/view', '/preview');
    }
    return raw;
  }
  if (typeof source === 'string' && source.includes('/view')) {
    return source.replace('/view', '/preview');
  }
  return typeof source === 'string' ? source : '';
}

/**
 * Returns the Google Drive / fallback preview URL for a resume object.
 */
export function getResumePreviewUrl(resume) {
  if (!resume) return '#';
  const apiBaseUrl = (typeof window !== 'undefined' ? window.location.origin : '');
  const fallbackId = resume.saved_resume_id || resume.id || resume.resume_id;
  const fileId = extractDriveFileId(resume);

  return (
    resume.drive_view_url ||
    resume.drive_web_view_link ||
    (fileId
      ? `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
      : fallbackId
      ? `${apiBaseUrl}/api/resumes/${fallbackId}/preview`
      : '#')
  );
}

/**
 * Returns the Google Drive / fallback direct download URL for a resume object.
 */
export function getResumeDownloadUrl(resume) {
  if (!resume) return '#';
  const apiBaseUrl = (typeof window !== 'undefined' ? window.location.origin : '');
  const fallbackId = resume.saved_resume_id || resume.id || resume.resume_id;
  const fileId = extractDriveFileId(resume);

  return (
    resume.drive_download_url ||
    resume.drive_download_link ||
    (fileId
      ? `https://drive.google.com/uc?export=download&id=${fileId}`
      : fallbackId
      ? `${apiBaseUrl}/api/resumes/${fallbackId}/download`
      : '#')
  );
}

/**
 * Returns the public Google Drive sharing URL for copying to clipboard.
 */
export function getResumeShareUrl(resume) {
  if (!resume) return '';
  const fallbackId = resume.saved_resume_id || resume.id || resume.resume_id;
  const fileId = extractDriveFileId(resume);

  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  }
  if (resume.drive_view_url) {
    return resume.drive_view_url;
  }
  if (resume.drive_web_view_link) {
    return resume.drive_web_view_link;
  }
  return fallbackId ? `${window.location.origin}/api/resumes/${fallbackId}/preview` : '';
}

/**
 * Opens resume preview in a new browser tab with security attributes.
 */
export function openResumePreview(resume) {
  const url = getResumePreviewUrl(resume);
  if (url && url !== '#') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Opens resume download in a new browser tab.
 */
export function openResumeDownload(resume) {
  const url = getResumeDownloadUrl(resume);
  if (url && url !== '#') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Copies resume share link to user's clipboard and triggers optional toast callback.
 */
export async function copyResumeShareLink(resume, notifySuccess) {
  const shareUrl = getResumeShareUrl(resume);
  if (!shareUrl) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      if (typeof notifySuccess === 'function') {
        notifySuccess('Link Copied', 'Google Drive candidate share link copied to clipboard.');
      }
      return true;
    } else {
      prompt('Copy candidate resume link:', shareUrl);
      return true;
    }
  } catch {
    prompt('Copy candidate resume link:', shareUrl);
    return true;
  }
}
