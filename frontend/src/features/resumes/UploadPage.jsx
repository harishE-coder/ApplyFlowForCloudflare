import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Building2,
  Trash2,
  Check,
  RefreshCw,
  Edit3,
  SkipForward,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Info,
  Eye,
  Download,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { formatDate, cn } from '@/utils/cn';
import {
  openResumePreview,
  openResumeDownload,
  copyResumeShareLink,
} from '@/utils/resumeUrls';

// Memoized Upload Queue Row
const UploadQueueRow = React.memo(function UploadQueueRow({
  row,
  onUpdateRow,
  onRemoveRow,
}) {
  return (
    <tr
      className={cn(
        'transition-colors',
        row.status === 'duplicate'
          ? 'bg-[#FFFBEB]/40'
          : row.status === 'needs_review'
          ? 'bg-[#FEF2F2]/40'
          : 'hover:bg-[#F8FAFC]'
      )}
    >
      {/* 1. File Name */}
      <td className="px-4 py-3 max-w-[170px]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[#0D6EFD] shrink-0" />
          <span className="font-mono text-caption text-[#081226] truncate" title={row.filename}>
            {row.filename}
          </span>
        </div>
      </td>

      {/* 2. Service Client (Editable) */}
      <td className="px-4 py-3 w-36">
        <input
          type="text"
          value={row.service_client}
          onChange={(e) => onUpdateRow(row.id, 'service_client', e.target.value)}
          className={cn(
            'w-full h-[34px] px-2 rounded-lg text-caption font-semibold bg-white border focus:outline-none',
            row.clientMatch === false
              ? 'border-rose-300 text-rose-700 bg-rose-50/50'
              : 'border-[#E2E8F0] text-[#081226] focus:border-[#0D6EFD]'
          )}
          placeholder="Service Client"
        />
      </td>

      {/* 3. Target Company (Editable) */}
      <td className="px-4 py-3 w-32">
        <input
          type="text"
          value={row.company}
          onChange={(e) => onUpdateRow(row.id, 'company', e.target.value)}
          className="w-full h-[34px] px-2 rounded-lg text-caption font-bold bg-white text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          placeholder="e.g. TCS"
        />
      </td>

      {/* 4. Role / Role ID (Editable) */}
      <td className="px-4 py-3 w-36">
        <input
          type="text"
          value={row.role}
          onChange={(e) => onUpdateRow(row.id, 'role', e.target.value)}
          className="w-full h-[34px] px-2 rounded-lg text-caption bg-white text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          placeholder="e.g. Java Developer"
        />
      </td>

      {/* 5. Resume Identifier (Editable) */}
      <td className="px-4 py-3 w-32">
        <input
          type="text"
          value={row.resume_identifier}
          placeholder="e.g. RES101"
          onChange={(e) => onUpdateRow(row.id, 'resume_identifier', e.target.value)}
          className="w-full h-[34px] px-2 rounded-lg text-caption font-mono bg-white text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
        />
      </td>

      {/* 6. Status Badge */}
      <td className="px-4 py-3 whitespace-nowrap">
        {row.status === 'valid' && (
          <div className="flex flex-col gap-0.5">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] inline-flex items-center gap-1 w-fit">
              ✅ ServiceClient Verified
            </span>
          </div>
        )}
        {row.status === 'duplicate' && (
          <span
            className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"
            title={row.duplicateInfo?.existing_candidate ? `Matches candidate ${row.duplicateInfo.existing_candidate}` : 'Duplicate candidate'}
          >
            ⚠️ Duplicate Exists
          </span>
        )}
        {row.status === 'needs_review' && (
          <div className="flex flex-col gap-0.5">
            {row.error === 'ServiceClient Mismatch' ? (
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA] inline-flex items-center gap-1 w-fit"
                title="The first segment in the filename does not match the selected Service Client."
              >
                ❌ ServiceClient Mismatch
              </span>
            ) : (
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] inline-flex items-center gap-1 w-fit"
                title="Cannot detect ServiceClient from filename. Correct inline or select client."
              >
                ⚠ Cannot detect ServiceClient from filename
              </span>
            )}
          </div>
        )}
      </td>

      {/* 7. Row delete */}
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onRemoveRow(row.id)}
          className="p-1.5 text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

export function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error: toastError, warning } = useToast();

  const fileInputRef = useRef(null);

  // Form State
  const [assignedClients, setAssignedClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [resumeDate, setResumeDate] = useState(new Date().toISOString().split('T')[0]); // Default Today
  const [loadingClients, setLoadingClients] = useState(true);

  // Ingestion Queue State
  const [queue, setQueue] = useState([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0 to 100
  const [uploadProgressCount, setUploadProgressCount] = useState({ current: 0, total: 0 });

  // Progressive rendering for large queue (render first 20 immediately, then expand)
  useEffect(() => {
    if (queue.length > 20 && visibleCount < queue.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => Math.min(prev + 50, queue.length));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [queue.length, visibleCount]);

  // Success State
  const [uploadSuccessSummary, setUploadSuccessSummary] = useState(null);

  // Core Rule: Only employees can upload. Redirect others.
  useEffect(() => {
    if (user && user.role !== 'employee') {
      toastError('Permission Denied', 'Only recruiters can upload resumes. Administrators and Clients cannot upload.');
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Load only assigned clients
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const res = await api.get('/clients');
        const list = res.data || [];
        setAssignedClients(list);
        if (list.length > 0 && !selectedClientId) {
          setSelectedClientId(list[0].id);
        }
      } catch (err) {
        toastError('Error', 'Failed to load assigned service clients');
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  // Handle location state initial files if redirected from dashboard
  useEffect(() => {
    if (location.state?.initialFiles) {
      handleFilesSelected(location.state.initialFiles);
    }
    if (location.state?.client_id) {
      setSelectedClientId(location.state.client_id);
    }
  }, [location.state]);

  // Clean candidate name from filename noise
  const cleanCandidateName = (raw) => {
    if (!raw) return 'Candidate';
    let cleaned = raw.replace(/\.pdf$/i, '');
    cleaned = cleaned.replace(/[\(\[\{]\d+[\)\]\}]/g, '');
    cleaned = cleaned.replace(/\b(resume|cv|biodata|profile|curriculum|vitae)\b/gi, '');
    cleaned = cleaned.replace(/[-_]+/g, ' ');
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Candidate';
  };

  // Client-side Filename Parser (Strict ServiceClient Filename Verification Only):
  // Format: ServiceClient_HiringCompany_Role.pdf
  // 1. Parse filename using '_' as separator.
  // 2. Extract first segment as ServiceClient.
  // 3. Compare with selected ServiceClient in upload form.
  // 4. Ignore Hiring Company and Role validation.
  const parseFilename = (filename, selectedClientName = '') => {
    const stem = filename.replace(/\.[^/.]+$/, '').trim();
    const parts = stem.split('_').map((p) => p.trim()).filter(Boolean);

    const rawFirst = parts[0] || '';
    const normFirst = rawFirst.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const normSelected = selectedClientName ? selectedClientName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';

    let serviceClient = selectedClientName || (rawFirst ? rawFirst.replace(/([a-z])([A-Z])/g, '$1 $2').trim() : 'ServiceClient');
    let company = '';
    let role = '';
    let resumeIdentifier = parts.length > 1 ? parts[parts.length - 1] : stem;
    let resumeIdTag = '';
    let candidateName = 'Candidate';
    let status = 'valid';
    let error = null;
    let clientMatch = true;

    const hasNoise = parts.some((p) => /\b(resume|cv|biodata)\b|[\(\[\{]\d+[\)\]\}]/i.test(p));

    if (parts.length >= 3 && !hasNoise) {
      company = parts[1].length <= 4 ? parts[1].toUpperCase() : parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      const roleRaw = parts.slice(2).join('_');
      role = roleRaw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
      candidateName = cleanCandidateName(parts.length >= 4 ? parts[parts.length - 1] : parts[0]);

      if (selectedClientName) {
        if (normFirst === normSelected) {
          serviceClient = selectedClientName;
          status = 'valid';
          clientMatch = true;
          error = null;
        } else {
          status = 'needs_review';
          clientMatch = false;
          error = 'ServiceClient Mismatch';
        }
      } else {
        serviceClient = rawFirst;
        status = 'valid';
        clientMatch = true;
      }
    } else if (parts.length === 2 && !hasNoise) {
      company = parts[1].length <= 4 ? parts[1].toUpperCase() : parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      candidateName = cleanCandidateName(parts[0]);
      if (selectedClientName) {
        if (normFirst === normSelected) {
          serviceClient = selectedClientName;
          status = 'valid';
          clientMatch = true;
          error = null;
        } else {
          status = 'needs_review';
          clientMatch = false;
          error = 'ServiceClient Mismatch';
        }
      } else {
        serviceClient = rawFirst;
        status = 'valid';
        clientMatch = true;
      }
    } else {
      candidateName = cleanCandidateName(rawFirst || stem);
      if (selectedClientName) {
        serviceClient = selectedClientName;
        status = 'valid';
        clientMatch = true;
        error = null;
      } else {
        serviceClient = 'ServiceClient';
        status = 'needs_review';
        clientMatch = false;
        error = 'Cannot detect ServiceClient from filename';
      }
    }

    return {
      service_client: serviceClient,
      company: company || 'General',
      role: role || 'General Role',
      resume_identifier: resumeIdentifier || 'RES01',
      resume_id_tag: resumeIdTag,
      candidate_name: candidateName || 'Candidate',
      status,
      error,
      clientMatch,
    };
  };

  // Handle files selection
  const handleFilesSelected = (files) => {
    const pdfFiles = Array.from(files).filter(
      (file) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
    );

    if (pdfFiles.length === 0) {
      warning('PDF Only', 'Only PDF resume files are accepted.');
      return;
    }

    const selectedClientObj = assignedClients.find((c) => c.id === selectedClientId);
    const selectedClientName = selectedClientObj?.company_name || '';

    const newQueueItems = pdfFiles.map((file, idx) => {
      const parsed = parseFilename(file.name, selectedClientName);
      return {
        id: `${file.name}-${Date.now()}-${idx}`,
        file,
        filename: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        service_client: parsed.service_client,
        company: parsed.company,
        role: parsed.role,
        resume_identifier: parsed.resume_identifier,
        resume_id_tag: parsed.resume_id_tag || '',
        candidate_name: parsed.candidate_name || 'Candidate',
        status: parsed.status, // 'valid' | 'duplicate' | 'needs_review'
        error: parsed.error,
        clientMatch: parsed.clientMatch,
        isDuplicate: false,
        duplicateInfo: null,
      };
    });

    setQueue((prev) => {
      const combined = [...prev, ...newQueueItems].slice(0, 200); // 1-200 files
      if (selectedClientId) {
        runDuplicateCheck(combined, selectedClientId);
      }
      return combined;
    });

    setUploadSuccessSummary(null);
  };

  // Sync existing queue items when selectedClientId changes
  useEffect(() => {
    if (selectedClientId && queue.length > 0) {
      const selectedClientObj = assignedClients.find((c) => c.id === selectedClientId);
      const selectedClientName = selectedClientObj?.company_name || '';
      setQueue((prev) =>
        prev.map((it) => ({
          ...it,
          service_client: selectedClientName || it.service_client,
          clientMatch: true,
          status: it.status === 'duplicate' ? 'duplicate' : 'valid',
        }))
      );
      runDuplicateCheck(queue, selectedClientId);
    }
  }, [selectedClientId]);

  // Run Duplicate Detection via Backend API: POST /api/resumes/check-duplicates
  const runDuplicateCheck = async (itemsToCheck, cId) => {
    if (!cId || itemsToCheck.length === 0) return;
    setIsCheckingDuplicates(true);
    try {
      const payload = {
        client_id: cId,
        items: itemsToCheck.map((it) => ({
          filename: it.filename,
          company: it.company,
          candidate_name: it.candidate_name || it.resume_identifier,
          resume_id_tag: it.resume_id_tag || it.resume_identifier || null,
        })),
      };

      const res = await api.post('/resumes/check-duplicates', payload);
      const results = res.data?.results || [];

      setQueue((prev) =>
        prev.map((item) => {
          const match = results.find((r) => r.filename === item.filename);
          if (match?.is_duplicate) {
            return {
              ...item,
              status: 'duplicate',
              isDuplicate: true,
              duplicateInfo: match,
            };
          }
          if (item.status === 'duplicate' && !match?.is_duplicate) {
            return {
              ...item,
              status: item.error ? 'needs_review' : 'valid',
              isDuplicate: false,
              duplicateInfo: null,
            };
          }
          return item;
        })
      );
    } catch (err) {
      console.warn('Duplicate check warning:', err);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  // Re-run client match and duplicate check if selectedClientId changes
  useEffect(() => {
    if (selectedClientId && queue.length > 0) {
      const selectedClientObj = assignedClients.find((c) => c.id === selectedClientId);
      const selName = selectedClientObj?.company_name || '';

      setQueue((prev) =>
        prev.map((it) => {
          const parsed = parseFilename(it.filename, selName);
          if (it.status === 'duplicate') return it;
          return {
            ...it,
            service_client: parsed.service_client,
            status: parsed.status,
            error: parsed.error,
            clientMatch: parsed.clientMatch,
          };
        })
      );

      runDuplicateCheck(queue, selectedClientId);
    }
  }, [selectedClientId]);

  // Inline row updates
  const handleUpdateRow = (id, field, value) => {
    setQueue((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          const updated = { ...it, [field]: value };
          const selectedClientObj = assignedClients.find((c) => c.id === selectedClientId);
          const selName = selectedClientObj?.company_name || '';

          const normParsed = (updated.service_client || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const normSelected = selName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const match = !selName || normParsed === normSelected;

          if (updated.status !== 'duplicate') {
            if (match) {
              updated.status = 'valid';
              updated.error = null;
              updated.clientMatch = true;
            } else {
              updated.status = 'needs_review';
              updated.error = 'ServiceClient Mismatch';
              updated.clientMatch = false;
            }
          }
          return updated;
        }
        return it;
      })
    );
  };

  const handleRemoveRow = (id) => {
    setQueue((prev) => prev.filter((it) => it.id !== id));
  };

  // Skip duplicates helper
  const handleSkipDuplicates = () => {
    setQueue((prev) => prev.filter((it) => it.status !== 'duplicate'));
    success('Duplicates Skipped', 'Removed duplicate files from current upload batch.');
  };

  // Perform upload
  const handleCommitUpload = async (mode = 'all_valid') => {
    if (!selectedClientId) {
      toastError('Required', 'Please select an assigned Service Client.');
      return;
    }

    let filesToUpload = queue;
    if (mode === 'skip_duplicates') {
      filesToUpload = queue.filter((it) => it.status !== 'duplicate');
    }

    // Filter out items that have client mismatch or errors unless corrected
    const hasUnresolvedErrors = filesToUpload.some((it) => it.status === 'needs_review');
    if (hasUnresolvedErrors) {
      toastError(
        'Review Required',
        'Some files have client mismatches or invalid formats. Correct them inline before uploading.'
      );
      return;
    }

    if (filesToUpload.length === 0) {
      toastError('No Files', 'No valid files selected for upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);
    setUploadProgressCount({ current: 0, total: filesToUpload.length });

    const formData = new FormData();
    formData.append('client_id', selectedClientId);
    const validDate = resumeDate && resumeDate.trim() ? resumeDate.trim() : new Date().toISOString().split('T')[0];
    formData.append('resume_date', validDate);

    filesToUpload.forEach((item) => {
      if (item.file) {
        formData.append('files', item.file);
      }
    });

    let progressInterval;
    try {
      progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 15;
        });
        setUploadProgressCount((prev) => ({
          current: Math.min(prev.current + 5, filesToUpload.length),
          total: filesToUpload.length,
        }));
      }, 300);

      const res = await api.post('/resumes/upload', formData, {
        headers: {
          'Content-Type': undefined,
        },
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadProgressCount({ current: filesToUpload.length, total: filesToUpload.length });

      const uploaded = res.data?.saved_count ?? filesToUpload.length;
      const dupCount = queue.filter((it) => it.status === 'duplicate').length;
      const reviewedCount = queue.filter((it) => it.status === 'needs_review').length;

      setUploadSuccessSummary({
        uploaded: uploaded || 0,
        duplicates: dupCount || 0,
        reviewed: reviewedCount || 0,
        items: res.data?.items || [],
      });

      setQueue([]);

      // Trigger immediate dashboard update event across the application
      window.dispatchEvent(new CustomEvent('resume-uploaded', { detail: { count: uploaded } }));
      window.dispatchEvent(new CustomEvent('application-created', { detail: { count: uploaded } }));
      window.dispatchEvent(new CustomEvent('application-updated', { detail: { count: uploaded } }));

      // Confetti celebration (safely guarded)
      try {
        if (typeof confetti === 'function') {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#0D6EFD', '#FF8A00', '#16A34A'],
          });
        }
      } catch (e) {
        // Ignore confetti error
      }

      success('Batch Ingested', `Successfully uploaded ${uploaded} candidate resumes.`);
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Failed to upload batch.';
      toastError('Upload Failed', errorMsg);
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsUploading(false);
    }
  };

  const duplicateCount = queue.filter((it) => it.status === 'duplicate').length;
  const reviewCount = queue.filter((it) => it.status === 'needs_review').length;
  const validCount = queue.filter((it) => it.status === 'valid').length;

  if (loadingClients) {
    return <BrandedLoader size="lg" label="Loading Recruiter Upload Studio..." />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-h1 font-extrabold text-[#081226] tracking-tight">
              Upload Resumes
            </h1>
            <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#FFF7ED] text-[#FF8A00] border border-[#FFEDD5]">
              Recruiter Ingestion Only
            </span>
          </div>
          <p className="text-small text-[#64748B] mt-1">
            Batch PDF ingestion with locked 4-segment entity extraction, client verification, and duplicate check.
          </p>
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={() => navigate('/candidates')}
        >
          Candidate Workspace →
        </Button>
      </div>

      {/* Upload Configuration Form (1. Assigned Client, 2. Resume Date) */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2E8F0] shadow-card space-y-5">
        <h3 className="text-small font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#0D6EFD]" />
          Batch Ingestion Settings
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* 1. Service Client Dropdown (Show ONLY assigned clients!) */}
          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Service Client <span className="text-[#EF4444]">*</span>
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full h-[48px] px-4 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#0D6EFD]"
              required
            >
              <option value="">Select Assigned Service Client...</option>
              {assignedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name} ({c.contact_person || 'Client Account'})
                </option>
              ))}
            </select>
            <p className="text-caption text-[#64748B] mt-1">
              Showing only your assigned Service Clients.
            </p>
          </div>

          {/* 2. Resume Date (Batch date picker, default today, inherited by every resume) */}
          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Resume Date (Batch Inherited) <span className="text-[#EF4444]">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={resumeDate}
                onChange={(e) => setResumeDate(e.target.value)}
                className="w-full h-[48px] px-4 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#0D6EFD]"
              />
            </div>
            <p className="text-caption text-[#64748B] mt-1">
              Quota date credited to candidate submissions.
            </p>
          </div>
        </div>
      </div>

      {/* Drag & Drop Ingestion Zone with Standard Help Text & Live Examples */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-card p-6 sm:p-8 space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files) {
              handleFilesSelected(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group',
            isDragOver
              ? 'border-[#0D6EFD] bg-[#EFF6FF]'
              : 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] hover:border-[#94A3B8]'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            onChange={(e) => {
              if (e.target.files) {
                handleFilesSelected(e.target.files);
              }
            }}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] text-[#0D6EFD] flex items-center justify-center mb-4 border border-[#BFDBFE]">
            <UploadCloud className="w-8 h-8" />
          </div>

          <h4 className="text-h3 font-bold text-[#081226]">
            Drag & drop PDF resumes, or <span className="text-[#0D6EFD] underline underline-offset-4">browse</span>
          </h4>

          <p className="text-small text-[#081226] font-semibold max-w-lg mt-2 mb-2">
            Use the format <code className="font-mono text-caption text-[#0D6EFD] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">ServiceClient_Company_RoleOrRoleID_ResumeIdentifier.pdf</code>
          </p>

          {/* Direct Standard Examples */}
          <div className="w-full max-w-xl bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs text-left my-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-caption font-bold text-[#64748B] uppercase tracking-wider">
              <Info className="w-3.5 h-3.5 text-[#0D6EFD]" />
              <span>Standard Filename Examples</span>
            </div>
            <div className="grid grid-cols-1 gap-1 font-mono text-[11px] text-[#334155]">
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#F8FAFC]">
                <span>ABCStaffing_TCS_JavaDeveloper_RES101.pdf</span>
                <span className="text-[10px] text-[#64748B] font-sans">Client: ABC Staffing | TCS | Java Developer</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#F8FAFC]">
                <span>TalentHub_Amazon_SDEII_RES205.pdf</span>
                <span className="text-[10px] text-[#64748B] font-sans">Client: Talent Hub | Amazon | SDE II</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#F8FAFC]">
                <span>NextHire_Infosys_INF-PY-02_RahulKumar.pdf</span>
                <span className="text-[10px] text-[#64748B] font-sans">Client: NextHire | Infosys | INF-PY-02</span>
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={FileText}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-2"
          >
            Choose PDF Files
          </Button>

          {queue.length > 0 && (
            <p className="text-caption font-bold text-[#0D6EFD] mt-4">
              {queue.length} files currently in staging queue
            </p>
          )}
        </div>
      </div>

      {/* Pre-Commit Batch Summary Table & Inline Review */}
      {queue.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-[#E2E8F0] shadow-card overflow-hidden space-y-0"
        >
          {/* Header & Status Badges */}
          <div className="p-6 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-h3 font-bold text-[#081226]">
                  Pre-Commit Batch Summary ({queue.length} Files)
                </h3>
                {isCheckingDuplicates && (
                  <span className="text-[11px] text-[#FF8A00] font-semibold flex items-center gap-1 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Checking duplicates...
                  </span>
                )}
              </div>
              <p className="text-caption text-[#64748B] mt-0.5">
                Verify parsed entities before saving to database. You can edit any field directly inline.
              </p>
            </div>

            {/* Status Breakdown Pills */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-lg text-caption font-bold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                ✅ {validCount} Valid
              </span>
              {duplicateCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg text-caption font-bold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                  ⚠️ {duplicateCount} Duplicates
                </span>
              )}
              {reviewCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg text-caption font-bold bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA]">
                  ❌ {reviewCount} Need Review
                </span>
              )}
            </div>
          </div>

          {/* Review Table with 4-Segment Columns & Inline Inputs */}
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-small border-collapse">
              <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] text-caption font-bold text-[#64748B] uppercase select-none">
                <tr>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Service Client</th>
                  <th className="px-4 py-3">Target Company</th>
                  <th className="px-4 py-3">Role / Role ID</th>
                  <th className="px-4 py-3">Resume Identifier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {queue.slice(0, visibleCount).map((row) => (
                  <UploadQueueRow
                    key={row.id}
                    row={row}
                    onUpdateRow={handleUpdateRow}
                    onRemoveRow={handleRemoveRow}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Upload Progress Bar (When uploading) */}
          {isUploading && (
            <div className="p-6 bg-[#081226] text-white space-y-3">
              <div className="flex items-center justify-between text-small font-semibold">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#0D6EFD] animate-spin" />
                  Uploading batch to Google Drive & database repository...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#101F3D] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0D6EFD] to-[#16A34A] rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-caption text-[#94A3B8] text-right">
                Uploaded {uploadProgressCount.current} of {uploadProgressCount.total} files
              </p>
            </div>
          )}

          {/* Action Bar */}
          <div className="p-6 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => setQueue([])}
                disabled={isUploading}
              >
                Clear Batch
              </Button>

              {duplicateCount > 0 && (
                <Button
                  variant="outline"
                  size="md"
                  icon={SkipForward}
                  onClick={handleSkipDuplicates}
                  disabled={isUploading}
                  className="text-[#D97706] border-[#FDE68A] hover:bg-[#FFFBEB]"
                >
                  Skip {duplicateCount} Duplicate(s)
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={UploadCloud}
                isLoading={isUploading}
                onClick={() => handleCommitUpload(duplicateCount > 0 ? 'skip_duplicates' : 'all_valid')}
                disabled={validCount === 0 || reviewCount > 0}
              >
                Commit & Upload {validCount} Valid Resumes →
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Ingestion Completion Dialog / Summary Card */}
      {uploadSuccessSummary && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#F0FDF4] border border-[#BBF7D0] p-6 rounded-3xl shadow-card space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#16A34A] text-white flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-h3 font-bold text-[#166534]">
                Batch Ingestion Successful!
              </h3>
              <p className="text-small text-[#15803D]">
                Candidate resumes are now saved, linked to client pipeline, and updated across your daily quota metrics.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="bg-white p-4 rounded-2xl border border-[#BBF7D0] text-center">
              <p className="text-[11px] font-bold uppercase text-[#64748B]">Successfully Saved</p>
              <p className="text-h2 font-black text-[#16A34A] mt-1">{uploadSuccessSummary.uploaded}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-[#BBF7D0] text-center">
              <p className="text-[11px] font-bold uppercase text-[#64748B]">Duplicates Skipped</p>
              <p className="text-h2 font-black text-[#D97706] mt-1">{uploadSuccessSummary.duplicates}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-[#BBF7D0] text-center">
              <p className="text-[11px] font-bold uppercase text-[#64748B]">Needs Review</p>
              <p className="text-h2 font-black text-[#64748B] mt-1">{uploadSuccessSummary.reviewed}</p>
            </div>
          </div>

          {/* List of uploaded items with Drive Preview & Download */}
          {(uploadSuccessSummary.items || []).length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">
                Ingested Candidates Ready on Google Drive:
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {uploadSuccessSummary.items.map((upItem, idx) => (
                  <div
                    key={upItem.id || idx}
                    className="p-3 rounded-xl bg-white border border-[#BBF7D0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#16A34A] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-caption font-bold text-[#081226] truncate">
                          {upItem.candidate_name || upItem.file_name || 'Candidate Resume'}
                        </p>
                        <p className="text-[11px] text-[#64748B] truncate">
                          {upItem.role || 'Role'} • {upItem.company || 'Company'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => openResumePreview(upItem)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] text-caption font-bold border border-[#BFDBFE] transition-colors cursor-pointer"
                        title="Preview on Google Drive"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openResumeDownload(upItem)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#081226] text-caption font-bold border border-[#CBD5E1] transition-colors cursor-pointer"
                        title="Direct Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => copyResumeShareLink(upItem, success)}
                        className="p-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#081226] border border-[#CBD5E1] transition-colors cursor-pointer"
                        title="Copy Share Link"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setUploadSuccessSummary(null)}
            >
              Upload Another Batch
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={ArrowRight}
              onClick={() => navigate('/candidates')}
            >
              View Candidates Workspace
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default UploadPage;
