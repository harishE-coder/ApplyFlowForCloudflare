import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Calendar,
  Bell,
  Clock,
  CheckCircle2,
  LogOut,
  ChevronDown,
  Building,
  User,
  Sparkles,
  Command,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { formatDate, cn } from '@/utils/cn';

export function TopBar({
  onOpenCommandPalette,
  unreadCount = 0,
  notifications = [],
  onRefreshNotifications,
  onToggleMobileSidebar,
}) {
  const { user, logout, isEmployee, isAdmin, isSubAdmin } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [attendance, setAttendance] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Fetch employee attendance
  useEffect(() => {
    if (isEmployee) {
      api
        .get('/attendance/status')
        .then((res) => setAttendance(res.data))
        .catch(() => {});
    }
  }, [isEmployee]);

  const handleToggleAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      if (attendance?.is_active) {
        const res = await api.post('/attendance/check-out');
        setAttendance(res.data);
        success('Checked Out', `Session ended. Total hours: ${res.data.total_hours || 0} hrs`);
      } else {
        const res = await api.post('/attendance/check-in');
        setAttendance(res.data);
        success('Checked In', 'Daily ATS work session activated.');
      }
    } catch (err) {
      error('Attendance Error', err.response?.data?.detail || 'Failed to update attendance');
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendance, error, success]);

  const todayStr = useMemo(() => formatDate(new Date()), []);

  const profileMenuItems = useMemo(
    () => [
      {
        label: user?.name || 'Recruiter Account',
        icon: User,
        onClick: () => {},
      },
      {
        divider: true,
      },
      {
        label: 'Sign Out',
        icon: LogOut,
        danger: true,
        onClick: logout,
      },
    ],
    [user?.name, logout]
  );

  return (
    <header className="sticky top-2 lg:static z-30 h-[64px] sm:h-[70px] mx-2 sm:mx-4 lg:mx-6 mt-2 sm:mt-4 lg:mt-5 mb-3 sm:mb-4 px-3 sm:px-5 lg:px-6 glass-panel rounded-[24px] flex items-center justify-between gap-2 sm:gap-4 select-none">
      {/* Left: Mobile Hamburger Toggle + Brand / Search Trigger */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {/* Hamburger Menu (Mobile/Tablet only) */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 min-h-[42px] min-w-[42px] flex items-center justify-center text-[#081226] hover:bg-[#F1F5F9] rounded-xl transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Brand Name */}
        <div className="lg:hidden font-display font-extrabold text-sm sm:text-base text-[#081226] tracking-tight shrink-0 flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] flex items-center justify-center text-white text-[12px] font-black shadow-[0_0_10px_rgba(37,99,235,0.3)]">
            AF
          </div>
          <span className="hidden xs:inline font-bold">ApplyFlow</span>
        </div>

        {/* Search / Command Palette Trigger */}
        <div className="flex-1 max-w-md min-w-0">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full h-[38px] sm:h-[42px] px-3 sm:px-4 rounded-xl text-small bg-[#F8FAFC]/90 text-[#64748B] border border-[#E2E8F0] hover:border-[#BFDBFE] hover:bg-white hover:shadow-[0_2px_12px_rgba(37,99,235,0.08)] flex items-center justify-between transition-all duration-150 cursor-pointer min-w-0 group"
          >
            <div className="flex items-center gap-2.5 min-w-0 truncate">
              <Search className="w-4 h-4 text-[#94A3B8] group-hover:text-[#2563EB] transition-colors shrink-0" />
              <span className="text-[#94A3B8] group-hover:text-[#475569] font-medium truncate hidden sm:inline text-small transition-colors">
                Search candidates, jobs, quick jump...
              </span>
              <span className="text-[#94A3B8] font-medium truncate sm:hidden text-small">
                Search...
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1">
              <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10.5px] font-extrabold text-[#64748B] bg-white border border-[#E2E8F0] rounded-md shadow-2xs group-hover:border-[#BFDBFE] group-hover:text-[#2563EB] transition-colors shrink-0">
                <Command className="w-3 h-3" />
                <span>K</span>
              </kbd>
            </div>
          </button>
        </div>
      </div>

      {/* Right: Actions, Date, Attendance, Notifications, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Date Display (Desktop only) */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-caption text-[#64748B] font-semibold shadow-2xs">
          <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
          <span>{todayStr}</span>
        </div>

        {/* Recruiter Live Work Session Button */}
        {isEmployee && (
          <button
            type="button"
            onClick={handleToggleAttendance}
            disabled={attendanceLoading}
            className={cn(
              'h-[38px] sm:h-[42px] px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-small font-bold flex items-center gap-2 transition-all duration-150 cursor-pointer shadow-xs active:scale-95 shrink-0',
              attendance?.is_active
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                : 'bg-[#081226] text-white hover:bg-[#101F3D] border border-[#1E2E4E]'
            )}
          >
            {attendance?.is_active ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {attendanceLoading ? 'Updating...' : attendance?.is_active ? 'Checked In' : 'Check In'}
            </span>
          </button>
        )}

        {/* Notifications Icon Button */}
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="relative min-h-[38px] min-w-[38px] sm:min-h-[42px] sm:min-w-[42px] flex items-center justify-center text-[#64748B] hover:text-[#081226] hover:bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] hover:border-[#CBD5E1] transition-all duration-150 cursor-pointer active:scale-95 shrink-0 shadow-2xs"
          title="Notifications"
          aria-label="View notifications"
        >
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#F97316] text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.5)] animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User Profile Menu */}
        <Dropdown
          trigger={
            <button
              type="button"
              className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-all duration-150 cursor-pointer min-h-[38px] sm:min-h-[42px] active:scale-95"
            >
              <Avatar
                name={user?.name || 'Recruiter'}
                size="sm"
                variant={isAdmin ? 'blue' : isSubAdmin ? 'purple' : 'teal'}
                status="online"
              />
              <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8] hidden sm:block transition-transform group-data-[state=open]:rotate-180" />
            </button>
          }
          items={profileMenuItems}
        />
      </div>
    </header>
  );
}

export default TopBar;
