import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  UploadCloud,
  Users,
  Briefcase,
  Layers,
  Building2,
  UserCheck,
  ShieldCheck,
  Target,
  BarChart3,
  Bell,
  MessageSquare,
  LogOut,
  Sparkles,
  X,
  Mail,
  BrainCircuit,
} from 'lucide-react';
import { ApplyFlowLogo } from '@/assets/logo/ApplyFlowLogo';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/features/auth/AuthContext';
import { cn } from '@/utils/cn';

export function Sidebar({
  unreadNotificationsCount = 0,
  unreadChatCount = 0,
  isMobileOpen = false,
  onCloseMobile,
}) {
  const { user, logout, isAdmin, isSubAdmin, isEmployee, isClient } = useAuth();
  const location = useLocation();

  const navigationSections = [
    {
      label: 'Core Workspace',
      items: [
        {
          label: 'Dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
      ],
    },
    {
      label: 'Talent',
      items: [
        {
          label: 'Upload Resumes',
          path: '/upload',
          icon: UploadCloud,
          roles: ['employee'], // Recruiters only
          badge: 'Batch',
        },
        {
          label: 'Candidate Bank',
          path: '/candidates',
          icon: Users,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
        {
          label: 'Applications',
          path: '/applications',
          icon: Mail,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
          badge: 'AI Intake',
          badgeColor: 'blue',
        },
        {
          label: 'Workspace Chat',
          path: '/chats',
          icon: MessageSquare,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
          badge: unreadChatCount > 0 ? unreadChatCount : null,
          badgeColor: 'orange',
        },
        {
          label: 'Job Openings',
          path: '/requirements',
          icon: Layers,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
      ],
    },
    {
      label: 'Management',
      items: [
        {
          label: 'Service Clients',
          path: '/clients',
          icon: Building2,
          roles: ['admin', 'sub_admin', 'employee'],
        },
        {
          label: 'Sub-Admins',
          path: '/sub-admins',
          icon: ShieldCheck,
          roles: ['admin'], // Super Admin only
        },
        {
          label: 'Recruiters',
          path: '/recruiters',
          icon: UserCheck,
          roles: ['admin', 'sub_admin'],
        },
        {
          label: 'Recruiter Targets',
          path: '/targets',
          icon: Target,
          roles: ['admin', 'sub_admin', 'employee'],
        },
      ],
    },
    {
      label: 'Insights',
      items: [
        {
          label: 'Reports',
          path: '/reports',
          icon: BarChart3,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
        {
          label: 'AI Intelligence',
          path: '/interview-intelligence',
          icon: BrainCircuit,
          badge: 'v2.0',
          badgeColor: 'blue',
          roles: ['admin', 'sub_admin', 'employee'],
        },
        {
          label: 'Notifications',
          path: '/notifications',
          icon: Bell,
          badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : null,
          badgeColor: 'orange',
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
      ],
    },
  ];

  const sidebarInnerContent = (
    <div className="flex flex-col justify-between h-full text-white select-none">
      {/* Brand Header */}
      <div className="px-6 pt-6 pb-5 border-b border-[#101F3D] flex items-center justify-between">
        <ApplyFlowLogo variant="dark" />
        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 text-[#94A3B8] hover:text-white hover:bg-[#101F3D] rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links Scrollable Area */}
      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-6">
        {navigationSections.map((section, idx) => {
          const visibleItems = section.items.filter((item) =>
            Array.isArray(item.roles) && item.roles.includes(user?.role || 'employee')
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-1.5">
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                {section.label}
              </p>

              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    location.pathname === item.path ||
                    (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => {
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={cn(
                        'relative flex items-center justify-between px-3.5 py-2.5 min-h-[44px] rounded-xl text-small font-medium transition-all duration-150 group',
                        isActive
                          ? 'text-white'
                          : 'text-[#94A3B8] hover:text-white hover:bg-[#101F3D]/60'
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-sidebar-pill"
                          className="absolute inset-0 bg-[#2563EB] rounded-xl shadow-md"
                          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                        />
                      )}

                      <div className="relative z-10 flex items-center gap-3">
                        <Icon
                          className={cn(
                            'w-[18px] h-[18px] transition-colors',
                            isActive ? 'text-white' : 'text-[#94A3B8] group-hover:text-white'
                          )}
                        />
                        <span className="font-semibold">{item.label}</span>
                      </div>

                      {item.badge && (
                        <span
                          className={cn(
                            'relative z-10 text-[10px] font-bold px-2 py-0.5 rounded-full',
                            item.badgeColor === 'orange'
                              ? 'bg-[#F97316] text-white shadow-xs'
                              : 'bg-white/15 text-white'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recruiter Quick Status Callout */}
      {isEmployee && (
        <div className="mx-4 mb-3 p-3 rounded-2xl bg-[#101F3D]/80 border border-[#1E2E4E] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#F97316]/20 border border-[#F97316]/30 flex items-center justify-center text-[#F97316]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[12px] font-bold text-white leading-tight">Daily Recruiter Target</p>
              <p className="text-[11px] text-[#94A3B8]">Active Session</p>
            </div>
          </div>
          <span className="text-[12px] font-extrabold text-[#F97316] px-2 py-0.5 rounded bg-[#F97316]/10">
            Live
          </span>
        </div>
      )}

      {/* User Profile & Logout Footer */}
      <div className="p-4 bg-[#050C1B] border-t border-[#101F3D] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={user?.name || 'Recruiter'}
            size="sm"
            variant={isAdmin ? 'blue' : isSubAdmin ? 'purple' : 'teal'}
            status="online"
          />
          <div className="min-w-0">
            <p className="text-small font-semibold text-white truncate leading-tight">
              {user?.name || 'Recruiter'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-medium text-[#94A3B8] capitalize truncate">
                {user?.role?.replace('_', '-') || 'Recruiter'}
              </span>
              {isAdmin && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#2563EB]/30 text-[#60A5FA] border border-[#2563EB]/40">
                  Admin
                </span>
              )}
              {isSubAdmin && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#8B5CF6]/30 text-[#C4B5FD] border border-[#8B5CF6]/40">
                  Sub-Admin
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          title="Sign out"
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#101F3D] rounded-xl transition-colors shrink-0 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex w-[280px] h-[calc(100vh-48px)] my-6 ml-6 bg-[#081226] rounded-[28px] shadow-2xl flex-col justify-between border border-[#1E2E4E] shrink-0 sticky top-6 z-40 overflow-hidden">
        {sidebarInnerContent}
      </aside>

      {/* 2. Mobile & Tablet Off-Canvas Drawer (< 1024px) */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-xs z-50 transition-opacity"
            />

            {/* Slide-out Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-[290px] max-w-[85vw] bg-[#081226] z-50 shadow-2xl flex flex-col border-r border-[#1E2E4E] overflow-hidden"
            >
              {sidebarInnerContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default Sidebar;
