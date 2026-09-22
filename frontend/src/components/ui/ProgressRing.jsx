import React, { useId } from 'react';
import { cn } from '@/utils/cn';

export function ProgressRing({
  progress = 0, // 0 to 100
  size = 110,
  strokeWidth = 10,
  color = '#F97316', // Orange used for progress & targets
  trackColor = '#F1F5F9',
  label,
  valueText,
  className,
}) {
  const uid = useId().replace(/:/g, '');
  const gradientId = `ringGradient-${uid}`;
  const visualProgress = Math.min(Math.max(progress, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (visualProgress / 100) * circumference;
  const isOver100 = progress >= 100;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isOver100 ? '#10B981' : color} />
            <stop offset="100%" stopColor={isOver100 ? '#059669' : '#EA580C'} />
          </linearGradient>
        </defs>

        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out drop-shadow-xs"
        />
      </svg>

      {/* Center Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
        <span className={cn('font-display text-[20px] font-extrabold tracking-tight leading-none', isOver100 ? 'text-[#10B981]' : 'text-[#081226]')}>
          {valueText || `${Math.round(Math.max(progress, 0))}%`}
        </span>
        {label && (
          <span className="text-[11px] font-semibold text-[#64748B] mt-1 leading-none">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export default ProgressRing;
