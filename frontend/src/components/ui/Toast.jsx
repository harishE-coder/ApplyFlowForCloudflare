import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/utils/cn';

const ToastContext = createContext(null);

function formatToastMessage(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) {
    return msg
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && item.msg) {
          const loc = item.loc ? `${item.loc.filter((l) => l !== 'body').join('.')}: ` : '';
          return `${loc}${item.msg}`;
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (typeof msg === 'object') {
    if (msg.msg) return msg.msg;
    if (msg.detail) return formatToastMessage(msg.detail);
    if (msg.message) return msg.message;
    return JSON.stringify(msg);
  }
  return String(msg);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(({ title, message, type = 'info', duration = 4000 }) => {
    const formattedTitle = formatToastMessage(title);
    const formattedMessage = formatToastMessage(message);
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title: formattedTitle, message: formattedMessage, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  const success = useCallback((title, message, duration = 4000) => addToast({ title, message, type: 'success', duration }), [addToast]);
  const error = useCallback((title, message, duration = 5000) => addToast({ title, message, type: 'error', duration }), [addToast]);
  const warning = useCallback((title, message, duration = 4000) => addToast({ title, message, type: 'warning', duration }), [addToast]);
  const info = useCallback((title, message, duration = 4000) => addToast({ title, message, type: 'info', duration }), [addToast]);

  const value = useMemo(
    () => ({ addToast, removeToast, success, error, warning, info }),
    [addToast, removeToast, success, error, warning, info]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastItem({ toast, onClose }) {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />,
    error: <AlertCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />,
    info: <Info className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />,
  };

  const tintStyles = {
    success: 'bg-white/95 border-emerald-300/80 shadow-[0_12px_36px_rgba(16,185,129,0.18)]',
    error: 'bg-white/95 border-rose-300/80 shadow-[0_12px_36px_rgba(239,68,68,0.18)]',
    warning: 'bg-white/95 border-amber-300/80 shadow-[0_12px_36px_rgba(245,158,11,0.18)]',
    info: 'bg-white/95 border-blue-300/80 shadow-[0_12px_36px_rgba(37,99,235,0.18)]',
  };

  const ambientGlow = {
    success: 'bg-[#10B981]/10',
    error: 'bg-[#EF4444]/10',
    warning: 'bg-[#F59E0B]/10',
    info: 'bg-[#2563EB]/10',
  };

  const progressColors = {
    success: 'bg-[#10B981]',
    error: 'bg-[#EF4444]',
    warning: 'bg-[#F59E0B]',
    info: 'bg-[#2563EB]',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, y: 12, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.92, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', damping: 26, stiffness: 380 }}
      className={cn(
        'pointer-events-auto relative rounded-[20px] border p-4 flex items-start justify-between gap-3 overflow-hidden backdrop-blur-2xl card-bevel shadow-elevated',
        tintStyles[toast.type]
      )}
    >
      {/* Ambient background glow */}
      <div className={cn('absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl pointer-events-none', ambientGlow[toast.type])} />

      <div className="relative z-10 flex items-start gap-3 min-w-0 flex-1">
        {icons[toast.type]}
        <div className="min-w-0 flex-1">
          {toast.title && <h5 className="font-display text-[13.5px] font-bold text-[#081226] leading-tight truncate">{toast.title}</h5>}
          {toast.message && <p className="text-caption text-[#64748B] mt-0.5 leading-relaxed break-words font-medium">{toast.message}</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="relative z-10 p-1 min-h-[28px] min-w-[28px] flex items-center justify-center text-[#94A3B8] hover:text-[#081226] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
        aria-label="Dismiss toast"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Auto-dismiss progress bar */}
      {toast.duration > 0 && (
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: toast.duration / 1000, ease: 'linear' }}
          className={cn('absolute bottom-0 left-0 h-[2.5px]', progressColors[toast.type])}
        />
      )}
    </motion.div>
  );
}

export default ToastProvider;
