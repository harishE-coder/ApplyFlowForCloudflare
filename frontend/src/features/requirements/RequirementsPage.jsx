import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  Building2,
  Plus,
  Search,
  CheckCircle2,
  ExternalLink,
  Filter,
  MoreVertical,
  Edit2,
  Archive,
  Trash2,
  RotateCcw,
  Sparkles,
  Link as LinkIcon,
  Check,
  Clock,
  AlertCircle,
  TrendingUp,
  FileText,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { cn, formatDate } from '@/utils/cn';

export function RequirementsPage() {
  const { user, isAdmin, isSubAdmin, isClient } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'done' | 'archived'
  const [requirements, setRequirements] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignedEmployee, setAssignedEmployee] = useState('ALL');
  const [editAssignedEmployee, setEditAssignedEmployee] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('all');

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [notes, setNotes] = useState('');
  const [clientId, setClientId] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editReq, setEditReq] = useState(null);
  const [editCompany, setEditCompany] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editJobUrl, setEditJobUrl] = useState('');
  const [editPriority, setEditPriority] = useState('Medium');
  const [editNotes, setEditNotes] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [updating, setUpdating] = useState(false);

  // Mark Done confirmation modal state
  const [doneConfirmReq, setDoneConfirmReq] = useState(null);
  const [completing, setCompleting] = useState(false);

  // Safe Delete modal state
  const [deleteConfirmReq, setDeleteConfirmReq] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRequirements = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (selectedClient) params.client_id = selectedClient;
      if (selectedPriority && selectedPriority !== 'all') params.priority = selectedPriority;
      params.status = activeTab;

      const res = await api.get('/requirements', { params });
      setRequirements(res.data || []);
    } catch (err) {
      toastError('Error', 'Failed to load job openings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data || [])).catch(() => {});
    api.get('/users?role=employee').then((res) => setEmployees(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchRequirements();
  }, [activeTab, search, selectedClient, selectedPriority]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setCompany('');
    setJobTitle('');
    setJobUrl('');
    setPriority('Medium');
    setNotes('');
    setAssignedEmployee('ALL');
    setClientId(isClient ? user?.client_id || '' : '');
    if (!clients || clients.length === 0) {
      api.get('/clients').then((res) => setClients(res.data || [])).catch(() => {});
    }
    setIsCreateOpen(true);
  };

  // Submit Create Job
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!company.trim() || !jobTitle.trim()) {
      toastError('Validation Error', 'Hiring Company and Job Title are required.');
      return;
    }

    const targetClientId = isClient ? user?.client_id : clientId;
    if (!targetClientId) {
      toastError('Validation Error', 'Please select a Service Client.');
      return;
    }

    setCreating(true);
    try {
      await api.post('/requirements', {
        company: company.trim(),
        job_title: jobTitle.trim(),
        job_url: jobUrl.trim() || null,
        priority,
        notes: notes.trim() || null,
        client_id: targetClientId,
        assigned_employee: assignedEmployee,
      });

      success('Job Opening Created', `${company} – ${jobTitle} added to task board.`);
      setIsCreateOpen(false);
      fetchRequirements();
    } catch (err) {
      toastError('Creation Failed', err.response?.data?.detail || 'Failed to create job opening');
    } finally {
      setCreating(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (req) => {
    setEditReq(req);
    setEditCompany(req.company);
    setEditJobTitle(req.job_title || req.role);
    setEditJobUrl(req.job_url || '');
    setEditPriority(req.priority || 'Medium');
    setEditNotes(req.notes || '');
    setEditClientId(req.client_id);
    setEditAssignedEmployee(req.assigned_employee_id || 'ALL');
    setIsEditOpen(true);
  };

  // Submit Edit Job
  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editReq) return;

    setUpdating(true);
    try {
      await api.put(`/requirements/${editReq.id}`, {
        company: editCompany.trim(),
        job_title: editJobTitle.trim(),
        job_url: editJobUrl.trim() || null,
        priority: editPriority,
        notes: editNotes.trim() || null,
        assigned_employee: editAssignedEmployee,
      });

      success('Job Opening Updated', `${editCompany} – ${editJobTitle} updated successfully.`);
      setIsEditOpen(false);
      fetchRequirements();
    } catch (err) {
      toastError('Update Failed', err.response?.data?.detail || 'Failed to update job opening');
    } finally {
      setUpdating(false);
    }
  };

  // Mark Job as Completed (Done)
  const handleConfirmDone = async () => {
    if (!doneConfirmReq) return;
    setCompleting(true);
    try {
      await api.post(`/requirements/${doneConfirmReq.id}/done`);
      success(
        'Job Completed!',
        `${doneConfirmReq.company} – ${doneConfirmReq.job_title || doneConfirmReq.role} moved to Completed History.`
      );
      setDoneConfirmReq(null);
      fetchRequirements();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to mark job as done');
    } finally {
      setCompleting(false);
    }
  };

  // Reopen Job Opening
  const handleReopen = async (req) => {
    try {
      await api.post(`/requirements/${req.id}/reopen`);
      success('Job Reopened', `${req.company} – ${req.job_title || req.role} returned to Active Jobs.`);
      fetchRequirements();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to reopen job');
    }
  };

  // Archive Job Opening
  const handleArchive = async (req) => {
    try {
      await api.post(`/requirements/${req.id}/archive`);
      success('Job Archived', `${req.company} – ${req.job_title || req.role} moved to Archive.`);
      fetchRequirements();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to archive job');
    }
  };

  // Safe Delete Job Opening
  const handleConfirmDelete = async () => {
    if (!deleteConfirmReq) return;
    setDeleting(true);
    try {
      await api.delete(`/requirements/${deleteConfirmReq.id}`);
      success('Job Deleted', `${deleteConfirmReq.company} – ${deleteConfirmReq.job_title || deleteConfirmReq.role} permanently deleted.`);
      setDeleteConfirmReq(null);
      fetchRequirements();
    } catch (err) {
      toastError('Cannot Delete', err.response?.data?.detail || 'This job opening has linked candidate records. Archive instead.');
    } finally {
      setDeleting(false);
    }
  };

  const getPriorityBadge = (p) => {
    const norm = (p || 'Medium').toLowerCase();
    if (norm === 'high') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          High Priority
        </span>
      );
    }
    if (norm === 'low') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Low Priority
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Medium Priority
      </span>
    );
  };

  const isEmployee = !isAdmin && !isSubAdmin && !isClient;
  const canCreate = isAdmin || isSubAdmin || isClient;
  const canEdit = isAdmin || isSubAdmin || isClient;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-[#0D6EFD] border border-blue-200 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Recruitment Task Board
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-[#081226] tracking-tight">
            Job Openings
          </h1>
          <p className="text-small text-[#64748B] mt-1">
            Task board for client recruitment requirements. Review job links, apply candidates, and mark completed.
          </p>
        </div>

        {canCreate && (
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenCreate}
            className="flex items-center gap-2 shadow-md shadow-blue-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>Create Job Opening</span>
          </Button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={cn(
            'px-5 py-2.5 rounded-xl font-bold text-small transition-all flex items-center gap-2 cursor-pointer',
            activeTab === 'active'
              ? 'bg-[#081226] text-white shadow-md'
              : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9]'
          )}
        >
          <Briefcase className="w-4 h-4" />
          <span>Active Jobs</span>
          {activeTab === 'active' && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-[#2563EB] text-white">
              {requirements.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('done')}
          className={cn(
            'px-5 py-2.5 rounded-xl font-bold text-small transition-all flex items-center gap-2 cursor-pointer',
            activeTab === 'done'
              ? 'bg-[#081226] text-white shadow-md'
              : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9]'
          )}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Completed History</span>
          {activeTab === 'done' && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-600 text-white">
              {requirements.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          className={cn(
            'px-5 py-2.5 rounded-xl font-bold text-small transition-all flex items-center gap-2 cursor-pointer',
            activeTab === 'archived'
              ? 'bg-[#081226] text-white shadow-md'
              : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9]'
          )}
        >
          <Archive className="w-4 h-4" />
          <span>Archived Jobs</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, role, or title..."
              className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] placeholder-[#94A3B8] focus:outline-none focus:border-[#0D6EFD] focus:bg-white"
            />
          </div>

          {!isClient && clients.length > 0 && (
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] focus:outline-none focus:border-[#0D6EFD]"
            >
              <option value="">All Service Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] focus:outline-none focus:border-[#0D6EFD]"
          >
            <option value="all">All Priorities</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="Low">Low Priority</option>
          </select>
        </div>

        <div className="text-caption font-semibold text-[#64748B]">
          Showing <span className="text-[#081226] font-bold">{requirements.length}</span> {activeTab} job(s)
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#64748B]">
            <div className="w-8 h-8 border-3 border-[#0D6EFD] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-small font-semibold">Loading job openings...</p>
          </div>
        ) : requirements.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0D6EFD] flex items-center justify-center mx-auto">
              <Briefcase className="w-7 h-7" />
            </div>
            <h3 className="text-h4 font-bold text-[#081226]">
              {activeTab === 'active'
                ? 'No Active Job Openings'
                : activeTab === 'done'
                ? 'No Completed Jobs'
                : 'No Archived Jobs'}
            </h3>
            <p className="text-small text-[#64748B] max-w-md mx-auto">
              {activeTab === 'active'
                ? canCreate
                  ? 'Create your first Job Opening to assign recruitment tasks to team members.'
                  : 'All assigned recruitment tasks are currently completed.'
                : 'Jobs marked as Done will appear in this history list.'}
            </p>
            {activeTab === 'active' && canCreate && (
              <Button variant="primary" size="md" onClick={handleOpenCreate} className="mt-2">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Job Opening
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-caption font-bold uppercase tracking-wider text-[#64748B]">
                  <th className="py-4 px-5">Hiring Company</th>
                  <th className="py-4 px-5">Job Title</th>
                  <th className="py-4 px-5">Job Link</th>
                  <th className="py-4 px-5">Service Client</th>
                  <th className="py-4 px-5">Priority</th>
                  {activeTab === 'done' ? (
                    <th className="py-4 px-5">Completed By</th>
                  ) : (
                    <th className="py-4 px-5">Status</th>
                  )}
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-small text-[#081226]">
                {requirements.map((req) => {
                  const menuItems = [];

                  if (canEdit) {
                    menuItems.push({
                      icon: Edit2,
                      label: 'Edit Opening',
                      onClick: () => handleOpenEdit(req),
                    });
                  }

                  if (activeTab === 'active') {
                    if (isAdmin || isSubAdmin) {
                      menuItems.push({
                        icon: Archive,
                        label: 'Archive Opening',
                        onClick: () => handleArchive(req),
                      });
                    }
                  } else if (activeTab === 'done' || activeTab === 'archived') {
                    menuItems.push({
                      icon: RotateCcw,
                      label: 'Reopen Job',
                      onClick: () => handleReopen(req),
                    });
                  }

                  if (isAdmin) {
                    menuItems.push({ divider: true });
                    menuItems.push({
                      icon: Trash2,
                      label: 'Delete Opening',
                      danger: true,
                      onClick: () => setDeleteConfirmReq(req),
                    });
                  }

                  return (
                    <tr key={req.id} className="hover:bg-[#F8FAFC]/80 transition-colors">
                      {/* 1. Hiring Company */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-[#081226]">
                            {req.company.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-[#081226] block">{req.company}</span>
                            {req.notes && (
                              <span className="text-caption text-[#64748B] block truncate max-w-xs" title={req.notes}>
                                📝 {req.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Job Title */}
                      <td className="py-4 px-5">
                        <span className="font-semibold text-[#081226] block">
                          {req.job_title || req.role}
                        </span>
                        <span className="text-[11px] font-medium text-[#64748B] flex items-center gap-1 mt-0.5">
                          {req.assignment_type === 'all' || !req.assigned_employee_name ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#0D6EFD] font-bold">
                              🌐 All Employees
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">
                              👤 {req.assigned_employee_name}
                            </span>
                          )}
                        </span>
                      </td>

                      {/* 3. Job Link */}
                      <td className="py-4 px-5">
                        {req.job_url ? (
                          <a
                            href={req.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-[#0D6EFD] hover:bg-blue-100 font-semibold text-caption transition-colors group"
                          >
                            <span>Open Job</span>
                            <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </a>
                        ) : (
                          <span className="text-caption font-medium text-[#94A3B8]">No Job Link</span>
                        )}
                      </td>

                      {/* 4. Service Client */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5 text-small font-medium text-[#334155]">
                          <Building2 className="w-3.5 h-3.5 text-[#64748B]" />
                          <span>{req.client_name || 'Client'}</span>
                        </div>
                      </td>

                      {/* 5. Priority */}
                      <td className="py-4 px-5">{getPriorityBadge(req.priority)}</td>

                      {/* 6. Status / Completed By */}
                      {activeTab === 'done' ? (
                        <td className="py-4 px-5">
                          <div>
                            <span className="font-semibold text-emerald-700 block text-caption">
                              ✓ {req.completer_name || 'Completed'}
                            </span>
                            <span className="text-caption text-[#64748B] block">
                              {req.completed_at ? formatDate(req.completed_at) : 'Completed'}
                            </span>
                          </div>
                        </td>
                      ) : (
                        <td className="py-4 px-5">
                          <StatusBadge status={req.status === 'archived' ? 'archived' : 'active'} />
                        </td>
                      )}

                      {/* 7. Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {activeTab === 'active' && isEmployee && (
                            <button
                              type="button"
                              onClick={() => setDoneConfirmReq(req)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-caption shadow-sm flex items-center gap-1.5 transition-all transform active:scale-95 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Mark Done</span>
                            </button>
                          )}

                          {menuItems.length > 0 && (
                            <Dropdown
                              trigger={
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#081226] hover:bg-[#E2E8F0]/50 transition-colors cursor-pointer"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              }
                              items={menuItems}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. CREATE JOB OPENING MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Job Opening"
        subtitle="Add a recruitment task for recruiters to submit candidates."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {!isClient && (
            <div>
              <label className="text-small font-semibold text-[#081226] block mb-1.5">
                Service Client <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] focus:outline-none focus:border-[#0D6EFD] focus:bg-white cursor-pointer"
              >
                <option value="">Select Service Client...</option>
                {clients
                  .slice()
                  .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <Input
            label="Hiring Company"
            required
            placeholder="e.g. TCS, Infosys, Amazon, Google"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />

          <Input
            label="Job Title"
            required
            placeholder="e.g. Java Developer, Frontend Engineer, DevOps Lead"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />

          <Input
            label="Job URL (Optional)"
            placeholder="https://careers.company.com/job/12345"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] focus:outline-none focus:border-[#0D6EFD] focus:bg-white"
            >
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Recruiter Guidance Notes (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Apply with 3+ years experience in React and Node.js..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] placeholder-[#94A3B8] focus:outline-none focus:border-[#0D6EFD] focus:bg-white resize-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={creating}>
              Create Job Opening
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. EDIT JOB OPENING MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Job Opening"
        subtitle="Update company, role title, job URL, or guidance notes."
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <Input
            label="Hiring Company"
            required
            value={editCompany}
            onChange={(e) => setEditCompany(e.target.value)}
          />

          <Input
            label="Job Title"
            required
            value={editJobTitle}
            onChange={(e) => setEditJobTitle(e.target.value)}
          />

          <Input
            label="Job URL (Optional)"
            placeholder="https://careers.company.com/job/12345"
            value={editJobUrl}
            onChange={(e) => setEditJobUrl(e.target.value)}
          />

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Priority
            </label>
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] focus:outline-none focus:border-[#0D6EFD] focus:bg-white"
            >
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Recruiter Guidance Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-small text-[#081226] placeholder-[#94A3B8] focus:outline-none focus:border-[#0D6EFD] focus:bg-white resize-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={updating}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. MARK DONE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!doneConfirmReq}
        onClose={() => setDoneConfirmReq(null)}
        title="Mark Job Opening as Completed"
        subtitle="Move this recruitment task to Completed History."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-small text-emerald-900 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Mark {doneConfirmReq?.company} – {doneConfirmReq?.job_title || doneConfirmReq?.role} as completed?
              </p>
              <p className="text-caption text-emerald-700 mt-1 leading-relaxed">
                This job will automatically leave the Active task board and move to Completed History. Admins and Client contacts will receive instant completion notifications.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setDoneConfirmReq(null)}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleConfirmDone}
              disabled={completing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-small shadow-md flex items-center gap-2 cursor-pointer transition-all transform active:scale-95"
            >
              {completing ? (
                <span>Completing...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Mark Done</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* 4. SAFE DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deleteConfirmReq}
        onClose={() => setDeleteConfirmReq(null)}
        title="Delete Job Opening"
        subtitle="Safe delete validation for this job opening."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-small text-rose-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Delete {deleteConfirmReq?.company} – {deleteConfirmReq?.job_title || deleteConfirmReq?.role}?
              </p>
              <p className="text-caption text-rose-700 mt-1 leading-relaxed">
                Safe delete will only succeed if no candidate resumes or application records are tied to this opening. If records exist, please archive instead.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setDeleteConfirmReq(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={deleting}
              onClick={handleConfirmDelete}
              className="!bg-rose-600 hover:!bg-rose-700 text-white font-bold"
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
