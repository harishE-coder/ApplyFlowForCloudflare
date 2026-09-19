import React from 'react';
import { motion } from 'framer-motion';
import { EmptyStateIllustration } from '@/assets/illustrations/ATSIllustrations';
import { Button } from './Button';
import { cn } from '@/utils/cn';

export function EmptyState({
  title = 'No records found',
  description = 'There are no items matching your criteria or active filters.',
  actionLabel,
  onAction,
  icon: Icon,
  className,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('py-12 px-6 flex flex-col items-center justify-center text-center', className)}
    >
      <div className="mb-4">
        {Icon ? (
          <div className="w-14 h-14 rounded-[20px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto mb-2 border border-[#BFDBFE]/60 shadow-[0_4px_16px_rgba(37,99,235,0.12)]">
            <Icon className="w-7 h-7" />
          </div>
        ) : (
          <EmptyStateIllustration className="w-28 h-28 mx-auto" />
        )}
      </div>

      <h4 className="text-h3 font-bold text-[#081226] tracking-tight">{title}</h4>
      <p className="text-small text-[#64748B] max-w-sm mt-1 mb-6 leading-relaxed">{description}</p>

      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction} className="shadow-sm">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}

export default EmptyState;
