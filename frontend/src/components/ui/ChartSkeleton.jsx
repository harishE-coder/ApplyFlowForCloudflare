import React from 'react';
import { cn } from '@/utils/cn';

export function ChartSkeleton({ height = 'h-64', className, title, subtitle }) {
  return (
    <div
      className={cn(
        'bg-white p-6 rounded-[22px] border border-[#E2E8F0] shadow-card space-y-4 card-bevel',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          {title ? (
            <div className="font-display text-h3 font-bold text-[#081226]">{title}</div>
          ) : (
            <div className="h-5 w-48 skeleton-shimmer rounded-lg" />
          )}
          {subtitle ? (
            <div className="text-caption text-[#64748B]">{subtitle}</div>
          ) : (
            <div className="h-3.5 w-64 skeleton-shimmer rounded-lg" />
          )}
        </div>
        <div className="h-4 w-20 skeleton-shimmer rounded-full" />
      </div>

      <div className={cn('w-full rounded-2xl bg-[#F8FAFC]/80 flex items-center justify-center p-6', height)}>
        <div className="flex items-end gap-3.5 h-32 w-full justify-center opacity-60">
          <div className="w-9 skeleton-shimmer rounded-t-xl h-16" />
          <div className="w-9 bg-[#2563EB]/40 rounded-t-xl h-28" />
          <div className="w-9 skeleton-shimmer rounded-t-xl h-20" />
          <div className="w-9 bg-[#2563EB]/60 rounded-t-xl h-32" />
          <div className="w-9 skeleton-shimmer rounded-t-xl h-14" />
          <div className="w-9 bg-[#2563EB]/40 rounded-t-xl h-24" />
        </div>
      </div>
    </div>
  );
}

export default ChartSkeleton;
