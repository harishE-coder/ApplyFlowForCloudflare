import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { useAuth } from '@/features/auth/AuthContext';
import api, { getWebSocketUrl } from '@/services/api';

export function AppLayout() {
  const { user, bootstrapData } = useAuth();
  const location = useLocation();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => bootstrapData?.notifications?.items || []);
  const [unreadCount, setUnreadCount] = useState(() => bootstrapData?.notifications?.unread_count || 0);
  const [unreadChatCount, setUnreadChatCount] = useState(() => bootstrapData?.chat_unread?.total_unread || 0);

  // Sync state if bootstrapData arrives or updates
  useEffect(() => {
    if (bootstrapData?.notifications) {
      setNotifications(bootstrapData.notifications.items || []);
      setUnreadCount(bootstrapData.notifications.unread_count || 0);
    }
    if (bootstrapData?.chat_unread) {
      setUnreadChatCount(bootstrapData.chat_unread.total_unread || 0);
    }
  }, [bootstrapData]);

  // Auto close mobile sidebar when route changes
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  // Fetch notifications & chat unread counts (Background Polling only)
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.items || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [user]);

  const fetchChatUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/chat/unread-count');
      setUnreadChatCount(res.data.total_unread || 0);
    } catch (err) {
      // Quiet fail if not logged in
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Initial fetch of unread count
    fetchChatUnread();

    let ws = null;
    let reconnectTimeout = null;
    let isCancelled = false;

    async function connectGlobalSocket() {
      if (isCancelled) return;

      const wsUrl = getWebSocketUrl('/ws/chat/global');

      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'room_update' || data.type === 'new_message') {
              fetchChatUnread();
              fetchNotifications();
            }
          } catch {
            // ignore
          }
        };
        ws.onclose = (event) => {
          if (!isCancelled && event.code !== 4003) {
            reconnectTimeout = setTimeout(connectGlobalSocket, 15000);
          }
        };
      } catch {
        // quiet fallback to interval polling
      }
    }

    connectGlobalSocket();

    // Interval fallback polling
    const interval = setInterval(() => {
      fetchNotifications();
      fetchChatUnread();
    }, 30000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [user, fetchNotifications, fetchChatUnread]);

  const handleOpenCommandPalette = useCallback(() => setIsCommandPaletteOpen(true), []);
  const handleCloseCommandPalette = useCallback(() => setIsCommandPaletteOpen(false), []);
  const handleToggleMobileSidebar = useCallback(() => setIsMobileSidebarOpen((prev) => !prev), []);
  const handleCloseMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);

  // Global ⌘K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F6F8FB] text-[#081226] antialiased overflow-x-hidden">
      {/* Sidebar (Desktop Sticky + Mobile/Tablet Off-Canvas Drawer) */}
      <Sidebar
        unreadNotificationsCount={unreadCount}
        unreadChatCount={unreadChatCount}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={handleCloseMobileSidebar}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen w-full lg:pr-6 pb-6">
        {/* Top Bar */}
        <TopBar
          onOpenCommandPalette={handleOpenCommandPalette}
          unreadCount={unreadCount}
          notifications={notifications}
          onRefreshNotifications={fetchNotifications}
          onToggleMobileSidebar={handleToggleMobileSidebar}
        />

        {/* Page View Container (Responsive Padding) */}
        <main className="flex-1 px-3 sm:px-5 lg:px-6 pb-8 overflow-y-auto w-full max-w-full">
          <Outlet />
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={handleCloseCommandPalette}
        userRole={user?.role}
      />
    </div>
  );
}

export default AppLayout;
