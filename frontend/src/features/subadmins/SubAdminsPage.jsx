import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  UserPlus,
  Building2,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Settings,
  Edit2,
  ChevronRight,
  Sparkles,
  Layers,
  X,
  Lock,
  Mail,
  User as UserIcon,
  Filter,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import api from '@/services/api';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/utils/cn';

export function SubAdminsPage() {
  const [subAdmins, setSubAdmins] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assignmentModalSubAdmin, setAssignmentModalSubAdmin] = useState(null);
  const [editModalSubAdmin, setEditModalSubAdmin] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    client_ids: [],
    employee_ids: [],
  });
  const [assignmentData, setAssignmentData] = useState({
    client_ids: [],
    employee_ids: [],
  });
  const [editData, setEditData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    is_active: true,
  });
  const [safeDeleteModalSA, setSafeDeleteModalSA] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await Promise.allSettled([
        api.get('/sub-admins?status=all'),
        api.get('/clients'),
        api.get('/users?role=employee'),
      ]);
      if (results[0].status === 'fulfilled') setSubAdmins(results[0].value.data || []);
      if (results[1].status === 'fulfilled') setClients(results[1].value.data || []);
      if (results[2].status === 'fulfilled') setEmployees(results[2].value.data || []);
    } catch (err) {
      console.error('Failed to load sub-admin data:', err);
      showToast('Failed to load sub-admins');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Assignment Modal
  const handleOpenAssignments = async (sa) => {
    try {
      const res = await api.get(`/sub-admins/${sa.id}/assignments`);
      setAssignmentData({
        client_ids: res.data.assigned_client_ids || [],
        employee_ids: res.data.assigned_employee_ids || [],
      });
      setAssignmentModalSubAdmin(sa);
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
      showToast('Error loading assignments');
    }
  };

  // Save Assignments
  const handleSaveAssignments = async (e) => {
    e.preventDefault();
    if (!assignmentModalSubAdmin) return;
    setIsSubmitting(true);
    try {
      await api.post(`/sub-admins/${assignmentModalSubAdmin.id}/assignments`, {
        client_ids: assignmentData.client_ids,
        employee_ids: assignmentData.employee_ids,
      });
      showToast(`Assignments updated for ${assignmentModalSubAdmin.name}`);
      setAssignmentModalSubAdmin(null);
      fetchData();
    } catch (err) {
      console.error('Error saving assignments:', err);
      showToast('Failed to update assignments');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Sub-Admin
  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/sub-admins', formData);
      showToast(`Sub-Admin ${formData.name} created successfully!`);
      setIsCreateModalOpen(false);
      setFormData({ name: '', email: '', phone: '', password: '', client_ids: [], employee_ids: [] });
      fetchData();
    } catch (err) {
      console.error('Failed to create sub-admin:', err);
      showToast(err.response?.data?.detail || 'Failed to create sub-admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit Sub-Admin
  const handleEditSubAdmin = async (e) => {
    e.preventDefault();
    if (!editModalSubAdmin) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: editData.name,
        email: editData.email,
        phone: editData.phone || null,
        is_active: editData.is_active,
      };
      if (editData.password) {
        payload.password = editData.password;
      }
      await api.put(`/sub-admins/${editModalSubAdmin.id}`, payload);
      showToast(`Sub-Admin ${editData.name} updated!`);
      setEditModalSubAdmin(null);
      fetchData();
    } catch (err) {
      console.error('Failed to update sub-admin:', err);
      showToast(err.response?.data?.detail || 'Failed to update sub-admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Deactivate Sub-Admin
  const handleDeactivateSubAdmin = async (sa) => {
    try {
      await api.post(`/sub-admins/${sa.id}/deactivate`);
      showToast(`Sub-Admin ${sa.name} deactivated.`);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to deactivate sub-admin');
    }
  };

  // Activate Sub-Admin
  const handleActivateSubAdmin = async (sa) => {
    try {
      await api.post(`/sub-admins/${sa.id}/activate`);
      showToast(`Sub-Admin ${sa.name} reactivated.`);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to activate sub-admin');
    }
  };

  // Delete Sub-Admin
  const handleDeleteSubAdmin = async (sa) => {
    try {
      await api.delete(`/sub-admins/${sa.id}`);
      showToast(`Sub-Admin ${sa.name} deleted.`);
      fetchData();
    } catch (err) {
      const detail =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        '';
      if (err?.response?.status === 400 || (typeof detail === 'string' && detail.includes('Reassign'))) {
        setSafeDeleteModalSA(sa);
      } else {
        showToast(typeof detail === 'string' && detail ? detail : 'Failed to delete sub-admin');
      }
    }
  };

  // Reassign to Admin & Delete Sub-Admin
  const handleReassignAndDelete = async () => {
    if (!safeDeleteModalSA) return;
    try {
      await api.delete(`/sub-admins/${safeDeleteModalSA.id}?reassign_to_admin=true`);
      showToast(`Resources reassigned to Super Admin and ${safeDeleteModalSA.name} deleted.`);
      setSafeDeleteModalSA(null);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to reassign and delete');
    }
  };

  // Filtered sub-admins
  const filteredSubAdmins = subAdmins.filter(
    (sa) =>
      sa.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sa.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAssignedClients = subAdmins.reduce((acc, sa) => acc + (sa.assigned_clients_count || 0), 0);
  const totalAssignedEmployees = subAdmins.reduce((acc, sa) => acc + (sa.assigned_employees_count || 0), 0);

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl bg-[#081226] text-white border border-[#2563EB]/40 shadow-2xl flex items-center gap-3 text-sm font-semibold"
          >
            <Sparkles className="w-4 h-4 text-[#60A5FA]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#081226] via-[#0F2042] to-[#081226] p-8 rounded-[28px] border border-[#1E2E4E] shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#8B5CF6]/20 text-[#C4B5FD] border border-[#8B5CF6]/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Hierarchical Governance
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
            Sub-Admin Delegation Management
          </h1>
          <p className="text-sm text-[#94A3B8] max-w-2xl mt-1 leading-relaxed">
            Delegate operational oversight to Scoped Administrators. Sub-Admins manage only their assigned
            clients and recruiter teams with total isolation from global resources.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#1E40AF] text-white font-bold text-sm shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Sub-Admin</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-6 rounded-[24px] bg-[#081226] border border-[#1E2E4E] flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Active Sub-Admins</p>
            <p className="text-3xl font-black text-white mt-1">{subAdmins.length}</p>
            <p className="text-xs text-[#10B981] font-semibold mt-1">✓ Scoped Administrators</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center text-[#A78BFA]">
            <ShieldCheck className="w-7 h-7" />
          </div>
        </div>

        <div className="p-6 rounded-[24px] bg-[#081226] border border-[#1E2E4E] flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Delegated Clients</p>
            <p className="text-3xl font-black text-white mt-1">{totalAssignedClients}</p>
            <p className="text-xs text-[#94A3B8] font-semibold mt-1">Across all Sub-Admins</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center text-[#60A5FA]">
            <Building2 className="w-7 h-7" />
          </div>
        </div>

        <div className="p-6 rounded-[24px] bg-[#081226] border border-[#1E2E4E] flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Delegated Recruiters</p>
            <p className="text-3xl font-black text-white mt-1">{totalAssignedEmployees}</p>
            <p className="text-xs text-[#94A3B8] font-semibold mt-1">Recruiter accounts mapped</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20 flex items-center justify-center text-[#34D399]">
            <Users className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#081226] p-4 rounded-2xl border border-[#1E2E4E]">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Sub-Admins by name or email..."
            className="w-full pl-10 pr-4 py-2 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#2563EB]"
          />
        </div>
        <div className="text-xs font-semibold text-[#94A3B8]">
          Showing <span className="text-white font-bold">{filteredSubAdmins.length}</span> Sub-Admins
        </div>
      </div>

      {/* Sub-Admins Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-[#94A3B8] bg-[#081226] rounded-[28px] border border-[#1E2E4E]">
          <div className="w-10 h-10 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold">Loading Sub-Admins...</p>
        </div>
      ) : filteredSubAdmins.length === 0 ? (
        <div className="p-16 text-center bg-[#081226] rounded-[28px] border border-[#1E2E4E] space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center text-[#A78BFA] mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No Sub-Admins Configured</h3>
            <p className="text-sm text-[#94A3B8] mt-1 max-w-md mx-auto">
              Create your first Sub-Admin to delegate management of specific Service Clients and Recruiters.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-[#2563EB] text-white font-semibold text-sm hover:bg-[#1D4ED8] transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Sub-Admin</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredSubAdmins.map((sa) => (
            <div
              key={sa.id}
              className="bg-[#081226] rounded-[28px] border border-[#1E2E4E] p-6 shadow-xl hover:border-[#8B5CF6]/40 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Card Top */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#101F3D]">
                  <div className="flex items-center gap-3.5">
                    <Avatar name={sa.name} size="md" variant="purple" status={sa.is_active ? 'online' : 'offline'} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">{sa.name}</h3>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[#C4B5FD] border border-[#8B5CF6]/30">
                          Sub-Admin
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            sa.is_active
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                          )}
                        >
                          {sa.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{sa.email}</p>
                      {sa.phone && <p className="text-[11px] text-[#64748B]">📞 {sa.phone}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditData({
                          name: sa.name,
                          email: sa.email,
                          phone: sa.phone || '',
                          password: '',
                          is_active: sa.is_active,
                        });
                        setEditModalSubAdmin(sa);
                      }}
                      className="p-2 text-[#94A3B8] hover:text-white hover:bg-[#101F3D] rounded-xl transition-colors cursor-pointer"
                      title="Edit Sub-Admin"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => (sa.is_active ? handleDeactivateSubAdmin(sa) : handleActivateSubAdmin(sa))}
                      className={cn(
                        'p-2 rounded-xl transition-colors cursor-pointer',
                        sa.is_active
                          ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                          : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                      )}
                      title={sa.is_active ? 'Deactivate Sub-Admin' : 'Activate Sub-Admin'}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSubAdmin(sa)}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                      title="Delete Sub-Admin"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Scope Stats */}
                <div className="grid grid-cols-2 gap-3 my-4">
                  <div className="p-3 rounded-2xl bg-[#050C1B] border border-[#101F3D]">
                    <div className="flex items-center gap-2 text-[#60A5FA] mb-1">
                      <Building2 className="w-4 h-4" />
                      <span className="text-xs font-bold">Managed Clients</span>
                    </div>
                    <p className="text-xl font-extrabold text-white">{sa.assigned_clients_count || 0}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#050C1B] border border-[#101F3D]">
                    <div className="flex items-center gap-2 text-[#34D399] mb-1">
                      <Users className="w-4 h-4" />
                      <span className="text-xs font-bold">Managed Recruiters</span>
                    </div>
                    <p className="text-xl font-extrabold text-white">{sa.assigned_employees_count || 0}</p>
                  </div>
                </div>

                {/* Assigned Resource Tags */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1.5">
                      Assigned Service Clients
                    </p>
                    <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                      {sa.assigned_clients && sa.assigned_clients.length > 0 ? (
                        sa.assigned_clients.map((c) => (
                          <span
                            key={c.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-[#2563EB]/15 text-[#93C5FD] border border-[#2563EB]/30 font-medium"
                          >
                            {c.company_name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#64748B] italic">No clients assigned yet</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1.5">
                      Assigned Recruiters
                    </p>
                    <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                      {sa.assigned_employees && sa.assigned_employees.length > 0 ? (
                        sa.assigned_employees.map((e) => (
                          <span
                            key={e.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-[#10B981]/15 text-[#6EE7B7] border border-[#10B981]/30 font-medium"
                          >
                            {e.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#64748B] italic">No recruiters assigned yet</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer Button */}
              <div className="pt-5 mt-5 border-t border-[#101F3D] flex items-center justify-between">
                <span className="text-xs text-[#64748B]">
                  Created {new Date(sa.created_at).toLocaleDateString()}
                </span>

                <button
                  type="button"
                  onClick={() => handleOpenAssignments(sa)}
                  className="px-4 py-2 rounded-xl bg-[#101F3D] hover:bg-[#8B5CF6] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Manage Scoped Resources</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* CREATE SUB-ADMIN MODAL */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#081226] border border-[#1E2E4E] rounded-[28px] p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#101F3D]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C4B5FD]">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Create New Sub-Admin</h3>
                    <p className="text-xs text-[#94A3B8]">Set up credentials and initial delegation scope</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-[#64748B] hover:text-white p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Akhil Sharma"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. akhil@applyflow.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="e.g. 9876543210"
                      className="w-full px-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Temporary Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                {/* Initial Client Selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Assign Service Clients
                  </label>
                  <div className="max-h-36 overflow-y-auto p-2 bg-[#050C1B] border border-[#1E2E4E] rounded-xl space-y-1.5">
                    {clients.map((c) => {
                      const isChecked = formData.client_ids.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#101F3D] cursor-pointer text-xs text-white"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, client_ids: [...formData.client_ids, c.id] });
                              } else {
                                setFormData({
                                  ...formData,
                                  client_ids: formData.client_ids.filter((id) => id !== c.id),
                                });
                              }
                            }}
                            className="rounded border-[#1E2E4E] text-[#2563EB] focus:ring-0"
                          />
                          <span className="font-medium">{c.company_name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Initial Recruiter Selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Assign Recruiters
                  </label>
                  <div className="max-h-36 overflow-y-auto p-2 bg-[#050C1B] border border-[#1E2E4E] rounded-xl space-y-1.5">
                    {employees.map((emp) => {
                      const isChecked = formData.employee_ids.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#101F3D] cursor-pointer text-xs text-white"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, employee_ids: [...formData.employee_ids, emp.id] });
                              } else {
                                setFormData({
                                  ...formData,
                                  employee_ids: formData.employee_ids.filter((id) => id !== emp.id),
                                });
                              }
                            }}
                            className="rounded border-[#1E2E4E] text-[#2563EB] focus:ring-0"
                          />
                          <span className="font-medium">{emp.name}</span>
                          <span className="text-[#64748B] text-[11px]">({emp.email})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#101F3D]">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#94A3B8] hover:text-white hover:bg-[#101F3D]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Sub-Admin'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* MANAGE ASSIGNMENTS MODAL */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {assignmentModalSubAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#081226] border border-[#1E2E4E] rounded-[28px] p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#101F3D]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#2563EB]/20 border border-[#2563EB]/30 flex items-center justify-center text-[#60A5FA]">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Manage Scope: {assignmentModalSubAdmin.name}
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      Select clients and recruiters delegated to this Sub-Admin
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignmentModalSubAdmin(null)}
                  className="text-[#64748B] hover:text-white p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAssignments} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Clients Box */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#60A5FA] flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Service Clients ({assignmentData.client_ids.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (assignmentData.client_ids.length === clients.length) {
                            setAssignmentData({ ...assignmentData, client_ids: [] });
                          } else {
                            setAssignmentData({ ...assignmentData, client_ids: clients.map((c) => c.id) });
                          }
                        }}
                        className="text-[11px] text-[#2563EB] hover:underline font-bold"
                      >
                        {assignmentData.client_ids.length === clients.length ? 'Clear All' : 'Select All'}
                      </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto p-2 bg-[#050C1B] border border-[#1E2E4E] rounded-xl space-y-1">
                      {clients.map((c) => {
                        const isChecked = assignmentData.client_ids.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              'flex items-center gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-colors',
                              isChecked ? 'bg-[#2563EB]/15 text-white' : 'hover:bg-[#101F3D] text-[#94A3B8]'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAssignmentData({
                                    ...assignmentData,
                                    client_ids: [...assignmentData.client_ids, c.id],
                                  });
                                } else {
                                  setAssignmentData({
                                    ...assignmentData,
                                    client_ids: assignmentData.client_ids.filter((id) => id !== c.id),
                                  });
                                }
                              }}
                              className="rounded border-[#1E2E4E] text-[#2563EB]"
                            />
                            <span className="font-medium">{c.company_name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recruiters Box */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#34D399] flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Recruiters ({assignmentData.employee_ids.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (assignmentData.employee_ids.length === employees.length) {
                            setAssignmentData({ ...assignmentData, employee_ids: [] });
                          } else {
                            setAssignmentData({
                              ...assignmentData,
                              employee_ids: employees.map((e) => e.id),
                            });
                          }
                        }}
                        className="text-[11px] text-[#10B981] hover:underline font-bold"
                      >
                        {assignmentData.employee_ids.length === employees.length ? 'Clear All' : 'Select All'}
                      </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto p-2 bg-[#050C1B] border border-[#1E2E4E] rounded-xl space-y-1">
                      {employees.map((emp) => {
                        const isChecked = assignmentData.employee_ids.includes(emp.id);
                        return (
                          <label
                            key={emp.id}
                            className={cn(
                              'flex items-center gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-colors',
                              isChecked ? 'bg-[#10B981]/15 text-white' : 'hover:bg-[#101F3D] text-[#94A3B8]'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAssignmentData({
                                    ...assignmentData,
                                    employee_ids: [...assignmentData.employee_ids, emp.id],
                                  });
                                } else {
                                  setAssignmentData({
                                    ...assignmentData,
                                    employee_ids: assignmentData.employee_ids.filter((id) => id !== emp.id),
                                  });
                                }
                              }}
                              className="rounded border-[#1E2E4E] text-[#10B981]"
                            />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{emp.name}</p>
                              <p className="text-[10px] text-[#64748B] truncate">{emp.email}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#101F3D]">
                  <button
                    type="button"
                    onClick={() => setAssignmentModalSubAdmin(null)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#94A3B8] hover:text-white hover:bg-[#101F3D]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Assignments'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* EDIT SUB-ADMIN MODAL */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {editModalSubAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#081226] border border-[#1E2E4E] rounded-[28px] p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-[#101F3D]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C4B5FD]">
                    <Edit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Edit Sub-Admin</h3>
                    <p className="text-xs text-[#94A3B8]">Update account information</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditModalSubAdmin(null)}
                  className="text-[#64748B] hover:text-white p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={editData.phone}
                    onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full px-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                    New Password (optional)
                  </label>
                  <input
                    type="password"
                    value={editData.password}
                    onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                    className="w-full px-4 py-2.5 bg-[#050C1B] border border-[#1E2E4E] rounded-xl text-sm text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#101F3D]">
                  <button
                    type="button"
                    onClick={() => setEditModalSubAdmin(null)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#94A3B8] hover:text-white hover:bg-[#101F3D]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SAFE DELETE REASSIGN MODAL */}
      <AnimatePresence>
        {safeDeleteModalSA && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#081226] border border-[#1E2E4E] rounded-[28px] p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Reassign Delegated Scope</h3>
                  <p className="text-xs text-[#94A3B8]">Safe delete requires transferring managed resources.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#050C1B] border border-[#1E2E4E] text-xs text-[#94A3B8] leading-relaxed">
                <p className="font-semibold text-white mb-1">
                  Sub-Admin <span className="text-amber-400">{safeDeleteModalSA.name}</span> currently manages{' '}
                  <span className="text-white font-bold">{safeDeleteModalSA.assigned_clients_count || 0} client(s)</span> and{' '}
                  <span className="text-white font-bold">{safeDeleteModalSA.assigned_employees_count || 0} recruiter(s)</span>.
                </p>
                <p>
                  Deleting without reassignment would orphan these team members. Choose &quot;Reassign to Super Admin&quot; to transfer ownership to Super Admin and safely remove this Sub-Admin.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSafeDeleteModalSA(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#101F3D] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReassignAndDelete}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                >
                  Reassign to Admin &amp; Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SubAdminsPage;
