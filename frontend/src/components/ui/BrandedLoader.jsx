import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

export function BrandedLoader({ size = 'md', label = 'Loading ApplyFlow ATS...' }) {
  const sizeMap = {
    sm: 'w-8 h-8 border-2',
    md: 'w-12 h-12 border-3',
    lg: 'w-16 h-16 border-4',
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 select-none">
      <div className="relative flex items-center justify-center">
        {/* Ambient glow */}
        <div className="absolute w-20 h-20 rounded-full bg-[#2563EB]/15 blur-xl pointer-events-none" />

        {/* Outer Navy Squircle Base */}
        <div className="relative w-14 h-14 rounded-2xl bg-[#081226] flex items-center justify-center shadow-elevated border border-[#1E2E4E] card-bevel-dark">
          {/* Rotating Bright Blue / Orange Ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.0, ease: 'linear' }}
            className={cn(
              'rounded-full border-t-[#2563EB] border-r-[#F97316] border-b-transparent border-l-transparent',
              sizeMap[size] || sizeMap.md
            )}
          />
          {/* Central subtle pulse point */}
          <div className="absolute w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
        </div>
      </div>

      {label && (
        <p className="mt-4 font-display text-small font-bold text-[#081226] tracking-tight animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
}

export default BrandedLoader;
