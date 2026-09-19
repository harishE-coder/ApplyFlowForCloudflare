import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-xl',
  className,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#081226]/65 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className={cn(
              'relative w-full bg-white rounded-[26px] border border-[#E2E8F0] shadow-floating overflow-hidden z-10 max-h-[92vh] flex flex-col card-bevel',
              maxWidth,
              className
            )}
          >
            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-[#F1F5F9] flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                {title && <h3 className="text-h3 font-bold text-[#081226] tracking-tight truncate">{title}</h3>}
                {subtitle && <p className="text-small text-[#64748B] mt-0.5">{subtitle}</p>}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#94A3B8] hover:text-[#081226] hover:bg-[#F1F5F9] rounded-[12px] transition-all duration-150 shrink-0 cursor-pointer active:scale-95"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-end gap-2.5 sm:gap-3 rounded-b-[26px] shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-md',
  className,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#081226]/60 backdrop-blur-xs"
          />

          {/* Drawer Content */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 350 }}
            className={cn(
              'relative w-full h-full bg-white shadow-drawer border-l border-[#E2E8F0] z-10 flex flex-col max-w-[92vw] sm:max-w-md',
              width,
              className
            )}
          >
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-[#F1F5F9] flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                {title && <h3 className="text-h3 font-bold text-[#081226] truncate">{title}</h3>}
                {subtitle && <p className="text-small text-[#64748B] mt-0.5">{subtitle}</p>}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#94A3B8] hover:text-[#081226] hover:bg-[#F1F5F9] rounded-xl transition-all duration-150 cursor-pointer active:scale-95"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-end gap-3 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
