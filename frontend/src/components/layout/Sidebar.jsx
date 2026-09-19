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
  ChevronRight,
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
      label: 'Talent & Intake',
      items: [
        {
          label: 'Upload Resumes',
          path: '/upload',
          icon: UploadCloud,
          roles: ['employee'], // Recruiters only
          badge: 'Batch',
          badgeColor: 'blue',
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
          badge: unreadChatCount > 0 ? (unreadChatCount > 99 ? '99+' : unreadChatCount) : null,
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
      label: 'Insights & System',
      items: [
        {
          label: 'Reports',
          path: '/reports',
          icon: BarChart3,
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
        {
          label: 'Notifications',
          path: '/notifications',
          icon: Bell,
          badge: unreadNotificationsCount > 0 ? (unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount) : null,
          badgeColor: 'orange',
          roles: ['admin', 'sub_admin', 'employee', 'client'],
        },
      ],
    },
  ];

  const sidebarInnerContent = (
    <div className="flex flex-col justify-between h-full text-white select-none relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#2563EB]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 left-0 w-36 h-36 bg-[#F97316]/8 rounded-full blur-2xl pointer-events-none" />

      {/* Brand Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#101F3D]/90 flex items-center justify-between shrink-0 relative z-10">
        <ApplyFlowLogo variant="dark" />
        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 text-[#94A3B8] hover:text-white hover:bg-[#101F3D] rounded-xl transition-all duration-150 cursor-pointer active:scale-95"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links Scrollable Area */}
      <div className="px-3.5 py-4 flex-1 overflow-y-auto space-y-6 dark-scroll relative z-10">
        {navigationSections.map((section, idx) => {
          const visibleItems = section.items.filter((item) =>
            Array.isArray(item.roles) && item.roles.includes(user?.role || 'employee')
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-1">
              <p className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                {section.label}
              </p>

              <div className="space-y-0.5">
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
                        'relative flex items-center justify-between px-3.5 py-2.5 min-h-[42px] rounded-[13px] text-small font-medium transition-all duration-150 group',
                        isActive
                          ? 'text-white font-semibold'
                          : 'text-[#94A3B8] hover:text-white hover:bg-[#101F3D]/60'
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-sidebar-pill"
                          className="absolute inset-0 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] rounded-[13px] shadow-[0_2px_16px_rgba(37,99,235,0.45)] border border-blue-400/20"
                          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                        />
                      )}

                      <div className="relative z-10 flex items-center gap-3 min-w-0">
                        <Icon
                          className={cn(
                            'w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110',
                            isActive ? 'text-white drop-shadow-xs' : 'text-[#94A3B8] group-hover:text-white'
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>

                      <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                        {item.badge && (
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full transition-all duration-150',
                              item.badgeColor === 'orange'
                                ? 'bg-[#F97316] text-white shadow-[0_0_10px_rgba(249,115,22,0.5)] animate-pulse'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                        {isActive && (
                          <ChevronRight className="w-3.5 h-3.5 text-blue-200/80 shrink-0" />
                        )}
                      </div>
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
        <div className="mx-3.5 mb-3 p-3 rounded-2xl bg-gradient-to-b from-[#101F3D]/90 to-[#0A1428] border border-[#1E2E4E] shadow-sm relative z-10">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-[#F97316]/20 border border-[#F97316]/30 flex items-center justify-center text-[#F97316] shrink-0">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold text-white truncate leading-tight">Daily Recruiter Target</p>
                <p className="text-[10.5px] text-[#94A3B8] truncate">Pipeline tracking active</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#F97316] px-2 py-0.5 rounded-full bg-[#F97316]/15 border border-[#F97316]/25 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] animate-pulse" />
              Live
            </span>
          </div>
        </div>
      )}

      {/* User Profile & Logout Footer */}
      <div className="p-3.5 bg-[#050C1B] border-t border-[#101F3D]/90 flex items-center justify-between gap-2.5 shrink-0 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <Avatar
              name={user?.name || 'Recruiter'}
              size="sm"
              variant={isAdmin ? 'blue' : isSubAdmin ? 'purple' : 'teal'}
              status="online"
            />
          </div>
          <div className="min-w-0">
            <p className="text-small font-bold text-white truncate leading-tight">
              {user?.name || 'Recruiter'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-medium text-[#94A3B8] capitalize truncate">
                {user?.role?.replace('_', '-') || 'Recruiter'}
              </span>
              {isAdmin && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#2563EB]/25 text-[#60A5FA] border border-[#2563EB]/40 shrink-0">
                  Admin
                </span>
              )}
              {isSubAdmin && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#8B5CF6]/25 text-[#C4B5FD] border border-[#8B5CF6]/40 shrink-0">
                  Sub-Admin
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          title="Sign out of ApplyFlow"
          className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-xl transition-all duration-150 shrink-0 cursor-pointer active:scale-95"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex w-[275px] h-[calc(100vh-40px)] my-5 ml-5 bg-[#081226] rounded-[26px] shadow-sidebar flex-col justify-between border border-[#1E2E4E] shrink-0 sticky top-5 z-40 overflow-hidden card-bevel-dark">
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
              className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-md z-50 transition-opacity"
            />

            {/* Slide-out Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 350 }}
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
