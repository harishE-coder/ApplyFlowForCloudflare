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
  MessageSquare,
  Layers,
  ShieldCheck,
  UserCheck,
  Target,
  Activity,
  Command,
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
      subtitle: 'Overview, today targets, live metrics',
      icon: LayoutDashboard,
      section: 'Navigation',
      path: '/dashboard',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'upload',
      title: 'Upload Resumes',
      subtitle: 'Batch upload and parse candidate resumes',
      icon: Upload,
      section: 'Talent',
      path: '/upload',
      roles: ['employee'],
    },
    {
      id: 'candidates',
      title: 'Candidate Bank',
      subtitle: 'Split-view candidate list and resume viewer',
      icon: Users,
      section: 'Talent',
      path: '/candidates',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'apps',
      title: 'Applications & AI Intake',
      subtitle: 'Triage incoming emails and auto-parsed status',
      icon: Briefcase,
      section: 'Talent',
      path: '/applications',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'chats',
      title: 'Workspace Chat',
      subtitle: 'Internal team rooms and client messaging channels',
      icon: MessageSquare,
      section: 'Talent',
      path: '/chats',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'requirements',
      title: 'Job Openings',
      subtitle: 'Active requirements and open client positions',
      icon: Layers,
      section: 'Talent',
      path: '/requirements',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'clients',
      title: 'Service Clients',
      subtitle: 'Active corporate clients and recruiter assignments',
      icon: Building2,
      section: 'Management',
      path: '/clients',
      roles: ['admin', 'sub_admin', 'employee'],
    },
    {
      id: 'subadmins',
      title: 'Sub-Admins',
      subtitle: 'Client and recruiter scoping permissions',
      icon: ShieldCheck,
      section: 'Management',
      path: '/sub-admins',
      roles: ['admin'],
    },
    {
      id: 'recruiters',
      title: 'Recruiters Directory',
      subtitle: 'Manage recruiters, client assignments, passwords',
      icon: UserCheck,
      section: 'Management',
      path: '/recruiters',
      roles: ['admin', 'sub_admin'],
    },
    {
      id: 'targets',
      title: 'Recruiter Targets',
      subtitle: 'Daily quota tracking and history logs',
      icon: Target,
      section: 'Management',
      path: '/targets',
      roles: ['admin', 'sub_admin', 'employee'],
    },
    {
      id: 'reports',
      title: 'Reports & Exports',
      subtitle: 'Export Excel, PDF & CSV hiring analytics',
      icon: BarChart3,
      section: 'Insights',
      path: '/reports',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'notifs',
      title: 'Notifications',
      subtitle: 'System alerts, candidate submissions, targets',
      icon: Bell,
      section: 'Insights',
      path: '/notifications',
      roles: ['admin', 'sub_admin', 'employee', 'client'],
    },
    {
      id: 'perf',
      title: 'System Performance',
      subtitle: 'Latency telemetry, cache invalidation, edge health',
      icon: Activity,
      section: 'System',
      path: '/admin/performance',
      roles: ['admin', 'sub_admin'],
    },
  ];

  const term = (query || '').toLowerCase();
  const filtered = allActions.filter(
    (action) =>
      (!action.roles || (Array.isArray(action.roles) && action.roles.includes(userRole))) &&
      ((typeof action.title === 'string' && action.title.toLowerCase().includes(term)) ||
        (typeof action.subtitle === 'string' && action.subtitle.toLowerCase().includes(term)) ||
        (typeof action.section === 'string' && action.section.toLowerCase().includes(term)))
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
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#081226]/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            className="relative w-full max-w-xl bg-white/98 backdrop-blur-xl rounded-[24px] border border-[#E2E8F0] shadow-floating overflow-hidden z-10 card-bevel"
          >
            {/* Search Input Box */}
            <div className="p-4 border-b border-[#F1F5F9] flex items-center gap-3">
              <Search className="w-5 h-5 text-[#2563EB] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search workspace..."
                className="w-full text-body font-medium bg-transparent text-[#081226] placeholder-[#94A3B8] focus:outline-none"
              />
              <kbd className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] shadow-2xs">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="p-2 max-h-[360px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-[#64748B] text-small">
                  No commands matching "<span className="font-semibold text-[#081226]">{query}</span>"
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
                        'px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all duration-120 select-none group',
                        isSelected
                          ? 'bg-[#2563EB] text-white shadow-xs'
                          : 'hover:bg-[#F8FAFC] text-[#081226]'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'w-8.5 h-8.5 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150',
                            isSelected
                              ? 'bg-white/20 text-white scale-105'
                              : 'bg-[#EFF6FF] text-[#2563EB] group-hover:scale-105'
                          )}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-small font-bold truncate leading-tight">
                            {action.title}
                          </p>
                          <p
                            className={cn(
                              'text-caption truncate mt-0.5',
                              isSelected ? 'text-blue-100' : 'text-[#64748B]'
                            )}
                          >
                            {action.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            'text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-md transition-colors',
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]'
                          )}
                        >
                          {action.section}
                        </span>
                        {isSelected && <ArrowRight className="w-4 h-4 text-white shrink-0" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick footer */}
            <div className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-between text-caption text-[#64748B]">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                ApplyFlow Spotlight ⌘K
              </span>
              <div className="flex items-center gap-3">
                <span>Navigate <kbd className="font-bold text-[#081226] bg-white px-1.5 py-0.5 rounded border border-[#E2E8F0] shadow-2xs">↑↓</kbd></span>
                <span>Select <kbd className="font-bold text-[#081226] bg-white px-1.5 py-0.5 rounded border border-[#E2E8F0] shadow-2xs">↵</kbd></span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
