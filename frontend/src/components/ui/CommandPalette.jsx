import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutDashboard,
  Upload,
  Users,
  Briefcase,
  Building2,
  BarChart3,
  Bell,
  Settings,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/utils/cn';

export function CommandPalette({ isOpen, onClose, userRole = 'employee' }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const allActions = [
    {
      id: 'dash',
      title: 'Go to Dashboard',
      subtitle: 'Overview, today targets, queue',
      icon: LayoutDashboard,
      section: 'Navigation',
      path: '/dashboard',
      roles: ['admin', 'employee', 'client'],
    },
    {
      id: 'upload',
      title: 'Upload Resumes',
      subtitle: 'Bulk upload and parse candidate CVs',
      icon: Upload,
      section: 'Recruitment',
      path: '/upload',
      roles: ['employee'],
    },
    {
      id: 'candidates',
      title: 'Candidate Workspace',
      subtitle: 'Split-view candidate list and resume viewer',
      icon: Users,
      section: 'Recruitment',
      path: '/candidates',
      roles: ['admin', 'employee', 'client'],
    },
    {
      id: 'apps',
      title: 'Applications Pipeline',
      subtitle: 'Kanban & Table pipeline views',
      icon: Briefcase,
      section: 'Recruitment',
      path: '/applications',
      roles: ['admin', 'employee', 'client'],
    },
    {
      id: 'clients',
      title: 'Service Clients',
      subtitle: 'Active clients and recruiter assignments',
      icon: Building2,
      section: 'Management',
      path: '/clients',
      roles: ['admin', 'employee'],
    },
    {
      id: 'reports',
      title: 'Analytics & Reports',
      subtitle: 'Export PDF & Excel recruitment metrics',
      icon: BarChart3,
      section: 'Insights',
      path: '/reports',
      roles: ['admin', 'employee', 'client'],
    },
    {
      id: 'notifs',
      title: 'Notifications',
      subtitle: 'Recent alerts and updates',
      icon: Bell,
      section: 'Insights',
      path: '/notifications',
      roles: ['admin', 'employee', 'client'],
    },
  ];

  const filtered = allActions.filter(
    (action) =>
      (!action.roles || (Array.isArray(action.roles) && action.roles.includes(userRole))) &&
      ((typeof action.title === 'string' && action.title.toLowerCase().includes(query.toLowerCase())) ||
        (typeof action.subtitle === 'string' && action.subtitle.toLowerCase().includes(query.toLowerCase())) ||
        (typeof action.section === 'string' && action.section.toLowerCase().includes(query.toLowerCase())))
  );

  const handleSelect = (action) => {
    onClose();
    if (action.path) {
      navigate(action.path);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#081226]/50 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-xl bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl overflow-hidden z-10"
          >
            {/* Search Input Box */}
            <div className="p-4 border-b border-[#F1F5F9] flex items-center gap-3">
              <Search className="w-5 h-5 text-[#94A3B8] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or jump to page..."
                className="w-full text-body bg-transparent text-[#081226] placeholder-[#94A3B8] focus:outline-none"
              />
              <span className="text-caption font-semibold px-2 py-0.5 rounded bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]">
                ESC
              </span>
            </div>

            {/* Results List */}
            <div className="p-2 max-h-[340px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-[#64748B] text-small">
                  No commands matching "{query}"
                </div>
              ) : (
                filtered.map((action, idx) => {
                  const Icon = action.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={action.id}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => handleSelect(action)}
                      className={cn(
                        'px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors select-none',
                        isSelected ? 'bg-[#2563EB] text-white' : 'hover:bg-[#F8FAFC] text-[#081226]'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            isSelected ? 'bg-white/20 text-white' : 'bg-[#EFF6FF] text-[#2563EB]'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-small font-semibold truncate leading-tight">
                            {action.title}
                          </p>
                          <p
                            className={cn(
                              'text-caption truncate mt-0.5',
                              isSelected ? 'text-white/80' : 'text-[#64748B]'
                            )}
                          >
                            {action.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            'text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded',
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]'
                          )}
                        >
                          {action.section}
                        </span>
                        {isSelected && <ArrowRight className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick footer */}
            <div className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-between text-caption text-[#64748B]">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                ApplyFlow Quick Navigation
              </span>
              <div className="flex items-center gap-2">
                <span>Navigate <kbd className="font-semibold text-[#081226]">↑↓</kbd></span>
                <span>Select <kbd className="font-semibold text-[#081226]">↵</kbd></span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
