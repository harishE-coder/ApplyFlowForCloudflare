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
    // Application & candidate pipeline statuses
    draft: {
      label: 'Draft',
      bg: 'bg-[#F1F5F9]',
      text: 'text-[#475569]',
      border: 'border-[#CBD5E1]',
      dot: 'bg-[#94A3B8]',
    },
    submitted: {
      label: 'Submitted',
      bg: 'bg-[#EFF6FF]',
      text: 'text-[#2563EB]',
      border: 'border-[#BFDBFE]',
      dot: 'bg-[#2563EB]',
    },
    applied: {
      label: 'Applied',
      bg: 'bg-[#EFF6FF]',
      text: 'text-[#2563EB]',
      border: 'border-[#BFDBFE]',
      dot: 'bg-[#2563EB]',
    },
    shortlisted: {
      label: 'Shortlisted',
      bg: 'bg-[#F0FDF4]',
      text: 'text-[#16A34A]',
      border: 'border-[#BBF7D0]',
      dot: 'bg-[#16A34A]',
    },
    hold: {
      label: 'On Hold',
      bg: 'bg-[#FFFBEB]',
      text: 'text-[#D97706]',
      border: 'border-[#FDE68A]',
      dot: 'bg-[#F59E0B]',
    },
    rejected: {
      label: 'Rejected',
      bg: 'bg-[#FEF2F2]',
      text: 'text-[#DC2626]',
      border: 'border-[#FECACA]',
      dot: 'bg-[#EF4444]',
    },
    closed: {
      label: 'Closed',
      bg: 'bg-[#F8FAFC]',
      text: 'text-[#64748B]',
      border: 'border-[#E2E8F0]',
      dot: 'bg-[#64748B]',
    },
    // Entity Statuses
    active: {
      label: 'Active',
      bg: 'bg-[#F0FDF4]',
      text: 'text-[#16A34A]',
      border: 'border-[#BBF7D0]',
      dot: 'bg-[#16A34A]',
    },
    inactive: {
      label: 'Inactive',
      bg: 'bg-[#F8FAFC]',
      text: 'text-[#94A3B8]',
      border: 'border-[#E2E8F0]',
      dot: 'bg-[#CBD5E1]',
    },
    primary: {
      label: 'Primary Recruiter',
      bg: 'bg-[#FFF7ED]',
      text: 'text-[#EA580C]',
      border: 'border-[#FFEDD5]',
      dot: 'bg-[#F97316]',
    },
    supporting: {
      label: 'Supporting',
      bg: 'bg-[#F1F5F9]',
      text: 'text-[#475569]',
      border: 'border-[#E2E8F0]',
      dot: 'bg-[#94A3B8]',
    },
  };

  const config = configs[normStatus] || {
    label: label || status,
    bg: 'bg-[#F1F5F9]',
    text: 'text-[#475569]',
    border: 'border-[#E2E8F0]',
    dot: 'bg-[#94A3B8]',
  };

  const displayLabel = label || config.label;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1.5',
    md: 'px-2.5 py-1 text-caption font-semibold gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium select-none shrink-0 transition-colors',
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
