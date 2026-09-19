import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MessageSquare, Building2, Users, Shield, Clock, Plus, RefreshCw, Sparkles, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { cn } from '@/utils/cn';

function formatRoomTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ChatRoomList({
  rooms = [],
  activeRoomId = null,
  onSelectRoom,
  onSyncWorkspaces,
  loading = false,
  error = null,
  onRetry,
  onlineUsers = [],
  typingUsers = {},
}) {
  const navigate = useNavigate();
  const { user, isAdmin, isEmployee, isClient } = useAuth();
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  const handleSyncWorkspaces = async () => {
    setSyncing(true);
    try {
      await api.post('/chat/sync-workspaces');
      if (typeof onSyncWorkspaces === 'function') {
        onSyncWorkspaces();
      }
    } catch (err) {
      console.error('Failed to sync workspaces:', err);
    } finally {
      setSyncing(false);
    }
  };

  const sortedRooms = useMemo(() => {
    return [...(Array.isArray(rooms) ? rooms : [])].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.created_at || 0).getTime();
      const timeB = new Date(b.last_message_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, [rooms]);

  const term = (search || '').toLowerCase();
  const filteredRooms = useMemo(() => {
    return sortedRooms.filter((r) =>
      (r?.client_name || '').toLowerCase().includes(term)
    );
  }, [sortedRooms, term]);

  const canCreateClient = isAdmin || user?.role === 'sub_admin';

  return (
    <div className="w-full flex flex-col h-full bg-[#081226] border-r border-[#1E2E4E] text-white select-none">
      {/* Header */}
      <div className="p-4 border-b border-[#101F3D] space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8.5 h-8.5 rounded-xl bg-[#2563EB]/20 border border-[#2563EB]/40 flex items-center justify-center text-[#60A5FA] shadow-xs">
              <MessageSquare className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-small font-bold text-white leading-tight">
                {isAdmin ? 'Client Channels' : isClient ? 'Client Chat' : 'Assigned Clients'}
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                {isAdmin ? 'Live collaboration oversight' : 'Workspace conversations'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#2563EB]/25 text-[#60A5FA] border border-[#2563EB]/40">
              Admin
            </span>
          )}
        </div>

        {/* Search bar */}
        {rooms.length > 1 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#101F3D] border border-[#1E2E4E] text-caption text-white placeholder-[#64748B] focus:border-[#2563EB] focus:outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Room list scroll container */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1 dark-scroll">
        {loading ? (
          <div className="py-16 text-center text-caption text-[#64748B]">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Connecting to workspace channels...
          </div>
        ) : error ? (
          <div className="py-10 px-4 text-center text-caption text-[#CBD5E1]">
            <p className="font-semibold text-rose-400 mb-2">Unable to load conversations</p>
            <p className="text-[#94A3B8] mb-4 text-xs">{error}</p>
            {onRetry && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={RefreshCw}
                onClick={onRetry}
                className="mx-auto"
              >
                Retry
              </Button>
            )}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="py-12 px-4 text-center text-caption text-[#CBD5E1]">
            <div className="w-12 h-12 rounded-2xl bg-[#101F3D] border border-[#1E2E4E] flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6 text-[#60A5FA]" />
            </div>
            <p className="font-bold text-white mb-1.5">
              {search
                ? 'No rooms match search'
                : isAdmin
                ? 'No workspace chats found'
                : 'No service client chat assigned'}
            </p>
            <p className="text-[#94A3B8] mb-4 text-xs max-w-xs mx-auto leading-relaxed">
              {search
                ? 'Try another client or channel name.'
                : isAdmin
                ? 'No workspace chats are currently loaded. Run sync to repair missing chats or create a new Service Client.'
                : 'You currently have no assigned Service Client chats.'}
            </p>
            {!search && isAdmin && (
              <div className="flex flex-col gap-2 items-center">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={RefreshCw}
                  isLoading={syncing}
                  onClick={handleSyncWorkspaces}
                  className="mx-auto"
                >
                  Sync Workspace Chats
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/clients')}
                  className="text-[11px] text-[#60A5FA] hover:underline cursor-pointer"
                >
                  Or create a new Service Client
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isActive = room.id === activeRoomId;
            const hasUnread = (room.unread_count || 0) > 0;
            const isTypingInThisRoom = isActive && Object.keys(typingUsers).length > 0;

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={cn(
                  'p-3 rounded-[16px] cursor-pointer transition-all duration-150 relative group select-none',
                  isActive
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white shadow-[0_4px_20px_rgba(37,99,235,0.4)] border border-blue-400/30'
                    : 'hover:bg-[#101F3D] text-[#CBD5E1]'
                )}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Room Avatar with Online Indicator */}
                    <div className="relative shrink-0">
                      <Avatar
                        name={room.client_name || 'Client'}
                        size="md"
                        variant={isActive ? 'navy' : 'blue'}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={cn(
                            'text-[13.5px] font-bold truncate leading-tight',
                            isActive ? 'text-white' : 'text-white group-hover:text-blue-300'
                          )}
                        >
                          {room.client_name || 'Client Channel'}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-medium shrink-0',
                            isActive ? 'text-blue-100' : 'text-[#64748B]'
                          )}
                        >
                          {formatRoomTime(room.last_message_at || room.created_at)}
                        </span>
                      </div>

                      {/* Snippet / Typing Indicator */}
                      {isTypingInThisRoom ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-[#38BDF8] font-semibold animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
                          <span>Typing...</span>
                        </div>
                      ) : (
                        <p
                          className={cn(
                            'text-[11.5px] truncate leading-tight',
                            isActive ? 'text-blue-100' : 'text-[#94A3B8]'
                          )}
                        >
                          {room.last_message_preview || room.description || 'No messages yet'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Unread badge / chevron */}
                  <div className="flex items-center gap-1 shrink-0 self-center">
                    {hasUnread && (
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#F97316] text-white text-[10px] font-extrabold flex items-center justify-center shadow-[0_0_10px_rgba(249,115,22,0.6)] animate-pulse">
                        {room.unread_count > 99 ? '99+' : room.unread_count}
                      </span>
                    )}
                    {isActive && (
                      <ChevronRight className="w-4 h-4 text-white/80" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ChatRoomList;
