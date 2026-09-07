import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  ExternalLink,
  Building2,
  Briefcase,
  Loader2,
  AlertCircle,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  getDocumentEmbedUrl,
  getResumePreviewUrl,
  getResumeDownloadUrl,
  openResumePreview,
  openResumeDownload,
  extractDriveFileId,
} from '@/utils/resumeUrls';

export function ResumePreviewModal({ isOpen, onClose, resumeInfo }) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
  }, [resumeInfo?.id, resumeInfo?.drive_file_id, resumeInfo?.attachment_reference]);

  if (!resumeInfo) return null;

  const embedUrl = getDocumentEmbedUrl(resumeInfo);
  const previewUrl = getResumePreviewUrl(resumeInfo);
  const downloadUrl = getResumeDownloadUrl(resumeInfo);
  const fileId = extractDriveFileId(resumeInfo);
  const isCandidateProfile = Boolean(resumeInfo.candidate_name && resumeInfo.role);
  const displayName = resumeInfo.candidate_name || resumeInfo.filename || 'Document Preview';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={displayName}
      description={
        isCandidateProfile
          ? 'Verified candidate resume and credentials inspection'
          : 'Document attachment inspection and download'
      }
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 pt-1">
        {/* Top Header Card */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#081226] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#2563EB]/20 border border-[#2563EB]/40 flex items-center justify-center text-[#60A5FA] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-h3 font-bold text-white truncate">{displayName}</h3>
              <div className="flex flex-wrap items-center gap-2.5 text-caption text-[#94A3B8] mt-0.5">
                {resumeInfo.role && (
                  <span className="flex items-center gap-1 text-[#60A5FA] font-semibold">
                    <Briefcase className="w-3.5 h-3.5" />
                    {resumeInfo.role}
                  </span>
                )}
                {resumeInfo.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {resumeInfo.company}
                  </span>
                )}
                {resumeInfo.filename && (
                  <span className="text-[11px] font-mono text-[#CBD5E1] bg-white/10 px-2 py-0.5 rounded truncate max-w-[200px]">
                    {resumeInfo.filename}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {previewUrl && previewUrl !== '#' && (
              <button
                type="button"
                onClick={() => openResumePreview(resumeInfo)}
                title="Open document in new browser tab"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-caption font-semibold transition-colors border border-white/10 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>New Tab</span>
              </button>
            )}
            {downloadUrl && downloadUrl !== '#' && (
              <button
                type="button"
                onClick={() => openResumeDownload(resumeInfo)}
                title="Download document to device"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-caption font-semibold transition-colors shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            )}
          </div>
        </div>

        {/* Embedded Interactive Viewer */}
        <div className="relative w-full h-[62vh] min-h-[460px] rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] overflow-hidden shadow-inner flex flex-col items-center justify-center">
          {embedUrl ? (
            <>
              {/* Sleek Loading Overlay */}
              {!iframeLoaded && !iframeError && (
                <div className="absolute inset-0 z-10 bg-[#F8FAFC]/90 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
                  <p className="text-small font-semibold text-[#475569]">
                    Loading verified document preview…
                  </p>
                </div>
              )}

              {/* Document iframe */}
              <iframe
                src={embedUrl}
                title={displayName}
                className="w-full h-full border-0 bg-white"
                allow="autoplay"
                onLoad={() => setIframeLoaded(true)}
                onError={() => {
                  setIframeLoaded(true);
                  setIframeError(true);
                }}
              />
            </>
          ) : (
            /* Fallback if no direct embed URL exists */
            <div className="p-8 text-center max-w-md space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-h3 font-bold text-[#081226]">
                  {resumeInfo.filename || 'Document Attachment'}
                </h4>
                <p className="text-small text-[#64748B]">
                  Direct in-app embed preview is unavailable for this format, but you can open or download the file directly.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                {previewUrl && previewUrl !== '#' && (
                  <button
                    type="button"
                    onClick={() => openResumePreview(resumeInfo)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#CBD5E1] text-[#081226] text-small font-semibold hover:bg-[#F1F5F9] transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" /> Open in Google Drive
                  </button>
                )}
                {downloadUrl && downloadUrl !== '#' && (
                  <button
                    type="button"
                    onClick={() => openResumeDownload(resumeInfo)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] text-white text-small font-semibold hover:bg-[#1D4ED8] transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download File
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Status & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-caption text-[#64748B]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">
              Synchronized with ApplyFlow Google Drive cloud storage
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {downloadUrl && downloadUrl !== '#' && (
              <button
                type="button"
                onClick={() => openResumeDownload(resumeInfo)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-small font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Document
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
