import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

export function Tabs({
  tabs = [],
  activeTab,
  onChange,
  variant = 'pills', // 'pills' | 'underline' | 'glass'
  layoutId = 'active-tab',
  className,
}) {
  return (
    <div
      className={cn(
        'flex items-center select-none',
        variant === 'pills' && 'bg-[#F1F5F9] p-1 rounded-2xl gap-1 border border-[#E2E8F0]/80 shadow-2xs',
        variant === 'glass' && 'glass-panel p-1 rounded-2xl gap-1 shadow-xs',
        variant === 'underline' && 'border-b border-[#E2E8F0] gap-6',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        if (variant === 'pills' || variant === 'glass') {
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative px-3.5 py-1.5 text-small font-bold rounded-xl transition-colors select-none flex items-center gap-2 cursor-pointer',
                isActive ? 'text-[#081226]' : 'text-[#64748B] hover:text-[#081226]'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId={`${layoutId}-pill`}
                  className="absolute inset-0 bg-white rounded-xl shadow-xs border border-[#E2E8F0]"
                  transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4 transition-transform group-hover:scale-105" />}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-full text-[10.5px] font-extrabold leading-none transition-colors',
                      isActive ? 'bg-[#2563EB]/10 text-[#2563EB]' : 'bg-[#E2E8F0] text-[#64748B]'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </span>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative pb-3 text-small font-bold transition-colors flex items-center gap-2 cursor-pointer',
              isActive ? 'text-[#2563EB]' : 'text-[#64748B] hover:text-[#081226]'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10.5px] font-extrabold leading-none',
                  isActive ? 'bg-[#2563EB]/10 text-[#2563EB]' : 'bg-[#F1F5F9] text-[#64748B]'
                )}
              >
                {tab.badge}
              </span>
            )}
            {isActive && (
              <motion.div
                layoutId={`${layoutId}-underline`}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"
                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
