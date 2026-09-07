import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Briefcase,
  CheckCircle2,
  TrendingUp,
  Building2,
  Users,
  ChevronDown,
  RefreshCw,
  Search,
  Filter,
  Check,
  Award,
  Sparkles,
  Layers,
  ArrowRight,
  Clock,
  Send,
  Eye,
  Download,
  Share2,
  ExternalLink,
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DateFilter } from '@/components/ui/DateFilter';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { cn } from '@/utils/cn';
import {
  openResumePreview,
  openResumeDownload,
  copyResumeShareLink,
} from '@/utils/resumeUrls';

const ClientCharts = lazy(() => import('./charts/ClientCharts'));

export function ClientDashboard() {
  const { user, bootstrapData, consumeBootstrapDashboard } = useAuth();
  const { success, error: toastError } = useToast();

  const [initialData] = useState(() => {
    if (consumeBootstrapDashboard) {
      return consumeBootstrapDashboard();
    }
    return bootstrapData?.dashboard || null;
  });

  const [data, setData] = useState(() => initialData?.dashboard || (initialData && typeof initialData === 'object' ? initialData : null));
  const [loading, setLoading] = useState(() => !initialData);

  // Filters State
  const [selectedHiringCompany, setSelectedHiringCompany] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('today');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedCards, setExpandedCards] = useState({});

  const fetchClientDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange === 'custom') {
        params.custom_date = customDate;
        params.date_range = customDate;
      } else if (dateRange) {
        params.date_range = dateRange;
      }
      const res = await api.get('/dashboard/client/home', { params });
      if (res.data?.dashboard) {
        setData(res.data.dashboard);
      } else {
        setData(res.data);
      }
    } catch (err) {
      toastError('Dashboard Error', 'Failed to load client portal telemetry');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customDate, toastError]);

  useEffect(() => {
    fetchClientDashboard();
  }, [fetchClientDashboard]);

  // Real-time listener with stable ref to prevent re-attaching
  const fetchRef = useRef(fetchClientDashboard);
  fetchRef.current = fetchClientDashboard;

  useEffect(() => {
    let focusTimeout = null;
    const handleUploadEvent = () => {
      fetchRef.current();
    };
    const handleFocusEvent = () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      focusTimeout = setTimeout(() => {
        fetchRef.current();
      }, 500);
    };

    window.addEventListener('resume-uploaded', handleUploadEvent);
    window.addEventListener('application-created', handleUploadEvent);
    window.addEventListener('application-updated', handleUploadEvent);
    window.addEventListener('focus', handleFocusEvent);
    return () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      window.removeEventListener('resume-uploaded', handleUploadEvent);
      window.removeEventListener('application-created', handleUploadEvent);
      window.removeEventListener('application-updated', handleUploadEvent);
      window.removeEventListener('focus', handleFocusEvent);
    };
  }, []);

  const toggleCard = useCallback((id) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Filter timeline items by Hiring Company & search
  const filteredTimeline = useMemo(() => {
    if (!data?.application_timeline) return [];
    return data.application_timeline.filter((item) => {
      const matchCompany =
        selectedHiringCompany === 'all' ||
        item.hiring_company?.toLowerCase() === selectedHiringCompany.toLowerCase();
      const term = (searchQuery || '').toLowerCase();
      const matchSearch =
        !term ||
        (item?.candidate_name || '').toLowerCase().includes(term) ||
        (item?.hiring_company || '').toLowerCase().includes(term) ||
        (item?.role || '').toLowerCase().includes(term);
      return matchCompany && matchSearch;
    });
  }, [data, selectedHiringCompany, searchQuery]);

  const progressData = useMemo(() => {
    const stages = data?.application_progress || [];
    const colors = ['#2563EB', '#F97316', '#10B981', '#9333EA'];
    return stages.map((item, idx) => ({
      stage: item.stage,
      count: item.count || 0,
      color: colors[idx % colors.length],
    }));
  }, [data?.application_progress]);

  const getRoundBadgeColor = (roundStr = '') => {
    const r = typeof roundStr === 'string' ? roundStr.toLowerCase() : '';
    if (r.includes('offer')) return 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]';
    if (r.includes('tech') || r.includes('coding')) return 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]';
    if (r.includes('hr') || r.includes('discussion')) return 'bg-[#FAF5FF] text-[#9333EA] border-[#E9D5FF]';
    if (r.includes('shortlist') || r.includes('round 1') || r.includes('round 2')) return 'bg-[#FFF7ED] text-[#F97316] border-[#FFEDD5]';
    if (r.includes('reject')) return 'bg-[#FEF2F2] text-[#EF4444] border-[#FECACA]';
    return 'bg-[#F8FAFC] text-[#081226] border-[#E2E8F0]';
  };

  if (loading && !data) {
    return <BrandedLoader size="lg" label="Loading Client Talent Dashboard..." />;
  }

  const clientName = data?.company_name || user?.name || 'ABC Staffing';

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 select-none">
      {/* 1. Header with Global Date Filter */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2E8F0] shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-h2 font-extrabold text-[#081226] tracking-tight">
                {clientName} Dashboard
              </h1>
              <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#F97316]" />
                Dedicated Service Portal
              </span>
            </div>
            <p className="text-small text-[#64748B] mt-1">
              Real-time candidate submissions, global date filtering, and interview progress for your organization.
            </p>
          </div>

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchClientDashboard}
            isLoading={loading}
            className="h-[44px] font-bold text-xs"
          >
            Refresh Data
          </Button>
        </div>

        {/* Global Date Filter Controls */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[#F1F5F9] flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Date Period:
            </span>
            <DateFilter
              selectedPreset={dateRange}
              customDate={customDate}
              onFilterChange={({ preset, customDate: cDate }) => {
                setDateRange(preset);
                if (cDate) setCustomDate(cDate);
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Top 4 Locked KPI Cards (Applied, Today's Uploads, Interview Updates, Offers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KPICard
          title="Applied"
          value={data?.applied_count ?? 0}
          subtitle="All resumes uploaded"
          icon={FileText}
          variant="blue"
        />

        <KPICard
          title="Today's Uploads"
          value={data?.today_uploads ?? 0}
          subtitle="Uploaded today"
          icon={Clock}
          variant="default"
        />

        <KPICard
          title="Interview Updates"
          value={data?.interview_updates ?? 0}
          subtitle="Interview emails received"
          icon={TrendingUp}
          variant="orange"
        />

        <KPICard
          title="Offers"
          value={data?.offers_count ?? 0}
          subtitle="Offer emails received"
          icon={Award}
          variant="success"
        />
      </div>

      {/* 2.5 Job Openings Task Board Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <KPICard
          title="Active Job Openings"
          value={data?.active_jobs ?? 0}
          subtitle="Open candidate requirements"
          icon={Briefcase}
          variant="blue"
        />
        <KPICard
          title="Completed Job Openings"
          value={data?.completed_jobs ?? 0}
          subtitle="Fulfilled requirements"
          icon={CheckCircle2}
          variant="success"
        />
        <KPICard
          title="Job Completion Rate"
          value={`${data?.completion_rate ?? 0}%`}
          subtitle="Requisitions completed"
          icon={TrendingUp}
          variant={data?.completion_rate >= 80 ? 'success' : 'orange'}
        />
      </div>

      {/* 3. Application Progress Chart (Lazy-Loaded Background Rendering) */}
      <Suspense fallback={<ChartSkeleton className="h-64" title="Application Progress" />}>
        <ClientCharts
          progressData={progressData}
          clientName={clientName}
          appliedCount={data?.applied_count ?? 179}
          interviewUpdates={data?.interview_updates ?? 24}
          offersCount={data?.offers_count ?? 6}
          joinedCount={2}
        />
      </Suspense>

      {/* 4. Application Timeline & Hiring Company Filter */}
      <div className="space-y-4">
        {/* Filters Header: Hiring Company Filter + Candidate Search */}
        <div className="bg-white p-5 rounded-3xl border border-[#E2E8F0] shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">Application Timeline</h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Live candidate progression stages across hiring companies.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search */}
            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search candidate, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-[40px] rounded-xl text-small bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            {/* Hiring Company Filter (Renamed from Target Company) */}
            <div className="w-full sm:w-auto">
              <select
                value={selectedHiringCompany}
                onChange={(e) => setSelectedHiringCompany(e.target.value)}
                className="w-full sm:w-auto h-[40px] px-3.5 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="all">All Hiring Companies</option>
                {(data?.hiring_companies || ['TCS', 'Infosys', 'Amazon', 'Deloitte', 'Google']).map((hc) => (
                  <option key={hc} value={hc}>
                    {hc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Timeline Cards Feed */}
        <div className="space-y-4">
          {filteredTimeline.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-[#E2E8F0] space-y-3">
              <Users className="w-10 h-10 text-[#2563EB] mx-auto" />
              <h4 className="text-h3 font-bold text-[#081226]">No candidates match this filter</h4>
              <p className="text-small text-[#64748B]">Try selecting "All Hiring Companies" or adjusting your search.</p>
            </div>
          ) : (
            filteredTimeline.map((item) => {
              const isExpanded = !!expandedCards[item.id];

              return (
                <motion.div
                  key={item.id}
                  layout
                  className="bg-white rounded-3xl border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-card transition-all overflow-hidden"
                >
                  {/* Card Header */}
                  <div
                    onClick={() => toggleCard(item.id)}
                    className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#F8FAFC]/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar name={item.candidate_name} size="lg" variant="blue" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-h3 font-extrabold text-[#081226] truncate">
                            {item.candidate_name}
                          </h3>
                          <span className={cn('px-2.5 py-0.5 rounded-lg border text-caption font-extrabold truncate', getRoundBadgeColor(item.round))}>
                            {item.round}
                          </span>
                        </div>
                        <p className="text-small text-[#64748B] mt-0.5">
                          <strong className="text-[#081226]">{item.hiring_company}</strong> · {item.role}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center flex-wrap">
                      <span className="text-caption font-semibold text-[#64748B]">
                        Applied {item.applied_date}
                      </span>

                      {/* Instant Preview, Download & Share Buttons */}
                      {item.drive_file_id || item.drive_view_url || item.resume_id ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openResumePreview(item)}
                            title="Preview Candidate Resume in Google Drive"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] text-caption font-bold border border-[#BFDBFE] transition-colors shadow-xs cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openResumeDownload(item)}
                            title="Download Original Resume File"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#081226] text-caption font-bold border border-[#CBD5E1] transition-colors shadow-xs cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => copyResumeShareLink(item, success)}
                            title="Copy Public Google Drive Share Link"
                            className="p-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#081226] border border-[#CBD5E1] transition-colors shadow-xs cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#94A3B8] italic">
                          No resume linked
                        </span>
                      )}

                      <div className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#64748B]">
                        <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded ? 'rotate-180' : '')} />
                      </div>
                    </div>
                  </div>

                  {/* Expandable Step-by-step Progression Milestones & Document Inspection */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-6 pb-6 pt-2 border-t border-[#F1F5F9] bg-[#FAFAFA]"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-4">
                          Candidate Progression Milestones
                        </p>

                        <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
                          {(!item.events || item.events.length === 0) ? (
                            <p className="text-caption text-[#94A3B8] italic py-1">
                              No milestone progression events logged yet for this candidate.
                            </p>
                          ) : (
                            item.events.map((ev, eIdx) => {
                              const isLatest = eIdx === item.events.length - 1;

                              return (
                                <div key={eIdx} className="relative space-y-1">
                                  <div
                                    className={cn(
                                      'absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white',
                                      isLatest
                                        ? 'bg-[#2563EB] ring-2 ring-[#2563EB]/20'
                                        : 'bg-[#10B981] ring-2 ring-[#10B981]/20'
                                    )}
                                  />
                                  <div className="flex items-center gap-2">
                                    <p className="text-small font-extrabold text-[#081226]">
                                      {isLatest ? `● ${ev.stage || ev.round}` : `✓ ${ev.stage || ev.round}`}
                                    </p>
                                    <span className="text-[11px] text-[#64748B] font-medium">({ev.date})</span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Resume document bar in expanded view */}
                        {/* Resume document bar in expanded view */}
                        {item.drive_file_id || item.drive_view_url || item.resume_id ? (
                          <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E2E8F0]">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0 border border-[#BFDBFE]">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-caption font-bold text-[#081226] truncate">
                                  {item.file_name || `${(item.candidate_name || 'Candidate').replace(/\s+/g, '_')}_Resume.pdf`}
                                </p>
                                <p className="text-[11px] text-[#16A34A] font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Google Drive Cloud Storage Attached
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => openResumePreview(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-caption font-bold transition-colors shadow-xs cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View Full PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => openResumeDownload(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#081226] text-caption font-bold border border-[#CBD5E1] transition-colors shadow-xs cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download
                              </button>
                              <button
                                type="button"
                                onClick={() => copyResumeShareLink(item, success)}
                                className="p-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#081226] border border-[#CBD5E1] transition-colors shadow-xs cursor-pointer"
                                title="Copy Public Google Drive Share Link"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-5 pt-4 border-t border-[#E2E8F0] p-3 rounded-2xl bg-[#F8FAFC] border border-dashed border-[#CBD5E1] text-center text-caption text-[#94A3B8]">
                            Candidate application ingested from AI intake without an attached resume document.
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientDashboard;
