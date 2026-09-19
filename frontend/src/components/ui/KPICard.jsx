import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

function useCountUp(value, duration = 650) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || value === null || value === undefined) {
      setDisplayValue(value);
      return;
    }

    const strVal = String(value).trim();
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
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
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
    blue: 'bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] text-[#2563EB] border-[#BFDBFE]/80 shadow-[0_2px_10px_rgba(37,99,235,0.15)]',
    orange: 'bg-gradient-to-br from-[#FFF7ED] to-[#FFEDD5] text-[#F97316] border-[#FFEDD5] shadow-[0_2px_10px_rgba(249,115,22,0.15)]',
    success: 'bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] text-[#16A34A] border-[#BBF7D0] shadow-[0_2px_10px_rgba(22,163,74,0.15)]',
  };

  const borderHighlight = {
    default: 'via-slate-200/80',
    blue: 'via-blue-500/60',
    orange: 'via-orange-500/60',
    success: 'via-emerald-500/60',
  };

  const trendPositive = trend > 0;
  const trendNeutral = trend === 0;

  return (
    <div
      className={cn(
        'group relative overflow-hidden bg-white p-5 rounded-[22px] border border-[#E2E8F0] shadow-card transition-all duration-200 card-bevel',
        'hover:-translate-y-1 hover:shadow-card-hover hover:border-[#CBD5E1]',
        'before:absolute before:inset-x-0 before:top-0 before:h-[2.5px] before:bg-gradient-to-r before:from-transparent before:to-transparent',
        borderHighlight[variant],
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[12.5px] font-semibold text-[#64748B] truncate tracking-tight">{title}</p>
          <p className="text-display font-extrabold text-[#081226] tracking-tight truncate leading-none">
            {animatedValue}
          </p>
        </div>

        {Icon && (
          <div
            className={cn(
              'w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-105 group-hover:rotate-1',
              iconVariants[variant]
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between min-h-[26px]">
        {trend !== undefined ? (
          <div className="flex items-center gap-1.5 text-small">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-bold px-2 py-0.5 rounded-full text-caption',
                trendPositive && 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]',
                !trendPositive && !trendNeutral && 'bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA]',
                trendNeutral && 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]'
              )}
            >
              {trendPositive && <TrendingUp className="w-3 h-3 stroke-[2.5]" />}
              {!trendPositive && !trendNeutral && <TrendingDown className="w-3 h-3 stroke-[2.5]" />}
              {trendNeutral && <Minus className="w-3 h-3 stroke-[2.5]" />}
              {Math.abs(trend)}%
            </span>
            <span className="text-[#64748B] text-caption">{trendLabel || 'vs yesterday'}</span>
          </div>
        ) : subtitle ? (
          <p className="text-caption font-medium text-[#64748B] truncate">{subtitle}</p>
        ) : <div />}

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default KPICard;
