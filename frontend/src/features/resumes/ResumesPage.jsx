import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  FileText,
  Eye,
  Download,
  Share2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Building2,
  Briefcase,
  Calendar,
  CheckCircle2,
  Tag,
  MessageSquare,
  MoreVertical,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { DateFilter } from '@/components/ui/DateFilter';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { formatDate, cn } from '@/utils/cn';
import {
  getResumePreviewUrl,
  getResumeDownloadUrl,
  getResumeShareUrl,
  openResumePreview,
  openResumeDownload,
  copyResumeShareLink,
} from '@/utils/resumeUrls';

// Memoized Candidate Row Component to eliminate unnecessary re-renders
const CandidateRow = React.memo(function CandidateRow({
  candidate,
  isSelected,
  onSelect,
  menuItems,
  showAudit,
}) {
  return (
    <div
      onClick={() => onSelect(candidate)}
      className={cn(
        'px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer transition-all duration-100 group relative',
        isSelected ? 'bg-[#EFF6FF] border-l-4 border-[#2563EB]' : 'hover:bg-[#F8FAFC]'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={candidate.candidate_name} size="sm" variant={isSelected ? 'blue' : 'navy'} />

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-small font-bold truncate',
                isSelected ? 'text-[#2563EB]' : 'text-[#081226]'
              )}
            >
              {candidate.candidate_name}
            </span>

            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white text-[#475569] border border-[#E2E8F0] shrink-0">
              {candidate.resume_id_tag || `RES${candidate.display_seq || 1000}`}
            </span>

            {showAudit && candidate.is_backfilled && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 shrink-0 cursor-help"
                title={`Uploaded on ${formatDate(candidate.created_at)} for work completed on ${formatDate(candidate.work_date || candidate.resume_date)} (${candidate.delay_days} day delay)`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                🟡 Backfilled ({candidate.delay_days}d)
              </span>
            )}
          </div>

          <p className="text-caption text-[#64748B] mt-0.5 truncate flex items-center gap-1.5">
            <span className="font-semibold text-[#334155]">{candidate.company || 'General'}</span>
            <span>•</span>
            <span className="truncate">{candidate.role}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {showAudit && (
          <div className="hidden lg:flex flex-col items-end text-[11px] text-[#64748B] leading-tight">
            <span>Work: <strong className="text-[#081226]">{formatDate(candidate.work_date || candidate.resume_date)}</strong></span>
            <span className="text-[10px] text-[#94A3B8]">Up: {formatDate(candidate.created_at || candidate.upload_date)}</span>
          </div>
        )}

        <span className="hidden md:inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] max-w-[110px] truncate">
          {candidate.client_name || 'Client'}
        </span>

        <div className="flex items-center gap-1">
          <Dropdown
            trigger={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#081226] hover:bg-white transition-colors cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            }
            items={menuItems}
          />
        </div>
      </div>
    </div>
  );
});

export function ResumesPage() {
  const { user, isEmployee, isAdmin, isSubAdmin, isClient } = useAuth();
  const { success, error: toastError } = useToast();
  const [searchParams] = useSearchParams();

  const [resumes, setResumes] = useState([]);
  const [totalResumes, setTotalResumes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedResume, setSelectedResume] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Metadata filter options
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Action states
  const [noteText, setNoteText] = useState('');

  // Edit Metadata Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editResumeTarget, setEditResumeTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Resume Modal State
  const [deleteResumeTarget, setDeleteResumeTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load clients and companies once on mount
  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data || [])).catch(() => {});
    api.get('/resumes/companies').then((res) => setCompanies(res.data || [])).catch(() => {});
  }, []);

  // Fetch resumes with global date filter support
  const fetchResumes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (selectedClient) params.client_id = selectedClient;
      if (selectedCompany) params.company = selectedCompany;
      if (dateFilter && dateFilter !== 'all') {
        params.date_filter = dateFilter;
        if (dateFilter === 'custom' && customDate) {
          params.custom_date = customDate;
          params.resume_date = customDate;
        }
      }

      const res = await api.get('/resumes', { params });
      const items = res.data.items || [];
      setResumes(items);
      setTotalResumes(res.data.total || items.length);

      if (items.length > 0 && !selectedResume) {
        setSelectedResume(items[0]);
        setNoteText(items[0].client_notes || '');
      } else if (items.length === 0) {
        setSelectedResume(null);
      }
    } catch (err) {
      toastError('Failed to load candidate resumes', err.response?.data?.detail || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedClient, selectedCompany, dateFilter, customDate, selectedResume, toastError]);

  useEffect(() => {
    fetchResumes();
  }, [search, selectedClient, selectedCompany, dateFilter, customDate, page]);

  // Candidate Selection Handler
  const handleSelectCandidate = useCallback((candidate) => {
    setSelectedResume(candidate);
    setNoteText(candidate.client_notes || '');
  }, []);

  // Edit Metadata Handler
  const openEditModal = useCallback((resume) => {
    setEditResumeTarget(resume);
    setEditName(resume.candidate_name);
    setEditCompany(resume.company || '');
    setEditRole(resume.role || '');
    setEditClientId(resume.client_id || '');
    setIsEditOpen(true);
  }, []);

  const handleSaveEdit = useCallback(async (e) => {
    e.preventDefault();
    if (!editResumeTarget) return;
    setSavingEdit(true);
    try {
      await api.put(`/resumes/${editResumeTarget.id}`, {
        candidate_name: editName,
        company: editCompany,
        role: editRole,
        client_id: editClientId,
      });
      success('Metadata Updated', `${editName} updated successfully.`);
      setIsEditOpen(false);
      fetchResumes();
      if (selectedResume?.id === editResumeTarget.id) {
        setSelectedResume((prev) => ({
          ...prev,
          candidate_name: editName,
          company: editCompany,
          role: editRole,
          client_id: editClientId,
        }));
      }
    } catch (err) {
      toastError('Update Failed', err.response?.data?.detail || 'Failed to update resume metadata');
    } finally {
      setSavingEdit(false);
    }
  }, [editResumeTarget, editName, editCompany, editRole, editClientId, success, fetchResumes, selectedResume, toastError]);

  // Delete Resume Handler
  const handleDeleteResume = useCallback(async () => {
    if (!deleteResumeTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/resumes/${deleteResumeTarget.id}`);
      success('Resume Deleted', 'Candidate resume record and Google Drive file removed.');
      setDeleteResumeTarget(null);
      if (selectedResume?.id === deleteResumeTarget.id) {
        setSelectedResume(null);
      }
      fetchResumes();
    } catch (err) {
      toastError('Delete Failed', err.response?.data?.detail || 'Failed to delete resume');
    } finally {
      setDeleting(false);
    }
  }, [deleteResumeTarget, success, selectedResume, fetchResumes, toastError]);

  const getResumeActionMenu = useCallback(
    (resume) => {
      const items = [];

      items.push({
        icon: Eye,
        label: 'Preview Resume',
        onClick: () => openResumePreview(resume),
      });

      items.push({
        icon: Download,
        label: 'Download Candidate Resume',
        onClick: () => openResumeDownload(resume),
      });

      items.push({
        icon: Share2,
        label: 'Copy Resume Share Link',
        onClick: () => copyResumeShareLink(resume, success),
      });

    if (isAdmin || isSubAdmin || (isEmployee && resume.uploaded_by === user?.id)) {
      items.push({ divider: true });

      items.push({
        icon: Edit2,
        label: 'Edit Metadata',
        onClick: () => openEditModal(resume),
      });

      items.push({ divider: true });

      items.push({
        icon: Trash2,
        label: 'Delete Candidate Resume',
        danger: true,
        onClick: () => setDeleteResumeTarget(resume),
      });
    }

    return items;
  }, [isAdmin, isSubAdmin, isEmployee, user?.id, openEditModal, success]);

  // Only render the first 20 rows initially
  const displayedResumes = useMemo(() => resumes.slice(0, 20), [resumes]);

  const totalPages = Math.ceil(totalResumes / pageSize) || 1;
  const showAudit = !isClient && (isAdmin || isSubAdmin);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-h2 font-extrabold text-[#081226] tracking-tight">
                Candidate Bank
              </h1>
              <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                {totalResumes} Resumes Ingested
              </span>
            </div>
            <p className="text-small text-[#64748B] mt-0.5">
              Centralized candidate records with resume previews and synchronized hiring activity.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="md"
              icon={RefreshCw}
              onClick={fetchResumes}
              isLoading={loading}
              className="h-[44px]"
            />

            {isEmployee && (
              <Button
                variant="primary"
                size="md"
                icon={Plus}
                onClick={() => (window.location.href = '/upload')}
                className="h-[44px]"
              >
                Upload Resumes
              </Button>
            )}
          </div>
        </div>

        {/* Filter Controls Rows */}
        <div className="space-y-3 pt-2 border-t border-[#F1F5F9]">
          {/* Row 1: Search, Client, Company */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className={cn(isClient ? 'sm:col-span-8' : 'sm:col-span-6')}>
              <SearchBar
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder="Search candidate, role, or hiring organization..."
              />
            </div>

            {!isClient && (
              <div className="sm:col-span-3">
                <select
                  value={selectedClient}
                  onChange={(e) => {
                    setSelectedClient(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-[44px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="">All Service Clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={cn(isClient ? 'sm:col-span-4' : 'sm:col-span-3')}>
              <select
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setPage(1);
                }}
                className="w-full h-[44px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="">All Hiring Organizations</option>
                {companies.map((comp) => (
                  <option key={comp} value={comp}>
                    {comp}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Global Date Filter (Today | Yesterday | This Week | This Month | Custom Date) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#F8FAFC]">
            <div className="flex items-center gap-2">
              <span className="text-caption font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#0D6EFD]" />
                Upload Date:
              </span>
              <DateFilter
                selectedPreset={dateFilter === 'all' ? 'all' : dateFilter}
                customDate={customDate}
                onFilterChange={({ preset, customDate: cDate }) => {
                  setDateFilter(preset);
                  if (cDate) setCustomDate(cDate);
                  setPage(1);
                }}
              />
              {dateFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFilter('all');
                    setPage(1);
                  }}
                  className="text-caption font-bold text-[#64748B] hover:text-[#081226] underline ml-2 cursor-pointer"
                >
                  Show All Dates
                </button>
              )}
            </div>

            <div className="text-caption text-[#64748B]">
              Showing {resumes.length} of {totalResumes} candidates
            </div>
          </div>
        </div>
      </div>

      {/* 60% Left / 40% Right Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 60%: Dense Candidate Rows */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E2E8F0] shadow-card overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-caption font-semibold text-[#64748B] uppercase tracking-wider select-none">
            <div className="flex items-center gap-3">
              <span>Candidate & Hiring Organization</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="hidden sm:inline">Service Client</span>
              <span>Actions</span>
            </div>
          </div>

          <div className="divide-y divide-[#F1F5F9] max-h-[calc(100vh-280px)] overflow-y-auto">
            {loading && resumes.length === 0 ? (
              <div className="p-8 text-center text-caption text-[#64748B]">Loading candidate bank...</div>
            ) : resumes.length === 0 ? (
              <div className="p-12 text-center text-[#64748B]">
                <FileText className="w-10 h-10 text-[#CBD5E1] mx-auto mb-2" />
                <p className="text-small font-semibold text-[#081226]">No Candidates Found</p>
                <p className="text-caption mt-0.5">Try adjusting search keywords, date filters, or service clients.</p>
              </div>
            ) : (
              displayedResumes.map((cand) => {
                const isSelected = selectedResume?.id === cand.id;
                const menuItems = getResumeActionMenu(cand);

                return (
                  <CandidateRow
                    key={cand.id}
                    candidate={cand}
                    isSelected={isSelected}
                    onSelect={handleSelectCandidate}
                    menuItems={menuItems}
                    showAudit={showAudit}
                  />
                );
              })
            )}
          </div>

          {/* Dense Pagination Footer */}
          <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-caption text-[#64748B]">
            <div>
              <span>Showing </span>
              <strong className="text-[#081226] font-semibold">
                {totalResumes > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalResumes)}
              </strong>
              <span> of </span>
              <strong className="text-[#081226] font-semibold">{totalResumes}</strong>
              <span> candidates</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeft}
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>

              {/* Direct Page Numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pNum = i + 1;
                if (totalPages > 5 && page > 3) {
                  pNum = page - 2 + i;
                  if (pNum > totalPages) pNum = totalPages - (4 - i);
                }
                if (pNum <= 0 || pNum > totalPages) return null;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={cn(
                      'w-7 h-7 rounded-lg text-caption font-bold transition-all',
                      page === pNum
                        ? 'bg-[#2563EB] text-white shadow-sm'
                        : 'bg-white text-[#64748B] hover:bg-[#F1F5F9] border border-[#E2E8F0]'
                    )}
                  >
                    {pNum}
                  </button>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                icon={ChevronRight}
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT 40%: Real-Time Candidate Detail Slide-Over (Auto Synced, No Manual Pipeline Submission Button) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E2E8F0] shadow-card overflow-hidden sticky top-6">
          {selectedResume ? (
            <div className="flex flex-col h-full max-h-[calc(100vh-140px)]">
              {/* Header */}
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedResume.candidate_name} size="md" variant="blue" />
                  <div>
                    <h3 className="text-h3 font-bold text-[#081226] tracking-tight">
                      {selectedResume.candidate_name}
                    </h3>
                    <p className="text-caption text-[#64748B] mt-0.5">
                      Uploaded by {selectedResume.uploader_name || 'Recruiter'} • {formatDate(selectedResume.upload_date)}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-caption font-bold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Auto Synced
                </span>
              </div>

              {/* Body: Metadata & PDF Preview */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {/* Audit indicator for Admin/Sub-Admin */}
                {showAudit && selectedResume.is_backfilled && (
                  <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-caption font-bold flex items-center gap-1.5 text-amber-800">
                        🟡 Backfilled Upload Audit
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        {selectedResume.delay_days} {selectedResume.delay_days === 1 ? 'Day' : 'Days'} Delay
                      </span>
                    </div>
                    <p className="text-caption text-amber-900">
                      Uploaded on <strong>{formatDate(selectedResume.created_at || selectedResume.upload_date)}</strong> for work completed on <strong>{formatDate(selectedResume.work_date || selectedResume.resume_date)}</strong>.
                    </p>
                  </div>
                )}

                {/* Metadata Badges (Adapts to 3 columns for Admin with audit details) */}
                <div className={cn("grid gap-3", showAudit ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
                  <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="flex items-center gap-1.5 text-caption font-medium text-[#64748B]">
                      <Building2 className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Service Client</span>
                    </div>
                    <p className="text-small font-bold text-[#081226] mt-1 truncate">
                      {selectedResume.client_name || 'Service Client'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="flex items-center gap-1.5 text-caption font-medium text-[#64748B]">
                      <Briefcase className="w-3.5 h-3.5 text-[#FF8A00]" />
                      <span>Hiring Organization</span>
                    </div>
                    <p className="text-small font-bold text-[#081226] mt-1 truncate">
                      {selectedResume.company || 'Direct Hiring'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="flex items-center gap-1.5 text-caption font-medium text-[#64748B]">
                      <Tag className="w-3.5 h-3.5 text-[#16A34A]" />
                      <span>Role / Code</span>
                    </div>
                    <p className="text-small font-bold text-[#081226] mt-1 truncate">
                      {selectedResume.role || 'Software Engineer'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="flex items-center gap-1.5 text-caption font-medium text-[#64748B]">
                      <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                      <span>Work Date</span>
                    </div>
                    <p className="text-small font-mono font-bold text-[#081226] mt-1">
                      {selectedResume.work_date || selectedResume.resume_date || formatDate(selectedResume.upload_date)}
                    </p>
                  </div>

                  {showAudit && (
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="flex items-center gap-1.5 text-caption font-medium text-[#64748B]">
                        <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Uploaded On</span>
                      </div>
                      <p className="text-small font-mono font-bold text-[#081226] mt-1 truncate">
                        {formatDate(selectedResume.created_at || selectedResume.upload_date)}
                      </p>
                    </div>
                  )}

                  {showAudit && (
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="flex items-center gap-1.5 text-caption font-medium text-[#64748B]">
                        <Info className="w-3.5 h-3.5 text-amber-600" />
                        <span>Delay</span>
                      </div>
                      <p className={cn("text-small font-bold mt-1", selectedResume.is_backfilled ? "text-amber-700" : "text-emerald-700")}>
                        {selectedResume.is_backfilled ? `${selectedResume.delay_days} Days` : 'Same Day (0d)'}
                      </p>
                    </div>
                  )}
                </div>

                {/* PDF Document Preview Card */}
                <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-bold uppercase text-[#64748B] flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#2563EB]" />
                      Document Asset
                    </span>
                    <span className="text-caption font-mono text-[#64748B]">
                      {selectedResume.resume_id_tag || 'ID: RES1001'}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-[#E2E8F0] flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-[#2563EB] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-caption font-bold text-[#081226] truncate" title={selectedResume.original_filename}>
                          {selectedResume.original_filename || 'Candidate_Resume.pdf'}
                        </p>
                        <span className="text-[11px] text-[#64748B]">
                          Google Drive Cloud Storage Attached
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between text-caption text-[#64748B]">
                    <span className="flex items-center gap-1 text-[#16A34A] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resume PDF
                    </span>
                    <a
                      href={getResumeDownloadUrl(selectedResume)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2563EB] font-semibold hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Resume
                    </a>
                  </div>
                </div>
              </div>

              {/* Bottom: Action Bar with Preview PDF, Download, and Share (No Manual Submit Button) */}
              <div className="p-4 bg-white border-t border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between text-caption pb-1">
                  <span className="text-caption text-[#16A34A] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Auto Synced to Pipeline
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    Available to client & dashboard
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="primary"
                    size="md"
                    icon={Eye}
                    onClick={() => openResumePreview(selectedResume)}
                    title="Open Document Preview in Google Drive"
                    className="flex-1 h-[44px] font-bold text-xs"
                  >
                    Preview Resume
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    icon={Download}
                    onClick={() => openResumeDownload(selectedResume)}
                    title="Download Candidate Resume"
                    className="h-[44px] px-3.5"
                  />

                  <Button
                    variant="outline"
                    size="md"
                    icon={Share2}
                    onClick={() => copyResumeShareLink(selectedResume, success)}
                    title="Copy Resume Share Link"
                    className="h-[44px] px-3.5"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-[#64748B]">
              <FileText className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
              <h4 className="text-small font-bold text-[#081226]">No Candidate Selected</h4>
              <p className="text-caption mt-1">Select a candidate from the left list to review preview.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Metadata Modal */}
      {isEditOpen && (
        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit Candidate Metadata"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label className="text-small font-semibold text-[#081226] block mb-1">
                Candidate Name
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                placeholder="Candidate Full Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-small font-semibold text-[#081226] block mb-1">
                  Hiring Organization
                </label>
                <Input
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="e.g. TCS, Infosys"
                />
              </div>

              <div>
                <label className="text-small font-semibold text-[#081226] block mb-1">
                  Role
                </label>
                <Input
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  placeholder="e.g. Java Developer"
                />
              </div>
            </div>

            <div>
              <label className="text-small font-semibold text-[#081226] block mb-1">
                Assigned Service Client
              </label>
              <select
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                className="w-full h-[44px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0]"
                required
              >
                <option value="">Select Service Client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsEditOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={savingEdit}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Resume Confirmation Modal */}
      {deleteResumeTarget && (
        <Modal
          isOpen={!!deleteResumeTarget}
          onClose={() => setDeleteResumeTarget(null)}
          title="Delete Candidate Resume"
        >
          <div className="space-y-4">
            <p className="text-small text-[#64748B]">
              Are you sure you want to permanently delete{' '}
              <strong className="text-[#081226]">{deleteResumeTarget.candidate_name}</strong>? This will remove the record from ApplyFlow and purge the file from Google Drive.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteResumeTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                isLoading={deleting}
                onClick={handleDeleteResume}
              >
                Delete Candidate Resume
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ResumesPage;
