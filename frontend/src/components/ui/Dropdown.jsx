import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';

export function Dropdown({
  trigger,
  items = [],
  children,
  align = 'right', // 'left' | 'right'
  className,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className={cn(
              'absolute z-50 mt-2 min-w-[200px] bg-white/95 backdrop-blur-xl rounded-[16px] border border-[#E2E8F0] shadow-dropdown p-1.5 focus:outline-none overflow-hidden card-bevel',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              className
            )}
          >
            {items.length > 0
              ? items.map((item, index) => {
                  if (item.divider) {
                    return <div key={index} className="h-px bg-[#F1F5F9] my-1 mx-1.5" />;
                  }

                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick?.();
                        setIsOpen(false);
                      }}
                      className={cn(
                        'w-full px-3 py-2 text-small rounded-[11px] text-left flex items-center justify-between gap-2.5 transition-all duration-120 group cursor-pointer active:scale-[0.98]',
                        item.danger
                          ? 'text-[#EF4444] hover:bg-[#FEF2F2] hover:text-[#DC2626]'
                          : 'text-[#081226] hover:bg-[#F1F5F9] hover:text-[#2563EB]',
                        item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {Icon && (
                          <Icon
                            className={cn(
                              'w-4 h-4 shrink-0 transition-colors',
                              item.danger ? 'text-[#EF4444]' : 'text-[#64748B] group-hover:text-[#2563EB]'
                            )}
                          />
                        )}
                        <span className="font-semibold text-[13px] truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })
              : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dropdown;
