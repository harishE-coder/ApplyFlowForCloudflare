import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Button = forwardRef(({
  children,
  className,
  variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'orange' | 'dark'
  size = 'md', // 'sm' (36px), 'md' (42px), 'lg' (46px), 'icon' (40px)
  isLoading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  type = 'button',
  onClick,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all duration-150 relative overflow-hidden active:scale-[0.98]';

  const variants = {
    primary: 'bg-gradient-to-b from-[#3B82F6] to-[#2563EB] text-white hover:from-[#2563EB] hover:to-[#1D4ED8] active:from-[#1D4ED8] active:to-[#1E40AF] shadow-[0_1px_3px_rgba(37,99,235,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_4px_12px_rgba(37,99,235,0.35)] focus-visible:ring-[#2563EB]',
    secondary: 'bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] active:bg-[#BFDBFE] border border-[#BFDBFE]/80 focus-visible:ring-[#2563EB] shadow-2xs',
    outline: 'bg-white text-[#081226] border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9] focus-visible:ring-[#2563EB] shadow-xs hover:shadow-sm',
    ghost: 'bg-transparent text-[#475569] hover:bg-[#F1F5F9] hover:text-[#081226] active:bg-[#E2E8F0] focus-visible:ring-[#2563EB]',
    danger: 'bg-gradient-to-b from-[#EF4444] to-[#DC2626] text-white hover:from-[#DC2626] hover:to-[#B91C1C] active:from-[#B91C1C] active:to-[#991B1B] shadow-[0_1px_3px_rgba(239,68,68,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_4px_12px_rgba(239,68,68,0.35)] focus-visible:ring-[#EF4444]',
    orange: 'bg-gradient-to-b from-[#FB923C] to-[#F97316] text-white hover:from-[#F97316] hover:to-[#EA580C] active:from-[#EA580C] active:to-[#C2410C] shadow-[0_1px_3px_rgba(249,115,22,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_4px_12px_rgba(249,115,22,0.35)] focus-visible:ring-[#F97316]',
    dark: 'bg-gradient-to-b from-[#101F3D] to-[#081226] text-white hover:from-[#16274E] hover:to-[#101F3D] active:from-[#081226] active:to-[#040A17] border border-[#1E2E4E] shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] hover:shadow-[0_4px_14px_rgba(8,18,38,0.4)] focus-visible:ring-[#081226]',
  };

  const sizes = {
    sm: 'h-[34px] px-3 text-[12.5px] gap-1.5 rounded-[11px]',
    md: 'h-[42px] px-4 text-small gap-2 rounded-[13px]',
    lg: 'h-[46px] px-5 text-body gap-2.5 rounded-[14px]',
    icon: 'h-[38px] w-[38px] p-0 rounded-[12px]',
  };

  const isDisabledOrLoading = disabled || isLoading;

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabledOrLoading}
      onClick={onClick}
      whileTap={{ scale: isDisabledOrLoading ? 1 : 0.98 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />}
        </>
      )}
    </motion.button>
  );
});

Button.displayName = 'Button';
export default Button;
