import React from 'react';
import {
  Bell,
  CheckCircle2,
  UserCheck,
  Target,
  Info,
  MessageSquare,
  Mail,
  FileUp,
  Briefcase,
  BarChart3,
  Clock,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { formatRelativeTime, cn } from '@/utils/cn';

function resolveNotificationVisuals(notif) {
  const type = (notif?.type || '').toLowerCase();
  const title = (notif?.title || '').toLowerCase();

  if (type === 'chat' || title.includes('message')) {
    return {
      icon: <MessageSquare className="w-4 h-4 text-[#2563EB]" />,
      bg: 'bg-[#EFF6FF]',
    };
  }
  if (
    type.includes('application') ||
    type === 'ai_intake' ||
    title.includes('intake') ||
    title.includes('interview')
  ) {
    return {
      icon: <Mail className="w-4 h-4 text-[#8B5CF6]" />,
      bg: 'bg-[#F5F3FF]',
    };
  }
  if (
    type.includes('upload') ||
    type.includes('resume') ||
    title.includes('resume') ||
    title.includes('candidate')
  ) {
    return {
      icon: <FileUp className="w-4 h-4 text-[#16A34A]" />,
      bg: 'bg-[#F0FDF4]',
    };
  }
  if (type === 'client_assigned' || title.includes('client')) {
    return {
      icon: <UserCheck className="w-4 h-4 text-[#2563EB]" />,
      bg: 'bg-[#EFF6FF]',
    };
  }
  if (type === 'target_achieved' || type.includes('target') || title.includes('target')) {
    return {
      icon: <Target className="w-4 h-4 text-[#F97316]" />,
      bg: 'bg-[#FFF7ED]',
    };
  }
  if (
    type.includes('job') ||
    type.includes('requirement') ||
    title.includes('job') ||
    title.includes('position')
  ) {
    return {
      icon: <Briefcase className="w-4 h-4 text-[#0284C7]" />,
      bg: 'bg-[#F0F9FF]',
    };
  }
  if (type.includes('report') || type.includes('export')) {
    return {
      icon: <BarChart3 className="w-4 h-4 text-[#D97706]" />,
      bg: 'bg-[#FFFBEB]',
    };
  }
  if (type === 'attendance' || title.includes('attendance') || title.includes('check in')) {
    return {
      icon: <Clock className="w-4 h-4 text-[#10B981]" />,
      bg: 'bg-[#ECFDF5]',
    };
  }
  if (type === 'success') {
    return {
      icon: <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />,
      bg: 'bg-[#F0FDF4]',
    };
  }
  if (type === 'info') {
    return {
      icon: <Info className="w-4 h-4 text-[#2563EB]" />,
      bg: 'bg-[#EFF6FF]',
    };
  }

  return {
    icon: <Bell className="w-4 h-4 text-[#64748B]" />,
    bg: 'bg-[#F1F5F9]',
  };
}

export function NotificationItem({
  notification,
  onMarkRead,
  onClick,
  onDelete,
  className,
}) {
  const { icon, bg } = resolveNotificationVisuals(notification);
  const isUnread = !notification.is_read;

  return (
    <div
      onClick={() => {
        if (isUnread && onMarkRead) onMarkRead(notification.id);
        if (onClick) onClick(notification);
      }}
      className={cn(
        'group p-3.5 rounded-2xl transition-all duration-150 flex items-start gap-3.5 cursor-pointer select-none hover:shadow-xs relative border border-transparent hover:border-[#E2E8F0]',
        isUnread ? 'bg-[#EFF6FF]/70 hover:bg-[#EFF6FF] border-[#BFDBFE]/60' : 'hover:bg-[#F8FAFC]',
        className
      )}
    >
      <div
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-108 border border-transparent group-hover:border-black/5',
          bg
        )}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'text-small truncate transition-colors group-hover:text-[#2563EB]',
              isUnread ? 'font-bold text-[#081226]' : 'font-semibold text-[#334155]'
            )}
          >
            {notification.title}
          </p>
          <span className="text-[11px] text-[#94A3B8] font-medium shrink-0">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>

        <p className="text-caption text-[#64748B] mt-0.5 line-clamp-2 leading-relaxed font-medium">
          {notification.message}
        </p>
      </div>

      {isUnread && (
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shadow-[0_0_8px_rgba(37,99,235,0.7)] animate-pulse shrink-0 self-center"
          title="Unread notification"
        />
      )}

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-rose-50 transition-all self-center shrink-0 cursor-pointer active:scale-95"
          title="Delete notification"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#2563EB] group-hover:translate-x-1 transition-all self-center shrink-0" />
    </div>
  );
}

export default NotificationItem;
