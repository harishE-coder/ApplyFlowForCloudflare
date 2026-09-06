import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Bot,
  UserCheck,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ExternalLink,
  Clock,
  Calendar,
  Video,
  FileText,
  Upload,
  Check,
  X,
  Edit3,
  ShieldAlert,
  ChevronRight,
  Database,
  Cpu,
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const TAXONOMY_OPTIONS = [
  { value: 'interview', label: 'Interview (Technical / General)' },
  { value: 'hr_screening', label: 'HR Screening' },
  { value: 'technical_assessment', label: 'Technical Assessment (OA)' },
  { value: 'take_home', label: 'Take-Home Assignment' },
  { value: 'interview_confirmation', label: 'Interview Confirmation' },
  { value: 'interview_reschedule', label: 'Interview Reschedule' },
  { value: 'interview_cancelled', label: 'Interview Cancelled' },
  { value: 'recruiter_followup', label: 'Recruiter Follow-up' },
  { value: 'application_update', label: 'Application Update' },
  { value: 'response_request', label: 'Response Request' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'non_it', label: 'Non-IT / Unrelated' },
  { value: 'other', label: 'Other / Informational' },
];

export function InterviewIntelligencePage() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  // Dashboard Data State
  const [metrics, setMetrics] = useState({
    total_processed: 0,
    auto_accepted: 0,
    needs_review: 0,
    active_model_version: 'api_key_not_configured',
    api_classified: 0,
    human_reviewed: 0,
    pending_processing: 0,
    api_keys_configured: 0,
    api_providers: [],
    api_model: '',
    pipeline_version: 'interview_pipeline_v2.0',
    prompt_version: 'teacher_v1',
    category_breakdown: {},
  });

  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('');

  // Manual Relabel Modal State
  const [relabelModalOpen, setRelabelModalOpen] = useState(false);
  const [activeItemForRelabel, setActiveItemForRelabel] = useState(null);
  const [chosenLabel, setChosenLabel] = useState('interview');
  const [relabelNotes, setRelabelNotes] = useState('');

  // Process Email Ingestion Modal State
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [rawEmailInput, setRawEmailInput] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);

  // Timeline Inspector State
  const [timelineAppId, setTimelineAppId] = useState('');
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Active Tab View
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'timeline', 'search'

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Live Metrics
      const mRes = await api.get('/interview-intelligence/dashboard', { cache: false });
      if (mRes.data) setMetrics(mRes.data);

      // 2. Initial Search Table
      const sRes = await api.get('/interview-intelligence/emails/search?limit=15', { cache: false });
      if (sRes.data) setSearchResults(sRes.data);
    } catch (err) {
      toastError('Fetch Error', 'Unable to load Interview Intelligence telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Search Execution
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedCategoryFilter) params.append('category', selectedCategoryFilter);
      if (selectedSourceFilter) params.append('source', selectedSourceFilter);
      params.append('limit', '25');

      const res = await api.get(`/interview-intelligence/emails/search?${params.toString()}`, { cache: false });
      setSearchResults(res.data || []);
    } catch (err) {
      toastError('Search Error', 'Failed searching recruiter emails.');
    }
  };

  // Manual Email Relabeling
  const handleManualRelabel = async (e) => {
    e.preventDefault();
    if (!activeItemForRelabel) return;
    setActionLoading(true);
    try {
      await api.patch(`/interview-intelligence/emails/${activeItemForRelabel.id}`, {
        new_label: chosenLabel,
        notes: relabelNotes || 'Manual correction via Admin UI',
      });
      toastSuccess('Correction Saved', `Email classified as "${chosenLabel}". Audit log created.`);
      setRelabelModalOpen(false);
      fetchData();
    } catch (err) {
      toastError('Update Failed', 'Failed to submit manual correction.');
    } finally {
      setActionLoading(false);
    }
  };

  // Process Raw Email Ingestion
  const handleIngestEmail = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setIngestResult(null);
    try {
      let res;
      if (uploadFile) {
        const formData = new FormData();
        formData.append('file', uploadFile);
        res = await api.post('/interview-intelligence/upload-file', formData);
      } else {
        if (!rawEmailInput.trim()) {
          toastError('Input Required', 'Please paste email content or upload a file.');
          setActionLoading(false);
          return;
        }
        res = await api.post('/interview-intelligence/process-email', {
          raw_text: rawEmailInput,
        });
      }

      setIngestResult(res.data);
      toastSuccess('Email Ingested', `Result: ${res.data.action} (${res.data.category})`);
      setRawEmailInput('');
      setUploadFile(null);
      fetchData();
    } catch (err) {
      toastError('Ingestion Failed', err.response?.data?.detail || 'Failed processing email');
    } finally {
      setActionLoading(false);
    }
  };

  // Inspect Timeline
  const handleInspectTimeline = async (appId) => {
    const idToFetch = appId || timelineAppId;
    if (!idToFetch) return;
    setTimelineLoading(true);
    try {
      const res = await api.get(`/interview-intelligence/timeline/${idToFetch}`, { cache: false });
      setTimelineData(res.data);
      setActiveTab('timeline');
    } catch (err) {
      toastError('Timeline Error', 'Application not found or has no timeline events.');
      setTimelineData(null);
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-8">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <BrainCircuit className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Interview Intelligence
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  {metrics.pipeline_version}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Real-time API-key intake telemetry, provider health, and timeline inspector.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIngestModalOpen(true)}
            className="flex items-center gap-2 shadow-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            <Sparkles className="w-4 h-4" />
            Process Recruiter Email
          </Button>
        </div>
      </div>

      {/* Section 1: Real-Time Live KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Emails Processed"
          value={metrics.total_processed.toLocaleString()}
          subtitle="Total recruiter emails"
          icon={Layers}
          color="blue"
        />
        <KPICard
          title="API Classified"
          value={(metrics.api_classified ?? metrics.auto_accepted).toLocaleString()}
          subtitle={`${metrics.api_keys_configured || 0} API key${metrics.api_keys_configured === 1 ? '' : 's'} configured`}
          icon={CheckCircle2}
          color="emerald"
        />
        <KPICard
          title="Human Reviewed"
          value={(metrics.human_reviewed || 0).toLocaleString()}
          subtitle="Manual audit corrections"
          icon={Bot}
          color="indigo"
        />
        <KPICard
          title="Pending"
          value={(metrics.pending_processing ?? metrics.needs_review).toLocaleString()}
          subtitle="Pending or failed processing"
          icon={AlertTriangle}
          color="amber"
        />
      </div>

      {/* Navigation Tab Bar */}
      <div className="flex border-b border-border/40 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-4 text-sm font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Overview & Health
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 px-4 text-sm font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'timeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="w-4 h-4" />
          Timeline Inspector
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`pb-3 px-4 text-sm font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === 'search'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="w-4 h-4" />
          Email Search & Repository
        </button>
      </div>

      {/* Tab 1: Overview & Model Status */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* API Status Card */}
          <Card className="p-6 space-y-5 lg:col-span-1 border border-border/60 shadow-sm bg-gradient-to-b from-card to-card/50">
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">API Status</h3>
                  <p className="text-xs text-muted-foreground">Provider key & prompt</p>
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                {metrics.api_keys_configured > 0 ? 'Active' : 'No Key'}
              </span>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-sm py-1 border-b border-border/20">
                <span className="text-muted-foreground font-medium">Current API Model</span>
                <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                  {metrics.active_model_version}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-b border-border/20">
                <span className="text-muted-foreground font-medium">Prompt Version</span>
                <span className="font-mono text-indigo-500 font-semibold">{metrics.prompt_version}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-b border-border/20">
                <span className="text-muted-foreground font-medium">API Keys</span>
                <span className="font-bold text-emerald-600">{metrics.api_keys_configured || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-1 border-b border-border/20">
                <span className="text-muted-foreground font-medium">Human Reviewed</span>
                <span className="font-semibold text-amber-600 flex items-center gap-1">
                  {metrics.human_reviewed || 0} emails
                </span>
              </div>
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-muted-foreground font-medium">Storage Engine</span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded">
                  Supabase Storage
                </span>
              </div>
            </div>

            {/* Provider Legend */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40 space-y-2">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">API Gateway</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="text-emerald-600 font-semibold">API Key Only</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Primary</span>
                  <span className="text-indigo-600 font-semibold">{metrics.api_providers?.[0] || 'Not configured'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fallback</span>
                  <span className="text-amber-600 font-semibold">{Math.max((metrics.api_keys_configured || 0) - 1, 0)} keys</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Intake Summary & Category Breakdown */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 border border-border/60 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-base font-bold text-foreground">
                    Intake Mode
                  </h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary font-semibold">
                  API Key Only
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20">
                  <p className="text-xs text-muted-foreground">API classified</p>
                  <p className="text-xl font-bold text-foreground">{metrics.api_classified || 0}</p>
                </div>
                <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20">
                  <p className="text-xs text-muted-foreground">Manual corrections</p>
                  <p className="text-xl font-bold text-foreground">{metrics.human_reviewed || 0}</p>
                </div>
                <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20">
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-xl font-bold text-foreground">{metrics.pending_processing || 0}</p>
                </div>
              </div>
            </Card>

            {/* Category Breakdown Chips */}
            <Card className="p-6 border border-border/60 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-foreground">Classification Distribution</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(metrics.category_breakdown || {}).map(([cat, count]) => (
                  <div
                    key={cat}
                    className="px-3 py-1.5 rounded-lg border border-border/40 bg-card text-xs flex items-center gap-2 shadow-xs"
                  >
                    <span className="font-medium text-foreground capitalize">{cat.replace(/_/g, ' ')}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Timeline Inspector */}
      {activeTab === 'timeline' && (
        <Card className="p-6 border border-border/60 shadow-sm space-y-6">
          <div className="border-b border-border/40 pb-4">
            <h2 className="text-lg font-bold text-foreground">Application Timeline Inspector</h2>
            <p className="text-xs text-muted-foreground">
              Inspect reconstructed interview event chains (Invite → Reschedule → Confirmation) and sequential rounds.
            </p>
          </div>

          <div className="flex gap-3 max-w-xl">
            <input
              type="text"
              placeholder="Paste Application UUID..."
              value={timelineAppId}
              onChange={(e) => setTimelineAppId(e.target.value)}
              className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-border/60 bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleInspectTimeline()}
              disabled={timelineLoading || !timelineAppId.trim()}
              className="flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Inspect
            </Button>
          </div>

          {timelineLoading && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Loading reconstructed timeline...
            </div>
          )}

          {timelineData && (
            <div className="space-y-6 pt-2">
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {timelineData.company || 'Unknown Company'} — {timelineData.role || 'Role'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Candidate: {timelineData.candidate_name || 'N/A'} · Current Status: <strong className="text-primary">{timelineData.current_status}</strong>
                  </p>
                </div>
                <span className="px-3 py-1 text-xs font-bold rounded-lg bg-primary text-white">
                  Round: {timelineData.current_round || 'Initial'}
                </span>
              </div>

              {/* Vertical Chronological Timeline */}
              <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/80">
                {timelineData.events.map((ev, index) => (
                  <div key={ev.id} className="relative group">
                    {/* Step Icon */}
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-primary border-4 border-background shadow-xs flex items-center justify-center text-[10px] text-white font-bold">
                      {ev.event_sequence || index + 1}
                    </div>

                    <div className="p-4 rounded-xl border border-border/60 bg-card/60 hover:bg-card transition-all shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">
                            {ev.round_name || ev.round || ev.event_type}
                          </span>
                          {ev.round_type && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-primary/10 text-primary font-bold">
                              {ev.round_type}
                            </span>
                          )}
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                            {ev.status}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {ev.meeting_link && (
                        <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                          <Video className="w-3.5 h-3.5" />
                          <a
                            href={ev.meeting_link}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            {ev.meeting_link} <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {ev.deadline && (
                        <div className="flex items-center gap-2 text-xs text-amber-600 font-medium">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Deadline: {ev.deadline}</span>
                        </div>
                      )}

                      {ev.email_subject && (
                        <div className="p-2.5 rounded-md bg-muted/40 text-xs space-y-1">
                          <p className="font-semibold text-foreground">Subject: {ev.email_subject}</p>
                          {ev.email_preview && (
                            <p className="text-muted-foreground line-clamp-2">{ev.email_preview}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Email Search & Repository Table */}
      {activeTab === 'search' && (
        <Card className="p-6 border border-border/60 shadow-sm space-y-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search company, role, recruiter, or message-id..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="sm:col-span-3">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">All Categories</option>
                {TAXONOMY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <select
                value={selectedSourceFilter}
                onChange={(e) => setSelectedSourceFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">All Sources</option>
                <option value="api_key">API Key</option>
                <option value="groq">Groq Legacy</option>
                <option value="human">Human Verified</option>
              </select>
              <Button type="submit" variant="primary" size="sm" className="px-4">
                Filter
              </Button>
            </div>
          </form>

          {/* Search Table */}
          <div className="border border-border/60 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs font-bold text-muted-foreground border-b border-border/60 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Subject & Details</th>
                    <th className="py-3 px-4">Company / Role</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {searchResults.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-muted-foreground">
                        No email records found.
                      </td>
                    </tr>
                  ) : (
                    searchResults.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="font-semibold text-foreground truncate">{row.subject || 'No Subject'}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.sender_email || row.sender_domain}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-foreground">{row.company || '—'}</p>
                          <p className="text-xs text-muted-foreground">{row.role || '—'}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-muted text-foreground capitalize">
                            {row.category ? row.category.replace(/_/g, ' ') : 'Unclassified'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-bold ${
                              row.confidence >= 97
                                ? 'text-emerald-600'
                                : row.confidence >= 75
                                ? 'text-indigo-600'
                                : 'text-amber-600'
                            }`}
                          >
                            {row.confidence}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              row.source === 'human'
                                ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                                : row.source === 'groq'
                                ? 'bg-indigo-500/10 text-indigo-600'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {row.source}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveItemForRelabel(row);
                              setChosenLabel(row.category || 'interview');
                              setRelabelModalOpen(true);
                            }}
                            className="text-xs text-primary hover:bg-primary/10"
                          >
                            Relabel
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Ingest Email Modal */}
      <Modal
        isOpen={ingestModalOpen}
        onClose={() => setIngestModalOpen(false)}
        title="Process Recruiter Email"
      >
        <form onSubmit={handleIngestEmail} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Paste raw text, forward an email snippet, or upload a .eml / .pdf file to run through the ATS ingestion pipeline.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Paste Raw Email Text
            </label>
            <textarea
              rows={6}
              placeholder="From: recruiter@company.com&#10;Subject: Invitation to Technical Round 1...&#10;Hi Candidate, we would like to invite you..."
              value={rawEmailInput}
              onChange={(e) => setRawEmailInput(e.target.value)}
              className="w-full p-3 text-xs font-mono rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Or Upload .eml / .pdf File
            </label>
            <input
              type="file"
              accept=".eml,.pdf,.txt"
              onChange={(e) => setUploadFile(e.target.files[0])}
              className="w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
            />
          </div>

          {ingestResult && (
            <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs space-y-1">
              <p className="font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Action: {ingestResult.action}
              </p>
              <p className="text-muted-foreground">
                Category: <strong>{ingestResult.category}</strong> · Confidence: <strong>{ingestResult.confidence}%</strong> ({ingestResult.source})
              </p>
              {ingestResult.company && (
                <p className="text-muted-foreground">
                  Matched Company: <strong>{ingestResult.company}</strong> (Round: {ingestResult.round || 'N/A'})
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIngestModalOpen(false)}
            >
              Close
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={actionLoading}
              className="flex items-center gap-2"
            >
              {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Run Pipeline
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manual Relabel Modal */}
      <Modal
        isOpen={relabelModalOpen}
        onClose={() => setRelabelModalOpen(false)}
        title="Manual Classification Correction"
      >
        <form onSubmit={handleManualRelabel} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This action creates an audit log entry in <code className="bg-muted px-1.5 py-0.5 rounded">review_actions</code>.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Select 13-Class Taxonomy Label
            </label>
            <select
              value={chosenLabel}
              onChange={(e) => setChosenLabel(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {TAXONOMY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Reviewer Notes (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="Reason for manual label assignment..."
              value={relabelNotes}
              onChange={(e) => setRelabelNotes(e.target.value)}
              className="w-full p-2.5 text-xs rounded-lg border border-border/60 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRelabelModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={actionLoading}
              className="bg-primary text-white"
            >
              {actionLoading ? 'Saving...' : 'Confirm & Log Audit'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default InterviewIntelligencePage;
