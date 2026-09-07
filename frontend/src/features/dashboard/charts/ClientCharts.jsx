import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

export const ClientCharts = React.memo(function ClientCharts({
  progressData = [],
  clientName = 'Organization',
  appliedCount = 0,
  interviewUpdates = 0,
  offersCount = 0,
  joinedCount = 2,
}) {
  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#E2E8F0] shadow-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F1F5F9]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB] px-2.5 py-0.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE]">
              Talent Pipeline
            </span>
            <h3 className="text-h3 font-bold text-[#081226]">
              Application Progress
            </h3>
          </div>
          <p className="text-caption text-[#64748B] mt-0.5">
            Candidate progression across your hiring pipeline ({clientName}).
          </p>
        </div>

        <div className="flex items-center gap-4 text-caption font-semibold flex-wrap">
          <span className="flex items-center gap-1.5 text-[#2563EB]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" /> Applied ({appliedCount})
          </span>
          <span className="flex items-center gap-1.5 text-[#F97316]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" /> Interview ({interviewUpdates})
          </span>
          <span className="flex items-center gap-1.5 text-[#10B981]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Offer ({offersCount})
          </span>
          <span className="flex items-center gap-1.5 text-[#9333EA]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#9333EA]" /> Joined ({joinedCount})
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={progressData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="stage" stroke="#94A3B8" fontSize={13} fontWeight={600} />
            <YAxis stroke="#94A3B8" fontSize={12} />
            <Tooltip
              formatter={(val) => [`${val} Candidates`, 'Candidate Volume']}
              contentStyle={{
                backgroundColor: '#081226',
                borderRadius: '12px',
                border: '1px solid #1E2E4E',
                color: '#FFF',
              }}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {progressData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default ClientCharts;
