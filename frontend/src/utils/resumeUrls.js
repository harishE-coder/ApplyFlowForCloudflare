/**
 * Shared Single-Source Resume URL Helpers for ApplyFlow ATS.
 * Used across:
 * 1. Admin Candidate Bank (ResumesPage.jsx)
 * 2. Employee Uploaded Resumes (EmployeeDashboard.jsx / UploadPage.jsx)
 * 3. Client Candidate Preview (ClientDashboard.jsx)
 * 4. Applications and Chat Modals (ApplicationsPage.jsx / ResumePreviewModal.jsx)
 */

/**
 * Returns the Google Drive / fallback preview URL for a resume object.
 */
export function getResumePreviewUrl(resume) {
  if (!resume) return '#';
  const apiBaseUrl = (typeof window !== 'undefined' ? window.location.origin : '');
  const fallbackId = resume.saved_resume_id || resume.id || resume.resume_id;

  return (
    resume.drive_view_url ||
    resume.drive_web_view_link ||
    (resume.drive_file_id
      ? `https://drive.google.com/file/d/${resume.drive_file_id}/view?usp=sharing`
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

  return (
    resume.drive_download_url ||
    resume.drive_download_link ||
    (resume.drive_file_id
      ? `https://drive.google.com/uc?export=download&id=${resume.drive_file_id}`
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

  if (resume.drive_file_id) {
    return `https://drive.google.com/file/d/${resume.drive_file_id}/view?usp=sharing`;
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
