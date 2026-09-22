import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Button = forwardRef(({
  children,
  className,
  variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'orange' | 'dark'
  size = 'md', // 'sm' (34px), 'md' (42px), 'lg' (46px), 'icon' (38px)
  isLoading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  type = 'button',
  onClick,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all duration-180 relative overflow-hidden active:scale-[0.97] tracking-tight';

  const variants = {
    primary: 'bg-gradient-to-b from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] text-white hover:brightness-105 active:brightness-95 shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_8px_rgba(37,99,235,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_4px_16px_rgba(37,99,235,0.38),inset_0_1px_0_rgba(255,255,255,0.3)] focus-visible:ring-[#2563EB]',
    secondary: 'bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] active:bg-[#BFDBFE] border border-[#BFDBFE]/80 hover:border-[#93C5FD] focus-visible:ring-[#2563EB] shadow-2xs hover:shadow-xs',
    outline: 'bg-white text-[#081226] border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9] focus-visible:ring-[#2563EB] shadow-xs hover:shadow-sm',
    ghost: 'bg-transparent text-[#475569] hover:bg-[#F1F5F9] hover:text-[#081226] active:bg-[#E2E8F0] focus-visible:ring-[#2563EB]',
    danger: 'bg-gradient-to-b from-[#EF4444] via-[#DC2626] to-[#B91C1C] text-white hover:brightness-105 active:brightness-95 shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_8px_rgba(239,68,68,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.3)] focus-visible:ring-[#EF4444]',
    orange: 'bg-gradient-to-b from-[#FB923C] via-[#F97316] to-[#EA580C] text-white hover:brightness-105 active:brightness-95 shadow-[0_1px_2px_rgba(0,0,0,0.1),0_2px_8px_rgba(249,115,22,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_4px_16px_rgba(249,115,22,0.38),inset_0_1px_0_rgba(255,255,255,0.3)] focus-visible:ring-[#F97316]',
    dark: 'bg-gradient-to-b from-[#101F3D] via-[#0A1428] to-[#081226] text-white hover:brightness-110 active:brightness-95 border border-[#1E2E4E] shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_18px_rgba(8,18,38,0.5)] focus-visible:ring-[#081226]',
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
      whileTap={{ scale: isDisabledOrLoading ? 1 : 0.965 }}
      whileHover={{ scale: isDisabledOrLoading ? 1 : 1.01 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-105" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-105" />}
        </>
      )}
    </motion.button>
  );
});

Button.displayName = 'Button';
export default Button;
