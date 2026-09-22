import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export const EmployeeCharts = React.memo(function EmployeeCharts({ weeklyTrend = [] }) {
  return (
    <div className="bg-white rounded-[20px] border border-[#E2E8F0] card-bevel shadow-surface hover:shadow-elevated transition-shadow p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-h3 font-display font-bold text-[#081226]">
            My 7-Day Performance Trends
          </h3>
          <p className="text-caption text-[#64748B] mt-0.5">
            Personal candidate upload volume and application output.
          </p>
        </div>

        <div className="flex items-center gap-3 text-caption font-semibold">
          <span className="flex items-center gap-1.5 text-[#2563EB]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            Uploads
          </span>
          <span className="flex items-center gap-1.5 text-[#F97316]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
            Applications
          </span>
        </div>
      </div>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="date" stroke="#94A3B8" fontSize={12} />
            <YAxis stroke="#94A3B8" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#081226',
                borderRadius: '12px',
                border: '1px solid #1E2E4E',
                boxShadow: '0 8px 24px rgba(8,18,38,0.25)',
                color: '#FFF',
                padding: '8px 12px',
              }}
            />
            <Bar dataKey="uploads" name="Uploads" fill="#2563EB" radius={[6, 6, 0, 0]} />
            <Bar dataKey="applications" name="Applications" fill="#F97316" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default EmployeeCharts;
