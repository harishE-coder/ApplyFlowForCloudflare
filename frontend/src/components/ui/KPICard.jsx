import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

function useCountUp(value, duration = 750) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || value === null || value === undefined) {
      setDisplayValue(value);
      return;
    }

    const strVal = String(value).trim();
    // Match optional prefix, number, and optional suffix (e.g. "$45", "94%", "120")
    const match = strVal.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);

    if (!match) {
      setDisplayValue(value);
      return;
    }

    const prefix = match[1];
    const targetNum = parseFloat(match[2]);
    const suffix = match[3];
    const isFloat = match[2].includes('.');

    let startTime = null;
    let animFrameId = null;

    const startNum = 0;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out quad
      const ease = 1 - (1 - progress) * (1 - progress);
      const current = startNum + (targetNum - startNum) * ease;

      const formattedNum = isFloat ? current.toFixed(1) : Math.round(current).toString();
      setDisplayValue(`${prefix}${formattedNum}${suffix}`);

      if (progress < 1) {
        animFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(strVal);
      }
    };

    animFrameId = requestAnimationFrame(step);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [value, duration]);

  return displayValue;
}

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  icon: Icon,
  variant = 'default', // 'default' | 'blue' | 'orange' | 'success'
  className,
  action,
}) {
  const animatedValue = useCountUp(value);

  const iconVariants = {
    default: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
    blue: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]/60 shadow-[0_0_12px_rgba(37,99,235,0.12)]',
    orange: 'bg-[#FFF7ED] text-[#F97316] border-[#FFEDD5] shadow-[0_0_12px_rgba(249,115,22,0.12)]',
    success: 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0] shadow-[0_0_12px_rgba(22,163,74,0.12)]',
  };

  const highlightVariants = {
    default: 'via-slate-300/40',
    blue: 'via-blue-500/40',
    orange: 'via-orange-500/40',
    success: 'via-emerald-500/40',
  };

  const trendPositive = trend > 0;
  const trendNeutral = trend === 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-white p-5 rounded-[20px] border border-[#E2E8F0] shadow-card transition-all duration-200',
        'hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-elevated hover:border-[#CBD5E1]',
        'before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-transparent before:to-transparent',
        highlightVariants[variant],
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-small font-medium text-[#64748B]">{title}</p>
          <p className="text-display font-extrabold text-[#081226] tracking-tight">{animatedValue}</p>
        </div>

        {Icon && (
          <div
            className={cn(
              'w-11 h-11 rounded-full border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105',
              iconVariants[variant]
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
        {trend !== undefined ? (
          <div className="flex items-center gap-1.5 text-small">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold px-2 py-0.5 rounded-full text-caption',
                trendPositive && 'bg-[#F0FDF4] text-[#16A34A]',
                !trendPositive && !trendNeutral && 'bg-[#FEF2F2] text-[#EF4444]',
                trendNeutral && 'bg-[#F1F5F9] text-[#64748B]'
              )}
            >
              {trendPositive && <TrendingUp className="w-3.5 h-3.5" />}
              {!trendPositive && !trendNeutral && <TrendingDown className="w-3.5 h-3.5" />}
              {trendNeutral && <Minus className="w-3.5 h-3.5" />}
              {Math.abs(trend)}%
            </span>
            <span className="text-[#64748B] text-caption">{trendLabel || 'vs yesterday'}</span>
          </div>
        ) : subtitle ? (
          <p className="text-caption font-medium text-[#64748B]">{subtitle}</p>
        ) : <div />}

        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

export default KPICard;
