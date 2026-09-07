import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building2,
  Users,
  Briefcase,
  Layers,
  Plus,
  Mail,
  Phone,
  UserCheck,
  TrendingUp,
  Target,
  MoreVertical,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Edit2,
  Power,
  Archive,
  Trash2,
  AlertTriangle,
  UserPlus,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { cn } from '@/utils/cn';

// Memoized Client Card Component
const ClientCard = React.memo(function ClientCard({
  client,
  menuItems,
}) {
  const totalResumes = client.total_resumes ?? 0;
  const totalApps = client.total_applications ?? 0;
  const assignedEmps = client.assigned_employees || [];

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.12 }}
      className={cn(
        'bg-white rounded-3xl border shadow-card hover:shadow-card-hover transition-all duration-150 p-6 flex flex-col justify-between space-y-6 relative',
        client.status === 'inactive' ? 'border-[#CBD5E1] bg-[#F8FAFC]/70' :
        client.status === 'archived' ? 'border-[#E2E8F0] bg-[#FDF4FF]/30' :
        'border-[#E2E8F0]'
      )}
    >
      {/* Card Header: Client Logo + Name + Status + Three-Dot Menu */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <Avatar
              name={client.company_name}
              size="lg"
              variant={client.status === 'active' ? 'blue' : 'navy'}
            />
            <div className="min-w-0">
              <h3 className="text-h3 font-extrabold text-[#081226] truncate">
                {client.company_name}
              </h3>
              <p className="text-caption text-[#64748B] mt-0.5">
                Contact: <span className="font-semibold text-[#334155]">{client.contact_person || 'Main Contact'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge
              status={client.status === 'archived' ? 'archived' : client.status === 'inactive' ? 'inactive' : 'active'}
              size="sm"
            />
            {menuItems.length > 0 && (
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="p-1.5 rounded-lg text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                }
                items={menuItems}
              />
            )}
          </div>
        </div>

        {/* Contact strip */}
        <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9] space-y-1 text-caption text-[#64748B]">
          {client.email && (
            <div className="flex items-center gap-2 truncate">
              <Mail className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>{client.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Metrics & Deliveries */}
      <div className="grid grid-cols-2 gap-3 py-2 border-y border-[#F1F5F9]">
        <div className="p-3 rounded-xl bg-[#EFF6FF]/50 border border-[#BFDBFE]/40 text-center">
          <p className="text-caption font-bold uppercase text-[#2563EB]">Total Resumes</p>
          <p className="text-h2 font-extrabold text-[#081226] mt-0.5">{totalResumes}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#FFF7ED]/60 border border-[#FFEDD5] text-center">
          <p className="text-caption font-bold uppercase text-[#F97316]">Submissions</p>
          <p className="text-h2 font-extrabold text-[#081226] mt-0.5">{totalApps}</p>
        </div>
      </div>

      {/* Assigned Recruiters Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-caption font-bold uppercase tracking-wider text-[#64748B]">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#0D6EFD]" />
            Assigned Recruiters ({assignedEmps.length})
          </span>
        </div>

        {assignedEmps.length === 0 ? (
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-dashed border-[#CBD5E1] text-center text-caption text-[#94A3B8]">
            No recruiters assigned yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignedEmps.map((emp) => (
              <div
                key={emp.id || emp.employee_id}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-caption font-semibold flex items-center gap-1.5 border',
                  emp.is_primary
                    ? 'bg-[#EFF6FF] text-[#0D6EFD] border-[#BFDBFE]'
                    : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]'
                )}
              >
                <Avatar name={emp.name || 'Recruiter'} size="xs" variant={emp.is_primary ? 'blue' : 'navy'} />
                <span>{emp.name}</span>
                {emp.is_primary && <span className="text-[10px] uppercase font-bold text-[#0D6EFD]">• Lead</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export function ClientsPage() {
  const navigate = useNavigate();
  const { user, isAdmin, isSubAdmin, isEmployee } = useAuth();
  const { success, error: toastError, info } = useToast();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active'); // active | inactive | archived | all

  // Create Client Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCompany, setNewCompany] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit Client Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editClientData, setEditClientData] = useState(null);
  const [editCompany, setEditCompany] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAssignedEmployeeIds, setEditAssignedEmployeeIds] = useState([]);
  const [updating, setUpdating] = useState(false);

  // Assign Recruiter Modal State
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Confirmation Modals State
  const [deactivateClientTarget, setDeactivateClientTarget] = useState(null);
  const [deleteClientTarget, setDeleteClientTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/clients?status=${statusFilter}`);
      setClients(res.data || []);
    } catch (err) {
      toastError('Error', 'Failed to load service clients');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (isAdmin || isSubAdmin) {
      try {
        const res = await api.get('/employees');
        setAllEmployees(res.data || []);
      } catch (err) {
        console.error('Failed to load recruiters:', err);
      }
    }
  };

  useEffect(() => {
    fetchClients();
  }, [statusFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [isAdmin, isSubAdmin]);

  // Create Client Handler
  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newCompany) return;
    setCreating(true);
    try {
      await api.post('/clients', {
        company_name: newCompany,
        contact_person: newContact,
        email: newEmail,
        phone: newPhone,
        password: newPassword,
      });
      success('Client Created', `${newCompany} successfully added.`);
      setIsCreateOpen(false);
      setNewCompany('');
      setNewContact('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      fetchClients();
    } catch (err) {
      toastError('Creation Failed', err.response?.data?.detail || 'Failed to create client');
    } finally {
      setCreating(false);
    }
  };

  // Edit Client Handler
  const openEditModal = (client) => {
    setEditClientData(client);
    setEditCompany(client.company_name);
    setEditContact(client.contact_person || '');
    setEditEmail(client.email || '');
    setEditPhone(client.phone || '');
    const currentEmpIds = (client.assigned_employees || [])
      .map((emp) => emp.id || emp.employee_id)
      .filter(Boolean);
    setEditAssignedEmployeeIds(currentEmpIds);
    if (!allEmployees || allEmployees.length === 0) {
      fetchEmployees();
    }
    setIsEditOpen(true);
  };

  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!editClientData) return;
    setUpdating(true);
    try {
      const res = await api.put(`/clients/${editClientData.id}`, {
        company_name: editCompany,
        contact_person: editContact,
        email: editEmail,
        phone: editPhone,
        employee_ids: editAssignedEmployeeIds,
      });
      if (res.data) {
        setClients((prev) =>
          prev.map((c) => (c.id === editClientData.id ? res.data : c))
        );
      }
      success('Client Updated', `${editCompany} updated successfully.`);
      setIsEditOpen(false);
      fetchClients();
    } catch (err) {
      toastError('Update Failed', err.response?.data?.detail || 'Failed to update client');
    } finally {
      setUpdating(false);
    }
  };

  // Deactivate Client Handler
  const handleDeactivateClient = async () => {
    if (!deactivateClientTarget) return;
    setActionLoading(true);
    try {
      await api.post(`/clients/${deactivateClientTarget.id}/deactivate`);
      success('Client Deactivated', `${deactivateClientTarget.company_name} is now inactive. Chat is read-only.`);
      setDeactivateClientTarget(null);
      fetchClients();
    } catch (err) {
      toastError('Deactivation Failed', err.response?.data?.detail || 'Failed to deactivate client');
    } finally {
      setActionLoading(false);
    }
  };

  // Activate Client Handler
  const handleActivateClient = async (client) => {
    try {
      await api.post(`/clients/${client.id}/activate`);
      success('Client Activated', `${client.company_name} has been reactivated.`);
      fetchClients();
    } catch (err) {
      toastError('Activation Failed', err.response?.data?.detail || 'Failed to activate client');
    }
  };

  // Archive Client Handler
  const handleArchiveClient = async (client) => {
    try {
      await api.post(`/clients/${client.id}/archive`);
      success('Client Archived', `${client.company_name} moved to archived list.`);
      fetchClients();
    } catch (err) {
      toastError('Archive Failed', err.response?.data?.detail || 'Failed to archive client');
    }
  };

  // Safe Delete Client Handler
  const handleSafeDeleteClient = async () => {
    if (!deleteClientTarget) return;
    setActionLoading(true);
    try {
      await api.delete(`/clients/${deleteClientTarget.id}`);
      success('Client Deleted', `${deleteClientTarget.company_name} deleted successfully.`);
      setDeleteClientTarget(null);
      fetchClients();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to delete client';
      toastError('Cannot Delete Client', detail);
    } finally {
      setActionLoading(false);
    }
  };

  // Assign Recruiter Handler
  const handleAssignRecruiter = async (e) => {
    e.preventDefault();
    if (!selectedClient || !selectedEmployeeId) return;
    setAssigning(true);
    try {
      await api.post(`/clients/${selectedClient.id}/employees`, {
        assignments: [
          {
            employee_id: selectedEmployeeId,
            is_primary: isPrimary,
            active: true,
          },
        ],
      });
      success('Recruiter Assigned', 'Assigned recruiter to service client.');
      setIsAssignOpen(false);
      fetchClients();
    } catch (err) {
      toastError('Assignment Failed', err.response?.data?.detail || 'Failed to assign recruiter');
    } finally {
      setAssigning(false);
    }
  };

  // Generate three-dot menu items for client
  const getActionMenuItems = (client) => {
    const items = [];

    if (isAdmin || isSubAdmin) {
      items.push({
        icon: Edit2,
        label: 'Edit Client',
        onClick: () => openEditModal(client),
      });

      items.push({
        icon: UserPlus,
        label: 'Assign Recruiter',
        onClick: () => {
          setSelectedClient(client);
          setIsAssignOpen(true);
        },
      });

      if (client.status === 'active') {
        items.push({
          icon: Power,
          label: 'Deactivate Client',
          onClick: () => setDeactivateClientTarget(client),
        });
      } else {
        items.push({
          icon: Power,
          label: 'Activate Client',
          onClick: () => handleActivateClient(client),
        });
      }

      if (client.status !== 'archived') {
        items.push({
          icon: Archive,
          label: 'Archive Client',
          onClick: () => handleArchiveClient(client),
        });
      }

      if (isAdmin) {
        items.push({ divider: true });
        items.push({
          icon: Trash2,
          label: 'Safe Delete',
          danger: true,
          onClick: () => setDeleteClientTarget(client),
        });
      }
    }

    return items;
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-h1 font-extrabold text-[#081226] tracking-tight">
              Service Clients
            </h1>
            <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              {clients.length} Accounts
            </span>
          </div>
          <p className="text-small text-[#64748B] mt-1">
            Corporate staffing accounts, dedicated recruiter assignments, and complete lifecycle management.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchClients}
            isLoading={loading}
            className="h-[44px]"
          />

          {(isAdmin || isSubAdmin) && (
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => setIsCreateOpen(true)}
              className="h-[44px]"
            >
              Add Service Client
            </Button>
          )}
        </div>
      </div>

      {/* Lifecycle Status Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
        {[
          { key: 'active', label: 'Active Clients' },
          { key: 'inactive', label: 'Inactive' },
          { key: 'archived', label: 'Archived Clients' },
          { key: 'all', label: 'All Clients' },
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

      {clients.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-[#0284C7]" />
          </div>
          <h3 className="text-h3 font-extrabold text-[#081226]">No Service Client account yet</h3>
          <p className="text-small text-[#64748B] mt-2 max-w-md mx-auto">
            Create your first Service Client account to start chat, resume, and recruitment workflows.
          </p>
          {(isAdmin || isSubAdmin) && (
            <Button
              type="button"
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => setIsCreateOpen(true)}
              className="mt-6"
            >
              Create Service Client Account
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => {
            const menuItems = getActionMenuItems(client);
            return (
              <ClientCard
                key={client.id}
                client={client}
                menuItems={menuItems}
              />
            );
          })}
        </div>
      )}

      {/* Add Client Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add New Service Client"
        subtitle="Create a new client corporate account for recruitment operations."
      >
        <form onSubmit={handleCreateClient} className="space-y-4">
          <Input
            label="Company Name"
            placeholder="e.g. Apex Staffing"
            required
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
          />
          <Input
            label="Contact Person"
            placeholder="e.g. Jane Smith"
            value={newContact}
            onChange={(e) => setNewContact(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="jane@apexstaffing.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Input
            label="Phone Number"
            placeholder="+1-555-0199"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />
          <Input
            label="Client Login Password"
            type="password"
            placeholder="Set password for client login"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={creating}>
              Create Client Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Service Client"
        subtitle="Update corporate details and contact information."
      >
        <form onSubmit={handleUpdateClient} className="space-y-4">
          <Input
            label="Company Name"
            required
            value={editCompany}
            onChange={(e) => setEditCompany(e.target.value)}
          />
          <Input
            label="Contact Person"
            value={editContact}
            onChange={(e) => setEditContact(e.target.value)}
          />
          <Input
            label="Email Address"
            type="email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
          />
          <Input
            label="Phone Number"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-small font-semibold text-[#081226]">
                Assigned Recruiters
              </label>
              <span className="text-caption font-medium text-[#64748B]">
                {editAssignedEmployeeIds.length} selected
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2 space-y-1">
              {allEmployees.length === 0 ? (
                <p className="text-caption text-[#94A3B8] p-3 text-center">No recruiters available</p>
              ) : (
                allEmployees
                  .filter((emp) => emp.is_active !== false)
                  .map((emp) => {
                    const isSelected = editAssignedEmployeeIds.includes(emp.id);
                    return (
                      <button
                        type="button"
                        key={emp.id}
                        onClick={() => {
                          setEditAssignedEmployeeIds((prev) =>
                            prev.includes(emp.id)
                              ? prev.filter((id) => id !== emp.id)
                              : [...prev, emp.id]
                          );
                        }}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-small transition-all text-left cursor-pointer',
                          isSelected
                            ? 'bg-blue-50/90 border border-blue-200 text-[#0D6EFD] font-semibold'
                            : 'hover:bg-white text-[#334155] border border-transparent'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={emp.name || emp.email} size="xs" variant={isSelected ? 'blue' : 'navy'} />
                          <div className="min-w-0">
                            <span className="truncate block font-medium">{emp.name}</span>
                            {emp.email && (
                              <span className="text-caption text-[#94A3B8] block truncate">
                                {emp.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className={cn(
                            'w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0',
                            isSelected
                              ? 'bg-[#0D6EFD] border-[#0D6EFD] text-white'
                              : 'border-[#CBD5E1] bg-white'
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
            <p className="text-caption text-[#64748B] mt-1">
              Recruiters selected here are automatically assigned to job openings for this client.
            </p>
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

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={!!deactivateClientTarget}
        onClose={() => setDeactivateClientTarget(null)}
        title="Deactivate Service Client?"
        subtitle="Review the effects of deactivating this customer account."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-small text-[#92400E] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#B45309]">
              <AlertTriangle className="w-5 h-5" />
              <span>Deactivation Effects:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-caption text-[#78350F]">
              <li>Client user will no longer be able to log in.</li>
              <li>Chat room will switch to <strong>read-only mode</strong>.</li>
              <li>Resumes, candidate submissions, and reports remain searchable.</li>
              <li>Dashboard telemetry and history are fully preserved.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setDeactivateClientTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleDeactivateClient}
              isLoading={actionLoading}
            >
              Deactivate Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* Safe Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteClientTarget}
        onClose={() => setDeleteClientTarget(null)}
        title="Safe Delete Client Account?"
        subtitle="Permanently delete client only if no historical records exist."
      >
        <div className="space-y-4">
          <p className="text-small text-[#64748B]">
            Are you sure you want to delete <strong>{deleteClientTarget?.company_name}</strong>?
          </p>
          <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-caption text-[#991B1B]">
            <strong>Note:</strong> If this client has historical resumes, job requirements, applications, or chat messages, the system will block deletion and advise archiving instead.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setDeleteClientTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleSafeDeleteClient}
              isLoading={actionLoading}
            >
              Confirm Safe Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Recruiter Modal */}
      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title={`Assign Recruiter to ${selectedClient?.company_name || 'Client'}`}
        subtitle="Designate primary or supporting recruiter for candidate submission workflows."
      >
        <form onSubmit={handleAssignRecruiter} className="space-y-4">
          <div>
            <label className="block text-caption font-bold text-[#081226] mb-1.5">
              Select Recruiter
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-small focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
              required
            >
              <option value="">-- Choose Recruiter --</option>
              {allEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isPrimaryCheck"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="w-4 h-4 text-[#2563EB] rounded border-gray-300"
            />
            <label htmlFor="isPrimaryCheck" className="text-small font-medium text-[#081226]">
              Set as Primary Assigned Recruiter
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={() => setIsAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={assigning}>
              Confirm Assignment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
