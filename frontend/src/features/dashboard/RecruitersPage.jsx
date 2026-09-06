import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Building2,
  Target,
  Clock,
  TrendingUp,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  KeyRound,
  Mail,
  Shield,
  Sparkles,
  ChevronRight,
  Filter,
  MoreVertical,
  Power,
  Archive,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Dropdown } from '@/components/ui/Dropdown';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { formatDate, cn } from '@/utils/cn';

export function RecruitersPage() {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const { success, error: toastError, warning } = useToast();

  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  // 1. ADD RECRUITER MODAL STATE
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPassword, setAddPassword] = useState('Password@123');
  const [addAssignedClientIds, setAddAssignedClientIds] = useState([]);
  const [addDailyTarget, setAddDailyTarget] = useState(25);
  const [creatingRecruiter, setCreatingRecruiter] = useState(false);

  // 2. EDIT RECRUITER MODAL STATE
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editAssignedClientIds, setEditAssignedClientIds] = useState([]);
  const [updatingRecruiter, setUpdatingRecruiter] = useState(false);

  // 3. RESET PASSWORD MODAL STATE
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmployee, setResetEmployee] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // 4. TARGET ASSIGNMENT MODAL STATE
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [selectedRecruiterForTarget, setSelectedRecruiterForTarget] = useState(null);
  const [targetClientId, setTargetClientId] = useState('');
  const [targetValue, setTargetValue] = useState(25);
  const [savingTarget, setSavingTarget] = useState(false);

  // 5. SAFE DELETE DEACTIVATE MODAL STATE
  const [safeDeleteModalEmp, setSafeDeleteModalEmp] = useState(null);

  // Fetch recruiters and clients
  const fetchData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.get(`/employees?status=${statusFilter}`),
        api.get('/clients'),
      ]);
      if (results[0].status === 'fulfilled') setEmployees(results[0].value.data || []);
      if (results[1].status === 'fulfilled') setClients(results[1].value.data || []);
    } catch (err) {
      toastError('Error', 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  // Open Add Recruiter Modal
  const handleOpenAddModal = () => {
    setAddName('');
    setAddEmail('');
    setAddPhone('');
    setAddPassword('Password@123');
    setAddAssignedClientIds(clients.length > 0 ? [clients[0].id] : []);
    setAddDailyTarget(25);
    setIsAddModalOpen(true);
  };

  // Submit Add Recruiter
  const handleCreateRecruiter = async (e) => {
    e.preventDefault();
    if (!addName || !addEmail || !addPassword) return;

    setCreatingRecruiter(true);
    try {
      await api.post('/employees', {
        name: addName.trim(),
        email: addEmail.trim().toLowerCase(),
        phone: addPhone.trim() || null,
        password: addPassword,
        assigned_client_ids: addAssignedClientIds,
        daily_target: Number(addDailyTarget) || 25,
      });

      success(
        'Recruiter Created',
        `${addName} added to the team and assigned to ${addAssignedClientIds.length} client(s).`
      );
      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      toastError('Creation Failed', err.response?.data?.detail || 'Failed to create recruiter');
    } finally {
      setCreatingRecruiter(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (emp) => {
    setEditingEmployee(emp);
    setEditName(emp.name);
    setEditEmail(emp.email);
    setEditPhone(emp.phone || '');
    setEditPassword('');
    const assignedIds = emp.assigned_clients ? emp.assigned_clients.map((c) => c.client_id || c.id) : [];
    setEditAssignedClientIds(assignedIds);
    setIsEditModalOpen(true);
  };

  // Submit Edit Recruiter
  const handleUpdateRecruiter = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setUpdatingRecruiter(true);
    try {
      const payload = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim() || null,
        assigned_client_ids: editAssignedClientIds,
      };
      if (editPassword) payload.password = editPassword;

      await api.put(`/employees/${editingEmployee.employee_id || editingEmployee.id}`, payload);

      success('Recruiter Updated', `${editName}'s profile and client assignments updated.`);
      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      toastError('Update Failed', err.response?.data?.detail || 'Failed to update recruiter');
    } finally {
      setUpdatingRecruiter(false);
    }
  };

  // Open Reset Password Modal
  const handleOpenResetModal = (emp) => {
    setResetEmployee(emp);
    setNewPassword('Password@123');
    setIsResetOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetEmployee || !newPassword) return;
    setResetting(true);
    try {
      await api.post(`/users/${resetEmployee.employee_id || resetEmployee.id}/reset-password`, {
        new_password: newPassword,
      });
      success('Password Reset', `Password reset for ${resetEmployee.name}.`);
      setIsResetOpen(false);
    } catch (err) {
      toastError('Reset Failed', err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  // Lifecycle Actions: Deactivate, Activate, Archive, Safe Delete
  const handleDeactivateRecruiter = async (emp) => {
    try {
      await api.post(`/users/${emp.employee_id || emp.id}/deactivate`);
      success('Recruiter Deactivated', `${emp.name} has been deactivated.`);
      fetchData();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to deactivate recruiter');
    }
  };

  const handleActivateRecruiter = async (emp) => {
    try {
      await api.post(`/users/${emp.employee_id || emp.id}/activate`);
      success('Recruiter Activated', `${emp.name} is now active.`);
      fetchData();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to activate recruiter');
    }
  };

  const handleArchiveRecruiter = async (emp) => {
    try {
      await api.post(`/users/${emp.employee_id || emp.id}/archive`);
      success('Recruiter Archived', `${emp.name} moved to archive.`);
      fetchData();
    } catch (err) {
      toastError('Action Failed', err.response?.data?.detail || 'Failed to archive recruiter');
    }
  };

  const handleDeleteRecruiter = async (emp) => {
    try {
      await api.delete(`/users/${emp.employee_id || emp.id}`);
      success('Recruiter Deleted', `${emp.name} deleted successfully.`);
      fetchData();
    } catch (err) {
      const detail =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        '';
      if (err?.response?.status === 400 || (typeof detail === 'string' && detail.includes('historical'))) {
        setSafeDeleteModalEmp(emp);
      } else {
        toastError('Cannot Delete', typeof detail === 'string' && detail ? detail : 'This recruiter has historical records.');
      }
    }
  };

  // Open Target Setting Modal
  const handleOpenTargetModal = (emp) => {
    setSelectedRecruiterForTarget(emp);
    const firstClientId = emp.assigned_clients?.[0]?.client_id || emp.assigned_clients?.[0]?.id || clients[0]?.id || '';
    setTargetClientId(firstClientId);
    setTargetValue(emp.daily_target ?? 0);
    setIsTargetModalOpen(true);
  };

  // Submit Target
  const handleSaveTarget = async (e) => {
    e.preventDefault();
    if (!selectedRecruiterForTarget || !targetClientId) return;

    setSavingTarget(true);
    try {
      await api.post('/targets', {
        employee_id: selectedRecruiterForTarget.employee_id || selectedRecruiterForTarget.id,
        client_id: targetClientId,
        daily_target: Number(targetValue),
      });

      success(
        'Target Configured',
        `Daily application target of ${targetValue} set for ${selectedRecruiterForTarget.name}.`
      );
      setIsTargetModalOpen(false);
      fetchData();
    } catch (err) {
      toastError('Target Error', err.response?.data?.detail || 'Failed to update target quota.');
    } finally {
      setSavingTarget(false);
    }
  };

  const getRecruiterActionMenu = (emp) => {
    const items = [];

    if (isAdmin || isSubAdmin) {
      items.push({
        icon: Edit2,
        label: 'Edit Recruiter',
        onClick: () => handleOpenEditModal(emp),
      });

      items.push({
        icon: Target,
        label: 'Set Target',
        onClick: () => handleOpenTargetModal(emp),
      });

      items.push({
        icon: KeyRound,
        label: 'Reset Password',
        onClick: () => handleOpenResetModal(emp),
      });

      if (emp.status === 'active' || emp.is_active) {
        items.push({
          icon: Power,
          label: 'Deactivate Recruiter',
          onClick: () => handleDeactivateRecruiter(emp),
        });
      } else {
        items.push({
          icon: Power,
          label: 'Activate Recruiter',
          onClick: () => handleActivateRecruiter(emp),
        });
      }

      if (emp.status !== 'archived') {
        items.push({
          icon: Archive,
          label: 'Archive Recruiter',
          onClick: () => handleArchiveRecruiter(emp),
        });
      }

      if (isAdmin) {
        items.push({ divider: true });
        items.push({
          icon: Trash2,
          label: 'Safe Delete',
          danger: true,
          onClick: () => handleDeleteRecruiter(emp),
        });
      }
    }

    return items;
  };

  // Filter recruiters
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.email?.toLowerCase().includes(search.toLowerCase());
      const matchesClient =
        !selectedClientFilter ||
        emp.assigned_clients?.some((c) => (c.client_id || c.id) === selectedClientFilter);
      return matchesSearch && matchesClient;
    });
  }, [employees, search, selectedClientFilter]);

  const columns = [
    {
      title: 'Recruiter',
      key: 'name',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={val} size="md" variant="blue" status={row.is_active ? 'online' : 'offline'} />
          <div>
            <p className="font-bold text-[#081226] text-small">{val}</p>
            <p className="text-caption text-[#64748B]">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      title: 'Assigned Service Clients',
      key: 'assigned_clients',
      render: (val) => (
        <div className="flex flex-wrap gap-1.5 max-w-sm">
          {val && val.length > 0 ? (
            val.map((c, i) => (
              <span
                key={i}
                className={cn(
                  'px-2.5 py-0.5 rounded-md text-[11px] font-bold border',
                  c.is_primary
                    ? 'bg-[#FFF7ED] text-[#FF8A00] border-[#FFEDD5]'
                    : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]'
                )}
              >
                {c.company_name} {c.is_primary && '★'}
              </span>
            ))
          ) : (
            <span className="text-caption text-[#94A3B8] italic">No clients assigned</span>
          )}
        </div>
      ),
    },
    {
      title: 'Daily Target',
      key: 'daily_target',
      render: (val) => (
        <div className="flex items-center gap-2">
          <span className="text-h3 font-extrabold text-[#FF8A00]">{val ?? 0}</span>
          <span className="text-caption text-[#64748B]">apps / day</span>
        </div>
      ),
    },
    {
      title: "Today's Submissions",
      key: 'total_applications',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0D6EFD]">{row.today_applications ?? val ?? 0}</span>
          <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#0D6EFD] border border-[#BFDBFE]">
            {row.completion_percentage || 0}%
          </span>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, row) => (
        <StatusBadge
          status={row.status === 'archived' ? 'archived' : (row.is_active ? 'active' : 'inactive')}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, row) => {
        const menuItems = getRecruiterActionMenu(row);
        return (
          <div className="flex items-center justify-end gap-2">
            {(isAdmin || isSubAdmin) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Edit2}
                  onClick={() => handleOpenEditModal(row)}
                  className="h-[34px]"
                >
                  Edit
                </Button>
                <Button
                  variant="orange"
                  size="sm"
                  icon={Target}
                  onClick={() => handleOpenTargetModal(row)}
                  className="h-[34px]"
                >
                  Target
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
              </>
            )}
          </div>
        );
      },
    },
  ];

  if (loading && employees.length === 0) {
    return <BrandedLoader size="lg" label="Loading Recruitment Team..." />;
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2E8F0] shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-h2 font-extrabold text-[#081226] tracking-tight">
              Recruiters Team Management
            </h1>
            <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#0D6EFD] border border-[#BFDBFE]">
              {employees.length} Recruiters
            </span>
          </div>
          <p className="text-small text-[#64748B] mt-0.5">
            Add team members, assign dedicated Service Clients, reset credentials, and manage lifecycle states.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchData}
            isLoading={loading}
            className="h-[44px]"
          />

          {(isAdmin || isSubAdmin) && (
            <Button
              variant="primary"
              size="md"
              icon={UserPlus}
              onClick={handleOpenAddModal}
              className="h-[44px] px-5"
            >
              Add Recruiter
            </Button>
          )}
        </div>
      </div>

      {/* Lifecycle Status Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
        {[
          { key: 'active', label: 'Active Recruiters' },
          { key: 'inactive', label: 'Inactive' },
          { key: 'archived', label: 'Archived Team' },
          { key: 'all', label: 'All Team Members' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              'px-4 py-2 text-small font-bold rounded-xl transition-all',
              statusFilter === tab.key
                ? 'bg-[#081226] text-white shadow-sm'
                : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recruiter by name or email..."
            className="w-full h-[40px] px-3.5 rounded-xl text-small bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          />
        </div>

        <div className="w-full sm:w-64">
          <select
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            className="w-full h-[40px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:border-[#0D6EFD] focus:outline-none"
          >
            <option value="">All Service Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recruiters Matrix Table */}
      <Table columns={columns} data={filteredEmployees} isLoading={loading} />

      {/* 1. ADD RECRUITER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Recruiter"
        subtitle="Create a new recruiter account and assign dedicated Service Clients."
      >
        <form onSubmit={handleCreateRecruiter} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="e.g. Ravi Kumar"
            required
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. ravi@applyflow.com"
            required
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
          />

          <Input
            label="Phone Number (Optional)"
            type="tel"
            placeholder="e.g. 9876543210"
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
          />

          <Input
            label="Temporary Password"
            type="text"
            required
            value={addPassword}
            onChange={(e) => setAddPassword(e.target.value)}
            helperText="Employee can log in immediately with this credential."
          />

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Assigned Service Clients (Multi-Select)
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
              {clients.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white border border-[#E2E8F0] text-caption cursor-pointer hover:border-[#0D6EFD]"
                >
                  <input
                    type="checkbox"
                    checked={addAssignedClientIds.includes(c.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAddAssignedClientIds((prev) => [...prev, c.id]);
                      } else {
                        setAddAssignedClientIds((prev) => prev.filter((id) => id !== c.id));
                      }
                    }}
                    className="rounded border-gray-300 text-[#0D6EFD]"
                  />
                  <span className="font-semibold text-[#081226] truncate">{c.company_name}</span>
                </label>
              ))}
            </div>
          </div>

          <Input
            label="Initial Daily Target Quota"
            type="number"
            min="1"
            max="200"
            value={addDailyTarget}
            onChange={(e) => setAddDailyTarget(e.target.value)}
            helperText="Target applications required per workday."
          />

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={creatingRecruiter}>
              Create Recruiter Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. EDIT RECRUITER MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Recruiter Profile"
        subtitle="Update team member credentials and managed Service Client assignments."
      >
        <form onSubmit={handleUpdateRecruiter} className="space-y-4">
          <Input
            label="Full Name"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <Input
            label="Email Address"
            type="email"
            required
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
          />

          <Input
            label="Phone Number (Optional)"
            type="tel"
            placeholder="e.g. 9876543210"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
          />

          <Input
            label="Change Password (Optional)"
            type="password"
            placeholder="Leave blank to preserve current password"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
          />

          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Assigned Service Clients
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
              {clients.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white border border-[#E2E8F0] text-caption cursor-pointer hover:border-[#0D6EFD]"
                >
                  <input
                    type="checkbox"
                    checked={editAssignedClientIds.includes(c.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditAssignedClientIds((prev) => [...prev, c.id]);
                      } else {
                        setEditAssignedClientIds((prev) => prev.filter((id) => id !== c.id));
                      }
                    }}
                    className="rounded border-gray-300 text-[#0D6EFD]"
                  />
                  <span className="font-semibold text-[#081226] truncate">{c.company_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={updatingRecruiter}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. RESET PASSWORD MODAL */}
      <Modal
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        title={`Reset Password for ${resetEmployee?.name || 'Recruiter'}`}
        subtitle="Specify a new password for immediate account access."
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="New Password"
            type="text"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Employee will use this new password upon next login."
          />

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsResetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={resetting}>
              Update Password
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. TARGET MODAL */}
      <Modal
        isOpen={isTargetModalOpen}
        onClose={() => setIsTargetModalOpen(false)}
        title={`Set Target: ${selectedRecruiterForTarget?.name || 'Recruiter'}`}
        subtitle="Configure daily submitted applications quota for a dedicated client account."
      >
        <form onSubmit={handleSaveTarget} className="space-y-4">
          <div>
            <label className="text-small font-semibold text-[#081226] block mb-1.5">
              Service Client <span className="text-[#EF4444]">*</span>
            </label>
            <select
              value={targetClientId}
              onChange={(e) => setTargetClientId(e.target.value)}
              className="w-full h-[48px] px-4 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs focus:border-[#0D6EFD] focus:outline-none"
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
            label="Daily Application Target"
            type="number"
            min="1"
            max="300"
            required
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            helperText="Target applications submitted per workday."
          />

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsTargetModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="orange" size="md" isLoading={savingTarget}>
              Save Target
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. SAFE DELETE DEACTIVATE MODAL */}
      <Modal
        isOpen={!!safeDeleteModalEmp}
        onClose={() => setSafeDeleteModalEmp(null)}
        title="Historical Records Protected"
        subtitle="This employee has historical activity and cannot be permanently deleted."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-small text-amber-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {safeDeleteModalEmp?.name} has historical submissions, attendance, or chat records.
              </p>
              <p className="text-caption text-amber-700 mt-1 leading-relaxed">
                To preserve recruitment audit logs, analytics, and client submission histories, this employee cannot be hard deleted. Deactivating will block future logins while preserving all past work intact.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setSafeDeleteModalEmp(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={async () => {
                const empToDeact = safeDeleteModalEmp;
                setSafeDeleteModalEmp(null);
                await handleDeactivateRecruiter(empToDeact);
              }}
              className="!bg-amber-600 hover:!bg-amber-700 text-white font-bold"
            >
              Deactivate Instead
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default RecruitersPage;
