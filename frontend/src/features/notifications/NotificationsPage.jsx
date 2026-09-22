import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NotificationItem } from '@/components/ui/NotificationItem';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import api from '@/services/api';

export function getNotificationRoute(notification, userRole) {
  if (!notification) return null;

  // Direct explicit link / path if backend provided one
  const directLink =
    notification.link ||
    notification.target_url ||
    notification.action_url ||
    notification.path ||
    notification.url;
  if (directLink && typeof directLink === 'string') {
    return directLink;
  }

  const type = (notification.type || '').toLowerCase().trim();
  const title = (notification.title || '').toLowerCase();
  const message = (notification.message || '').toLowerCase();
  const combined = `${type} ${title} ${message}`;

  // 1. Chat notifications
  if (type === 'chat' || combined.includes('chat') || combined.includes('new message from')) {
    if (notification.room_id) {
      return `/chats/${notification.room_id}`;
    }
    return '/chats';
  }

  // 2. Applications / AI Intake / Interviews
  if (
    type === 'application' ||
    type === 'application_update' ||
    type === 'ai_intake' ||
    type === 'interview' ||
    combined.includes('ai intake') ||
    combined.includes('interview') ||
    combined.includes('candidate progress') ||
    combined.includes('progressed to') ||
    combined.includes('application')
  ) {
    return '/applications';
  }

  // 3. Resumes / Uploads / Candidate Bank
  if (
    type === 'upload_completed' ||
    type === 'resume_available' ||
    type === 'resume' ||
    combined.includes('resume') ||
    combined.includes('candidate') ||
    combined.includes('resumes uploaded') ||
    combined.includes('resumes ingested')
  ) {
    return '/candidates';
  }

  // 4. Job Openings / Requirements
  if (
    type === 'job' ||
    type === 'requirement' ||
    type === 'job_opening' ||
    combined.includes('job opening') ||
    combined.includes('requirement') ||
    combined.includes('position')
  ) {
    return '/requirements';
  }

  // 5. Service Clients
  if (
    type === 'client_assigned' ||
    type === 'client' ||
    combined.includes('client assigned') ||
    combined.includes('new client')
  ) {
    if (userRole === 'client') return '/dashboard';
    return '/clients';
  }

  // 6. Targets / Quotas
  if (
    type === 'target_achieved' ||
    type === 'target' ||
    combined.includes('target') ||
    combined.includes('quota')
  ) {
    if (userRole === 'client') return '/dashboard';
    return '/targets';
  }

  // 7. Reports / Analytics / Exports
  if (
    type === 'report' ||
    type === 'export' ||
    combined.includes('report') ||
    combined.includes('export')
  ) {
    return '/reports';
  }

  // 8. Performance telemetry
  if (
    type === 'performance' ||
    combined.includes('latency') ||
    combined.includes('telemetry')
  ) {
    if (userRole === 'admin' || userRole === 'sub_admin') {
      return '/admin/performance';
    }
    return '/dashboard';
  }

  // 9. Attendance / Check-in
  if (
    type === 'attendance' ||
    combined.includes('attendance') ||
    combined.includes('check in') ||
    combined.includes('checked in')
  ) {
    return '/dashboard';
  }

  // Default fallback
  return '/dashboard';
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.items || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      toastError('Error', 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      success('All Read', 'Marked all notifications as read.');
    } catch (err) {
      toastError('Error', 'Failed to mark all as read');
    }
  };

  const handleDeleteNotification = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((c) => {
        const item = notifications.find((n) => n.id === id);
        return item && !item.is_read ? Math.max(0, c - 1) : c;
      });
      success('Deleted', 'Notification removed');
    } catch (err) {
      toastError('Error', 'Failed to delete notification');
    }
  };

  const handleClearRead = async () => {
    try {
      try {
        await api.delete('/notifications/clear-read');
      } catch (err) {
        // Resilient fallback to clear-old with days=0
        await api.delete('/notifications/clear-old?days=0');
      }
      setNotifications((prev) => prev.filter((n) => !n.is_read));
      success('Cleared', 'Cleared read notifications');
    } catch (err) {
      console.error('Failed to clear read notifications:', err);
      toastError('Error', 'Failed to clear read notifications');
    }
  };

  const handleNotificationClick = async (item) => {
    if (!item.is_read) {
      handleMarkRead(item.id);
    }
    const route = getNotificationRoute(item, user?.role);
    if (route) {
      navigate(route);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    return true;
  });

  const readCount = notifications.filter((n) => n.is_read).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-[24px] border border-[#E2E8F0] shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 card-bevel">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-h2 font-extrabold text-[#081226] tracking-tight">
              Notifications & Alerts
            </h1>
            {unreadCount > 0 && (
              <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-[#FFF7ED] text-[#F97316] border border-[#FFEDD5]">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-small text-[#64748B] mt-0.5">
            Click any notification to navigate directly to its relevant section.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="md"
              icon={CheckCheck}
              onClick={handleMarkAllRead}
              className="h-[42px]"
            >
              Mark All as Read
            </Button>
          )}

          {readCount > 0 && (
            <Button
              variant="outline"
              size="md"
              icon={Trash2}
              onClick={handleClearRead}
              className="h-[42px] text-[#64748B] hover:text-[#EF4444]"
              title="Clear read notifications"
            >
              Clear Read
            </Button>
          )}

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchNotifications}
            isLoading={loading}
            className="h-[42px]"
            title="Refresh notifications"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-small font-semibold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'bg-white text-[#64748B] hover:bg-[#F8FAFC] border border-[#E2E8F0]'
          }`}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-xl text-small font-semibold transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'bg-white text-[#64748B] hover:bg-[#F8FAFC] border border-[#E2E8F0]'
          }`}
        >
          Unread Only ({unreadCount})
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-card divide-y divide-[#F1F5F9] p-2">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[#64748B]">
            <Bell className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
            <h4 className="text-small font-bold text-[#081226]">No notifications</h4>
            <p className="text-caption mt-1">You are all caught up with your recruitment updates.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onMarkRead={handleMarkRead}
              onClick={handleNotificationClick}
              onDelete={handleDeleteNotification}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default NotificationsPage;
