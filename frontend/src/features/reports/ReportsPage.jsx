import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Download,
  Calendar,
  Building2,
  Users,
  TrendingUp,
  Briefcase,
  UploadCloud,
  CheckCircle2,
  FileCode,
  Archive,
  UserX,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { KPICard } from '@/components/ui/KPICard';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';

export function ReportsPage() {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const { success, error: toastError } = useToast();

  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [dateRange, setDateRange] = useState('this_month');

  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(null);

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data || [])).catch(() => {});
  }, []);

  const handleDownloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      const params = {};
      if (selectedClient) params.client_id = selectedClient;

      const response = await api.get('/reports/excel', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'ApplyFlow_Recruitment_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      success('Export Ready', 'Excel report downloaded successfully.');
    } catch (err) {
      toastError('Export Failed', 'Admin permissions required for Excel export');
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const params = {};
      if (selectedClient) params.client_id = selectedClient;

      const response = await api.get('/reports/pdf', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'ApplyFlow_Recruitment_Report.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      success('Export Ready', 'PDF executive report downloaded successfully.');
    } catch (err) {
      toastError('Export Failed', 'Admin permissions required for PDF export');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadCsv = async (type, filename, endpoint, statusParam) => {
    setExportingCsv(type);
    try {
      const response = await api.get(endpoint, {
        params: { status: statusParam },
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      success('Export Ready', `${filename} downloaded successfully.`);
    } catch (err) {
      toastError('Export Failed', err.response?.data?.detail || 'Failed to generate CSV export');
    } finally {
      setExportingCsv(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-extrabold text-[#081226] tracking-tight">
            Analytics & Reports
          </h1>
          <p className="text-small text-[#64748B] mt-1">
            Export structured recruitment data, audit trails, and lifecycle telemetry.
          </p>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Service Clients"
          value={clients.filter((c) => c.status === 'active').length}
          subtitle="Service Client accounts"
          icon={Building2}
          color="blue"
        />
        <KPICard
          title="Total Candidate Resumes"
          value={clients.reduce((sum, c) => sum + (c.total_resumes || 0), 0)}
          subtitle="In Candidate Bank"
          icon={UploadCloud}
          color="navy"
        />
        <KPICard
          title="Applications Submitted"
          value={clients.reduce((sum, c) => sum + (c.total_applications || 0), 0)}
          subtitle="Applications pipeline"
          icon={Briefcase}
          color="orange"
        />
        <KPICard
          title="Delivery Rate"
          value="98.4%"
          subtitle="On-time delivery"
          icon={TrendingUp}
          color="emerald"
        />
      </div>

      {/* Primary Export Center */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Excel Export Card */}
        <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-card p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-h3 font-extrabold text-[#081226]">Excel Comprehensive Report</h3>
            <p className="text-small text-[#64748B] mt-1">
              Multi-tab spreadsheet with candidate telemetry, recruiter performance, and target delivery breakdowns.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-caption font-bold text-[#081226]">Filter by Service Client</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-small"
              >
                <option value="">All Service Clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="primary"
              size="lg"
              icon={Download}
              onClick={handleDownloadExcel}
              isLoading={downloadingExcel}
              className="w-full"
            >
              Export Excel (.xlsx)
            </Button>
          </div>
        </div>

        {/* PDF Executive Export Card */}
        <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-card p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-h3 font-extrabold text-[#081226]">PDF Executive Summary</h3>
            <p className="text-small text-[#64748B] mt-1">
              Formal branded recruitment delivery report suitable for corporate client presentations and SLA reviews.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9] text-caption text-[#64748B]">
              Includes executive summary, hiring organization distribution chart, and high-priority candidate pipeline status.
            </div>

            <Button
              variant="secondary"
              size="lg"
              icon={Download}
              onClick={handleDownloadPdf}
              isLoading={downloadingPdf}
              className="w-full"
            >
              Download PDF Report
            </Button>
          </div>
        </div>
      </div>

      {/* Lifecycle Data Exports (CSV) */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-card p-6 space-y-4">
        <div>
          <h3 className="text-h3 font-extrabold text-[#081226]">Lifecycle Management Data Exports</h3>
          <p className="text-small text-[#64748B] mt-0.5">
            Download raw CSV extracts for audits, compliance, and historical record analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Active Clients */}
          <Button
            variant="outline"
            size="md"
            icon={Building2}
            onClick={() => handleDownloadCsv('active_clients', 'ApplyFlow_Active_Clients.csv', '/reports/export/clients', 'active')}
            isLoading={exportingCsv === 'active_clients'}
            className="justify-start text-left h-auto py-3"
          >
            <div>
              <p className="font-bold text-[#081226]">Active Service Clients</p>
              <p className="text-caption text-[#64748B]">Active Service Client accounts</p>
            </div>
          </Button>

          {/* Archived Clients */}
          <Button
            variant="outline"
            size="md"
            icon={Archive}
            onClick={() => handleDownloadCsv('archived_clients', 'ApplyFlow_Archived_Clients.csv', '/reports/export/clients', 'archived')}
            isLoading={exportingCsv === 'archived_clients'}
            className="justify-start text-left h-auto py-3"
          >
            <div>
              <p className="font-bold text-[#081226]">Archived Service Clients</p>
              <p className="text-caption text-[#64748B]">Past Service Client history</p>
            </div>
          </Button>

          {/* Inactive Employees */}
          <Button
            variant="outline"
            size="md"
            icon={UserX}
            onClick={() => handleDownloadCsv('inactive_employees', 'ApplyFlow_Inactive_Employees.csv', '/reports/export/employees', 'inactive')}
            isLoading={exportingCsv === 'inactive_employees'}
            className="justify-start text-left h-auto py-3"
          >
            <div>
              <p className="font-bold text-[#081226]">Inactive Employees</p>
              <p className="text-caption text-[#64748B]">Deactivated team records</p>
            </div>
          </Button>

          {/* Completed Targets */}
          <Button
            variant="outline"
            size="md"
            icon={Target}
            onClick={() => handleDownloadCsv('ended_targets', 'ApplyFlow_Completed_Targets.csv', '/reports/export/targets', 'ended')}
            isLoading={exportingCsv === 'ended_targets'}
            className="justify-start text-left h-auto py-3"
          >
            <div>
              <p className="font-bold text-[#081226]">Fulfilled Targets</p>
              <p className="text-caption text-[#64748B]">Ended recruiter targets</p>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
