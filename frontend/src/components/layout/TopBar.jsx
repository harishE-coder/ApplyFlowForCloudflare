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

  const profileMenuItems = useMemo(() => [
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
  ], [user?.name, logout]);

  return (
    <header className="sticky top-2 lg:static z-30 h-[64px] sm:h-[72px] mx-2 sm:mx-4 lg:mx-6 mt-2 sm:mt-4 lg:mt-6 mb-3 sm:mb-4 px-3 sm:px-5 lg:px-6 bg-white/95 backdrop-blur-md rounded-2xl border border-[#E2E8F0] shadow-topbar flex items-center justify-between gap-2 sm:gap-4 select-none">
      {/* Left: Mobile Hamburger Toggle + Brand / Search Trigger */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {/* Hamburger Menu (Mobile/Tablet only) */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#081226] hover:bg-[#F1F5F9] rounded-xl transition-colors cursor-pointer shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Brand Name */}
        <div className="lg:hidden font-extrabold text-sm sm:text-base text-[#081226] tracking-tight shrink-0 flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] flex items-center justify-center text-white text-[11px] font-black shadow-xs">
            AF
          </div>
          <span className="hidden xs:inline">ApplyFlow</span>
        </div>

        {/* Search / Command Palette Trigger */}
        <div className="flex-1 max-w-md min-w-0">
          {/* Full input on tablet/desktop */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full h-[40px] sm:h-[44px] px-3 sm:px-4 rounded-xl text-small bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-white flex items-center justify-between transition-all duration-120 cursor-pointer shadow-xs min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0 truncate">
              <Search className="w-4 h-4 text-[#94A3B8] shrink-0" />
              <span className="text-[#94A3B8] font-normal truncate hidden sm:inline">
                Search candidates, job openings, quick jump...
              </span>
              <span className="text-[#94A3B8] font-normal truncate sm:hidden">
                Search...
              </span>
            </div>

            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-semibold text-[#64748B] bg-white border border-[#E2E8F0] rounded-md shadow-2xs shrink-0">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* Right: Actions, Date, Attendance, Notifications, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Date Display (Desktop only) */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-caption text-[#64748B] font-semibold">
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
              'h-[40px] sm:h-[44px] px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-small font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0',
              attendance?.is_active
                ? 'bg-[#10B981]/15 text-[#059669] border border-[#10B981]/30 hover:bg-[#10B981]/25'
                : 'bg-[#081226] text-white hover:bg-[#101F3D]'
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {attendanceLoading ? 'Updating...' : attendance?.is_active ? 'Checked In' : 'Check In'}
            </span>
          </button>
        )}

        {/* Notifications Icon Button */}
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="relative min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center text-[#64748B] hover:text-[#081226] hover:bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] transition-colors cursor-pointer shrink-0"
          title="Notifications"
        >
          <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 bg-[#F97316] text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User Profile Menu */}
        <Dropdown trigger={
          <button
            type="button"
            className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-colors cursor-pointer min-h-[40px] sm:min-h-[44px]"
          >
            <Avatar
              name={user?.name || 'Recruiter'}
              size="sm"
              variant={isAdmin ? 'blue' : isSubAdmin ? 'purple' : 'teal'}
              status="online"
            />
            <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8] hidden sm:block" />
          </button>
        } items={profileMenuItems} />
      </div>
    </header>
  );
}

export default TopBar;
