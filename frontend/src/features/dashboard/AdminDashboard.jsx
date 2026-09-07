import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Users,
  Briefcase,
  Target,
  Clock,
  TrendingUp,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock3,
  BarChart2,
  PieChart as PieIcon,
  RefreshCw,
  ChevronDown,
  Activity,
  ArrowRight,
  Plus,
  ShieldCheck,
  Mail,
  UploadCloud,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { KPICard } from '@/components/ui/KPICard';
import { Avatar } from '@/components/ui/Avatar';
import { BrandedLoader } from '@/components/ui/BrandedLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { DateFilter } from '@/components/ui/DateFilter';
import { Modal } from '@/components/ui/Modal';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { formatDate, formatRelativeTime, cn } from '@/utils/cn';

// Lazy-loaded Charts Subcomponent
const AdminCharts = lazy(() => import('./charts/AdminCharts'));

export function AdminDashboard() {
  const { isAdmin, isSubAdmin, bootstrapData, consumeBootstrapDashboard } = useAuth();
  const { error: toastError } = useToast();

  const [initialData] = useState(() => {
    if (consumeBootstrapDashboard) {
      return consumeBootstrapDashboard();
    }
    return bootstrapData?.dashboard || null;
  });

  const [loading, setLoading] = useState(() => !initialData);

  // 1. Reactive Top Filters (Batched selection to guarantee atomic cascading updates)
  const [clients, setClients] = useState(() => initialData?.clients || []);
  const [allEmployees, setAllEmployees] = useState(() => initialData?.all_employees || []);
  const [filterSelection, setFilterSelection] = useState({
    clientId: '',
    employeeId: '',
  });
  const selectedClientId = filterSelection.clientId;
  const selectedEmployeeId = filterSelection.employeeId;

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]); // Single Date Picker
  const [quickDateFilter, setQuickDateFilter] = useState('today'); // 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'

  // Sort Option for Recruiter Performance Table
  const [sortOption, setSortOption] = useState('highest'); // 'highest' | 'lowest' | 'remaining'

  // Data States
  const [overview, setOverview] = useState(() => initialData?.overview || null);
  const [clientCards, setClientCards] = useState(() => initialData?.client_cards || []);
  const [teamPerformance, setTeamPerformance] = useState(() => initialData?.team_performance || []);
  const [allTargets, setAllTargets] = useState(() => initialData?.all_targets || []);
  const [attendanceSummary, setAttendanceSummary] = useState(() => initialData?.attendance_summary || null);

  // Backfilled Drilldown Modal State
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownRecruiterName, setDrilldownRecruiterName] = useState('');
  const [drilldownItems, setDrilldownItems] = useState([]);

  const openDrilldownModal = useCallback(async (employeeId, recruiterName) => {
    setDrilldownRecruiterName(recruiterName || 'Recruiter');
    setIsDrilldownOpen(true);
    setDrilldownLoading(true);
    setDrilldownItems([]);
    try {
      const params = {};
      if (employeeId) params.employee_id = employeeId;
      const res = await api.get('/dashboard/admin/backfilled-details', { params });
      setDrilldownItems(res.data?.items || []);
    } catch (err) {
      toastError('Drilldown Failed', err.response?.data?.detail || 'Failed to load backfilled upload audit details');
    } finally {
      setDrilldownLoading(false);
    }
  }, [toastError]);

  // Cascading Employee list based on selected client
  const availableEmployees = useMemo(() => {
    if (!selectedClientId) return allEmployees;
    return allEmployees.filter((emp) =>
      emp.assigned_clients?.some((c) => (c.client_id || c.id) === selectedClientId)
    );
  }, [selectedClientId, allEmployees]);

  const handleClientChange = useCallback((newClientId) => {
    setFilterSelection((prev) => {
      if (!newClientId) {
        return { clientId: '', employeeId: prev.employeeId };
      }
      const stillValid = allEmployees.some(
        (emp) =>
          (emp.id || emp.employee_id) === prev.employeeId &&
          emp.assigned_clients?.some((c) => (c.client_id || c.id) === newClientId)
      );
      return {
        clientId: newClientId,
        employeeId: stillValid ? prev.employeeId : '',
      };
    });
  }, [allEmployees]);

  const handleEmployeeChange = useCallback((newEmployeeId) => {
    setFilterSelection((prev) => ({ ...prev, employeeId: newEmployeeId }));
  }, []);

  const handleQuickDateSelect = useCallback((filterKey) => {
    setQuickDateFilter(filterKey);
    const today = new Date();
    if (filterKey === 'today') {
      setSelectedDate(today.toISOString().split('T')[0]);
    } else if (filterKey === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      setSelectedDate(yesterday.toISOString().split('T')[0]);
    }
  }, []);

  const handleDateInput = useCallback((dateStr) => {
    setSelectedDate(dateStr);
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateStr === todayStr) {
      setQuickDateFilter('today');
    } else if (dateStr === yesterdayStr) {
      setQuickDateFilter('yesterday');
    } else {
      setQuickDateFilter('custom');
    }
  }, []);

  // Fetch all dashboard data and metadata in 1 consolidated roundtrip
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedClientId) params.client_id = selectedClientId;
      if (selectedEmployeeId) params.employee_id = selectedEmployeeId;

      // Pass date string (or quick range)
      if (quickDateFilter === 'this_week' || quickDateFilter === 'this_month') {
        params.date_range = quickDateFilter;
      } else if (quickDateFilter === 'today' || quickDateFilter === 'yesterday') {
        params.date_range = quickDateFilter;
        params.custom_date = selectedDate;
      } else {
        params.date_range = selectedDate;
        params.custom_date = selectedDate;
      }

      const res = await api.get('/dashboard/admin/home', { params });
      const homeData = res.data;

      if (homeData) {
        if (homeData.overview) setOverview(homeData.overview);
        if (homeData.team_performance) setTeamPerformance(homeData.team_performance);
        if (homeData.attendance_summary) setAttendanceSummary(homeData.attendance_summary);
        if (homeData.client_cards) setClientCards(homeData.client_cards);
        if (homeData.clients?.length) setClients(homeData.clients);
        if (homeData.all_employees?.length) setAllEmployees(homeData.all_employees);
        if (homeData.all_targets?.length) setAllTargets(homeData.all_targets);
      }
    } catch (err) {
      toastError('Dashboard Error', 'Failed to load telemetry metrics');
    } finally {
      setLoading(false);
    }
  }, [selectedClientId, selectedEmployeeId, quickDateFilter, selectedDate, toastError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time listener with debounced focus handler to prevent Alt+Tab storms
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    let focusTimeout = null;
    const handleUploadEvent = () => {
      fetchDataRef.current();
    };
    const handleFocusEvent = () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      focusTimeout = setTimeout(() => {
        fetchDataRef.current();
      }, 500);
    };

    window.addEventListener('resume-uploaded', handleUploadEvent);
    window.addEventListener('application-created', handleUploadEvent);
    window.addEventListener('application-updated', handleUploadEvent);
    window.addEventListener('focus', handleFocusEvent);
    return () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      window.removeEventListener('resume-uploaded', handleUploadEvent);
      window.removeEventListener('application-created', handleUploadEvent);
      window.removeEventListener('application-updated', handleUploadEvent);
      window.removeEventListener('focus', handleFocusEvent);
    };
  }, []);

  // Selected Client Entity
  const currentClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  // -------------------------------------------------------------
  // CALCULATIONS: TARGET PROGRESS IS BASED ON APPLICATIONS SUBMITTED
  // -------------------------------------------------------------
  // DAILY TARGET PROGRESS BAR METRICS (Single source of truth from backend overview.target_sum)
  // -------------------------------------------------------------
  const {
    totalDailyTarget,
    applicationsSubmitted,
    completionPercentage,
    remainingTarget,
    activeRecruitersCount,
  } = useMemo(() => {
    const targetSum = overview?.target_sum ?? 0;
    let submittedCount = 0;
    if (overview?.selected_applications !== undefined && overview?.selected_applications !== null) {
      submittedCount = Number(overview.selected_applications);
    } else if (quickDateFilter === 'yesterday') {
      submittedCount = Number(overview?.yesterday_applications ?? 0);
    } else {
      submittedCount = Number(overview?.today_applications ?? 0);
    }

    const recruiters = selectedClientId
      ? (availableEmployees.length || 0)
      : (availableEmployees.length || allEmployees.length || 0);

    const pct = targetSum > 0 ? Math.min(Math.round((submittedCount / targetSum) * 100), 100) : 0;
    const remaining = Math.max(0, targetSum - submittedCount);

    return {
      totalDailyTarget: targetSum,
      applicationsSubmitted: submittedCount,
      completionPercentage: pct,
      remainingTarget: remaining,
      activeRecruitersCount: recruiters,
    };
  }, [overview, quickDateFilter, selectedClientId, availableEmployees, allEmployees]);

  const dateSubtitle = useMemo(() => {
    if (quickDateFilter === 'today') return `Today (${formatDate(selectedDate)})`;
    if (quickDateFilter === 'yesterday') return `Yesterday (${formatDate(selectedDate)})`;
    if (quickDateFilter === 'this_week') return 'This Week';
    if (quickDateFilter === 'this_month') return 'This Month';
    return `On ${formatDate(selectedDate)}`;
  }, [quickDateFilter, selectedDate]);

  // -------------------------------------------------------------
  // RECRUITER PERFORMANCE ROWS (Calculated per employee based on backend target and applications)
  // -------------------------------------------------------------
  const recruiterRows = useMemo(() => {
    let list = teamPerformance.map((emp) => {
      const target = emp.daily_target ?? 0;
      let submitted = 0;
      if (emp.selected_applications !== undefined && emp.selected_applications !== null) {
        submitted = Number(emp.selected_applications);
      } else if (emp.submitted !== undefined && emp.submitted !== null) {
        submitted = Number(emp.submitted);
      } else if (quickDateFilter === 'yesterday') {
        submitted = Number(emp.yesterday_applications ?? 0);
      } else {
        submitted = Number(emp.today_applications ?? 0);
      }
      const remaining = Math.max(0, target - submitted);
      const completion = target > 0 ? Math.min(Math.round((submitted / target) * 100), 100) : 0;
      const backfilledToday = Number(emp.backfilled_today ?? 0);
      const todayUploads = Number(emp.today_uploads ?? 0);

      return {
        ...emp,
        target,
        submitted,
        remaining,
        completion,
        backfilled_today: backfilledToday,
        today_uploads: todayUploads,
      };
    });

    // Filter by client if client selected
    if (selectedClientId) {
      list = list.filter((emp) =>
        emp.assigned_clients?.some((c) => (c.client_id || c.id) === selectedClientId)
      );
    }
    // Filter by employee if single employee selected
    if (selectedEmployeeId) {
      list = list.filter((emp) => (emp.id || emp.employee_id) === selectedEmployeeId);
    }

    // Sort
    if (sortOption === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === 'completion') {
      list.sort((a, b) => b.completion - a.completion);
    } else if (sortOption === 'target') {
      list.sort((a, b) => b.target - a.target);
    } else if (sortOption === 'remaining') {
      list.sort((a, b) => b.remaining - a.remaining);
    }

    return list;
  }, [teamPerformance, selectedClientId, selectedEmployeeId, sortOption]);

  // -------------------------------------------------------------
  // 4 INTERACTIVE CHARTS DATA
  // -------------------------------------------------------------
  // 1. Daily Target vs Applications (Bar Chart)
  const targetVsAppsData = useMemo(() => {
    return recruiterRows.map((r) => ({
      employee: r.name ? r.name.split(' ')[0] : 'Recruiter',
      target: r.target ?? 0,
      submitted: r.submitted ?? 0,
    }));
  }, [recruiterRows]);

  // 2. Target Completion Trend (7-Day Line Chart)
  const completionTrendData = useMemo(() => {
    if (overview?.daily_uploads_trend && overview.daily_uploads_trend.length > 0) {
      return overview.daily_uploads_trend.map((pt) => {
        const t = pt.target || totalDailyTarget || 0;
        const comp = t > 0 ? Math.round((pt.uploads / t) * 100) : (pt.uploads > 0 ? 100 : 0);
        return {
          day: pt.date,
          date: pt.date,
          uploads: pt.uploads,
          target: t,
          completion: comp,
        };
      });
    }
    return [];
  }, [overview?.daily_uploads_trend, totalDailyTarget]);

  // 3. Client Performance Comparison (Horizontal Bar Chart)
  const clientComparisonData = useMemo(() => {
    return clientCards.map((c) => ({
      client: c.company_name,
      completion: c.completion_rate ?? 0,
      applications: c.applications_received_count ?? 0,
      requirements: c.active_requirements_count ?? 0,
    }));
  }, [clientCards]);

  // 4. Application Status Distribution (Donut / Pie)
  const STATUS_CONFIGS = [
    { key: 'draft', name: 'Draft', color: '#64748B' },
    { key: 'submitted', name: 'Submitted', color: '#0D6EFD' },
    { key: 'shortlisted', name: 'Shortlisted', color: '#16A34A' },
    { key: 'rejected', name: 'Rejected', color: '#EF4444' },
    { key: 'hold', name: 'Hold', color: '#FF8A00' },
    { key: 'closed', name: 'Closed', color: '#9333EA' },
  ];

  const statusDistributionData = useMemo(() => {
    const rawDist = overview?.application_status_distribution;
    if (Array.isArray(rawDist) && rawDist.length > 0) {
      const colors = ['#0D6EFD', '#16A34A', '#FF8A00', '#EF4444', '#9333EA', '#64748B'];
      return rawDist.map((item, idx) => ({
        name: item.name || 'Submitted',
        value: item.value || 0,
        color: colors[idx % colors.length],
      }));
    }
    if (rawDist && typeof rawDist === 'object') {
      return STATUS_CONFIGS.map((cfg) => ({
        name: cfg.name,
        value: rawDist[cfg.key] || 0,
        color: cfg.color,
      })).filter((it) => it.value > 0);
    }
    return [];
  }, [overview?.application_status_distribution]);

  if (loading && !overview) {
    return <BrandedLoader size="lg" label="Loading Executive Operations & Target Analytics..." />;
  }

  return (
    <div className="space-y-8">
      {/* 1. STICKY TOP FILTER BAR (4 Reactive Filters: Service Client, Cascading Recruiter, Single Date Picker, Quick Buttons) */}
      <div className="sticky top-6 z-30 bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-[#E2E8F0] shadow-topbar space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-h1 font-extrabold text-[#081226] tracking-tight">
                {isSubAdmin ? 'Scoped Operations & Target Analytics' : 'Admin Target & Operations Analytics'}
              </h1>
              {isSubAdmin ? (
                <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/15 text-[#7C3AED] border border-[#8B5CF6]/30 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Sub-Admin Scope
                </span>
              ) : (
                <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#0D6EFD] border border-[#BFDBFE] flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Live Application Pipeline
                </span>
              )}
            </div>
            <p className="text-small text-[#64748B] mt-0.5">
              {isSubAdmin
                ? 'Managing assigned Service Clients and recruiter throughput within your delegated scope.'
                : 'Target progress measured strictly by Applications Submitted across client allocations.'}
            </p>
          </div>

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchData}
            isLoading={loading}
            className="h-[44px]"
          >
            Refresh
          </Button>
        </div>

        {/* 4 Reactive Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 pt-3 border-t border-[#F1F5F9] items-center">
          {/* Filter 1: Service Client Dropdown */}
          <div className="lg:col-span-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
              1. Service Client {isSubAdmin && '(Scoped)'}
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full h-[44px] px-3.5 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#0D6EFD]"
            >
              <option value="">All Service Clients ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter 2: Employee Dropdown (Cascading) */}
          <div className="lg:col-span-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
              2. Recruiter {isSubAdmin && '(Scoped)'}
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className="w-full h-[44px] px-3.5 rounded-xl text-small font-medium bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] focus:outline-none focus:border-[#0D6EFD]"
            >
              <option value="">All Recruiters ({availableEmployees.length})</option>
              {availableEmployees.map((emp) => (
                <option key={emp.id || emp.employee_id} value={emp.id || emp.employee_id}>
                  {emp.name} ({emp.email})
                </option>
              ))}
            </select>
          </div>

          {/* Filter 3: Global Unified Date Filter */}
          <div className="lg:col-span-6">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
              3. Date Filter (Global Telemetry)
            </label>
            <DateFilter
              selectedPreset={quickDateFilter}
              customDate={selectedDate}
              onFilterChange={({ preset, customDate: cDate }) => {
                setQuickDateFilter(preset);
                if (cDate) {
                  setSelectedDate(cDate);
                } else if (preset === 'today') {
                  setSelectedDate(new Date().toISOString().split('T')[0]);
                } else if (preset === 'yesterday') {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setSelectedDate(y.toISOString().split('T')[0]);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* 1.5 DATE-FILTERED AGGREGATIONS & BACKFILL AUDIT METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          title="Today Uploads"
          value={overview?.today_uploads ?? 0}
          trend={overview?.uploads_trend}
          trendLabel="vs yesterday"
          subtitle={`vs ${overview?.yesterday_uploads ?? 0} yesterday`}
          icon={UploadCloud}
          variant="blue"
        />
        <KPICard
          title="Yesterday Uploads"
          value={overview?.yesterday_uploads ?? 0}
          subtitle="Previous day resumes"
          icon={Clock3}
          variant="default"
        />
        <KPICard
          title="Backfilled Uploads Today"
          value={overview?.backfilled_today ?? 0}
          subtitle="Uploaded today for earlier work dates"
          icon={Clock}
          variant="orange"
          onClick={() => openDrilldownModal(null, 'All Recruiters')}
          className="cursor-pointer hover:border-amber-400 transition-all"
        />
        <KPICard
          title="Average Backfill Delay"
          value={`${overview?.avg_backfill_delay ?? 0} Days`}
          subtitle="Average delay between work date and upload date"
          icon={Activity}
          variant="default"
        />
        <KPICard
          title="Today Applications"
          value={overview?.today_applications ?? 0}
          trend={overview?.applications_trend}
          trendLabel="vs yesterday"
          subtitle={`vs ${overview?.yesterday_applications ?? 0} yesterday`}
          icon={Briefcase}
          variant="orange"
        />
        <KPICard
          title="Yesterday Applications"
          value={overview?.yesterday_applications ?? 0}
          subtitle="Previous day applications"
          icon={CheckCircle2}
          variant="success"
        />
      </div>

      {/* 2. TARGET OVERVIEW CARDS (Daily Target, Applications Submitted, Completion %, Remaining, Active Recruiters, Total Sub-Admins) */}
      <div className={cn(
        "grid gap-4",
        isAdmin ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      )}>
        <KPICard
          title="Daily Recruiter Target"
          value={totalDailyTarget}
          subtitle={selectedClientId ? `${currentClient?.company_name || 'Service Client'} Target` : 'Combined Target'}
          icon={Target}
          variant="orange"
        />

        <KPICard
          title="Applications Submitted"
          value={applicationsSubmitted}
          subtitle={dateSubtitle}
          icon={Briefcase}
          variant="blue"
        />

        <KPICard
          title="Target Completion"
          value={`${completionPercentage}%`}
          subtitle={
            completionPercentage >= 100
              ? '🎯 100% Target Met!'
              : `${remainingTarget} applications needed`
          }
          icon={TrendingUp}
          variant={completionPercentage >= 100 ? 'success' : 'orange'}
        />

        <KPICard
          title="Target Remaining"
          value={remainingTarget}
          subtitle="To reach 100% quota"
          icon={Clock3}
          variant={remainingTarget === 0 ? 'success' : 'default'}
        />

        <KPICard
          title="Active Recruiters"
          value={activeRecruitersCount}
          subtitle={isSubAdmin ? 'Under your scope' : 'Assigned to target'}
          icon={Users}
          variant="default"
        />

        {isAdmin && (
          <KPICard
            title="Total Sub-Admins"
            value={overview?.total_sub_admins || 0}
            subtitle="Scoped administrators"
            icon={ShieldCheck}
            variant="purple"
          />
        )}
      </div>

      {/* 2.5 JOB OPENINGS TASK BOARD CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Active Job Openings"
          value={overview?.active_jobs ?? 0}
          subtitle="Open positions"
          icon={Briefcase}
          variant="blue"
        />
        <KPICard
          title="Completed Today"
          value={overview?.completed_today_jobs ?? 0}
          subtitle="Marked done today"
          icon={CheckCircle2}
          variant="success"
        />
        <KPICard
          title="High Priority Openings"
          value={overview?.high_priority_jobs ?? 0}
          subtitle="Urgent job openings"
          icon={AlertCircle}
          variant="orange"
        />
        <KPICard
          title="Openings Without URL"
          value={overview?.jobs_without_url ?? 0}
          subtitle="No direct posting link"
          icon={Layers}
          variant="default"
        />
      </div>

      {/* 3. RECRUITER PERFORMANCE TABLE (Target, Submitted, Remaining, Completion % with 0-50% Red, 51-99% Orange, 100%+ Green) */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#F1F5F9]">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              Recruiter-wise Target Completion
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Live submission throughput vs individual daily targets {quickDateFilter === 'this_week' || quickDateFilter === 'this_month' ? `for ${dateSubtitle}` : `on ${formatDate(selectedDate)}`}.
            </p>
          </div>

          {/* Sort Controls & Add Recruiter Action */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-caption font-bold text-[#64748B]">Sort:</span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="h-[36px] px-3 rounded-lg text-caption font-semibold bg-[#F8FAFC] text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#0D6EFD]"
              >
                <option value="highest">Highest Completion %</option>
                <option value="lowest">Lowest Completion %</option>
                <option value="remaining">Target Remaining</option>
              </select>
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => (window.location.href = '/recruiters')}
              className="h-[36px] hidden sm:inline-flex"
            >
              Add Recruiter
            </Button>
          </div>
        </div>

        {/* Mobile Card Conversion View (screens < 640px) */}
        <div className="sm:hidden space-y-3">
          {recruiterRows.length === 0 ? (
            <div className="py-8 text-center text-[#64748B] text-small">
              No recruiters match the selected service client filter.
            </div>
          ) : (
            recruiterRows.map((r) => {
              const pct = r.completion;
              let barColor = 'bg-[#EF4444]'; // 0-50% Red
              let textColor = 'text-[#EF4444]';
              let bgTag = 'bg-[#FEF2F2] border-[#FECACA]';

              if (pct >= 100) {
                barColor = 'bg-[#16A34A]'; // 100%+ Green
                textColor = 'text-[#16A34A]';
                bgTag = 'bg-[#F0FDF4] border-[#BBF7D0]';
              } else if (pct > 50) {
                barColor = 'bg-[#FF8A00]'; // 51-99% Orange
                textColor = 'text-[#FF8A00]';
                bgTag = 'bg-[#FFF7ED] border-[#FFEDD5]';
              }

              return (
                <div
                  key={r.employee_id || r.id}
                  className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={r.name} size="sm" variant="blue" />
                      <div className="min-w-0">
                        <p className="font-bold text-[#081226] text-small truncate">{r.name}</p>
                        <p className="text-[11px] text-[#64748B] truncate">{r.email}</p>
                      </div>
                    </div>
                    <span className={cn('px-2 py-0.5 rounded-md border text-xs font-extrabold shrink-0', bgTag, textColor)}>
                      {pct}%
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center py-2 bg-white rounded-xl border border-[#F1F5F9]">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Target</p>
                      <p className="text-sm font-extrabold text-[#081226]">{r.target}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Today</p>
                      <p className="text-sm font-extrabold text-[#0D6EFD]">{r.today_uploads}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Backfilled</p>
                      {r.backfilled_today > 0 ? (
                        <button
                          type="button"
                          onClick={() => openDrilldownModal(r.employee_id || r.id, r.name)}
                          className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300 inline-flex items-center gap-1 mt-0.5 cursor-pointer hover:bg-amber-100"
                        >
                          🟡 {r.backfilled_today}
                        </button>
                      ) : (
                        <p className="text-sm font-extrabold text-[#94A3B8]">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Remaining</p>
                      <p className="text-sm font-extrabold text-[#64748B]">{r.remaining}</p>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop & Tablet Table Rendering (screens >= 640px) */}
        <div className="hidden sm:block overflow-x-auto max-h-[480px] overflow-y-auto rounded-xl border border-[#F1F5F9]">
          <table className="w-full text-left border-collapse text-small">
            <thead className="sticky top-0 z-10 bg-[#F8FAFC]/95 backdrop-blur-xs">
              <tr className="border-b border-[#E2E8F0] text-caption font-bold text-[#64748B] uppercase">
                <th className="px-4 py-3">Recruiter</th>
                <th className="px-4 py-3 text-center">Daily Recruiter Target</th>
                <th className="px-4 py-3 text-center">Today</th>
                <th className="px-4 py-3 text-center">Backfilled</th>
                <th className="px-4 py-3 text-center">Submitted</th>
                <th className="px-4 py-3 text-center">Remaining</th>
                <th className="px-4 py-3">Completion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {recruiterRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#64748B]">
                    No recruiters match the selected service client filter.
                  </td>
                </tr>
              ) : (
                recruiterRows.map((r) => {
                  const pct = r.completion;
                  let barColor = 'bg-[#EF4444]'; // 0-50% Red
                  let textColor = 'text-[#EF4444]';
                  let bgTag = 'bg-[#FEF2F2] border-[#FECACA]';

                  if (pct >= 100) {
                    barColor = 'bg-[#16A34A]'; // 100%+ Green
                    textColor = 'text-[#16A34A]';
                    bgTag = 'bg-[#F0FDF4] border-[#BBF7D0]';
                  } else if (pct > 50) {
                    barColor = 'bg-[#FF8A00]'; // 51-99% Orange
                    textColor = 'text-[#FF8A00]';
                    bgTag = 'bg-[#FFF7ED] border-[#FFEDD5]';
                  }

                  return (
                    <tr key={r.employee_id || r.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.name} size="sm" variant="blue" />
                          <div>
                            <p className="font-bold text-[#081226] text-small leading-tight">{r.name}</p>
                            <p className="text-caption text-[#64748B]">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-[#081226]">{r.target}</td>
                      <td className="px-4 py-3.5 text-center font-extrabold text-[#0D6EFD]">{r.today_uploads}</td>
                      <td className="px-4 py-3.5 text-center">
                        {r.backfilled_today > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDrilldownModal(r.employee_id || r.id, r.name)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer shadow-xs"
                            title="Click to inspect backfilled upload audit drilldown"
                          >
                            <span>🟡</span>
                            <span>{r.backfilled_today}</span>
                          </button>
                        ) : (
                          <span className="text-caption text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center font-extrabold text-[#081226]">{r.submitted}</td>
                      <td className="px-4 py-3.5 text-center font-semibold text-[#64748B]">{r.remaining}</td>
                      <td className="px-4 py-3.5">
                        <div className="w-48 space-y-1">
                          <div className="flex items-center justify-between text-caption font-bold">
                            <span className={cn('px-1.5 py-0.2 rounded border text-[11px]', bgTag, textColor)}>
                              {pct}%
                            </span>
                            <span className="text-[11px] text-[#64748B]">
                              {r.submitted}/{r.target}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all duration-500', barColor)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. FOUR INTERACTIVE TARGET ANALYTICS CHARTS (Lazy-Loaded Background Rendering) */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <ChartSkeleton className="lg:col-span-6 h-64" title="1. Daily Target vs Applications" />
            <ChartSkeleton className="lg:col-span-6 h-64" title="2. Target Completion Trend" />
            <ChartSkeleton className="lg:col-span-6 h-64" title="3. Service Client Performance" />
            <ChartSkeleton className="lg:col-span-6 h-64" title="4. Application Pipeline Distribution" />
            <ChartSkeleton className="lg:col-span-12 h-64" title="5. Daily Application Events" />
          </div>
        }
      >
        <AdminCharts
          targetVsAppsData={targetVsAppsData}
          completionTrendData={completionTrendData}
          clientComparisonData={clientComparisonData}
          statusDistributionData={statusDistributionData}
          selectedClientId={selectedClientId}
          currentClient={currentClient}
          totalDailyTarget={totalDailyTarget}
          applicationsSubmitted={applicationsSubmitted}
          availableEmployees={availableEmployees}
          selectedDate={selectedDate}
        />
      </Suspense>

      {/* 5. RECRUITER AUDIT DRILLDOWN MODAL */}
      <Modal
        isOpen={isDrilldownOpen}
        onClose={() => setIsDrilldownOpen(false)}
        title={`Backfilled Uploads Audit — ${drilldownRecruiterName}`}
        subtitle="Resumes uploaded today for work completed on earlier dates"
        maxWidth="max-w-4xl"
      >
        <div className="p-4 sm:p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-caption text-amber-900 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Immutable Audit Trail: </strong>
              These resumes were uploaded today, but are credited toward the recruiter's productivity on the earlier Work Date selected during upload. Actual upload timestamps (<code className="bg-amber-100/70 px-1 py-0.5 rounded font-mono text-[11px]">created_at</code>) remain immutable.
            </div>
          </div>

          {drilldownLoading ? (
            <div className="py-12 text-center text-caption text-[#64748B] flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#0D6EFD]" />
              <span>Loading backfilled audit details...</span>
            </div>
          ) : drilldownItems.length === 0 ? (
            <div className="py-12 text-center text-[#64748B]">
              <FileText className="w-10 h-10 text-[#CBD5E1] mx-auto mb-2" />
              <p className="text-small font-semibold text-[#081226]">No Backfilled Uploads Today</p>
              <p className="text-caption mt-0.5">All work uploaded by this recruiter today was completed today.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full text-left border-collapse text-small">
                <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] text-caption font-bold text-[#64748B] uppercase">
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Hiring Organization</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-center">Work Date</th>
                    <th className="px-4 py-3 text-center">Uploaded On</th>
                    <th className="px-4 py-3 text-center">Delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {drilldownItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#081226]">
                        {item.candidate_name}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {item.company}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {item.role}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[#081226]">
                        {formatDate(item.work_date)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[#64748B]">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {item.delay_days} {item.delay_days === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default AdminDashboard;
