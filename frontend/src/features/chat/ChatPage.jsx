import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { ChatRoomList } from './ChatRoomList';
import { ChatWindow } from './ChatWindow';
import { useChatWebSocket } from './useChatWebSocket';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import {
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeToPushNotifications,
} from '@/services/pushNotifications';
import api from '@/services/api';
import { cn } from '@/utils/cn';

import { audioChime } from '@/utils/audioChime';

export function ChatPage() {
  const { user } = useAuth();
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();
  const { error: toastError, success: toastSuccess } = useToast();
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(urlRoomId || null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMobileViewingChat, setIsMobileViewingChat] = useState(Boolean(urlRoomId));
  const [pushPermission, setPushPermission] = useState(() => getNotificationPermission());
  const [enablingPush, setEnablingPush] = useState(false);

  // Sync route param with activeRoomId
  useEffect(() => {
    if (urlRoomId && urlRoomId !== activeRoomId) {
      setActiveRoomId(urlRoomId);
      setIsMobileViewingChat(true);
    }
  }, [urlRoomId, activeRoomId]);

  // Sort helper to ensure conversations are ordered by latest activity
  const sortRoomsByActivity = useCallback((roomsList) => {
    return [...(roomsList || [])].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.created_at || 0).getTime();
      const timeB = new Date(b.last_message_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, []);

  // Update room metadata and re-sort so conversation immediately moves to top (#1)
  const updateRoomAndSort = useCallback(
    (roomId, updates) => {
      setRooms((prev) => {
        const next = prev.map((r) => {
          if (r.id === roomId) {
            return {
              ...r,
              ...updates,
            };
          }
          return r;
        });
        return sortRoomsByActivity(next);
      });
    },
    [sortRoomsByActivity]
  );

  // Fetch all accessible rooms (backend returns sorted by latest message)
  const fetchRooms = useCallback(async () => {
    try {
      const res = await api.get('/chat/rooms');
      const items = res.data.items || [];
      const sorted = sortRoomsByActivity(items);
      setRooms(sorted);
      setActiveRoomId((prev) => {
        if (urlRoomId) return urlRoomId;
        if (prev) return prev;
        return sorted.length > 0 && window.innerWidth >= 768 ? sorted[0].id : null;
      });
    } catch (err) {
      console.error('Failed to fetch chat rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, [urlRoomId, sortRoomsByActivity]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(() => {
      fetchRooms();
    }, 15000);
    const onFocus = () => fetchRooms();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchRooms]);

  // Fetch initial messages when active room changes
  const fetchMessages = useCallback(async (roomId) => {
    if (!roomId) return;
    setLoadingMessages(true);
    try {
      const res = await api.get(`/chat/rooms/${roomId}/messages?limit=50`);
      const items = res.data.items || [];
      setMessages(items);
      setHasMore(res.data.has_more ?? false);

      // Mark read if there are messages
      if (items.length > 0) {
        const lastMsg = items[items.length - 1];
        if (lastMsg.sender?.id !== user?.id) {
          api.patch(`/chat/rooms/${roomId}/read`, { message_id: lastMsg.id }).catch(() => {});
        }
        setRooms((prev) =>
          prev.map((r) => (r.id === roomId ? { ...r, unread_count: 0 } : r))
        );
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      toastError('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [user?.id, toastError]);

  useEffect(() => {
    if (activeRoomId) {
      fetchMessages(activeRoomId);
    }
  }, [activeRoomId, fetchMessages]);

  // Cursor-based infinite scroll for older messages
  const loadMoreMessages = useCallback(async () => {
    if (!activeRoomId || loadingMore || !hasMore || messages.length === 0) return;
    const oldestMessage = messages[0];
    if (!oldestMessage?.id) return;

    setLoadingMore(true);
    try {
      const res = await api.get(
        `/chat/rooms/${activeRoomId}/messages?limit=30&before_id=${oldestMessage.id}`
      );
      const older = res.data.items || [];
      setHasMore(res.data.has_more ?? false);

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const filteredOlder = older.filter((m) => !existingIds.has(m.id));
        return [...filteredOlder, ...prev];
      });
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [activeRoomId, loadingMore, hasMore, messages]);

  // Handle incoming real-time WS message
  const handleIncomingMessage = useCallback(
    (newMsg) => {
      const isFromOther = newMsg.sender?.id !== user?.id;

      if (newMsg.room_id === activeRoomId) {
        setMessages((prev) => {
          // Deduplicate / replace optimistic message by client_id or server id
          const idx = prev.findIndex(
            (m) =>
              (newMsg.client_id && m.client_id === newMsg.client_id) ||
              m.id === newMsg.id
          );
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = newMsg;
            return copy;
          }
          return [...prev, newMsg];
        });

        // Only send read receipt if message is from another participant
        if (isFromOther) {
          audioChime.playMessagePop();
          api.patch(`/chat/rooms/${activeRoomId}/read`, { message_id: newMsg.id }).catch(() => {});
        }
      } else {
        if (isFromOther) {
          audioChime.playMessagePop();
        }
      }

      setRooms((prev) => {
        const next = prev.map((r) => {
          if (r.id === newMsg.room_id) {
            return {
              ...r,
              last_message: newMsg.message,
              last_message_sender: newMsg.sender?.name,
              last_message_at: newMsg.created_at,
              unread_count: r.id === activeRoomId ? 0 : (r.unread_count || 0) + 1,
            };
          }
          return r;
        });
        return sortRoomsByActivity(next);
      });
    },
    [activeRoomId, user?.id, sortRoomsByActivity]
  );

  // Handle cross-room live updates
  const handleRoomUpdate = useCallback(
    (roomUpdateData) => {
      const { room_id, last_message, last_message_sender, last_message_at } = roomUpdateData;
      setRooms((prev) => {
        const next = prev.map((r) => {
          if (r.id === room_id) {
            return {
              ...r,
              last_message,
              last_message_sender,
              last_message_at: last_message_at || new Date().toISOString(),
              unread_count: r.id === activeRoomId ? 0 : (r.unread_count || 0) + 1,
            };
          }
          return r;
        });
        return sortRoomsByActivity(next);
      });
    },
    [activeRoomId, sortRoomsByActivity]
  );

  // Handle message delivery/read status updates
  const handleMessageStatus = useCallback((statusData) => {
    const { message_id, client_id, status } = statusData;

    setMessages((prev) =>
      prev.map((m) => {
        // Individual message match
        if (
          (message_id && m.id === message_id) ||
          (client_id && m.client_id === client_id)
        ) {
          return { ...m, status };
        }
        // Room-level bulk status update
        if (!message_id && status === 'delivered' && m.status === 'sent') {
          return { ...m, status: 'delivered' };
        }
        if (!message_id && status === 'read' && m.status !== 'read') {
          return { ...m, status: 'read' };
        }
        return m;
      })
    );
  }, []);

  // Handle read receipt
  const handleReadReceipt = useCallback((receiptData) => {
    const { message_id } = receiptData;
    if (message_id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === message_id ? { ...m, status: 'read' } : m))
      );
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.status !== 'read' ? { ...m, status: 'read' } : m))
      );
    }
  }, []);

  // Handle deleted messages with Admin Audit View support
  const handleWsMessageDeleted = useCallback((delData) => {
    const { message_id, deleted_by, deleted_by_name, deleted_by_role, deleted_at } = delData || {};
    if (message_id) {
      const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin';
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== message_id) return m;
          if (isAdminUser) {
            // Admin retains original message text and attachments for audit trail
            return {
              ...m,
              is_deleted: true,
              deleted_by: deleted_by || m.deleted_by || user?.id,
              deleted_by_name: deleted_by_name || m.deleted_by_name || 'Staff',
              deleted_by_role: deleted_by_role || m.deleted_by_role || 'admin',
              deleted_at: deleted_at || m.deleted_at || new Date().toISOString(),
            };
          }
          // Non-admin viewers see sanitized deleted placeholder with attachments stripped
          return {
            ...m,
            is_deleted: true,
            message: 'This message was deleted.',
            attachment_type: null,
            attachment_url: null,
            attachment_download_url: null,
            attachment_reference: null,
            attachment_name: null,
            attachment_filename: null,
            attachment_thumbnail_url: null,
            resume_data: null,
            job_data: null,
          };
        })
      );
    }
  }, [user?.id, user?.role]);

  // Handle live room status changes (lock/unlock/archive)
  const handleRoomStatusChanged = useCallback((statusData) => {
    const { room_id, status } = statusData;
    if (room_id && status) {
      setRooms((prev) =>
        prev.map((r) => (r.id === room_id ? { ...r, status } : r))
      );
    }
  }, []);

  // Real-time WebSocket hook with stable callbacks
  const {
    isConnected,
    isReconnecting,
    onlineUsers,
    typingUsers,
    sendTyping: wsSendTyping,
  } = useChatWebSocket(activeRoomId, {
    onOpen: fetchRooms,
    onMessage: handleIncomingMessage,
    onRoomUpdate: handleRoomUpdate,
    onMessageStatus: handleMessageStatus,
    onReadReceipt: handleReadReceipt,
    onMessageDeleted: handleWsMessageDeleted,
    onRoomStatusChanged: handleRoomStatusChanged,
  });

  // Action handlers
  const handleSendMessage = useCallback(
    async (text) => {
      if (!activeRoomId || !text.trim()) return;
      const trimmed = text.trim();
      const clientId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Optimistic message
      const optimisticMsg = {
        id: clientId,
        client_id: clientId,
        room_id: activeRoomId,
        sender: {
          id: user?.id,
          name: user?.name || 'You',
          role: user?.role || 'user',
        },
        message: trimmed,
        attachment_type: null,
        attachment_reference: null,
        attachment_filename: null,
        status: 'pending',
        created_at: new Date().toISOString(),
        is_deleted: false,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      // Optimistically move active room to #1 and update preview
      updateRoomAndSort(activeRoomId, {
        last_message: trimmed,
        last_message_sender: user?.name || 'You',
        last_message_at: optimisticMsg.created_at,
      });

      try {
        const res = await api.post(`/chat/rooms/${activeRoomId}/messages`, {
          message: trimmed,
          client_id: clientId,
        });
        const savedMsg = res.data;
        setMessages((prev) =>
          prev.map((m) => (m.client_id === clientId || m.id === savedMsg.id ? savedMsg : m))
        );
        updateRoomAndSort(activeRoomId, {
          last_message: savedMsg.message,
          last_message_sender: savedMsg.sender?.name || user?.name || 'You',
          last_message_at: savedMsg.created_at,
        });
      } catch (err) {
        console.error('Failed to send message:', err);
        toastError('Failed to send message');
        setMessages((prev) => prev.filter((m) => m.client_id !== clientId));
      }
    },
    [activeRoomId, user, toastError, updateRoomAndSort]
  );

  const handleUploadAttachment = useCallback(
    async (file) => {
      if (!activeRoomId || !file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await api.post(`/chat/rooms/${activeRoomId}/attachment`, formData);
        const savedMsg = res.data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === savedMsg.id)) return prev;
          return [...prev, savedMsg];
        });
        updateRoomAndSort(activeRoomId, {
          last_message: '📎 ' + (savedMsg.attachment_filename || 'Attachment'),
          last_message_sender: savedMsg.sender?.name || user?.name || 'You',
          last_message_at: savedMsg.created_at,
        });
        toastSuccess('Attachment uploaded and sent');
      } catch (err) {
        console.error('Failed to upload attachment:', err);
        toastError('Failed to upload file');
      }
    },
    [activeRoomId, user?.name, toastError, toastSuccess, updateRoomAndSort]
  );

  const handleShareResume = useCallback(
    async (resumeId, caption) => {
      if (!activeRoomId || !resumeId) return;
      try {
        const res = await api.post(`/chat/rooms/${activeRoomId}/share-resume`, {
          resume_id: resumeId,
          caption: caption || null,
        });
        const savedMsg = res.data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === savedMsg.id)) return prev;
          return [...prev, savedMsg];
        });
        updateRoomAndSort(activeRoomId, {
          last_message: '📄 ' + (savedMsg.message || 'Candidate Resume Shared'),
          last_message_sender: savedMsg.sender?.name || user?.name || 'You',
          last_message_at: savedMsg.created_at,
        });
        toastSuccess('Resume shared to chat');
      } catch (err) {
        console.error('Failed to share resume:', err);
        toastError('Failed to share resume');
      }
    },
    [activeRoomId, user?.name, toastError, toastSuccess, updateRoomAndSort]
  );

  const handleShareJob = useCallback(
    async (requirementId, caption) => {
      if (!activeRoomId || !requirementId) return;
      try {
        const res = await api.post(`/chat/rooms/${activeRoomId}/share-job`, {
          requirement_id: requirementId,
          caption: caption || null,
        });
        const savedMsg = res.data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === savedMsg.id)) return prev;
          return [...prev, savedMsg];
        });
        updateRoomAndSort(activeRoomId, {
          last_message: '💼 ' + (savedMsg.message || 'Job Opening Shared'),
          last_message_sender: savedMsg.sender?.name || user?.name || 'You',
          last_message_at: savedMsg.created_at,
        });
        toastSuccess('Job opening shared to chat');
      } catch (err) {
        console.error('Failed to share job opening:', err);
        toastError('Failed to share job opening');
      }
    },
    [activeRoomId, user?.name, toastError, toastSuccess, updateRoomAndSort]
  );

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      try {
        const res = await api.delete(`/chat/messages/${messageId}`);
        const delInfo = res?.data || {};
        const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin';
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            if (isAdminUser) {
              return {
                ...m,
                is_deleted: true,
                deleted_by: delInfo.deleted_by || user?.id,
                deleted_by_name: delInfo.deleted_by_name || user?.name || 'Admin',
                deleted_by_role: delInfo.deleted_by_role || user?.role || 'admin',
                deleted_at: delInfo.deleted_at || new Date().toISOString(),
              };
            }
            return {
              ...m,
              is_deleted: true,
              message: 'This message was deleted.',
              attachment_type: null,
              attachment_url: null,
              attachment_download_url: null,
              attachment_reference: null,
              attachment_name: null,
              attachment_filename: null,
              attachment_thumbnail_url: null,
              resume_data: null,
              job_data: null,
            };
          })
        );
        toastSuccess('Message deleted');
      } catch (err) {
        console.error('Failed to delete message:', err);
        toastError('Failed to delete message');
      }
    },
    [user?.id, user?.name, user?.role, toastError, toastSuccess]
  );

  const handleEnablePush = useCallback(async () => {
    setEnablingPush(true);
    try {
      const res = await subscribeToPushNotifications();
      if (res?.success) {
        setPushPermission('granted');
        toastSuccess('Browser push notifications enabled!');
      } else {
        setPushPermission(res?.permission || 'denied');
        if (res?.permission === 'denied') {
          toastError('Push notifications were blocked in browser settings.');
        }
      }
    } catch (err) {
      console.error('Failed to subscribe to push:', err);
      toastError(err.message || 'Failed to enable push notifications');
    } finally {
      setEnablingPush(false);
    }
  }, [toastSuccess, toastError]);

  const handleSelectRoom = useCallback((roomId) => {
    setActiveRoomId(roomId);
    setIsMobileViewingChat(true);
    navigate(`/chats/${roomId}`, { replace: true });
  }, [navigate]);

  const activeRoom = useMemo(() => {
    return rooms.find((r) => r.id === activeRoomId) || null;
  }, [rooms, activeRoomId]);

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] sm:h-[calc(100vh-130px)] min-h-[480px]">
      {/* Optional Push Notification Permission Prompt Banner */}
      {isPushNotificationSupported() && pushPermission === 'default' && (
        <div className="mb-2.5 px-4 py-2 bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-blue-600/10 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs text-blue-900 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-blue-600 text-white">
              <Bell className="w-3.5 h-3.5" />
            </span>
            <span>
              <strong>Never miss a client message:</strong> Enable browser push notifications to get alerts even when this tab is closed.
            </span>
          </div>
          <button
            onClick={handleEnablePush}
            disabled={enablingPush}
            className="ml-3 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm text-xs shrink-0 cursor-pointer disabled:opacity-50"
          >
            {enablingPush ? 'Enabling...' : 'Enable Notifications'}
          </button>
        </div>
      )}

      <div className="flex-1 flex rounded-2xl sm:rounded-3xl overflow-hidden border border-[#CBD5E1] shadow-xl bg-white relative">
        {/* Left Panel: Service Client Rooms */}
        <div
          className={cn(
            'w-full md:w-[320px] lg:w-[350px] shrink-0 h-full',
            isMobileViewingChat ? 'hidden md:flex' : 'flex'
          )}
        >
          <ChatRoomList
            rooms={rooms}
            activeRoomId={activeRoomId}
            onSelectRoom={handleSelectRoom}
            loading={loadingRooms}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
          />
        </div>

      {/* Right Panel: Conversation Canvas */}
      <div
        className={cn(
          'flex-1 h-full min-w-0',
          !isMobileViewingChat ? 'hidden md:flex' : 'flex'
        )}
      >
        <ChatWindow
          room={activeRoom}
          messages={messages}
          onlineUsers={onlineUsers}
          typingUsers={typingUsers}
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMoreMessages={loadMoreMessages}
          onSendMessage={handleSendMessage}
          onUploadAttachment={handleUploadAttachment}
          onShareResume={handleShareResume}
          onShareJob={handleShareJob}
          onDeleteMessage={handleDeleteMessage}
          onTypingChange={wsSendTyping}
          loadingMessages={loadingMessages}
          onBackMobile={() => setIsMobileViewingChat(false)}
          onRefreshRoom={fetchRooms}
        />
      </div>
    </div>
  </div>
  );
}

export default ChatPage;

