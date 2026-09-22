import React from 'react';
import { cn } from '@/utils/cn';

export function Card({
  children,
  className,
  header,
  footer,
  action,
  title,
  subtitle,
  variant = 'default', // 'default' | 'glass' | 'dark'
  hoverable = false,
  onClick,
  ...props
}) {
  const isInteractive = hoverable || Boolean(onClick);

  const variantStyles = {
    default: 'bg-white border-[#E2E8F0] card-bevel',
    glass: 'glass-panel',
    dark: 'bg-[#081226] border-[#1E2E4E] card-bevel-dark text-white',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-[22px] border shadow-card transition-all duration-200',
        variantStyles[variant] || variantStyles.default,
        isInteractive && 'hover:-translate-y-0.5 hover:shadow-card-hover hover:border-[#CBD5E1] cursor-pointer active:scale-[0.995]',
        className
      )}
      {...props}
    >
      {(title || header || action) && (
        <div className={cn(
          'px-5 pt-5 pb-3.5 flex items-center justify-between gap-4 border-b',
          variant === 'dark' ? 'border-[#1E2E4E]' : 'border-[#F1F5F9]'
        )}>
          {header || (
            <div>
              {title && (
                <h3 className={cn(
                  'text-h3 font-bold tracking-tight',
                  variant === 'dark' ? 'text-white' : 'text-[#081226]'
                )}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className={cn(
                  'text-small mt-0.5',
                  variant === 'dark' ? 'text-[#94A3B8]' : 'text-[#64748B]'
                )}>
                  {subtitle}
                </p>
              )}
            </div>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={cn('p-5', (title || header) && 'pt-4')}>{children}</div>

      {footer && (
        <div className={cn(
          'px-5 py-3.5 border-t rounded-b-[22px] flex items-center justify-between',
          variant === 'dark' ? 'bg-[#050C1B] border-[#1E2E4E]' : 'bg-[#F8FAFC]/80 border-[#F1F5F9]'
        )}>
          {footer}
        </div>
      )}
    </div>
  );
}

export default Card;
