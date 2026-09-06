import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Plus,
  Edit2,
  TrendingUp,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  Calendar,
  History,
  Sparkles,
  RefreshCw,
  Search,
  Check,
  Filter,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  StopCircle,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dropdown } from '@/components/ui/Dropdown';
import { Table } from '@/components/ui/Table';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { formatDate, cn } from '@/utils/cn';

export function TargetsPage() {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const { success, error: toastError } = useToast();

  const [targets, setTargets] = useState([]);
  const [employees, setAllEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Target Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formDailyTarget, setFormDailyTarget] = useState(25);
  const [saving, setSaving] = useState(false);

  // Target History Modal State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);

  const fetchMetadata = async () => {
    try {
      const results = await Promise.allSettled([
        api.get('/employees'),
        api.get('/clients'),
      ]);
      if (results[0].status === 'fulfilled') setAllEmployees(results[0].value.data || []);
      if (results[1].status === 'fulfilled') setClients(results[1].value.data || []);
    } catch (err) {
      console.error('Failed to load employees/clients:', err);
    }
  };

  const fetchTargets = async () => {
    setLoading(true);
    try {
      const res = await api.get('/targets');
      setTargets(res.data || []);
    } catch (err) {
      toastError('Error', 'Failed to load targets list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
    fetchTargets();
  }, []);

  const handleOpenCreate = () => {
    setEditingTarget(null);
    const firstEmpId = employees[0]?.id || employees[0]?.employee_id || '';
    setFormEmployeeId(firstEmpId);
    setFormClientId(clients[0]?.id || '');
    setFormDailyTarget(25);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTarget(t);
    setFormEmployeeId(t.employee_id || t.id);
    setFormClientId(t.client_id);
    setFormDailyTarget(t.daily_target);
    setIsModalOpen(true);
  };

  const handleOpenHistory = (t) => {
    setHistoryTarget(t);
    setIsHistoryOpen(true);
  };

  const handleSaveTarget = async (e) => {
    e.preventDefault();
    if (!formEmployeeId || !formClientId) return;
    setSaving(true);
    try {
      await api.post('/targets', {
        employee_id: formEmployeeId,
        client_id: formClientId,
        daily_target: Number(formDailyTarget),
      });

      success(
        editingTarget ? 'Target Updated' : 'Target Created',
        `Daily application target of ${formDailyTarget} configured with effective date preserved.`
      );
      setIsModalOpen(false);
      fetchTargets();
    } catch (err) {
      toastError('Save Failed', err.response?.data?.detail || 'Failed to save target allocation');
    } finally {
      setSaving(false);
    }
  };

  const handlePauseTarget = async (target) => {
    try {
      await api.post(`/targets/${target.id}/pause`);
      success('Target Paused', `Target for ${target.employee_name} paused.`);
      fetchTargets();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to pause target');
    }
  };

  const handleResumeTarget = async (target) => {
    try {
      await api.post(`/targets/${target.id}/resume`);
      success('Target Resumed', `Target for ${target.employee_name} resumed.`);
      fetchTargets();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to resume target');
    }
  };

  const handleEndTarget = async (target) => {
    try {
      await api.post(`/targets/${target.id}/end`);
      success('Target Ended', `Target for ${target.employee_name} marked as completed/ended.`);
      fetchTargets();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to end target');
    }
  };

  const handleDeleteTarget = async (target) => {
    try {
      await api.delete(`/targets/${target.id}`);
      success('Target Deleted', 'Target removed successfully.');
      fetchTargets();
    } catch (err) {
      toastError('Cannot Delete', err.response?.data?.detail || 'Failed to delete target');
    }
  };

  const getTargetActions = (t) => {
    const items = [];

    items.push({
      icon: Edit2,
      label: 'Edit Target',
      onClick: () => handleOpenEdit(t),
    });

    if (t.status === 'active') {
      items.push({
        icon: PauseCircle,
        label: 'Pause Target',
        onClick: () => handlePauseTarget(t),
      });
    } else if (t.status === 'paused') {
      items.push({
        icon: PlayCircle,
        label: 'Resume Target',
        onClick: () => handleResumeTarget(t),
      });
    }

    if (t.status !== 'ended') {
      items.push({
        icon: StopCircle,
        label: 'End Target',
        onClick: () => handleEndTarget(t),
      });
    }

    items.push({
      icon: History,
      label: 'Target History',
      onClick: () => handleOpenHistory(t),
    });

    if (isAdmin) {
      items.push({ divider: true });
      items.push({
        icon: Trash2,
        label: 'Delete Target',
        danger: true,
        onClick: () => handleDeleteTarget(t),
      });
    }

    return items;
  };

  // Filtered target records
  const filteredTargets = targets.filter((t) => {
    const term = (search || '').toLowerCase();
    const matchesSearch =
      (t?.employee_name || '').toLowerCase().includes(term) ||
      (t?.client_name || '').toLowerCase().includes(term);
    const matchesClient = !selectedClientFilter || t.client_id === selectedClientFilter;
    const matchesStatus = statusFilter === 'all' || (t.status || 'active') === statusFilter;
    return matchesSearch && matchesClient && matchesStatus;
  });

  const columns = [
    {
      title: 'Employee / Recruiter',
      key: 'employee_name',
      render: (val) => (
        <div className="flex items-center gap-3">
          <Avatar name={val} size="sm" variant="blue" />
          <div>
            <p className="font-bold text-[#081226] text-small">{val}</p>
            <span className="text-[11px] text-[#64748B]">Dedicated Recruiter</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Service Client',
      key: 'client_name',
      render: (val) => (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#0D6EFD]" />
          <span className="font-bold text-[#081226] text-small">{val}</span>
        </div>
      ),
    },
    {
      title: 'Daily Application Target',
      key: 'daily_target',
      render: (val) => (
        <div className="flex items-center gap-2">
          <span className="text-h3 font-extrabold text-[#FF8A00]">{val}</span>
          <span className="text-caption text-[#64748B]">apps / day</span>
        </div>
      ),
    },
    {
      title: 'Effective Date',
      key: 'effective_date',
      render: (val) => (
        <span className="font-mono text-caption text-[#475569]">
          {formatDate(val)}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (val) => {
        const st = val || 'active';
        return (
          <StatusBadge
            status={st === 'paused' ? 'warning' : st === 'ended' ? 'inactive' : 'active'}
          />
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, row) => {
        const menuItems = getTargetActions(row);
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Edit2}
              onClick={() => handleOpenEdit(row)}
              className="h-[34px]"
            >
              Edit
            </Button>

            <Dropdown
              trigger={
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9] transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              }
              items={menuItems}
            />
          </div>
        );
      },
    },
  ];

  if (loading && targets.length === 0) {
    return <BrandedLoader size="lg" label="Loading Target & Goal Management..." />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-h1 font-extrabold text-[#081226] tracking-tight">
              Recruiter Target Management
            </h1>
            <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#FFF7ED] text-[#FF8A00] border border-[#FFEDD5]">
              {targets.length} Active Targets
            </span>
          </div>
          <p className="text-small text-[#64748B] mt-1">
            Configure, adjust, pause, and track daily submitted application targets for recruiters across service clients.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchTargets}
            isLoading={loading}
            className="h-[44px]"
          />

          {(isAdmin || isSubAdmin) && (
            <Button
              variant="orange"
              size="md"
              icon={Plus}
              onClick={handleOpenCreate}
              className="h-[44px]"
            >
              Assign New Target
            </Button>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-4 flex items-start gap-3.5">
        <div className="w-8 h-8 rounded-xl bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB] shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="text-small text-[#1E40AF]">
          <strong className="font-bold">Lifecycle & Historical Accuracy:</strong>
          <p className="text-caption mt-0.5">
            Targets are strictly based on <strong className="font-bold">Applications Submitted</strong> (e.g. Harish → ABC Staffing → 25 apps/day + Talent Hub → 15 apps/day = 40 total daily goal). Historical performance queries automatically respect the target that was in effect on that date.
          </p>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or client target..."
            className="w-full h-[40px] px-3.5 rounded-xl text-small bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            className="w-full sm:w-56 h-[40px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          >
            <option value="">All Service Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40 h-[40px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
        </div>
      </div>

      {/* Targets Table */}
      <Table columns={columns} data={filteredTargets} isLoading={loading} />

      {/* Add / Edit Target Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTarget ? 'Edit Target Quota' : 'Assign Employee Client Target'}
        subtitle="Set the required daily submitted applications quota for an employee under a specific client."
      >
        <form onSubmit={handleSaveTarget} className="space-y-4">
          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Select Recruiter (Employee) <span className="text-[#EF4444]">*</span>
            </label>
            <select
              value={formEmployeeId}
              onChange={(e) => setFormEmployeeId(e.target.value)}
              disabled={Boolean(editingTarget)}
              className="w-full h-[48px] px-4 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs focus:border-[#0D6EFD] focus:outline-none disabled:opacity-60"
              required
            >
              {employees.map((emp) => (
                <option key={emp.id || emp.employee_id} value={emp.id || emp.employee_id}>
                  {emp.name} ({emp.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Service Client <span className="text-[#EF4444]">*</span>
            </label>
            <select
              value={formClientId}
              onChange={(e) => setFormClientId(e.target.value)}
              disabled={Boolean(editingTarget)}
              className="w-full h-[48px] px-4 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs focus:border-[#0D6EFD] focus:outline-none disabled:opacity-60"
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Daily Application Target (Applications / Day)"
            type="number"
            min="1"
            max="300"
            required
            value={formDailyTarget}
            onChange={(e) => setFormDailyTarget(e.target.value)}
            helperText="Number of candidate applications required to be submitted to this client each day."
          />

          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-caption text-[#64748B]">
            <span>Effective Date:</span>{' '}
            <strong className="text-[#081226]">{formatDate(new Date())} (Today)</strong>.
            Future calculations will use this new quota while previous days retain their historical targets.
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="orange" size="md" isLoading={saving}>
              {editingTarget ? 'Save Target Changes' : 'Confirm Assignment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Target History Modal */}
      <Modal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title={`Target History: ${historyTarget?.employee_name} (${historyTarget?.client_name})`}
        subtitle="Audit timeline of daily application targets and effective dates."
      >
        {historyTarget && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <p className="text-small font-bold text-[#081226]">
                    Current Target: {historyTarget.daily_target} applications/day
                  </p>
                  <p className="text-caption text-[#64748B]">
                    Effective since {formatDate(historyTarget.effective_date)}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                  Active Policy
                </span>
              </div>

              <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] opacity-75 flex items-center justify-between">
                <div>
                  <p className="text-small font-bold text-[#475569]">
                    Initial Baseline Target: 20 applications/day
                  </p>
                  <p className="text-caption text-[#94A3B8]">
                    Effective: 01 Aug 2026 – {formatDate(historyTarget.effective_date)}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F1F5F9] text-[#64748B]">
                  Archived
                </span>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button variant="outline" size="md" onClick={() => setIsHistoryOpen(false)}>
                Close History
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default TargetsPage;
