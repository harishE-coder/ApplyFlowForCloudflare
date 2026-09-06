import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Mail,
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  User,
  Briefcase,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Filter,
  FileText,
  Calendar,
  Layers,
  ArrowRight,
  Eye,
  Check,
  Edit3,
  X,
  TrendingUp,
  Cpu,
  Bot,
  UploadCloud,
  FileCode,
  Paperclip,
  Image as ImageIcon,
  History,
  AlertCircle,
  Clock3,
  CheckSquare,
  ShieldCheck,
  CornerDownRight,
  Undo2,
  Ban,
  MoreVertical,
  Archive,
  Trash2,
  XCircle,
  Link2,
  Unlink,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal, Drawer } from '@/components/ui/Modal';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { formatDate, formatRelativeTime, cn } from '@/utils/cn';

// Sample recruiter & non-recruiter emails for 1-click testing
const SAMPLE_EMAILS = [
  {
    label: '📄 Interview Scheduled (New)',
    text: `From: priya.recruiter@tcs.com
To: hr@applyflow.com
Subject: Interview Scheduled - Java Developer - Rahul Kumar

Hi Team,

We have scheduled Round 1 Technical Interview for Rahul Kumar on 2026-08-26 at 10:00 AM for Java Developer at TCS.

Best Regards,
Priya Verma
TCS Recruitment`,
  },
  {
    label: '💻 Round 2 Follow-up',
    text: `From: priya.recruiter@tcs.com
To: hr@applyflow.com
Subject: Round 2 Scheduled - Rahul Kumar

Hi Team,

Rahul Kumar has cleared Round 1. We are scheduling Round 2 Interview on 2026-08-28.

Best Regards,
Priya Verma
TCS Recruitment`,
  },
  {
    label: '🎉 Official Offer Letter',
    text: `From: hr.offers@tcs.com
To: hr@applyflow.com
Subject: Official Offer Letter - Rahul Kumar

Dear Rahul Kumar,

We are pleased to extend an Offer Letter for the Java Developer position at TCS.
Congratulations!

Sincerely,
TCS Talent Acquisition`,
  },
  {
    label: '🚫 50% AWS Promo (Ignored)',
    text: `From: promo@clouddeals.io
To: hr@applyflow.com
Subject: 50% Discount on AWS Cloud Servers this Weekend!

Hey there,
Get 50% off on all enterprise AWS cloud servers today. Click here to subscribe now!`,
  },
];

export function AIResponseInboxPage() {
  const { user, isAdmin, isSubAdmin, isEmployee, isClient } = useAuth();
  const { success, error: toastError, warning, info } = useToast();

  // Primary Navigation View: 'intake' | 'timeline'
  const [activeMainTab, setActiveMainTab] = useState('intake');

  // Feed State
  const [inboxData, setInboxData] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [search, setSearch] = useState('');

  // AI Intake Mode: 'paste' | 'eml' | 'pdf' | 'screenshot'
  const [intakeMode, setIntakeMode] = useState('paste');

  // Text Ingestion State
  const [rawEmail, setRawEmail] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // File Upload Ingestion State
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // PHASE 1: Human Confirmation State (Review Card before DB save)
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableForm, setEditableForm] = useState({
    candidate_name: '',
    company: '',
    role: '',
    round: '',
    status: 'Shortlisted',
    interview_date: '',
    client_id: '',
  });

  // Smart Resume Linking State
  const [linkedResume, setLinkedResume] = useState(null);
  const [isResumeSelectorOpen, setIsResumeSelectorOpen] = useState(false);
  const [clientResumes, setClientResumes] = useState([]);
  const [loadingClientResumes, setLoadingClientResumes] = useState(false);
  const [resumeSearchTerm, setResumeSearchTerm] = useState('');

  // Expanded cards state in Application Timeline view
  const [expandedCards, setExpandedCards] = useState({});

  // Timeline Inspection Drawer State
  const [selectedAppIdForTimeline, setSelectedAppIdForTimeline] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Raw Email View Modal State
  const [selectedItemForRawEmail, setSelectedItemForRawEmail] = useState(null);

  // Fetch scoped clients for current user
  useEffect(() => {
    api.get('/clients').then((res) => {
      const clList = res.data || [];
      setClients(clList);
      if (clList.length === 1 && !selectedClient) {
        setSelectedClient(clList[0].id);
      }
    }).catch(() => {});
  }, []);

  // Fetch AI inbox feed
  const fetchInbox = async () => {
    setLoadingFeed(true);
    try {
      const params = {};
      if (selectedClient) params.client_id = selectedClient;
      if (selectedStatus) params.status = selectedStatus;
      if (search) params.search = search;

      const res = await api.get('/ai/inbox', { params });
      setInboxData(res.data);
    } catch (err) {
      console.error('Failed to load AI inbox:', err);
      toastError('Error', 'Failed to load Applications feed');
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, [selectedClient, selectedStatus, search]);

  // Fetch timeline when an app is selected
  const fetchTimeline = async (appId) => {
    if (!appId) return;
    setSelectedAppIdForTimeline(appId);
    setLoadingTimeline(true);
    try {
      const res = await api.get(`/applications/${appId}/timeline`);
      setTimelineData(res.data);
    } catch (err) {
      console.error('Failed to load timeline:', err);
      toastError('Failed to load candidate timeline');
    } finally {
      setLoadingTimeline(false);
    }
  };

  const toggleCardExpansion = (id) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Trigger celebration confetti
  const triggerConfetti = () => {
    try {
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#2563EB', '#F97316', '#10B981'],
        });
      }
    } catch (e) {}
  };

  // Open manual resume selector modal
  const openResumeSelector = async () => {
    setIsResumeSelectorOpen(true);
    setLoadingClientResumes(true);
    try {
      const targetClientId = editableForm.client_id || selectedClient || (clients.length > 0 ? clients[0].id : null);
      if (!targetClientId) {
        toastError('Client Required', 'Please select a Service Client first.');
        setLoadingClientResumes(false);
        return;
      }
      const res = await api.get('/resumes', {
        params: { client_id: targetClientId, page_size: 100 },
      });
      setClientResumes(res.data?.items || []);
    } catch (err) {
      console.error('Failed to fetch client resumes:', err);
      toastError('Error', 'Failed to load resumes for this client');
    } finally {
      setLoadingClientResumes(false);
    }
  };

  // --------------------------------------------------------------------------
  // STEP 1: ANALYZE WITH GROQ (FIRST JOB: IS IT INTERVIEW MAIL?)
  // --------------------------------------------------------------------------
  const handleAnalyzeEmail = async () => {
    if (!rawEmail.trim()) {
      warning('Empty Email', 'Please paste the email content.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await api.post('/ai/analyze-email', {
        raw_email: rawEmail.trim(),
        client_id: selectedClient || (clients.length === 1 ? clients[0].id : undefined),
        source_type: 'paste',
      });

      const data = res.data;
      setAnalysisResult(data);
      setIsEditing(false);
      setEditableForm({
        candidate_name: data.candidate_name,
        company: data.company,
        role: data.role,
        round: data.round,
        status: data.status,
        interview_date: data.interview_date || '',
        client_id: data.client_id || selectedClient || (clients[0]?.id || ''),
      });

      if (data.matched_resume_id) {
        setLinkedResume({
          id: data.matched_resume_id,
          original_filename: data.matched_resume_name,
          candidate_name: data.matched_resume_candidate,
          company: data.matched_resume_company,
          role: data.matched_resume_role,
          resume_id_tag: data.matched_resume_tag,
          match_priority: data.match_priority,
          match_reason: data.match_reason,
        });
      } else {
        setLinkedResume(null);
      }

      if (!data.is_interview_mail) {
        warning('Not Related', 'This email is not a recruitment/interview update. Ignored.');
      } else {
        info('Interview Mail Detected', 'Review details before confirming.');
      }
    } catch (err) {
      console.error('Failed to analyze email:', err);
      toastError('Analysis Failed', err.response?.data?.detail || 'Failed to analyze email with Groq AI');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Analyze uploaded email file (.eml, .pdf, screenshot OCR)
  const handleAnalyzeFile = async () => {
    if (!selectedFile) {
      warning('No File', 'Please select an email file (.eml, .pdf, screenshot) to upload.');
      return;
    }

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedClient || (clients.length === 1 ? clients[0].id : null)) {
      formData.append('client_id', selectedClient || clients[0].id);
    }

    try {
      const res = await api.post('/ai/analyze-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res.data;
      setAnalysisResult(data);
      setIsEditing(false);
      setEditableForm({
        candidate_name: data.candidate_name,
        company: data.company,
        role: data.role,
        round: data.round,
        status: data.status,
        interview_date: data.interview_date || '',
        client_id: data.client_id || selectedClient || (clients[0]?.id || ''),
      });

      if (data.matched_resume_id) {
        setLinkedResume({
          id: data.matched_resume_id,
          original_filename: data.matched_resume_name,
          candidate_name: data.matched_resume_candidate,
          company: data.matched_resume_company,
          role: data.matched_resume_role,
          resume_id_tag: data.matched_resume_tag,
          match_priority: data.match_priority,
          match_reason: data.match_reason,
        });
      } else {
        setLinkedResume(null);
      }

      if (!data.is_interview_mail) {
        warning('Not Related', 'This file is not a recruitment/interview update. Ignored.');
      } else {
        info('File Analyzed', `Extracted interview details from ${selectedFile.name}. Review before confirming.`);
      }
    } catch (err) {
      console.error('Failed to analyze file:', err);
      toastError('Upload Failed', err.response?.data?.detail || 'Failed to extract text from email file.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --------------------------------------------------------------------------
  // STEP 2: HUMAN CONFIRMATION (PERSIST TO DATABASE & AUTO-POST TO CHAT)
  // --------------------------------------------------------------------------
  const handleConfirmAndSave = async () => {
    if (!analysisResult || !analysisResult.is_interview_mail) return;

    if (!editableForm.candidate_name.trim()) {
      warning('Candidate Required', 'Please provide a valid candidate name.');
      return;
    }

    setIsSaving(true);
    try {
      const targetClientId = editableForm.client_id || selectedClient || (clients.length > 0 ? clients[0].id : undefined);

      const payload = {
        candidate_name: editableForm.candidate_name.trim(),
        company: editableForm.company.trim() || 'Company',
        role: editableForm.role.trim() || 'Software Engineer',
        round: editableForm.round.trim() || 'Round 1',
        status: editableForm.status || 'Shortlisted',
        interview_date: editableForm.interview_date || null,
        client_id: targetClientId,
        raw_email: analysisResult.raw_email,
        source_type: analysisResult.source_type,
        decision: analysisResult.decision,
        matched_application_id: analysisResult.matched_application_id,
        resume_id: linkedResume ? linkedResume.id : null,
      };

      const res = await api.post('/ai/confirm-save', payload);
      const data = res.data;

      triggerConfetti();
      const actionWord = data.action_type === 'new' ? 'New candidate created' : 'Candidate timeline updated';
      success('Confirmed & Saved', `${actionWord}: ${data.application.candidate_name} → ${data.application.current_round}`);

      // Dispatch global real-time event so dashboards and charts update instantly
      window.dispatchEvent(new CustomEvent('application-created', { detail: data }));
      window.dispatchEvent(new CustomEvent('application-updated', { detail: data }));

      // Reset analysis and input states
      setAnalysisResult(null);
      setLinkedResume(null);
      setIsEditing(false);
      setRawEmail('');
      setSelectedFile(null);
      fetchInbox();
    } catch (err) {
      console.error('Failed to confirm and save:', err);
      toastError('Save Failed', err.response?.data?.detail || 'Failed to save confirmed update to database');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardAnalysis = () => {
    setAnalysisResult(null);
    setLinkedResume(null);
    setIsEditing(false);
    info('Discarded', 'Analysis discarded. No changes were made to the database.');
  };

  const handleCloseApplication = async (appId) => {
    try {
      await api.post(`/applications/${appId}/close`);
      success('Application Closed', 'Application process marked as finished.');
      window.dispatchEvent(new CustomEvent('application-updated', { detail: { appId } }));
      fetchInbox();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to close application');
    }
  };

  const handleArchiveApplication = async (appId) => {
    try {
      await api.post(`/applications/${appId}/archive`);
      success('Application Archived', 'Application moved to archive.');
      window.dispatchEvent(new CustomEvent('application-updated', { detail: { appId } }));
      fetchInbox();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to archive application');
    }
  };

  const handleDeleteApplication = async (appId) => {
    try {
      await api.delete(`/applications/${appId}`);
      success('Application Deleted', 'Application record removed.');
      window.dispatchEvent(new CustomEvent('application-updated', { detail: { appId } }));
      fetchInbox();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to delete application');
    }
  };

  const getApplicationActionMenu = (item) => {
    const items = [
      {
        icon: TrendingUp,
        label: 'View Timeline History',
        onClick: () => fetchTimeline(item.application_id),
      },
    ];

    if (isAdmin || isSubAdmin || isEmployee) {
      items.push({
        icon: XCircle,
        label: 'Close Application',
        onClick: () => handleCloseApplication(item.application_id),
      });

      items.push({
        icon: Archive,
        label: 'Archive Application',
        onClick: () => handleArchiveApplication(item.application_id),
      });
    }

    if (isAdmin) {
      items.push({ divider: true });
      items.push({
        icon: Trash2,
        label: 'Delete Record',
        danger: true,
        onClick: () => handleDeleteApplication(item.application_id),
      });
    }

    return items;
  };

  const getRoundBadgeColor = (roundStr = '') => {
    const r = typeof roundStr === 'string' ? roundStr.toLowerCase() : '';
    if (r.includes('offer')) return 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]';
    if (r.includes('tech') || r.includes('coding')) return 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]';
    if (r.includes('hr') || r.includes('discussion')) return 'bg-[#FAF5FF] text-[#9333EA] border-[#E9D5FF]';
    if (r.includes('shortlist') || r.includes('round 1') || r.includes('round 2')) return 'bg-[#FFF7ED] text-[#F97316] border-[#FFEDD5]';
    if (r.includes('reject')) return 'bg-[#FEF2F2] text-[#EF4444] border-[#FECACA]';
    if (r.includes('hold')) return 'bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]';
    return 'bg-[#F8FAFC] text-[#081226] border-[#E2E8F0]';
  };

  // Scoped Dropdown Header Text
  const clientFilterDropdownLabel = isEmployee
    ? `All Assigned Clients (${clients.length})`
    : isSubAdmin
    ? `All Managed Clients (${clients.length})`
    : `All Clients (${clients.length})`;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-12 select-none">
      {/* 1. TOP HEADER & METRICS BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] flex items-center justify-center text-white shadow-md">
              <Mail className="w-5 h-5" />
            </div>
            <h1 className="text-h1 font-extrabold text-[#081226] tracking-tight">
              Applications
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] flex items-center gap-1.5 shadow-xs">
              <Sparkles className="w-3 h-3 text-[#F97316]" />
              Groq AI Interview Mail Detector
            </span>
          </div>
          <p className="text-small text-[#64748B] mt-1">
            {isClient
              ? 'Track candidate progression and interview rounds for your company in real-time.'
              : isEmployee
              ? 'AI-assisted recruiter intake scoped to your assigned Service Clients.'
              : isSubAdmin
              ? 'AI-assisted recruiter intake scoped to your managed Service Clients.'
              : 'Global recruiter intake across all system Service Clients.'}
          </p>
        </div>

        {/* Real-time KPI Badges (Scoped) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
          <div className="p-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">New Applications</p>
            <p className="text-lg font-black text-[#2563EB] mt-0.5">{inboxData?.new_count ?? 0}</p>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Interview Updates</p>
            <p className="text-lg font-black text-[#F97316] mt-0.5">{inboxData?.followup_count ?? 0}</p>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Shortlisted Today</p>
            <p className="text-lg font-black text-[#16A34A] mt-0.5">{inboxData?.today_processed ?? 0}</p>
          </div>

          <div className="p-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Total Candidates</p>
            <p className="text-lg font-black text-[#081226] mt-0.5">{inboxData?.total ?? 0}</p>
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS: AI Intake | Application Timeline */}
      <div className="flex items-center gap-2 p-1.5 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-x-auto">
        {!isClient && (
          <button
            type="button"
            onClick={() => setActiveMainTab('intake')}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-small font-bold transition-all shrink-0 cursor-pointer',
              activeMainTab === 'intake'
                ? 'bg-[#081226] text-white shadow-md'
                : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F8FAFC]'
            )}
          >
            <Sparkles className={cn('w-4 h-4', activeMainTab === 'intake' ? 'text-[#F97316]' : 'text-[#64748B]')} />
            <span>AI Interview Mail Intake</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveMainTab('timeline')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-small font-bold transition-all shrink-0 cursor-pointer',
            activeMainTab === 'timeline' || isClient
              ? 'bg-[#081226] text-white shadow-md'
              : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F8FAFC]'
          )}
        >
          <TrendingUp className={cn('w-4 h-4', activeMainTab === 'timeline' || isClient ? 'text-[#2563EB]' : 'text-[#64748B]')} />
          <span>Application Timeline ({inboxData?.total ?? 0})</span>
        </button>
      </div>

      {/* 3. VIEW 1: AI INTAKE & HUMAN CONFIRMATION SCREEN (Recruiters & Admins only) */}
      {!isClient && activeMainTab === 'intake' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: INTAKE STUDIO OR CONFIRMATION SCREEN */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-[#E2E8F0] shadow-card p-5 sm:p-6 space-y-5 sticky top-6">
            
            {/* IF UNRELATED EMAIL DETECTED (IGNORE FLOW) */}
            {analysisResult && !analysisResult.is_interview_mail && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="p-6 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-[#FEE2E2] flex items-center justify-center mx-auto text-[#EF4444]">
                    <Ban className="w-6 h-6" />
                  </div>
                  <h3 className="text-h3 font-extrabold text-[#991B1B]">Ignored. Not an Interview Email</h3>
                  <p className="text-small text-[#B91C1C] leading-relaxed max-w-md mx-auto">
                    Groq analyzed this email and determined it is not related to recruitment, an interview, or candidate application. Nothing has been saved to the database.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="md"
                  icon={Undo2}
                  onClick={handleDiscardAnalysis}
                  className="w-full h-[44px] font-bold"
                >
                  Paste Another Email
                </Button>
              </motion.div>
            )}

            {/* IF INTERVIEW MAIL DETECTED: SHOW CONFIRMATION SCREEN */}
            {analysisResult && analysisResult.is_interview_mail && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-5"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                    <div>
                      <h3 className="text-h3 font-bold text-[#081226]">
                        {analysisResult.decision === 'existing_application' ? 'Existing Application Found' : 'New Application Detected'}
                      </h3>
                      <p className="text-caption text-[#64748B]">Review extracted details before confirming</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Edit3}
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs font-bold text-[#2563EB]"
                  >
                    {isEditing ? 'View Mode' : 'Edit Details'}
                  </Button>
                </div>

                {/* Structured Confirmation Table / Form */}
                {!isEditing ? (
                  <div className="rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    <table className="w-full text-left text-small">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                        <tr>
                          <th className="px-4 py-2.5">Field</th>
                          <th className="px-4 py-2.5">Extracted Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Candidate</td>
                          <td className="px-4 py-2.5 font-extrabold text-[#081226]">{editableForm.candidate_name}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Company</td>
                          <td className="px-4 py-2.5 font-bold text-[#081226]">{editableForm.company}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Service Client</td>
                          <td className="px-4 py-2.5 font-bold text-[#2563EB]">
                            {clients.find(c => c.id === editableForm.client_id)?.company_name || 'Assigned Client'}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Role</td>
                          <td className="px-4 py-2.5 text-[#081226]">{editableForm.role}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Round</td>
                          <td className="px-4 py-2.5">
                            <span className={cn('px-2.5 py-0.5 rounded-lg border font-extrabold text-caption', getRoundBadgeColor(editableForm.round))}>
                              {editableForm.round}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Status</td>
                          <td className="px-4 py-2.5 font-bold text-[#2563EB]">{editableForm.status}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2.5 font-bold text-[#64748B]">Date</td>
                          <td className="px-4 py-2.5 text-[#081226]">{editableForm.interview_date || 'Not specified'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Editable Mode */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Candidate
                        </label>
                        <input
                          type="text"
                          value={editableForm.candidate_name}
                          onChange={(e) => setEditableForm({ ...editableForm, candidate_name: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Company
                        </label>
                        <input
                          type="text"
                          value={editableForm.company}
                          onChange={(e) => setEditableForm({ ...editableForm, company: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                    </div>

                    {clients.length > 1 && (
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Target Service Client
                        </label>
                        <select
                          value={editableForm.client_id}
                          onChange={(e) => setEditableForm({ ...editableForm, client_id: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        >
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.company_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Role
                        </label>
                        <input
                          type="text"
                          value={editableForm.role}
                          onChange={(e) => setEditableForm({ ...editableForm, role: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Round
                        </label>
                        <input
                          type="text"
                          value={editableForm.round}
                          onChange={(e) => setEditableForm({ ...editableForm, round: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Status
                        </label>
                        <select
                          value={editableForm.status}
                          onChange={(e) => setEditableForm({ ...editableForm, status: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        >
                          <option value="Submitted">Submitted</option>
                          <option value="Shortlisted">Shortlisted</option>
                          <option value="Round 1">Round 1</option>
                          <option value="Round 2">Round 2</option>
                          <option value="Technical">Technical</option>
                          <option value="Manager">Manager</option>
                          <option value="HR">HR</option>
                          <option value="Offer">Offer</option>
                          <option value="Rejected">Rejected</option>
                          <option value="Hold">Hold</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                          Date
                        </label>
                        <input
                          type="text"
                          value={editableForm.interview_date}
                          placeholder="e.g. 2026-08-26"
                          onChange={(e) => setEditableForm({ ...editableForm, interview_date: e.target.value })}
                          className="w-full h-[42px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:bg-white focus:border-[#2563EB] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Smart Resume Linking Section */}
                <div className="pt-3 border-t border-[#F1F5F9] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-[#2563EB]" />
                      Linked Resume
                    </span>
                    {linkedResume && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                        {linkedResume.match_priority
                          ? `Priority ${linkedResume.match_priority}: ${linkedResume.match_reason || 'Matched'}`
                          : 'Manually Linked'}
                      </span>
                    )}
                  </div>

                  {linkedResume ? (
                    /* Case 1 — Resume Found / Linked */
                    <div className="p-3.5 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                          <FileCheck className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-small font-extrabold text-[#166534] truncate" title={linkedResume.original_filename}>
                            {linkedResume.original_filename}
                          </p>
                          <p className="text-caption text-[#15803D] truncate">
                            {linkedResume.candidate_name} • {linkedResume.company} ({linkedResume.role})
                            {linkedResume.resume_id_tag ? ` • Tag: ${linkedResume.resume_id_tag}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={openResumeSelector}
                          className="h-8 text-xs font-bold bg-white text-[#166534] border-[#86EFAC] hover:bg-[#DCFCE7]"
                        >
                          Change Resume
                        </Button>
                        <button
                          type="button"
                          onClick={() => setLinkedResume(null)}
                          title="Unlink resume"
                          className="p-1.5 text-[#DC2626] hover:bg-[#FEE2E2] rounded-lg transition-colors cursor-pointer"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Case 2 — No Resume Found / Unlinked */
                    <div className="p-3.5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-small font-extrabold text-[#92400E]">
                            No Resume Match Found
                          </p>
                          <p className="text-caption text-[#B45309]">
                            Create without linking a resume, or select one manually.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openResumeSelector}
                        className="h-8 text-xs font-bold bg-white text-[#92400E] border-[#FCD34D] hover:bg-[#FEF3C7] shrink-0"
                      >
                        Select Resume Manually
                      </Button>
                    </div>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#F1F5F9]">
                  <Button
                    variant="outline"
                    size="md"
                    icon={Undo2}
                    onClick={handleDiscardAnalysis}
                    className="h-[46px] px-4 font-bold"
                  >
                    Discard
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    icon={CheckCircle2}
                    onClick={handleConfirmAndSave}
                    isLoading={isSaving}
                    className="flex-1 h-[46px] font-bold bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] shadow-md hover:shadow-lg transition-all"
                  >
                    {analysisResult.decision === 'existing_application'
                      ? (linkedResume ? 'Confirm & Update' : 'Confirm & Update (Unlinked)')
                      : (linkedResume ? 'Confirm & Create' : 'Confirm & Create (Unlinked)')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* IF NO ACTIVE ANALYSIS: SHOW INTAKE OPTIONS */}
            {!analysisResult && (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-[#2563EB]" />
                    <h3 className="text-h3 font-bold text-[#081226]">AI Intake Screen</h3>
                  </div>
                  <span className="text-caption font-semibold text-[#64748B] flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-[#10B981]" />
                    Groq Ready
                  </span>
                </div>

                {/* Assigned Client Selector if multiple */}
                {clients.length > 1 && (
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                      {isEmployee ? 'Target Assigned Client' : 'Target Managed Client'}
                    </label>
                    <select
                      value={selectedClient}
                      onChange={(e) => setSelectedClient(e.target.value)}
                      className="w-full h-[40px] px-3 rounded-xl bg-[#F8FAFC] text-small font-bold text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="">Auto-Detect from Email or Select Client</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.company_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 4 Input Options */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-2">
                    Select Intake Format
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#F1F5F9] rounded-2xl border border-[#E2E8F0]">
                    <button
                      type="button"
                      onClick={() => setIntakeMode('paste')}
                      className={cn(
                        'py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer',
                        intakeMode === 'paste' ? 'bg-white text-[#081226] shadow-xs' : 'text-[#64748B] hover:text-[#081226]'
                      )}
                    >
                      <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Paste</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntakeMode('eml')}
                      className={cn(
                        'py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer',
                        intakeMode === 'eml' ? 'bg-white text-[#081226] shadow-xs' : 'text-[#64748B] hover:text-[#081226]'
                      )}
                    >
                      <Mail className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>.eml</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntakeMode('pdf')}
                      className={cn(
                        'py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer',
                        intakeMode === 'pdf' ? 'bg-white text-[#081226] shadow-xs' : 'text-[#64748B] hover:text-[#081226]'
                      )}
                    >
                      <FileCode className="w-3.5 h-3.5 text-[#10B981]" />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntakeMode('screenshot')}
                      className={cn(
                        'py-2 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer',
                        intakeMode === 'screenshot' ? 'bg-white text-[#081226] shadow-xs' : 'text-[#64748B] hover:text-[#081226]'
                      )}
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-[#9333EA]" />
                      <span>Screenshot</span>
                    </button>
                  </div>
                </div>

                {/* OPTION 1: PASTE EMAIL */}
                {intakeMode === 'paste' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1.5">
                        1-Click Test Samples
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {SAMPLE_EMAILS.map((tpl, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRawEmail(tpl.text)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#F8FAFC] text-[#475569] border border-[#E2E8F0] hover:bg-[#EFF6FF] hover:text-[#2563EB] hover:border-[#BFDBFE] transition-colors cursor-pointer"
                          >
                            {tpl.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-small font-semibold text-[#081226]">
                          Paste Email Text <span className="text-[#EF4444]">*</span>
                        </label>
                        {rawEmail && (
                          <button
                            type="button"
                            onClick={() => setRawEmail('')}
                            className="text-caption text-[#94A3B8] hover:text-[#EF4444] cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <textarea
                        rows={8}
                        value={rawEmail}
                        onChange={(e) => setRawEmail(e.target.value)}
                        placeholder="Paste interview scheduled email, round 2 follow-up, offer letter, or newsletter..."
                        className="w-full p-4 rounded-2xl bg-[#F8FAFC] text-small font-mono text-[#081226] border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:bg-white focus:outline-none transition-all placeholder-[#94A3B8] leading-relaxed resize-y"
                      />
                    </div>

                    <Button
                      variant="primary"
                      size="lg"
                      icon={Sparkles}
                      onClick={handleAnalyzeEmail}
                      isLoading={isAnalyzing}
                      className="w-full h-[48px] text-base font-bold bg-gradient-to-r from-[#2563EB] via-[#1D4ED8] to-[#0D6EFD] shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                    >
                      {isAnalyzing ? 'Groq AI is Classifying...' : 'Analyze with Groq'}
                    </Button>
                  </div>
                )}

                {/* OPTION 2, 3, 4: FILE / SCREENSHOT UPLOAD */}
                {intakeMode !== 'paste' && (
                  <div className="space-y-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={
                        intakeMode === 'eml'
                          ? '.eml,message/rfc822'
                          : intakeMode === 'pdf'
                          ? '.pdf,application/pdf'
                          : 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg'
                      }
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0]);
                        }
                      }}
                    />

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          setSelectedFile(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        'border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all',
                        isDragging
                          ? 'border-[#2563EB] bg-[#EFF6FF]'
                          : selectedFile
                          ? 'border-[#10B981] bg-[#F0FDF4]'
                          : 'border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#2563EB] hover:bg-[#EFF6FF]/40'
                      )}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-[#E2E8F0] flex items-center justify-center mx-auto text-[#2563EB] mb-3">
                        <UploadCloud className="w-6 h-6" />
                      </div>

                      {selectedFile ? (
                        <div className="space-y-1">
                          <p className="font-extrabold text-[#081226] text-small truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-caption text-[#16A34A] font-bold">
                            {(selectedFile.size / 1024).toFixed(1)} KB · Ready to analyze
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-extrabold text-[#081226] text-small">
                            {intakeMode === 'screenshot'
                              ? 'Upload Email Screenshot (OCR)'
                              : intakeMode === 'pdf'
                              ? 'Upload Email PDF'
                              : 'Upload .eml File'}
                          </p>
                          <p className="text-caption text-[#64748B]">
                            Click to browse or drag & drop file
                          </p>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="primary"
                      size="lg"
                      icon={Sparkles}
                      onClick={handleAnalyzeFile}
                      isLoading={isAnalyzing}
                      disabled={!selectedFile}
                      className="w-full h-[48px] text-base font-bold bg-gradient-to-r from-[#2563EB] via-[#1D4ED8] to-[#0D6EFD] shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                    >
                      {isAnalyzing ? 'Extracting & Classifying...' : 'Analyze with Groq'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT COLUMN: RECENT CONFIRMED APPLICATIONS FEED (Scoped) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#2563EB]" />
                <h3 className="text-h3 font-bold text-[#081226]">Confirmed Applications</h3>
              </div>
              <span className="text-caption font-bold text-[#64748B]">
                {inboxData?.items?.length ?? 0} Records
              </span>
            </div>

            <div className="space-y-3.5">
              {loadingFeed ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-[#E2E8F0]">
                  <BrandedLoader size="md" label="Loading confirmed records..." />
                </div>
              ) : !inboxData || inboxData.items?.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-[#E2E8F0] space-y-3">
                  <Mail className="w-10 h-10 text-[#2563EB] mx-auto" />
                  <h4 className="text-h3 font-bold text-[#081226]">No emails confirmed yet</h4>
                  <p className="text-small text-[#64748B]">Paste interview emails on the left and confirm to build candidate timelines.</p>
                </div>
              ) : (
                inboxData.items.map((item) => {
                  const isNew = item.action_type === 'new';

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-card p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={item.candidate_name} size="md" variant={isNew ? 'blue' : 'purple'} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-[#081226] text-small sm:text-base leading-tight truncate">
                                {item.candidate_name}
                              </h4>
                              <span
                                className={cn(
                                  'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border',
                                  isNew
                                    ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
                                    : 'bg-[#FFF7ED] text-[#F97316] border-[#FFEDD5]'
                                )}
                              >
                                {isNew ? 'NEW' : 'FOLLOW-UP'}
                              </span>
                            </div>
                            <p className="text-caption text-[#64748B] truncate mt-0.5">
                              {item.role} · <strong className="text-[#081226]">{item.company}</strong> ({item.client_name})
                            </p>
                          </div>
                        </div>

                        <span className={cn('px-2.5 py-0.5 rounded-lg border font-extrabold text-caption truncate', getRoundBadgeColor(item.round))}>
                          {item.round}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9]">
                        <button
                          type="button"
                          onClick={() => setSelectedItemForRawEmail(item)}
                          className="text-caption font-semibold text-[#64748B] hover:text-[#2563EB] flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Raw Email</span>
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={TrendingUp}
                          onClick={() => fetchTimeline(item.application_id)}
                          className="h-[34px] text-xs font-bold text-[#2563EB] border-[#BFDBFE] hover:bg-[#EFF6FF]"
                        >
                          Timeline ({item.events_count || 2} Events) →
                        </Button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. VIEW 2: APPLICATION TIMELINE */}
      {(isClient || activeMainTab === 'timeline') && (
        <div className="space-y-4">
          {/* Scoped Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search candidate, company, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-[38px] rounded-xl text-small bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Client Dropdown: Hidden for Client role, Scoped for Employee/SubAdmin/Admin */}
              {!isClient && (
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="h-[38px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] flex-1 sm:flex-none"
                >
                  <option value="">{clientFilterDropdownLabel}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="h-[38px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] flex-1 sm:flex-none"
              >
                <option value="">All Statuses</option>
                <option value="Submitted">Submitted</option>
                <option value="Shortlisted">Shortlisted</option>
                <option value="Round 1">Round 1</option>
                <option value="Round 2">Round 2</option>
                <option value="Technical">Technical</option>
                <option value="Manager">Manager</option>
                <option value="HR">HR</option>
                <option value="Offer">Offer</option>
                <option value="Rejected">Rejected</option>
                <option value="Hold">Hold</option>
              </select>
            </div>
          </div>

          {/* Expandable Candidate Timeline Cards */}
          <div className="space-y-4">
            {loadingFeed ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-[#E2E8F0]">
                <BrandedLoader size="md" label="Loading Candidate Timelines..." />
              </div>
            ) : !inboxData || inboxData.items?.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-[#E2E8F0] space-y-3">
                <Layers className="w-10 h-10 text-[#2563EB] mx-auto" />
                <h4 className="text-h3 font-bold text-[#081226]">No applications found</h4>
                <p className="text-small text-[#64748B]">
                  {isClient
                    ? 'No candidate applications currently active for your account.'
                    : 'Process interview emails in the AI Intake Studio to build application timelines.'}
                </p>
              </div>
            ) : (
              inboxData.items.map((item) => {
                const isExpanded = !!expandedCards[item.id];

                return (
                  <motion.div
                    key={item.id}
                    layout
                    className="bg-white rounded-3xl border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-card transition-all overflow-hidden"
                  >
                    {/* Header Row */}
                    <div
                      onClick={() => toggleCardExpansion(item.id)}
                      className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#F8FAFC]/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <Avatar name={item.candidate_name} size="lg" variant="blue" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-h3 font-extrabold text-[#081226] truncate">
                              {item.candidate_name}
                            </h3>
                            <span className={cn('px-2.5 py-0.5 rounded-lg border font-extrabold text-caption truncate', getRoundBadgeColor(item.round))}>
                              {item.round}
                            </span>
                          </div>
                          <p className="text-small text-[#64748B] mt-0.5">
                            {item.role} · <strong className="text-[#081226]">{item.company}</strong> · {item.client_name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={TrendingUp}
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchTimeline(item.application_id);
                          }}
                          className="h-[36px] text-xs font-bold text-[#2563EB] border-[#BFDBFE]"
                        >
                          Full Audit History →
                        </Button>

                        <div onClick={(e) => e.stopPropagation()}>
                          <Dropdown
                            trigger={
                              <button
                                type="button"
                                className="p-2 rounded-xl text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9] transition-colors"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            }
                            items={getApplicationActionMenu(item)}
                          />
                        </div>

                        <div className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#64748B]">
                          {isExpanded ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Step-by-Step Visual Timeline Progression */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-6 pb-6 pt-2 border-t border-[#F1F5F9] bg-[#FAFAFA]"
                        >
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-4">
                            Timeline Progression Stages
                          </p>

                          <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
                            {/* Step 1: Submitted */}
                            <div className="relative space-y-1">
                              <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#10B981] border-2 border-white ring-2 ring-[#10B981]/20" />
                              <p className="text-small font-extrabold text-[#081226]">✓ Submitted</p>
                              <p className="text-caption text-[#64748B]">{formatDate(item.created_at)} · Direct ATS Ingestion</p>
                            </div>

                            {/* Step 2: Latest Extracted Round */}
                            <div className="relative space-y-1">
                              <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#2563EB] border-2 border-white ring-2 ring-[#2563EB]/20" />
                              <p className="text-small font-extrabold text-[#081226]">● {item.round}</p>
                              <p className="text-caption text-[#475569] font-mono whitespace-pre-wrap bg-white p-3 rounded-xl border border-[#E2E8F0] mt-1">
                                {item.raw_email_snippet}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 5. CANDIDATE TIMELINE DRAWER */}
      <Drawer
        isOpen={!!selectedAppIdForTimeline}
        onClose={() => {
          setSelectedAppIdForTimeline(null);
          setTimelineData(null);
        }}
        title={`Application Timeline: ${timelineData?.candidate_name || 'Loading...'}`}
        subtitle={`${timelineData?.role || ''} · ${timelineData?.company || ''} (${timelineData?.client_name || ''})`}
        width="max-w-xl"
      >
        {loadingTimeline ? (
          <div className="py-16 text-center">
            <BrandedLoader size="md" label="Loading Candidate Timeline..." />
          </div>
        ) : !timelineData ? (
          <div className="py-12 text-center text-[#64748B]">No timeline events found.</div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">Current Stage</p>
                <p className="text-base font-extrabold text-[#081226] mt-0.5">{timelineData.current_round}</p>
              </div>
              <span className={cn('px-2.5 py-1 rounded-xl border text-caption font-black', getRoundBadgeColor(timelineData.current_round))}>
                Active
              </span>
            </div>

            <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
              {timelineData.events?.map((ev, idx) => {
                const isLatest = idx === timelineData.events.length - 1;

                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="relative space-y-2"
                  >
                    <div
                      className={cn(
                        'absolute -left-6 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center text-white',
                        isLatest
                          ? 'bg-[#2563EB] border-white ring-4 ring-[#2563EB]/20'
                          : 'bg-[#10B981] border-white ring-2 ring-[#10B981]/20'
                      )}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>

                    <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                      <h4 className="font-extrabold text-[#081226] text-small">
                        {ev.event_type}
                      </h4>

                      <p className="text-[11px] text-[#64748B]">
                        Recorded {formatDate(ev.created_at)} by <span className="font-bold text-[#081226]">{ev.created_by_name || 'AI Intake Engine'}</span>
                      </p>

                      {ev.raw_email && ev.raw_email !== 'Initial Application Submission' && (
                        <div className="mt-2 p-2.5 rounded-xl bg-white border border-[#E2E8F0] text-[11px] font-mono text-[#475569] max-h-24 overflow-y-auto leading-relaxed">
                          {ev.raw_email}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </Drawer>

      {/* 6. RAW EMAIL VIEW MODAL */}
      <Modal
        isOpen={!!selectedItemForRawEmail}
        onClose={() => setSelectedItemForRawEmail(null)}
        title={`Recruiter Email Source: ${selectedItemForRawEmail?.candidate_name || ''}`}
        subtitle={`${selectedItemForRawEmail?.company || ''} · ${selectedItemForRawEmail?.round || ''}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-small font-mono text-[#081226] whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
            {selectedItemForRawEmail?.raw_email_snippet || 'No raw email recorded.'}
          </div>
        </div>
      </Modal>

      {/* 7. MANUAL RESUME SELECTOR MODAL (Scoped to Client) */}
      <Modal
        isOpen={isResumeSelectorOpen}
        onClose={() => setIsResumeSelectorOpen(false)}
        title={`Select Candidate Resume`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-small text-[#64748B]">
            Search and select a resume belonging to <strong className="text-[#081226]">{clients.find(c => c.id === (editableForm.client_id || selectedClient))?.company_name || 'Selected Client'}</strong>.
          </p>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by candidate name, company, role, or resume tag (e.g. RES101)..."
              value={resumeSearchTerm}
              onChange={(e) => setResumeSearchTerm(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-small font-medium text-[#081226] focus:bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          {/* Resume Items List */}
          <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
            {loadingClientResumes ? (
              <div className="py-12 text-center text-small text-[#64748B]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2563EB]" />
                Loading client candidate bank...
              </div>
            ) : clientResumes.filter(r => {
              if (!resumeSearchTerm.trim()) return true;
              const q = resumeSearchTerm.toLowerCase();
              return (
                r.candidate_name?.toLowerCase().includes(q) ||
                r.company?.toLowerCase().includes(q) ||
                r.role?.toLowerCase().includes(q) ||
                r.resume_id_tag?.toLowerCase().includes(q) ||
                r.original_filename?.toLowerCase().includes(q)
              );
            }).length === 0 ? (
              <div className="py-12 text-center text-small text-[#64748B]">
                No resumes found matching "{resumeSearchTerm}" in this client account.
              </div>
            ) : (
              clientResumes
                .filter(r => {
                  if (!resumeSearchTerm.trim()) return true;
                  const q = resumeSearchTerm.toLowerCase();
                  return (
                    r.candidate_name?.toLowerCase().includes(q) ||
                    r.company?.toLowerCase().includes(q) ||
                    r.role?.toLowerCase().includes(q) ||
                    r.resume_id_tag?.toLowerCase().includes(q) ||
                    r.original_filename?.toLowerCase().includes(q)
                  );
                })
                .map(r => {
                  const isCurrentlySelected = linkedResume?.id === r.id;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors',
                        isCurrentlySelected ? 'bg-[#EFF6FF] border-[#BFDBFE]' : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-white'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-small font-extrabold text-[#081226] truncate">
                            {r.candidate_name}
                          </p>
                          {r.resume_id_tag && (
                            <span className="px-2 py-0.5 rounded-md bg-white border border-[#E2E8F0] text-[#2563EB] text-[10px] font-extrabold">
                              {r.resume_id_tag}
                            </span>
                          )}
                        </div>
                        <p className="text-caption text-[#64748B] truncate mt-0.5">
                          {r.company} • {r.role} • <span className="text-[#94A3B8]">{r.original_filename}</span>
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant={isCurrentlySelected ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setLinkedResume({
                            id: r.id,
                            original_filename: r.original_filename,
                            candidate_name: r.candidate_name,
                            company: r.company,
                            role: r.role,
                            resume_id_tag: r.resume_id_tag,
                            match_priority: null,
                            match_reason: 'Manually selected by recruiter',
                          });
                          if (!editableForm.candidate_name || editableForm.candidate_name === 'Candidate') {
                            setEditableForm(prev => ({
                              ...prev,
                              candidate_name: r.candidate_name,
                              company: r.company || prev.company,
                              role: r.role || prev.role,
                            }));
                          }
                          setIsResumeSelectorOpen(false);
                          success('Resume Linked', `Linked ${r.original_filename}`);
                        }}
                        className="h-8 text-xs font-bold shrink-0"
                      >
                        {isCurrentlySelected ? 'Selected' : 'Link Resume'}
                      </Button>
                    </div>
                  );
                })
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setLinkedResume(null);
                setIsResumeSelectorOpen(false);
                info('Unlinked', 'Candidate will be created without a linked resume.');
              }}
              className="text-xs font-bold text-[#DC2626] hover:bg-[#FEE2E2]"
            >
              Clear Link & Proceed Unlinked
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsResumeSelectorOpen(false)}
              className="h-8 text-xs font-bold"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AIResponseInboxPage;
