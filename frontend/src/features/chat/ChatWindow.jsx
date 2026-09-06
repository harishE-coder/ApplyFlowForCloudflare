import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Building2,
  Users,
  FileText,
  Download,
  Trash2,
  Eye,
  Clock,
  Check,
  CheckCheck,
  Sparkles,
  ArrowLeft,
  MoreVertical,
  Lock,
  Unlock,
  Archive,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { ChatInput } from './ChatInput';
import { ResumeShareModal } from './ResumeShareModal';
import { ResumePreviewModal } from './ResumePreviewModal';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MessageStatusIcon({ status }) {
  if (status === 'pending') {
    return <Clock className="w-3 h-3 text-blue-200 animate-spin" title="Sending..." />;
  }
  if (status === 'read') {
    return (
      <span className="inline-flex items-center text-[#38BDF8] drop-shadow-xs transition-all animate-fadeIn" title="Read by recipient">
        <CheckCheck className="w-3.5 h-3.5 stroke-[2.5]" />
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span className="inline-flex items-center text-blue-100/90 transition-all animate-fadeIn" title="Delivered to recipient">
        <CheckCheck className="w-3.5 h-3.5 stroke-[2]" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-blue-200/80 transition-all" title="Sent to server">
      <Check className="w-3.5 h-3.5 stroke-[2]" />
    </span>
  );
}

export function ChatWindow({
  room,
  messages = [],
  onlineUsers = [],
  typingUsers = {},
  isConnected = false,
  isReconnecting = false,
  hasMore = false,
  loadingMore = false,
  onLoadMoreMessages,
  onSendMessage,
  onUploadAttachment,
  onShareResume,
  onDeleteMessage,
  onTypingChange,
  loadingMessages = false,
  onBackMobile,
  onRefreshRoom,
}) {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [previewResumeInfo, setPreviewResumeInfo] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const firstMessageIdRef = useRef(messages[0]?.id);

  const isReadOnly = room?.status === 'read_only';

  const typingUserNames = useMemo(() => {
    return Object.entries(typingUsers)
      .filter(([uid]) => uid !== user?.id)
      .map(([, name]) => name);
  }, [typingUsers, user?.id]);

  const typingText = useMemo(() => {
    if (typingUserNames.length === 1) return `${typingUserNames[0]} is typing...`;
    if (typingUserNames.length > 1) return `${typingUserNames.join(', ')} are typing...`;
    return '';
  }, [typingUserNames]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll on initial room switch
  useEffect(() => {
    scrollToBottom('auto');
    prevMessagesLengthRef.current = messages.length;
    firstMessageIdRef.current = messages[0]?.id;
  }, [room?.id, scrollToBottom]);

  // Intelligent auto-scroll on new messages
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    const currentLen = messages.length;
    const prevFirstId = firstMessageIdRef.current;
    const currentFirstId = messages[0]?.id;

    prevMessagesLengthRef.current = currentLen;
    firstMessageIdRef.current = currentFirstId;

    // If messages were prepended at top (history load), do not auto scroll to bottom
    if (currentLen > prevLen && prevFirstId !== currentFirstId && prevFirstId !== undefined) {
      return;
    }

    // If new message was appended at bottom
    if (currentLen > prevLen) {
      const lastMsg = messages[currentLen - 1];
      const isOwn = lastMsg?.sender?.id === user?.id;

      if (isOwn) {
        scrollToBottom('smooth');
      } else if (scrollContainerRef.current) {
        const { scrollHeight, scrollTop, clientHeight } = scrollContainerRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        if (isNearBottom) {
          scrollToBottom('smooth');
        }
      }
    }
  }, [messages, user?.id, scrollToBottom]);

  // Auto-scroll on typing indicator appearance
  useEffect(() => {
    if (typingUserNames.length > 0 && scrollContainerRef.current) {
      const { scrollHeight, scrollTop, clientHeight } = scrollContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 140;
      if (isNearBottom) {
        scrollToBottom('smooth');
      }
    }
  }, [typingUserNames.length, scrollToBottom]);

  // Scroll anchor preservation for infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || loadingMore || !hasMore) return;
    const container = scrollContainerRef.current;

    if (container.scrollTop < 60) {
      const prevScrollHeight = container.scrollHeight;
      onLoadMoreMessages?.()?.then(() => {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop =
              scrollContainerRef.current.scrollHeight - prevScrollHeight;
          }
        });
      });
    }
  }, [hasMore, loadingMore, onLoadMoreMessages]);

  const handleExportChat = async () => {
    if (!room) return;
    setIsExporting(true);
    try {
      const res = await api.get(`/chat/rooms/${room.id}/export`);
      const transcriptData = JSON.stringify(res.data, null, 2);
      const blob = new Blob([transcriptData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${room.client_name}_Chat_Transcript.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      success('Chat Exported', 'Transcript downloaded successfully.');
    } catch (err) {
      toastError('Export Failed', 'Failed to export chat transcript.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleLock = async () => {
    if (!room) return;
    try {
      if (isReadOnly) {
        await api.post(`/chat/rooms/${room.id}/unlock`);
        success('Room Unlocked', 'Chat room is now active.');
      } else {
        await api.post(`/chat/rooms/${room.id}/lock`);
        success('Room Locked', 'Chat room switched to read-only mode.');
      }
      if (onRefreshRoom) onRefreshRoom();
    } catch (err) {
      toastError('Action Failed', 'Failed to update chat room status.');
    }
  };

  const handleArchiveRoom = async () => {
    if (!room) return;
    try {
      await api.post(`/chat/rooms/${room.id}/archive`);
      success('Room Archived', 'Chat room has been archived.');
      if (onRefreshRoom) onRefreshRoom();
    } catch (err) {
      toastError('Action Failed', 'Failed to archive chat room.');
    }
  };

  if (!room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F8FAFC] text-[#64748B] p-8 select-none">
        <div className="w-16 h-16 rounded-2xl bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] mb-3 shadow-inner">
          <Building2 className="w-8 h-8" />
        </div>
        <h3 className="text-h3 font-bold text-[#081226]">Select a Client Chat</h3>
        <p className="text-small text-[#64748B] max-w-sm text-center mt-1">
          Pick a Service Client conversation from the left to review messages, coordinate targets,
          and share candidate profiles.
        </p>
      </div>
    );
  }

  const roomMenuItems = [
    {
      icon: Download,
      label: 'Export Chat',
      onClick: handleExportChat,
    },
  ];

  if (isAdmin || isSubAdmin) {
    roomMenuItems.push({
      icon: isReadOnly ? Unlock : Lock,
      label: isReadOnly ? 'Unlock Room (Active)' : 'Lock Room (Read-only)',
      onClick: handleToggleLock,
    });
    roomMenuItems.push({
      icon: Archive,
      label: 'Archive Chat',
      onClick: handleArchiveRoom,
    });
  }

  const groupedMessages = [];
  let currentDate = null;

  messages.forEach((msg) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ type: 'date', date: msg.created_at, id: `date-${msgDate}` });
    }
    groupedMessages.push({ type: 'message', data: msg });
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] min-w-0">
      <div className="h-16 px-3 sm:px-6 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-xs flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
          {onBackMobile && (
            <button
              type="button"
              onClick={onBackMobile}
              className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#081226] hover:bg-[#F1F5F9] rounded-xl transition-colors cursor-pointer shrink-0"
              title="Back to conversations"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center text-[#2563EB] shrink-0 font-bold">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-small font-bold text-[#081226] truncate">{room.client_name}</h2>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-2xs animate-fadeIn" title="Real-time WebSocket connection active">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              ) : isReconnecting ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-2xs animate-pulse" title="Reconnecting to real-time server...">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Reconnecting
                </span>
              ) : (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isReadOnly ? 'bg-[#94A3B8]' : 'bg-[#16A34A]'
                  }`}
                  title={isReadOnly ? 'Read-only room' : 'Active room'}
                />
              )}
              {isReadOnly && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#64748B]">
                  Read-only
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#64748B] truncate mt-0.5">
              {room.participants?.map((p) => p.name).join(' · ') || 'Participants'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center -space-x-1.5 overflow-hidden">
            {room.participants?.slice(0, 4).map((p) => {
              const isOnline = Array.isArray(onlineUsers) && onlineUsers.includes(String(p.id));
              return (
                <div key={p.id} className="relative" title={`${p.name} (${p.role})${isOnline ? ' • Online now' : ''}`}>
                  <Avatar
                    name={p.name}
                    size="xs"
                    variant={
                      p.role === 'admin' ? 'blue' : p.role === 'client' ? 'orange' : 'teal'
                    }
                  />
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-white" />
                  )}
                </div>
              );
            })}
          </div>
          {room.participants?.length > 4 && (
            <span className="text-[11px] font-semibold text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">
              +{room.participants.length - 4}
            </span>
          )}

          <Dropdown
            trigger={
              <button
                type="button"
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9] transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            }
            items={roomMenuItems}
          />
        </div>
      </div>

      {isReadOnly && (
        <div className="px-6 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2 text-caption text-[#64748B]">
          <Lock className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
          <span>
            This conversation is in <strong>read-only mode</strong>. History and shared resumes
            remain preserved.
          </span>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-[#F8FAFC]/50"
      >
        {loadingMore && (
          <div className="py-2 text-center flex items-center justify-center gap-2 text-caption text-[#64748B]">
            <div className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
            <span>Loading older messages...</span>
          </div>
        )}

        {loadingMessages ? (
          <div className="py-20 text-center text-caption text-[#64748B]">
            Loading conversation history...
          </div>
        ) : messages.length === 0 ? (
          <div className="py-20 text-center text-[#64748B] select-none">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-center mx-auto mb-2 text-[#94A3B8]">
              <Sparkles className="w-6 h-6 text-[#2563EB]" />
            </div>
            <p className="text-small font-semibold text-[#081226]">Conversation Started</p>
            <p className="text-caption mt-0.5">
              Welcome to the {room.client_name} chat room. Post targets, coordinate updates, or
              share candidate resumes.
            </p>
          </div>
        ) : (
          groupedMessages.map((item) => {
            if (item.type === 'date') {
              return (
                <div key={item.id} className="flex items-center justify-center my-3">
                  <span className="text-[11px] font-semibold text-[#64748B] bg-[#E2E8F0]/80 px-3 py-1 rounded-full shadow-2xs">
                    {formatDateHeader(item.date)}
                  </span>
                </div>
              );
            }

            const msg = item.data;
            const isOwn = msg.sender.id === user?.id;
            const isResume = msg.attachment_type === 'resume';
            const canDelete = !msg.is_deleted && (isOwn || isAdmin);

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 group ${
                  isOwn ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <Avatar
                    name={msg.sender.name}
                    size="sm"
                    variant={
                      msg.sender.role === 'admin'
                        ? 'blue'
                        : msg.sender.role === 'client'
                        ? 'orange'
                        : 'teal'
                    }
                  />
                </div>

                <div
                  className={`flex flex-col max-w-[80%] sm:max-w-[70%] ${
                    isOwn ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-caption font-bold text-[#081226]">
                      {isOwn ? 'You' : msg.sender.name}
                    </span>
                    <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      {msg.sender.role}
                    </span>
                    <span className="text-[10px] text-[#94A3B8]">
                      {formatMessageTime(msg.created_at)}
                    </span>
                    {isOwn && !msg.is_deleted && (
                      <span className="inline-flex items-center ml-0.5">
                        <MessageStatusIcon status={msg.status} />
                      </span>
                    )}
                  </div>

                  <div className="relative group/bubble">
                    {msg.is_deleted ? (
                      <div className="p-3 rounded-2xl bg-[#F1F5F9] text-[#94A3B8] italic text-small border border-[#E2E8F0]">
                        Message deleted
                      </div>
                    ) : isResume ? (
                      <div className="p-4 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#081226] space-y-2 shadow-xs min-w-[240px]">
                        <div className="flex items-center gap-2 text-[#2563EB]">
                          <FileText className="w-5 h-5" />
                          <span className="font-bold text-small">Candidate Resume Shared</span>
                        </div>
                        <p className="text-caption text-[#334155]">{msg.message}</p>
                        <div className="pt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewResumeInfo({
                                resumeId: msg.attachment_reference,
                                candidateName: msg.message,
                              })
                            }
                            className="text-caption font-bold text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview PDF
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`p-3.5 rounded-2xl text-small leading-relaxed break-words shadow-xs ${
                          isOwn
                            ? 'bg-[#2563EB] text-white rounded-tr-xs'
                            : 'bg-white text-[#081226] border border-[#CBD5E1]/70 rounded-tl-xs'
                        }`}
                      >
                        {msg.message}
                      </div>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        title={
                          isAdmin && !isOwn
                            ? 'Delete message (Admin oversight)'
                            : 'Delete your message'
                        }
                        className={`absolute top-2 opacity-0 group-hover/bubble:opacity-100 p-1.5 text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#F1F5F9] rounded-lg transition-all cursor-pointer ${
                          isOwn ? '-left-8' : '-right-8'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Live in-stream typing bubble */}
        {typingUserNames.length > 0 && (
          <div className="flex items-center gap-3 animate-fadeIn my-2">
            <div className="shrink-0">
              <Avatar name={typingUserNames[0]} size="xs" variant="teal" />
            </div>
            <div className="px-3.5 py-2 rounded-2xl rounded-tl-xs bg-white border border-[#CBD5E1] shadow-xs flex items-center gap-2.5">
              <span className="text-caption font-semibold text-[#081226]">
                {typingText}
              </span>
              <span className="flex gap-1 items-center py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {!isReadOnly ? (
        <ChatInput
          onSendMessage={onSendMessage}
          onUploadAttachment={onUploadAttachment}
          onOpenResumeModal={() => setIsShareModalOpen(true)}
          onTypingChange={onTypingChange}
          typingText={typingText}
        />
      ) : (
        <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] text-center text-caption text-[#64748B]">
          Chat input is disabled because this room is in read-only mode.
        </div>
      )}

      <ResumeShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={room.id}
        clientName={room.client_name}
        onShareResume={onShareResume}
      />

      <ResumePreviewModal
        isOpen={!!previewResumeInfo}
        onClose={() => setPreviewResumeInfo(null)}
        resumeInfo={previewResumeInfo}
      />
    </div>
  );
}

export default ChatWindow;
