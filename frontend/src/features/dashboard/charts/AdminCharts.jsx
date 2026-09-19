import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { Mail, TrendingUp } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/utils/cn';

const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#081226]/95 backdrop-blur-xl border border-[#1E2E4E] rounded-[14px] p-3 shadow-floating text-white text-caption select-none">
        <p className="font-bold text-[12px] text-blue-200 mb-1.5">{label}</p>
        <div className="space-y-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-3 text-[11.5px]">
              <span className="flex items-center gap-1.5 text-[#94A3B8]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const AdminCharts = React.memo(function AdminCharts({
  targetVsAppsData = [],
  completionTrendData = [],
  clientComparisonData = [],
  statusDistributionData = [],
  selectedClientId = '',
  currentClient = null,
  totalDailyTarget = 0,
  applicationsSubmitted = 0,
  availableEmployees = [],
  selectedDate = '',
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Chart 1: Daily Target vs Applications (Bar Chart) (Col span 6) */}
      <div className="lg:col-span-6 bg-white p-5 rounded-[24px] border border-[#E2E8F0] shadow-card hover:shadow-card-hover transition-all duration-200 space-y-4 card-bevel">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              1. Daily Recruiter Target vs Applications
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Recruiter goal vs actual submissions for {formatDate(selectedDate)}.
            </p>
          </div>

          <div className="flex items-center gap-2.5 text-caption font-semibold shrink-0">
            <span className="flex items-center gap-1 text-[#64748B]">
              <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" /> Target
            </span>
            <span className="flex items-center gap-1 text-[#2563EB]">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]" /> Submitted
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={targetVsAppsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="employee" stroke="#94A3B8" fontSize={11.5} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11.5} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomChartTooltip />} />
              <Bar dataKey="target" name="Daily Target" fill="#CBD5E1" radius={[6, 6, 0, 0]} />
              <Bar dataKey="submitted" name="Applications Submitted" fill="#2563EB" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Target Completion Trend (7-Day Line Chart) (Col span 6) */}
      <div className="lg:col-span-6 bg-white p-5 rounded-[24px] border border-[#E2E8F0] shadow-card hover:shadow-card-hover transition-all duration-200 space-y-4 card-bevel">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              2. Target Completion Trend (7 Days)
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Daily completion consistency over the last seven days.
            </p>
          </div>

          <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] shrink-0">
            100% Benchmark
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={completionTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="date" stroke="#94A3B8" fontSize={11.5} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11.5} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomChartTooltip />} />
              <Line
                type="monotone"
                dataKey="completionRate"
                name="Completion %"
                stroke="#16A34A"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#16A34A', strokeWidth: 2, stroke: '#FFF' }}
                activeDot={{ r: 6, fill: '#16A34A', stroke: '#FFF', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Client Distribution / Comparison (Bar Chart) (Col span 6) */}
      <div className="lg:col-span-6 bg-white p-5 rounded-[24px] border border-[#E2E8F0] shadow-card hover:shadow-card-hover transition-all duration-200 space-y-4 card-bevel">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              3. Service Client Workload
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Candidate volume and open requirements per client account.
            </p>
          </div>

          <div className="flex items-center gap-2.5 text-caption font-semibold shrink-0">
            <span className="flex items-center gap-1 text-[#2563EB]">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]" /> Candidates
            </span>
            <span className="flex items-center gap-1 text-[#F97316]">
              <span className="w-2 h-2 rounded-full bg-[#F97316]" /> Open Jobs
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={clientComparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="client" stroke="#94A3B8" fontSize={11.5} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11.5} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomChartTooltip />} />
              <Bar dataKey="resumes" name="Resumes" fill="#2563EB" radius={[6, 6, 0, 0]} />
              <Bar dataKey="requirements" name="Open Positions" fill="#F97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 4: Status Distribution (Donut Chart) (Col span 6) */}
      <div className="lg:col-span-6 bg-white p-5 rounded-[24px] border border-[#E2E8F0] shadow-card hover:shadow-card-hover transition-all duration-200 space-y-4 card-bevel">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              4. Candidate Pipeline Stages
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Distribution of candidates across recruitment stages.
            </p>
          </div>

          <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] shrink-0">
            Active Pipeline
          </span>
        </div>

        <div className="h-64 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomChartTooltip />} />
              <Pie
                data={statusDistributionData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
              >
                {statusDistributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || '#2563EB'} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

export default AdminCharts;
