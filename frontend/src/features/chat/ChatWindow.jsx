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
  Briefcase,
  MapPin,
  ExternalLink,
  ZoomIn,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ChatInput } from './ChatInput';
import { ResumeShareModal } from './ResumeShareModal';
import { JobShareModal } from './JobShareModal';
import { ResumePreviewModal } from './ResumePreviewModal';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import {
  extractDriveFileId,
  getImageDirectUrl,
  getImageThumbnailUrl,
} from '@/utils/resumeUrls';

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
  onShareJob,
  onDeleteMessage,
  onTypingChange,
  loadingMessages = false,
  onBackMobile,
  onRefreshRoom,
}) {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [previewResumeInfo, setPreviewResumeInfo] = useState(null);
  const [previewImageModal, setPreviewImageModal] = useState(null);
  const [fetchingResumeId, setFetchingResumeId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const firstMessageIdRef = useRef(messages[0]?.id);

  const isReadOnly = room?.status === 'read_only' || room?.status === 'locked';

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
      toastError('Export Failed', err?.response?.data?.detail || 'Failed to export chat transcript.');
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
      toastError('Action Failed', err?.response?.data?.detail || 'Failed to update chat room status.');
    }
  };

  const handleArchiveRoom = async () => {
    if (!room) return;
    try {
      await api.post(`/chat/rooms/${room.id}/archive`);
      success('Room Archived', 'Chat room has been archived.');
      if (onRefreshRoom) onRefreshRoom();
    } catch (err) {
      toastError('Action Failed', err?.response?.data?.detail || 'Failed to archive chat room.');
    }
  };

  // Reusable candidate resume and document preview modal trigger
  const handleOpenResumePreview = async (msg) => {
    if (!msg) return;

    if (msg.resume_data && (msg.resume_data.drive_file_id || msg.resume_data.drive_view_url)) {
      setPreviewResumeInfo(msg.resume_data);
      return;
    }

    const resumeId = msg.attachment_reference || msg.resume_data?.resumeId;

    // Check if resumeId is a Candidate Bank UUID (36 chars, 4 hyphens)
    const isUuid = resumeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resumeId);
    if (isUuid) {
      setFetchingResumeId(resumeId);
      try {
        const res = await api.get(`/resumes/${resumeId}`);
        if (res.data) {
          setPreviewResumeInfo(res.data);
          return;
        }
      } catch (err) {
        console.error('Failed to fetch resume metadata:', err);
      } finally {
        setFetchingResumeId(null);
      }
    }

    // Direct local attachment or fallback
    const fileId = extractDriveFileId(msg.attachment_reference) ||
                   extractDriveFileId(msg.attachment_url) ||
                   extractDriveFileId(msg.attachment_download_url);

    setPreviewResumeInfo({
      id: msg.id || resumeId || 'doc_preview',
      filename: msg.attachment_filename || msg.attachment_name || 'Document.pdf',
      candidate_name: msg.resume_data?.candidate_name || null,
      role: msg.resume_data?.role || null,
      company: msg.resume_data?.company || null,
      drive_file_id: fileId,
      drive_view_url: msg.attachment_url || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null),
      drive_download_url: msg.attachment_download_url || (fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : null),
    });
  };

  if (!room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F8FAFC] text-[#64748B] p-8 select-none">
        <div className="w-16 h-16 rounded-2xl bg-[#E2E8F0] flex items-center justify-center text-[#94A3B8] mb-3 shadow-inner">
          <Building2 className="w-8 h-8" />
        </div>
        <h3 className="text-h3 font-bold text-[#081226]">Select a Service Client Chat</h3>
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
      {/* Room Header */}
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
            This conversation is in <strong>read-only mode</strong>. History and shared documents
            remain preserved.
          </span>
        </div>
      )}

      {/* Messages Canvas */}
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
            const isOwn = msg.sender?.id === user?.id;
            const isResume = msg.attachment_type === 'resume';
            const isJob = msg.attachment_type === 'job';
            const attachName = (msg.attachment_name || msg.attachment_filename || msg.message || '').toLowerCase();
            const isImage = msg.attachment_type === 'image' || Boolean(attachName && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(attachName));
            const isPdf = msg.attachment_type === 'pdf' || Boolean(attachName && /\.(pdf|docx?|txt)$/i.test(attachName));
            const isFile = (msg.attachment_type === 'file' || Boolean(msg.attachment_reference && !isResume && !isJob)) && !isImage && !isPdf;

            // Role-based deletion permission matrix:
            // Admin: Everyone
            // Sub-Admin: Self + Client + Employee (DENY if sender is admin or super_admin)
            // Client: Own only
            // Employee: Own only
            const senderRole = msg.sender?.role || 'user';
            const isSenderAdmin = senderRole === 'admin' || senderRole === 'super_admin';
            const canDelete = !msg.is_deleted && (
              isAdmin ||
              (isSubAdmin && (!isSenderAdmin || isOwn)) ||
              isOwn
            );

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 group ${
                  isOwn ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <Avatar
                    name={msg.sender?.name}
                    size="sm"
                    variant={
                      msg.sender?.role === 'admin'
                        ? 'blue'
                        : msg.sender?.role === 'client'
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
                      {isOwn ? 'You' : msg.sender?.name}
                    </span>
                    <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      {msg.sender?.role}
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
                    {/* 1. Soft-deleted message bubble (Admin Audit View vs Standard User View) */}
                    {msg.is_deleted ? (
                      isAdmin ? (
                        <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-[#081226] space-y-2.5 shadow-xs max-w-full min-w-[260px]">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 border-b border-amber-200 pb-1.5">
                            <Trash2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Deleted by {msg.deleted_by_name || 'Admin'}
                              {msg.deleted_by_role ? ` (${msg.deleted_by_role === 'sub_admin' ? 'Sub-Admin' : msg.deleted_by_role})` : ''}
                              {msg.deleted_at ? ` at ${formatMessageTime(msg.deleted_at)}` : ''}
                            </span>
                            <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200/80">
                              Audit View
                            </span>
                          </div>

                          {/* Original message text with strikethrough */}
                          {msg.message && (
                            <p className="text-small line-through text-[#64748B] leading-relaxed break-words font-medium">
                              {msg.message}
                            </p>
                          )}

                          {/* Admin can still view and audit attachments */}
                          {isResume && (
                            <div className="pt-1 opacity-90">
                              <div className="p-2.5 rounded-xl bg-white border border-amber-200">
                                <div className="flex items-center justify-between gap-2 text-[#2563EB] mb-1">
                                  <span className="text-[11px] font-bold">Candidate Resume</span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenResumePreview(msg)}
                                    className="text-[11px] font-bold text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" /> Preview
                                  </button>
                                </div>
                                <p className="text-small font-semibold text-[#081226]">
                                  {msg.resume_data?.candidate_name || msg.attachment_name || 'Candidate Profile'}
                                </p>
                              </div>
                            </div>
                          )}

                          {isJob && (
                            <div className="pt-1 opacity-90">
                              <div className="p-2.5 rounded-xl bg-white border border-amber-200">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-[11px] font-bold text-emerald-700">Job Opening</span>
                                  <a
                                    href={msg.job_data?.job_url || `/requirements?search=${encodeURIComponent(msg.job_data?.title || '')}`}
                                    target={msg.job_data?.job_url ? '_blank' : '_self'}
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" /> View
                                  </a>
                                </div>
                                <p className="text-small font-semibold text-[#081226]">
                                  {msg.job_data?.title || msg.attachment_name}
                                </p>
                              </div>
                            </div>
                          )}

                          {isImage && (
                            <div className="pt-1 opacity-90">
                              {(() => {
                                const fileId = extractDriveFileId(msg.attachment_reference) ||
                                               extractDriveFileId(msg.attachment_url) ||
                                               extractDriveFileId(msg.attachment_download_url) ||
                                               extractDriveFileId(msg.attachment_thumbnail_url);
                                const thumbUrl = fileId
                                  ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
                                  : (msg.attachment_thumbnail_url || msg.attachment_url);
                                const directFullUrl = fileId
                                  ? `https://lh3.googleusercontent.com/d/${fileId}`
                                  : (msg.attachment_url || msg.attachment_download_url || thumbUrl);
                                const driveViewUrl = fileId
                                  ? `https://drive.google.com/file/d/${fileId}/view`
                                  : msg.attachment_url;
                                const dlUrl = fileId
                                  ? `https://drive.google.com/uc?export=download&id=${fileId}`
                                  : (msg.attachment_download_url || msg.attachment_url);
                                return (
                                  <div
                                    onClick={() =>
                                      setPreviewImageModal({
                                        url: directFullUrl,
                                        thumbnailUrl: thumbUrl,
                                        name: msg.attachment_name || msg.attachment_filename || 'Image Attachment',
                                        driveUrl: driveViewUrl,
                                        downloadUrl: dlUrl,
                                      })
                                    }
                                    className="relative overflow-hidden rounded-xl border border-amber-200 bg-white cursor-pointer max-w-[200px]"
                                  >
                                    <img
                                      src={thumbUrl}
                                      alt={msg.attachment_name || 'Attachment'}
                                      className="w-full max-h-[140px] object-cover"
                                      onError={(e) => {
                                        if (directFullUrl && e.target.src !== directFullUrl) {
                                          e.target.src = directFullUrl;
                                        }
                                      }}
                                    />
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {(isPdf || isFile) && (
                            <div className="pt-1 opacity-90">
                              <div className="p-2 rounded-xl bg-white border border-amber-200 flex items-center justify-between gap-2">
                                <span className="text-caption font-medium text-[#081226] truncate">
                                  {msg.attachment_name || msg.attachment_filename || 'File'}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenResumePreview(msg)}
                                    className="text-[11px] font-bold text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" /> Preview
                                  </button>
                                  {(msg.attachment_download_url || msg.attachment_reference) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const fileId = extractDriveFileId(msg.attachment_reference) || extractDriveFileId(msg.attachment_download_url);
                                        const dl = msg.attachment_download_url || (fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : null) || msg.attachment_url;
                                        if (dl) window.open(dl, '_blank');
                                      }}
                                      className="text-[11px] font-bold text-[#64748B] hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <Download className="w-3 h-3" /> Download
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 rounded-2xl bg-[#F1F5F9] text-[#94A3B8] italic text-small border border-[#E2E8F0] flex items-center gap-2 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#CBD5E1]" />
                          <span>This message was deleted.</span>
                        </div>
                      )
                    ) : isResume ? (
                      /* 2. Candidate Bank Resume Share Card */
                      <div className="p-4 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#081226] space-y-2.5 shadow-xs min-w-[260px] max-w-[360px]">
                        <div className="flex items-center justify-between gap-2 text-[#2563EB]">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-[#2563EB]" />
                            <span className="font-bold text-small">Candidate Resume</span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20">
                            Candidate Bank
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-[#BFDBFE]/60">
                          <p className="text-small font-bold text-[#081226]">
                            {msg.resume_data?.candidate_name || msg.attachment_name || 'Candidate Profile'}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-[#64748B] mt-0.5">
                            {msg.resume_data?.role && (
                              <span className="font-medium text-[#2563EB]">{msg.resume_data.role}</span>
                            )}
                            {msg.resume_data?.company && (
                              <>
                                <span>•</span>
                                <span className="truncate">{msg.resume_data.company}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {msg.message && !msg.message.startsWith('Shared resume:') && (
                          <p className="text-caption text-[#334155] px-0.5 italic">"{msg.message}"</p>
                        )}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenResumePreview(msg)}
                            disabled={fetchingResumeId === (msg.attachment_reference || msg.resume_data?.resumeId)}
                            className="w-full py-2 px-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-caption font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            {fetchingResumeId === (msg.attachment_reference || msg.resume_data?.resumeId) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            Preview Verified PDF
                          </button>
                        </div>
                      </div>
                    ) : isJob ? (
                      /* 3. Shared Job Opening Card */
                      <div className="p-4 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#081226] space-y-2.5 shadow-xs min-w-[280px] max-w-[380px]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-small font-bold text-[#081226] truncate">
                              {msg.job_data?.title || msg.attachment_name || 'Job Opening'}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] text-[#64748B] mt-1">
                              <span className="truncate font-medium text-[#081226]">
                                {msg.job_data?.company || 'Client'}
                              </span>
                              <span>•</span>
                              <span>{msg.job_data?.location || 'Remote'}</span>
                              <span>•</span>
                              <span className="font-medium text-emerald-700">
                                {msg.job_data?.openings || 1} {msg.job_data?.openings === 1 ? 'opening' : 'openings'}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              (msg.job_data?.priority || '').toLowerCase() === 'high'
                                ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                : (msg.job_data?.priority || '').toLowerCase() === 'medium'
                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                            }`}
                          >
                            {msg.job_data?.priority || 'Medium'} Priority
                          </span>
                        </div>

                        {msg.message && !msg.message.startsWith('Shared job opening:') && (
                          <p className="text-caption text-[#334155] p-2 rounded-xl bg-white border border-[#BBF7D0]/60 font-medium">
                            {msg.message}
                          </p>
                        )}

                        <div className="pt-1 flex items-center justify-end">
                          <a
                            href={msg.job_data?.job_url || `/requirements?search=${encodeURIComponent(msg.job_data?.title || '')}`}
                            target={msg.job_data?.job_url ? '_blank' : '_self'}
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-caption font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                          >
                            View Job Opening <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ) : isImage ? (
                      /* 4. Local Image Attachment (Inline Thumbnail + Lightbox Click) */
                      (() => {
                        const fileId = extractDriveFileId(msg.attachment_reference) ||
                                       extractDriveFileId(msg.attachment_url) ||
                                       extractDriveFileId(msg.attachment_download_url) ||
                                       extractDriveFileId(msg.attachment_thumbnail_url);
                        const thumbUrl = fileId
                          ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
                          : (msg.attachment_thumbnail_url || msg.attachment_url);
                        const directFullUrl = fileId
                          ? `https://lh3.googleusercontent.com/d/${fileId}`
                          : (msg.attachment_url || msg.attachment_download_url || thumbUrl);
                        const driveViewUrl = fileId
                          ? `https://drive.google.com/file/d/${fileId}/view`
                          : msg.attachment_url;
                        const dlUrl = fileId
                          ? `https://drive.google.com/uc?export=download&id=${fileId}`
                          : (msg.attachment_download_url || msg.attachment_url);
                        const imgName = msg.attachment_name || msg.attachment_filename || 'Image Attachment';

                        return (
                          <div className="space-y-1.5 max-w-[280px] sm:max-w-[320px]">
                            <div
                              onClick={() =>
                                setPreviewImageModal({
                                  url: directFullUrl,
                                  thumbnailUrl: thumbUrl,
                                  name: imgName,
                                  driveUrl: driveViewUrl,
                                  downloadUrl: dlUrl,
                                })
                              }
                              className="relative overflow-hidden rounded-2xl border border-[#CBD5E1] bg-[#081226]/5 shadow-xs cursor-pointer group/img"
                            >
                              <img
                                src={thumbUrl}
                                alt={imgName}
                                className="w-full max-h-[220px] object-cover transition-transform duration-200 group-hover/img:scale-105"
                                loading="lazy"
                                onError={(e) => {
                                  if (directFullUrl && e.target.src !== directFullUrl) {
                                    e.target.src = directFullUrl;
                                  }
                                }}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                <span className="p-2 rounded-full bg-black/60 text-white shadow-md">
                                  <ZoomIn className="w-4 h-4" />
                                </span>
                              </div>
                            </div>
                            {msg.message && msg.message !== imgName && (
                              <p className="text-caption text-[#334155] px-1 font-medium">{msg.message}</p>
                            )}
                          </div>
                        );
                      })()
                    ) : isPdf ? (
                      /* 5. PDF Attachment (Icon, Filename, In-Chat Preview, Download) */
                      <div className="p-3.5 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs space-y-2.5 min-w-[240px] max-w-[320px]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-small font-semibold text-[#081226] truncate">
                              {msg.attachment_name || msg.attachment_filename || 'Document.pdf'}
                            </p>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              PDF Document
                            </span>
                          </div>
                        </div>
                        {msg.message && msg.message !== (msg.attachment_name || msg.attachment_filename) && (
                          <p className="text-caption text-[#334155] px-0.5">{msg.message}</p>
                        )}
                        <div className="flex items-center gap-2 pt-1 border-t border-[#F1F5F9]">
                          <button
                            type="button"
                            onClick={() => handleOpenResumePreview(msg)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] text-caption font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          {(msg.attachment_download_url || msg.attachment_reference) && (
                            <button
                              type="button"
                              onClick={() => {
                                const fileId = extractDriveFileId(msg.attachment_reference) || extractDriveFileId(msg.attachment_download_url);
                                const dl = msg.attachment_download_url || (fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : null) || msg.attachment_url;
                                if (dl) window.open(dl, '_blank');
                              }}
                              className="py-1.5 px-2.5 rounded-lg bg-[#F8FAFC] hover:bg-[#E2E8F0] text-[#081226] text-caption font-semibold flex items-center justify-center gap-1.5 border border-[#CBD5E1] transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </button>
                          )}
                        </div>
                      </div>
                    ) : isFile ? (
                      /* 6. Other File Attachment (Icon, Filename, In-Chat Preview, Download) */
                      <div className="p-3.5 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs space-y-2.5 min-w-[240px] max-w-[320px]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-small font-semibold text-[#081226] truncate">
                              {msg.attachment_name || msg.attachment_filename || 'Attachment'}
                            </p>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                              File Attachment
                            </span>
                          </div>
                        </div>
                        {msg.message && msg.message !== (msg.attachment_name || msg.attachment_filename) && (
                          <p className="text-caption text-[#334155] px-0.5">{msg.message}</p>
                        )}
                        <div className="flex items-center gap-2 pt-1 border-t border-[#F1F5F9]">
                          <button
                            type="button"
                            onClick={() => handleOpenResumePreview(msg)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] text-caption font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const fileId = extractDriveFileId(msg.attachment_reference) || extractDriveFileId(msg.attachment_download_url);
                              const dl = msg.attachment_download_url || (fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : null) || msg.attachment_url;
                              if (dl) window.open(dl, '_blank');
                            }}
                            className="py-1.5 px-2.5 rounded-lg bg-[#F8FAFC] hover:bg-[#E2E8F0] text-[#081226] text-caption font-semibold flex items-center justify-center gap-1.5 border border-[#CBD5E1] transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 7. Regular Text Message Bubble */
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

                    {/* Role-Based Delete Action */}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmMessage(msg)}
                        title={
                          isAdmin && !isOwn
                            ? 'Delete message (Admin oversight)'
                            : isSubAdmin && !isOwn
                            ? 'Delete message (Sub-Admin moderation)'
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

      {/* Input Bar */}
      {!isReadOnly ? (
        <ChatInput
          onSendMessage={onSendMessage}
          onUploadAttachment={onUploadAttachment}
          onOpenResumeModal={() => setIsShareModalOpen(true)}
          onOpenJobModal={() => setIsJobModalOpen(true)}
          onTypingChange={onTypingChange}
          typingText={typingText}
        />
      ) : (
        <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] text-center text-caption text-[#64748B]">
          Chat input is disabled because this room is in read-only mode.
        </div>
      )}

      {/* Share Resume from Candidate Bank Modal */}
      <ResumeShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={room.id}
        clientName={room.client_name}
        onShareResume={onShareResume}
      />

      {/* Share Existing Job Opening Modal */}
      <JobShareModal
        isOpen={isJobModalOpen}
        onClose={() => setIsJobModalOpen(false)}
        onShareJob={onShareJob}
      />

      {/* Unified Candidate Bank Resume Preview Modal */}
      <ResumePreviewModal
        isOpen={!!previewResumeInfo}
        onClose={() => setPreviewResumeInfo(null)}
        resumeInfo={previewResumeInfo}
      />

      {/* Delete Message Confirmation Modal */}
      {deleteConfirmMessage && (
        <Modal
          isOpen={!!deleteConfirmMessage}
          onClose={() => {
            if (!deletingMessage) setDeleteConfirmMessage(null);
          }}
          title="Delete Message"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-small font-bold">
                  {deleteConfirmMessage.sender?.id === user?.id
                    ? 'Are you sure you want to delete this message?'
                    : `Delete message sent by ${deleteConfirmMessage.sender?.name || 'User'}?`}
                </p>
                <p className="text-caption text-rose-700 leading-relaxed">
                  This message will be soft-deleted. Team members will see &quot;This message was deleted&quot;, while Admins retain full audit history.
                </p>
              </div>
            </div>

            {/* Message preview snippet */}
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-small text-[#081226] max-h-24 overflow-y-auto break-words font-medium">
              {deleteConfirmMessage.message ||
                deleteConfirmMessage.attachment_name ||
                deleteConfirmMessage.attachment_filename ||
                (deleteConfirmMessage.attachment_type === 'resume'
                  ? 'Candidate Resume'
                  : deleteConfirmMessage.attachment_type === 'job'
                  ? 'Job Opening'
                  : 'Attachment')}
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <Button
                variant="outline"
                size="md"
                disabled={deletingMessage}
                onClick={() => setDeleteConfirmMessage(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                isLoading={deletingMessage}
                onClick={async () => {
                  setDeletingMessage(true);
                  try {
                    await onDeleteMessage(deleteConfirmMessage.id);
                    setDeleteConfirmMessage(null);
                  } catch (err) {
                    console.error('Delete message error:', err);
                  } finally {
                    setDeletingMessage(false);
                  }
                }}
              >
                Delete Message
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Lightbox Modal for Image Preview */}
      {previewImageModal && (
        <div
          onClick={() => setPreviewImageModal(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-[#081226] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10 text-white">
              <span className="text-small font-semibold truncate max-w-md">
                {previewImageModal.name || 'Image Attachment'}
              </span>
              <div className="flex items-center gap-2">
                {(previewImageModal.driveUrl || previewImageModal.url) && (
                  <a
                    href={previewImageModal.driveUrl || previewImageModal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-caption font-medium transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open in Drive
                  </a>
                )}
                {previewImageModal.downloadUrl && (
                  <a
                    href={previewImageModal.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-caption font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewImageModal(null)}
                  className="p-1.5 text-white/70 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/50 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={previewImageModal.url}
                alt={previewImageModal.name || 'Attachment'}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-md"
                onError={(e) => {
                  if (previewImageModal.thumbnailUrl && e.target.src !== previewImageModal.thumbnailUrl) {
                    e.target.src = previewImageModal.thumbnailUrl;
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
