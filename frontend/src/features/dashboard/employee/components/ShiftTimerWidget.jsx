import React, { useState, useEffect, useCallback, memo } from 'react';
import { Clock, Play, Square, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

const ShiftTimerWidget = memo(function ShiftTimerWidget({
  attendance,
  attendanceLoading,
  onToggleAttendance,
  formatDate = (d) => new Date(d).toLocaleDateString(),
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Owns the 1-second interval strictly within this subcomponent
  useEffect(() => {
    let interval = null;
    if (attendance?.is_active && attendance?.check_in) {
      const startTime = new Date(attendance.check_in).getTime();
      const updateTimer = () => {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - startTime) / 1000));
        setElapsedSeconds(diff);
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [attendance?.is_active, attendance?.check_in]);

  const formatTimer = useCallback((seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  return (
    <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-card hover:shadow-card-hover transition-all duration-200 p-5 space-y-4 card-bevel">
      <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2.5">
          <div className="w-8.5 h-8.5 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#BFDBFE]/60">
            <Clock className="w-4 h-4" />
          </div>
          <h4 className="text-small font-bold uppercase tracking-wider text-[#64748B]">
            Shift Attendance
          </h4>
        </div>

        <span
          className={cn(
            'text-caption font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs',
            attendance?.is_active
              ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]'
              : 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]'
          )}
        >
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              attendance?.is_active ? 'bg-[#16A34A] animate-pulse shadow-[0_0_6px_rgba(22,163,74,0.6)]' : 'bg-[#94A3B8]'
            )}
          />
          {attendance?.is_active ? 'Checked In' : 'Checked Out'}
        </span>
      </div>

      {/* Live Timer Display */}
      {attendance?.is_active ? (
        <div className="p-4 rounded-[18px] bg-gradient-to-b from-[#081226] to-[#040A17] text-white text-center space-y-1.5 card-bevel-dark relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#F97316]/10 rounded-full blur-xl pointer-events-none" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[#F97316]" />
            Active Shift Duration
          </p>
          <p className="font-mono text-display font-black text-[#F97316] tracking-wider drop-shadow-[0_0_12px_rgba(249,115,22,0.3)]">
            {formatTimer(elapsedSeconds)}
          </p>
          <p className="text-caption text-[#94A3B8]">
            Started at {attendance.check_in ? formatDate(attendance.check_in) : 'Today'}
          </p>
        </div>
      ) : (
        <div className="p-4 rounded-[18px] bg-[#F8FAFC] border border-[#E2E8F0] text-center text-[#64748B] text-small">
          {attendance?.check_out ? (
            <p>
              Completed shift today. Logged{' '}
              <span className="font-bold text-[#081226]">{attendance.total_hours} hrs</span>
            </p>
          ) : (
            <p className="text-[13px]">No active shift session. Click below to check in and record productivity.</p>
          )}
        </div>
      )}

      <Button
        variant={attendance?.is_active ? 'danger' : 'primary'}
        size="md"
        icon={attendance?.is_active ? Square : Play}
        isLoading={attendanceLoading}
        onClick={onToggleAttendance}
        className="w-full h-[44px] font-bold"
      >
        {attendance?.is_active ? 'End Shift Session' : 'Start Daily Shift (Check In)'}
      </Button>
    </div>
  );
});

export default ShiftTimerWidget;
