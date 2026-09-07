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
import { Mail } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/utils/cn';

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
      <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              1. Daily Recruiter Target vs Applications
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Recruiter goal vs actual submissions for {formatDate(selectedDate)}.
            </p>
          </div>

          <div className="flex items-center gap-3 text-caption font-semibold">
            <span className="flex items-center gap-1 text-[#64748B]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#CBD5E1]" /> Recruiter Target
            </span>
            <span className="flex items-center gap-1 text-[#0D6EFD]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0D6EFD]" /> Submitted
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={targetVsAppsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="employee" stroke="#94A3B8" fontSize={12} />
              <YAxis stroke="#94A3B8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#081226',
                  borderRadius: '12px',
                  border: '1px solid #1E2E4E',
                  color: '#FFF',
                }}
              />
              <Bar dataKey="target" name="Daily Recruiter Target" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="submitted" name="Applications Submitted" fill="#0D6EFD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Target Completion Trend (7-Day Line Chart) (Col span 6) */}
      <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-h3 font-bold text-[#081226]">
              2. Target Completion Trend (7 Days)
            </h3>
            <p className="text-caption text-[#64748B] mt-0.5">
              Daily completion consistency over the last seven days.
            </p>
          </div>

          <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A]">
            100% Benchmark
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={completionTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} />
              <YAxis domain={[0, 120]} stroke="#94A3B8" fontSize={12} unit="%" />
              <Tooltip
                formatter={(val) => [`${val}%`, 'Completion']}
                contentStyle={{
                  backgroundColor: '#081226',
                  borderRadius: '12px',
                  border: '1px solid #1E2E4E',
                  color: '#FFF',
                }}
              />
              <Line
                type="monotone"
                dataKey="completion"
                stroke="#FF8A00"
                strokeWidth={3}
                dot={{ r: 5, fill: '#FF8A00', strokeWidth: 2, stroke: '#FFF' }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Client Performance Comparison (Col span 6) */}
      {!selectedClientId ? (
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-h3 font-bold text-[#081226]">
                3. Service Client Performance
              </h3>
              <p className="text-caption text-[#64748B] mt-0.5">
                Completion percentage by Service Client account.
              </p>
            </div>
            <span className="text-caption font-bold text-[#0D6EFD]">All Service Clients View</span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {clientComparisonData.length === 0 ? (
              <p className="text-caption text-[#94A3B8]">No active service client telemetry to display</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={clientComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 120]} stroke="#94A3B8" fontSize={12} unit="%" />
                  <YAxis type="category" dataKey="client" stroke="#94A3B8" fontSize={12} width={100} />
                  <Tooltip
                    formatter={(val) => [`${val}%`, 'Completion']}
                    contentStyle={{
                      backgroundColor: '#081226',
                      borderRadius: '12px',
                      border: '1px solid #1E2E4E',
                      color: '#FFF',
                    }}
                  />
                  <Bar dataKey="completion" fill="#16A34A" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      ) : (
        /* Client Detail Highlight when specific client is selected */
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-3">
              <Avatar name={currentClient?.company_name || 'Client'} size="md" variant="blue" />
              <div>
                <h3 className="text-h3 font-bold text-[#081226]">{currentClient?.company_name}</h3>
                <p className="text-caption text-[#64748B]">Service Client Target Telemetry</p>
              </div>
            </div>
            <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#0D6EFD]">
              Account Scoped
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center">
              <p className="text-caption font-bold uppercase text-[#64748B]">Recruiter Target Quota</p>
              <p className="text-h2 font-extrabold text-[#081226] mt-0.5">{totalDailyTarget}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#EFF6FF]/60 border border-[#BFDBFE] text-center">
              <p className="text-caption font-bold uppercase text-[#0D6EFD]">Submitted</p>
              <p className="text-h2 font-extrabold text-[#0D6EFD] mt-0.5">{applicationsSubmitted}</p>
            </div>
          </div>

          <p className="text-caption text-[#475569] leading-relaxed">
            Assigned recruiters for {currentClient?.company_name}:{' '}
            <strong className="text-[#081226]">
              {availableEmployees.map((e) => e.name).join(', ') || 'Recruiter Assigned'}
            </strong>
          </p>
        </div>
      )}

      {/* Chart 4: Application Status Distribution (Donut / Pie) (Col span 6) */}
      <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4 flex flex-col justify-between h-full">
        <div>
          <h3 className="text-h3 font-bold text-[#081226]">
            4. Application Pipeline Distribution
          </h3>
          <p className="text-caption text-[#64748B] mt-0.5">
            Live submission mix across all candidate review stages.
          </p>
        </div>

        <div className="h-56 w-full flex items-center justify-center">
          {statusDistributionData.length === 0 ? (
            <p className="text-caption text-[#94A3B8]">No application statuses recorded yet</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#081226',
                    borderRadius: '12px',
                    border: '1px solid #1E2E4E',
                    color: '#FFF',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status color legend */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F1F5F9]">
          {statusDistributionData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5 text-caption">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[#475569] truncate font-medium">{item.name}:</span>
              <span className="font-bold text-[#081226]">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart 5: Daily Application Events (Col span 12) */}
      <div className="lg:col-span-12 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB] px-2.5 py-0.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]">
                AI Intake
              </span>
              <h3 className="text-h3 font-bold text-[#081226]">
                5. Daily Application Events (New Applications vs Follow-up Updates)
              </h3>
            </div>
            <p className="text-caption text-[#64748B] mt-0.5">
              Recruiter positive response volume: newly created candidate records vs progression rounds.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-caption font-semibold">
              <span className="flex items-center gap-1 text-[#2563EB]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" /> New Applications
              </span>
              <span className="flex items-center gap-1 text-[#F97316]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" /> Follow-up Updates
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={Mail}
              onClick={() => (window.location.href = '/applications')}
              className="h-[36px] text-xs font-bold text-[#2563EB] border-[#BFDBFE] hover:bg-[#EFF6FF]"
            >
              Open Applications →
            </Button>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { day: 'Mon', new: 8, followup: 4 },
                { day: 'Tue', new: 10, followup: 6 },
                { day: 'Wed', new: 7, followup: 9 },
                { day: 'Thu', new: 12, followup: 5 },
                { day: 'Fri', new: 9, followup: 8 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} />
              <YAxis stroke="#94A3B8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#081226',
                  borderRadius: '12px',
                  border: '1px solid #1E2E4E',
                  color: '#FFF',
                }}
              />
              <Bar dataKey="new" name="New Applications" fill="#2563EB" radius={[6, 6, 0, 0]} />
              <Bar dataKey="followup" name="Follow-up Updates" fill="#F97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

export default AdminCharts;
