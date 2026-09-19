import React from 'react';
import { cn } from '@/utils/cn';

export function StatusBadge({
  status = 'draft',
  label,
  showDot = true,
  size = 'md', // 'sm' | 'md'
  className,
}) {
  const normStatus = String(status || '').toLowerCase().trim();

  const configs = {
    // Pipeline statuses
    draft: {
      label: 'Draft',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300/80',
      dot: 'bg-slate-400',
    },
    submitted: {
      label: 'Submitted',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      dot: 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]',
    },
    applied: {
      label: 'Applied',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      dot: 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]',
    },
    shortlisted: {
      label: 'Shortlisted',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      dot: 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.6)]',
    },
    'round 1': {
      label: 'Round 1',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]',
    },
    'round 2': {
      label: 'Round 2',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]',
    },
    technical: {
      label: 'Technical',
      bg: 'bg-orange-50',
      text: 'text-orange-800',
      border: 'border-orange-200',
      dot: 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)]',
    },
    interview: {
      label: 'Interview',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]',
    },
    offer: {
      label: 'Offer',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse',
    },
    joined: {
      label: 'Joined',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
    },
    hold: {
      label: 'On Hold',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
    },
    rejected: {
      label: 'Rejected',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
    },
    closed: {
      label: 'Closed',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      dot: 'bg-slate-400',
    },
    archived: {
      label: 'Archived',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      dot: 'bg-slate-400',
    },

    // Entity Statuses
    active: {
      label: 'Active',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]',
    },
    inactive: {
      label: 'Inactive',
      bg: 'bg-slate-100',
      text: 'text-slate-500',
      border: 'border-slate-200',
      dot: 'bg-slate-400',
    },
    primary: {
      label: 'Primary Recruiter',
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      dot: 'bg-orange-500',
    },
    supporting: {
      label: 'Supporting',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      dot: 'bg-slate-400',
    },

    // Priority Statuses
    urgent: {
      label: 'Urgent',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-300',
      dot: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)] animate-pulse',
    },
    high: {
      label: 'High',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-300',
      dot: 'bg-amber-500',
    },
    medium: {
      label: 'Medium',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      dot: 'bg-blue-500',
    },
    low: {
      label: 'Low',
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      dot: 'bg-slate-400',
    },
  };

  const config = configs[normStatus] || {
    label: label || status,
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  };

  const displayLabel = label || config.label;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1.5 font-semibold',
    md: 'px-2.5 py-1 text-caption font-bold gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border select-none shrink-0 transition-all duration-150 shadow-2xs',
        config.bg,
        config.text,
        config.border,
        sizeClasses[size],
        className
      )}
    >
      {showDot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />}
      <span className="capitalize">{displayLabel}</span>
    </span>
  );
}

export default StatusBadge;
