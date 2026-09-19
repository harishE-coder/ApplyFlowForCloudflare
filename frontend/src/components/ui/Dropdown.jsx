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
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'absolute z-50 mt-2 min-w-[180px] bg-white rounded-[14px] border border-[#E2E8F0] shadow-dropdown py-1.5 focus:outline-none overflow-hidden',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              className
            )}
          >
            {items.length > 0
              ? items.map((item, index) => {
                  if (item.divider) {
                    return <div key={index} className="h-px bg-[#F1F5F9] my-1" />;
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
                        'w-full px-3.5 py-2 text-small text-left flex items-center gap-2.5 transition-colors',
                        item.danger
                          ? 'text-[#EF4444] hover:bg-[#FEF2F2]'
                          : 'text-[#081226] hover:bg-[#F8FAFC] hover:text-[#2563EB]',
                        item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                      )}
                    >
                      {Icon && <Icon className="w-4 h-4 shrink-0" />}
                      <span className="font-medium">{item.label}</span>
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
