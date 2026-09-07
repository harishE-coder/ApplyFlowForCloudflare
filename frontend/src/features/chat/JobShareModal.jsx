import React, { useState, useEffect } from 'react';
import { Briefcase, Search, Send, Check, Building2, MapPin, Users, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

export function JobShareModal({ isOpen, onClose, onShareJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [caption, setCaption] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSelectedJobId(null);
    setCaption('');
    setSearch('');

    api
      .get('/requirements')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        setJobs(list);
      })
      .catch((err) => {
        console.error('Failed to fetch job requirements:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  const filteredJobs = (Array.isArray(jobs) ? jobs : []).filter((j) => {
    const term = (search || '').toLowerCase().trim();
    if (!term) return true;
    const title = (j?.job_title || j?.role || '').toLowerCase();
    const company = (j?.company || j?.client_name || '').toLowerCase();
    const location = (j?.location || '').toLowerCase();
    const roleCode = (j?.role_code || '').toLowerCase();
    return title.includes(term) || company.includes(term) || location.includes(term) || roleCode.includes(term);
  });

  const handleShare = async () => {
    if (!selectedJobId) return;
    setSharing(true);
    try {
      await onShareJob(selectedJobId, caption.trim());
      onClose();
    } catch (err) {
      console.error('Failed to share job requirement:', err);
    } finally {
      setSharing(false);
    }
  };

  const getPriorityBadgeClass = (priority) => {
    const p = (priority || '').toLowerCase();
    if (p === 'high') {
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    }
    if (p === 'medium') {
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    }
    return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Job Opening in Chat"
      description="Reference an existing job opening to share as a discussion point or reminder."
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 pt-2">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            placeholder="Search job title, hiring organization, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] text-small font-medium text-[#081226] focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-all outline-hidden"
          />
        </div>

        {/* Job List */}
        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 divide-y divide-[#F1F5F9]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#64748B]">
              <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
              <p className="text-caption font-medium">Loading job openings...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="py-12 text-center text-[#64748B]">
              <Briefcase className="w-10 h-10 mx-auto text-[#CBD5E1] mb-2" />
              <p className="text-small font-semibold text-[#081226]">No Job Openings Found</p>
              <p className="text-caption mt-0.5">
                {search ? 'Try adjusting your search query' : 'No active job openings found.'}
              </p>
            </div>
          ) : (
            filteredJobs.map((job) => {
              const isSelected = selectedJobId === job.id;
              const title = job.job_title || job.role || 'Open Role';
              const company = job.company || job.client_name || 'Client';
              const location = job.location || 'Remote';
              const openings = job.openings || 1;
              const priority = job.priority || 'Medium';

              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`pt-2.5 pb-2.5 px-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
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
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-small font-semibold text-[#081226] truncate">
                          {title}
                        </p>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPriorityBadgeClass(
                            priority
                          )}`}
                        >
                          {priority} Priority
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#64748B] mt-1">
                        <span className="truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#94A3B8]" />
                          {company}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#94A3B8]" />
                          {location}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-medium text-[#2563EB]">
                          <Users className="w-3 h-3" />
                          {openings} {openings === 1 ? 'opening' : 'openings'}
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
            placeholder="e.g., Urgent opening — Need 3 React developers this week..."
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
            disabled={!selectedJobId || sharing}
            icon={sharing ? Loader2 : Send}
          >
            {sharing ? 'Sharing...' : 'Share in Room'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default JobShareModal;
