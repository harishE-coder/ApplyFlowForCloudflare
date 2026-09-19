import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  CheckCheck,
  UserCheck,
  Target,
  Info,
  Clock,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NotificationItem } from '@/components/ui/NotificationItem';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

export function NotificationsPage() {
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
      console.error(err);
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

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    return true;
  });

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
            Operational alerts, client assignments, target updates, and candidate notifications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="md"
              icon={CheckCheck}
              onClick={handleMarkAllRead}
              className="h-[44px]"
            >
              Mark All as Read
            </Button>
          )}

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchNotifications}
            isLoading={loading}
            className="h-[44px]"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-small font-semibold transition-colors ${
            filter === 'all'
              ? 'bg-[#2563EB] text-white'
              : 'bg-white text-[#64748B] hover:bg-[#F8FAFC] border border-[#E2E8F0]'
          }`}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-xl text-small font-semibold transition-colors ${
            filter === 'unread'
              ? 'bg-[#2563EB] text-white'
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
            />
          ))
        )}
      </div>
    </div>
  );
}

export default NotificationsPage;
