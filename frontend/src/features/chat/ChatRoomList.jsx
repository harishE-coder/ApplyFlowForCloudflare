import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageSquare, Building2, Users, Shield, Clock, Plus } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

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
  loading = false,
  onlineUsers = [],
  typingUsers = {},
}) {
  const navigate = useNavigate();
  const { user, isAdmin, isEmployee, isClient } = useAuth();
  const [search, setSearch] = useState('');

  // Sort rooms descending by last message timestamp (or creation timestamp)
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
    <div className="w-full flex flex-col h-full bg-[#081226] border-r border-[#101F3D] text-white select-none">
      {/* Header */}
      <div className="p-4 border-b border-[#101F3D] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2563EB]/20 border border-[#2563EB]/40 flex items-center justify-center text-[#60A5FA]">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-small font-bold text-white leading-tight">
                {isAdmin ? 'All Client Chats' : isClient ? 'Client Conversation' : 'Assigned Clients'}
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                {isAdmin ? 'Admin oversight across all accounts' : 'Internal Service Client rooms'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#2563EB]/30 text-[#60A5FA] border border-[#2563EB]/40">
              Admin
            </span>
          )}
        </div>

        {/* Search bar (only if more than 1 room) */}
        {rooms.length > 1 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#101F3D] border border-[#1E2E4E] text-caption text-white placeholder-[#64748B] focus:border-[#2563EB] focus:outline-hidden transition-colors"
            />
          </div>
        )}
      </div>

      {/* Room list scroll container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-[#101F3D]/40">
        {loading ? (
          <div className="py-12 text-center text-caption text-[#64748B]">
            Loading conversation channels...
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="py-10 px-4 text-center text-caption text-[#CBD5E1]">
            <div className="w-12 h-12 rounded-2xl bg-[#101F3D] border border-[#1E2E4E] flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-5 h-5 text-[#60A5FA]" />
            </div>
            <p className="font-semibold text-white mb-2">
              {search ? 'No rooms match search' : 'No service client account found'}
            </p>
            <p className="text-[#94A3B8] mb-4">
              {search
                ? 'Try another conversation name.'
                : 'Create a Service Client account first so chat rooms can be created.'}
            </p>
            {!search && canCreateClient && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => navigate('/clients')}
                className="mx-auto"
              >
                Create Service Client
              </Button>
            )}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isActive = room.id === activeRoomId;
            const hasUnread = room.unread_count > 0;
            const hasOnlineParticipants = room.participants?.some(
              (p) => p.id !== user?.id && Array.isArray(onlineUsers) && onlineUsers.includes(String(p.id))
            );
            const isTypingInThisRoom = isActive && Object.keys(typingUsers).length > 0;

            // Participants string (e.g. Harish · Ravi · John)
            const participantNames = room.participants
              .map((p) => (p.id === user?.id ? 'You' : p.name.split(' ')[0]))
              .join(' · ');

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`p-3 rounded-2xl cursor-pointer transition-all duration-150 relative group ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-md'
                    : 'hover:bg-[#101F3D]/80 text-[#CBD5E1]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Room Avatar */}
                    <div className="relative shrink-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[13px] ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-[#101F3D] text-[#93C5FD] border border-[#1E2E4E]'
                        }`}
                      >
                        <Building2 className="w-5 h-5" />
                      </div>
                      {hasOnlineParticipants && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#081226]" title="Participant online" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={`text-small font-bold truncate leading-tight ${
                            isActive ? 'text-white' : 'text-white'
                          }`}
                        >
                          {room.client_name}
                        </p>
                      </div>

                      {/* Participants snippet */}
                      <p
                        className={`text-[11px] truncate mt-0.5 ${
                          isActive ? 'text-white/80' : 'text-[#64748B]'
                        }`}
                      >
                        {participantNames || 'Team conversation'}
                      </p>
                    </div>
                  </div>

                  {/* Timestamp & Unread Badge */}
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    {room.last_message_at && (
                      <span
                        className={`text-[10px] font-medium ${
                          isActive ? 'text-white/80' : 'text-[#64748B]'
                        }`}
                      >
                        {formatRoomTime(room.last_message_at)}
                      </span>
                    )}

                    {hasUnread && (
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#F97316] text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs animate-bounce" style={{ animationDuration: '2s' }}>
                        {room.unread_count}
                      </span>
                    )}
                  </div>
                </div>

                {/* Last message / Typing preview */}
                {isTypingInThisRoom ? (
                  <div className="mt-2 pl-13 pr-1">
                    <p className={`text-caption italic font-medium flex items-center gap-1.5 ${isActive ? 'text-white' : 'text-[#60A5FA]'}`}>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span>typing...</span>
                    </p>
                  </div>
                ) : room.last_message ? (
                  <div className="mt-2 pl-13 pr-1">
                    <p
                      className={`text-caption truncate ${
                        isActive
                          ? 'text-white/90 font-medium'
                          : hasUnread
                          ? 'text-[#F8FAFC] font-semibold'
                          : 'text-[#94A3B8]'
                      }`}
                    >
                      {room.last_message_sender ? `${room.last_message_sender}: ` : ''}
                      {room.last_message}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ChatRoomList;
