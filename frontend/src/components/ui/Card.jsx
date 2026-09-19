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
  hoverable = false,
  onClick,
  ...props
}) {
  const isInteractive = hoverable || Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-[20px] border border-[#E2E8F0] shadow-card transition-all duration-200',
        isInteractive && 'hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-elevated hover:border-[#CBD5E1] cursor-pointer',
        className
      )}
      {...props}
    >
      {(title || header || action) && (
        <div className="px-5 pt-5 pb-3.5 flex items-center justify-between gap-4 border-b border-[#F1F5F9]">
          {header || (
            <div>
              {title && <h3 className="text-h3 font-semibold text-[#081226] tracking-tight">{title}</h3>}
              {subtitle && <p className="text-small text-[#64748B] mt-0.5">{subtitle}</p>}
            </div>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={cn('p-5', (title || header) && 'pt-4')}>{children}</div>

      {footer && (
        <div className="px-5 py-3.5 bg-[#F8FAFC]/70 border-t border-[#F1F5F9] rounded-b-[20px] flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  );
}

export default Card;
