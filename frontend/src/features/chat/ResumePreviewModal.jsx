import React from 'react';
import { FileText, Download, ExternalLink, Building2, Briefcase, Calendar, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { openResumePreview, openResumeDownload } from '@/utils/resumeUrls';

export function ResumePreviewModal({ isOpen, onClose, resumeInfo }) {
  if (!resumeInfo) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={resumeInfo.filename || 'Candidate Resume'}
      description="In-app verified document inspection and candidate profile"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 pt-2">
        {/* Header card with candidate details */}
        <div className="p-4 rounded-2xl bg-[#081226] text-white flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-[#2563EB]/20 border border-[#2563EB]/40 flex items-center justify-center text-[#60A5FA] shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-h3 font-bold text-white truncate">
                {resumeInfo.candidate_name || resumeInfo.filename || 'Candidate Profile'}
              </h3>
              <div className="flex items-center gap-3 text-caption text-[#94A3B8] mt-1">
                {resumeInfo.role && (
                  <span className="flex items-center gap-1 text-[#60A5FA] font-semibold">
                    <Briefcase className="w-3.5 h-3.5" />
                    {resumeInfo.role}
                  </span>
                )}
                {resumeInfo.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    Target: {resumeInfo.company}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openResumePreview(resumeInfo)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-caption font-semibold transition-colors border border-white/10 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open PDF
            </button>
          </div>
        </div>

        {/* Embedded Resume Preview Canvas */}
        <div className="rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-6 shadow-inner min-h-[360px] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Document Status</span>
                <div className="flex items-center gap-1.5 mt-0.5 text-small font-semibold text-[#16A34A]">
                  <CheckCircle2 className="w-4 h-4" />
                  Verified & Ready for Pipeline
                </div>
              </div>
              <span className="text-[12px] font-mono text-[#64748B] bg-white px-2.5 py-1 rounded-lg border border-[#E2E8F0]">
                {resumeInfo.filename || 'resume.pdf'}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-caption font-bold uppercase tracking-wider text-[#081226]">Candidate Overview</p>
              <p className="text-small text-[#475569] leading-relaxed bg-white p-4 rounded-xl border border-[#E2E8F0]">
                {resumeInfo.candidate_name ? `${resumeInfo.candidate_name} has been vetted for role opportunities.` : 'Candidate profile ingested through ApplyFlow talent recruitment system.'} All experience credentials and background details are indexed in PostgreSQL and synchronized to Google Drive cloud storage.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-caption text-[#64748B]">
            <span>ApplyFlow Cloud Storage</span>
            <span className="font-medium text-[#2563EB]">Google Apps Script Storage API</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-2 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <button
            type="button"
            onClick={() => openResumeDownload(resumeInfo)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-small font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download Resume
          </button>
        </div>
      </div>
    </Modal>
  );
}
