import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  LayoutGrid,
  List,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  MoreVertical,
  Plus,
  RefreshCw,
  Building2,
  FileText,
  User,
  ChevronRight,
  Target,
  Tag,
  Eye,
  Download,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table } from '@/components/ui/Table';
import { Avatar } from '@/components/ui/Avatar';
import { Drawer } from '@/components/ui/Modal';
import { SearchBar } from '@/components/ui/SearchBar';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';
import { formatDate, formatRelativeTime, cn } from '@/utils/cn';
import {
  openResumePreview,
  openResumeDownload,
  copyResumeShareLink,
} from '@/utils/resumeUrls';

export function ApplicationsPage() {
  const { user, isEmployee, isAdmin, isClient } = useAuth();
  const { success, error: toastError } = useToast();

  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Metadata
  const [clients, setClients] = useState([]);

  // Detail Drawer
  const [selectedApp, setSelectedApp] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const PIPELINE_STAGES = [
    { id: 'draft', label: 'Draft', color: '#64748B', bg: '#F1F5F9' },
    { id: 'submitted', label: 'Submitted', color: '#2563EB', bg: '#EFF6FF' },
    { id: 'shortlisted', label: 'Shortlisted', color: '#16A34A', bg: '#F0FDF4' },
    { id: 'hold', label: 'Hold', color: '#F59E0B', bg: '#FFFBEB' },
    { id: 'rejected', label: 'Rejected', color: '#EF4444', bg: '#FEF2F2' },
    { id: 'closed', label: 'Closed', color: '#475569', bg: '#F8FAFC' },
  ];

  // Load clients
  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data || [])).catch(() => {});
  }, []);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (search) params.search = search;
      if (selectedClient) params.client_id = selectedClient;
      if (selectedStatus) params.status = selectedStatus;

      const res = await api.get('/applications', { params });
      setApplications(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toastError('Error', 'Failed to fetch applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [page, selectedClient, selectedStatus, search]);

  const handleUpdateStatus = async (appId, newStatus) => {
    setUpdatingStatus(true);
    try {
      await api.put(`/applications/${appId}/status`, { status: newStatus });
      success('Status Updated', `Application moved to ${newStatus}`);

      window.dispatchEvent(new CustomEvent('application-updated', { detail: { appId, status: newStatus } }));

      // Optimistic update
      setApplications((prev) =>
        prev.map((app) => (app.id === appId ? { ...app, status: newStatus } : app))
      );
      if (selectedApp?.id === appId) {
        setSelectedApp((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      toastError('Update Failed', err.response?.data?.detail || 'Failed to update application');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Group applications by pipeline stage for Kanban
  const kanbanColumns = PIPELINE_STAGES.map((stage) => {
    const items = applications.filter((app) => {
      const st = (app.status || 'draft').toLowerCase();
      return st === stage.id || (stage.id === 'submitted' && st === 'applied');
    });
    return {
      ...stage,
      items,
    };
  });

  // Table Columns
  const tableColumns = [
    {
      title: 'Candidate',
      key: 'candidate_name',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={val || 'Candidate'} size="sm" variant="blue" />
          <div>
            <p className="font-bold text-[#081226] text-small">{val || 'Candidate Name'}</p>
            <p className="text-caption text-[#64748B]">Tag: {row.resume_id_tag || 'RES1000'}</p>
          </div>
        </div>
      ),
    },
    {
      title: 'Service Client & Hiring Organization',
      key: 'client_name',
      render: (val, row) => (
        <div>
          <p className="font-semibold text-[#081226] text-small">{val || 'Service Client'}</p>
          <p className="text-caption text-[#64748B]">{row.company || 'Enterprise'}</p>
        </div>
      ),
    },
    {
      title: 'Applied Role',
      key: 'role',
      render: (val) => <span className="font-medium text-[#334155]">{val || 'Role'}</span>,
    },
    {
      title: 'Status',
      key: 'status',
      render: (val) => <StatusBadge status={val} />,
    },
    {
      title: 'Date Submitted',
      key: 'applied_date',
      render: (val) => <span className="text-caption text-[#64748B]">{formatDate(val)}</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedApp(row);
          }}
        >
          View Details →
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header & Fast View Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-h2 font-extrabold text-[#081226] tracking-tight">
                Applications Pipeline
              </h1>
              <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                {total} Applications
              </span>
            </div>
            <p className="text-small text-[#64748B] mt-0.5">
              Manage candidate delivery across client review stages, shortlist decisions, and placement statuses.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle (Table / Kanban) */}
            <div className="bg-[#F1F5F9] p-1 rounded-xl flex items-center gap-1 border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-semibold transition-colors cursor-pointer',
                  viewMode === 'kanban'
                    ? 'bg-white text-[#081226] shadow-xs'
                    : 'text-[#64748B] hover:text-[#081226]'
                )}
              >
                <LayoutGrid className="w-4 h-4" />
                Kanban
              </button>

              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small font-semibold transition-colors cursor-pointer',
                  viewMode === 'table'
                    ? 'bg-white text-[#081226] shadow-xs'
                    : 'text-[#64748B] hover:text-[#081226]'
                )}
              >
                <List className="w-4 h-4" />
                Table
              </button>
            </div>

            <Button
              variant="outline"
              size="md"
              icon={RefreshCw}
              onClick={fetchApplications}
              isLoading={loading}
              className="h-[44px]"
            />
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-[#F1F5F9]">
          <div className="sm:col-span-6">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search candidate, role, or hiring organization..."
            />
          </div>

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

          <div className="sm:col-span-3">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full h-[44px] px-3 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">All Pipeline Stages</option>
              {PIPELINE_STAGES.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main View: Kanban or Table */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-start overflow-x-auto pb-6">
          {kanbanColumns.map((col) => (
            <div
              key={col.id}
              className="bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] p-3 flex flex-col min-w-[240px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-2 py-2 mb-2 border-b border-[#E2E8F0]/70">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  <h4 className="text-small font-bold text-[#081226]">{col.label}</h4>
                </div>

                <span className="text-[11px] font-bold px-2 py-0.2 rounded-full bg-white text-[#64748B] border border-[#E2E8F0]">
                  {col.items.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="space-y-3 min-h-[300px]">
                {col.items.length === 0 ? (
                  <div className="py-8 text-center text-[#94A3B8] text-caption font-medium">
                    No candidates in {col.label}
                  </div>
                ) : (
                  col.items.map((app) => (
                    <motion.div
                      key={app.id}
                      onClick={() => setSelectedApp(app)}
                      whileHover={{ y: -2 }}
                      className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-card hover:shadow-card-hover hover:border-[#CBD5E1] transition-all duration-120 cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Avatar name={app.candidate_name} size="xs" variant="blue" />
                        <span className="text-[10px] font-mono text-[#64748B]">
                          {formatRelativeTime(app.applied_date)}
                        </span>
                      </div>

                      <div>
                        <h5 className="text-small font-bold text-[#081226] leading-tight">
                          {app.candidate_name || 'Candidate Name'}
                        </h5>
                        <p className="text-caption text-[#475569] mt-0.5 font-medium truncate">
                          {app.role || 'Software Engineer'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-caption text-[#64748B]">
                        <span className="truncate max-w-[110px] font-semibold text-[#334155]">
                          {app.company || app.client_name || 'Hiring Organization'}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Table
          columns={tableColumns}
          data={applications}
          isLoading={loading}
          onRowClick={(row) => setSelectedApp(row)}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
          }}
        />
      )}

      {/* Detail Slide-Out Drawer */}
      <Drawer
        isOpen={Boolean(selectedApp)}
        onClose={() => setSelectedApp(null)}
        title="Application Details"
        subtitle={selectedApp?.candidate_name}
        width="max-w-lg"
      >
        {selectedApp && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-4">
              <Avatar name={selectedApp.candidate_name} size="lg" variant="blue" />
              <div>
                <h4 className="text-h3 font-bold text-[#081226]">{selectedApp.candidate_name}</h4>
                <p className="text-small text-[#475569] font-medium mt-0.5">
                  {selectedApp.company} • {selectedApp.role}
                </p>
                <div className="mt-2">
                  <StatusBadge status={selectedApp.status} />
                </div>
              </div>
            </div>

            {/* Quick Status Advance Buttons */}
            <div className="space-y-2">
              <label className="text-small font-bold uppercase tracking-wider text-[#64748B] block">
                Update Stage
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['submitted', 'shortlisted', 'closed'].map((st) => (
                  <Button
                    key={st}
                    variant={selectedApp.status === st ? 'primary' : 'outline'}
                    size="sm"
                    disabled={updatingStatus}
                    onClick={() => handleUpdateStatus(selectedApp.id, st)}
                    className="capitalize text-caption font-semibold"
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            {/* Application Details */}
            <div className="space-y-3 p-4 rounded-xl border border-[#E2E8F0] text-small">
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Service Client:</span>
                <span className="font-semibold text-[#081226]">{selectedApp.client_name || 'Service Client'}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Hiring Organization:</span>
                <span className="font-semibold text-[#081226]">{selectedApp.company || 'Enterprise'}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Submitted Date:</span>
                <span className="text-[#081226]">{formatDate(selectedApp.applied_date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748B]">Assigned Recruiter:</span>
                <span className="font-semibold text-[#2563EB]">{selectedApp.employee_name || 'Harish'}</span>
              </div>
            </div>

            {/* Resume actions */}
            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                icon={Eye}
                onClick={() => openResumePreview(selectedApp)}
                className="flex-1 font-bold text-xs"
              >
                Preview Resume
              </Button>
              <Button
                variant="outline"
                size="md"
                icon={Download}
                onClick={() => openResumeDownload(selectedApp)}
                title="Download Candidate Resume"
                className="px-3"
              />
              <Button
                variant="outline"
                size="md"
                icon={Share2}
                onClick={() => copyResumeShareLink(selectedApp, success)}
                title="Copy Resume Share Link"
                className="px-3"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default ApplicationsPage;
