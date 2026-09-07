import React, { useState, useEffect } from 'react';
import { FileText, Search, Send, Check, Building2, Briefcase, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

export function ResumeShareModal({ isOpen, onClose, roomId, clientName, onShareResume }) {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedResumeId, setSelectedResumeId] = useState(null);
  const [caption, setCaption] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSelectedResumeId(null);
    setCaption('');
    setSearch('');

    // Query the existing Candidate Bank endpoint directly (no duplicate endpoint)
    api
      .get('/resumes', { params: { page_size: 100 } })
      .then((res) => {
        const list = res.data?.items || (Array.isArray(res.data) ? res.data : []);
        setResumes(list);
      })
      .catch((err) => {
        console.error('Failed to fetch Candidate Bank resumes:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  // Enhanced search by Candidate Name, Company, and Role
  const filteredResumes = (Array.isArray(resumes) ? resumes : []).filter((r) => {
    const term = (search || '').toLowerCase().trim();
    if (!term) return true;
    const name = (r?.candidate_name || '').toLowerCase();
    const company = (r?.company || '').toLowerCase();
    const role = (r?.role || r?.role_designation || '').toLowerCase();
    const filename = (r?.original_filename || '').toLowerCase();
    return name.includes(term) || company.includes(term) || role.includes(term) || filename.includes(term);
  });

  const handleShare = async () => {
    if (!selectedResumeId) return;
    setSharing(true);
    try {
      await onShareResume(selectedResumeId, caption.trim());
      onClose();
    } catch (err) {
      console.error('Failed to share resume:', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Candidate Resume"
      description={`Select a candidate resume from the Candidate Bank${clientName ? ` for ${clientName}` : ''} to share directly in chat.`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 pt-2">
        {/* Search by candidate, company, role */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            placeholder="Search candidate, hiring organization, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] text-small font-medium text-[#081226] focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all outline-hidden"
          />
        </div>

        {/* Resumes List */}
        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 divide-y divide-[#F1F5F9]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#64748B]">
              <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
              <p className="text-caption font-medium">Loading Candidate Bank...</p>
            </div>
          ) : filteredResumes.length === 0 ? (
            <div className="py-12 text-center text-[#64748B]">
              <FileText className="w-10 h-10 mx-auto text-[#CBD5E1] mb-2" />
              <p className="text-small font-semibold text-[#081226]">No Resumes Found</p>
              <p className="text-caption mt-0.5">
                {search ? 'Try adjusting your search query' : 'No resumes found in Candidate Bank.'}
              </p>
            </div>
          ) : (
            filteredResumes.map((resume) => {
              const isSelected = selectedResumeId === resume.id;
              const roleDisplay = resume.role || resume.role_designation || 'Candidate';
              return (
                <div
                  key={resume.id}
                  onClick={() => setSelectedResumeId(resume.id)}
                  className={`pt-2 pb-2 px-3 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-[#EFF6FF] border border-[#2563EB]/40 shadow-xs'
                      : 'hover:bg-[#F8FAFC] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#2563EB] text-white'
                          : 'bg-[#F1F5F9] text-[#64748B] group-hover:bg-[#E2E8F0] group-hover:text-[#081226]'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-small font-semibold text-[#081226] truncate">
                        {resume.candidate_name || 'Unnamed Candidate'}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[#64748B] mt-0.5">
                        <span className="font-medium text-[#2563EB] flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-[#2563EB]" />
                          {roleDisplay}
                        </span>
                        <span>•</span>
                        <span className="truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#94A3B8]" />
                          {resume.company || 'Direct Ingestion'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-[#2563EB] bg-[#2563EB] text-white'
                          : 'border-[#CBD5E1] group-hover:border-[#94A3B8]'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Optional Caption Field */}
        <div className="space-y-1.5 pt-1">
          <label className="text-caption font-semibold text-[#081226]">
            Optional Caption / Note
          </label>
          <input
            type="text"
            placeholder="Add a note (e.g., Shortlisted candidate for review)..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] text-small font-medium text-[#081226] focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all outline-hidden"
          />
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose} disabled={sharing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleShare}
            disabled={!selectedResumeId || sharing}
            icon={sharing ? Loader2 : Send}
          >
            {sharing ? 'Sharing...' : 'Share in Room'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ResumeShareModal;
