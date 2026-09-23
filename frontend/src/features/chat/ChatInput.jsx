import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Send,
  Paperclip,
  FileText,
  Briefcase,
  Smile,
  Loader2,
  X,
  AtSign,
} from 'lucide-react';

const QUICK_EMOJIS = ['👍', '👋', '🎯', '📄', '🚀', '✅', '👏', '🔥', '💼', '⭐', '🤝', '🎉'];

// Get initials for avatar circle
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Role label + color mapping
function getRoleInfo(role) {
  switch (role) {
    case 'admin':
      return { label: 'Admin', color: 'text-[#2563EB]', bg: 'bg-[#EFF6FF]', border: 'border-[#BFDBFE]' };
    case 'super_admin':
      return { label: 'Super Admin', color: 'text-[#7C3AED]', bg: 'bg-[#F5F3FF]', border: 'border-[#DDD6FE]' };
    case 'sub_admin':
      return { label: 'Sub-Admin', color: 'text-[#9333EA]', bg: 'bg-[#FAF5FF]', border: 'border-[#E9D5FF]' };
    case 'client':
      return { label: 'Client', color: 'text-[#EA580C]', bg: 'bg-[#FFF7ED]', border: 'border-[#FED7AA]' };
    default:
      return { label: 'Recruiter', color: 'text-[#0D9488]', bg: 'bg-[#F0FDFA]', border: 'border-[#99F6E4]' };
  }
}

// Avatar color for initials circle
function getAvatarColor(role) {
  switch (role) {
    case 'admin': return 'bg-[#2563EB] text-white';
    case 'super_admin': return 'bg-[#7C3AED] text-white';
    case 'sub_admin': return 'bg-[#9333EA] text-white';
    case 'client': return 'bg-[#EA580C] text-white';
    default: return 'bg-[#0D9488] text-white';
  }
}

export function ChatInput({
  onSendMessage,
  onUploadAttachment,
  onOpenResumeModal,
  onOpenJobModal,
  onTypingChange,
  typingText = '',
  disabled = false,
  participants = [],
}) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const lastTypingSentRef = useRef(0);

  // @Mention state
  const [mentionQuery, setMentionQuery] = useState(null); // null = dropdown hidden, string = active query
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionDropdownRef = useRef(null);
  const mentionItemRefs = useRef([]);

  const isMentionActive = mentionQuery !== null;

  // Filter participants by mention query
  const filteredParticipants = useMemo(() => {
    if (mentionQuery === null || !participants.length) return [];
    const query = mentionQuery.toLowerCase();
    const filtered = participants.filter((p) =>
      p.name?.toLowerCase().includes(query)
    );
    return filtered.slice(0, 8); // Max 8 suggestions
  }, [mentionQuery, participants]);

  // Reset active index when filtered list changes
  useEffect(() => {
    setMentionActiveIndex(0);
  }, [filteredParticipants.length, mentionQuery]);

  // Scroll active mention item into view
  useEffect(() => {
    if (isMentionActive && mentionItemRefs.current[mentionActiveIndex]) {
      mentionItemRefs.current[mentionActiveIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [mentionActiveIndex, isMentionActive]);

  // Close mention dropdown when clicking outside
  useEffect(() => {
    if (!isMentionActive) return;
    const handleClickOutside = (e) => {
      if (
        mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(e.target) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target)
      ) {
        setMentionQuery(null);
        setMentionStartIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMentionActive]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  // Detect @ mention trigger from cursor position
  const detectMention = useCallback((value, cursorPos) => {
    if (!participants.length) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    // Look backwards from cursor to find the nearest unmatched @
    const textBeforeCursor = value.slice(0, cursorPos);

    // Find the last @ before cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    // @ must be at start of input or preceded by a space/newline
    if (lastAtIndex > 0 && !/\s/.test(value[lastAtIndex - 1])) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    // Extract query text between @ and cursor
    const query = textBeforeCursor.slice(lastAtIndex + 1);

    // If query has a newline, it's not a valid mention trigger
    if (query.includes('\n')) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    setMentionQuery(query);
    setMentionStartIndex(lastAtIndex);
  }, [participants.length]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setText(val);

    // Detect @ mention
    detectMention(val, cursorPos);

    // Typing indicator management
    if (onTypingChange) {
      const now = Date.now();
      if (!val.trim()) {
        isTypingRef.current = false;
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        onTypingChange(false);
        return;
      }

      if (!isTypingRef.current || now - lastTypingSentRef.current > 1500) {
        isTypingRef.current = true;
        lastTypingSentRef.current = now;
        onTypingChange(true);
      }

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        onTypingChange(false);
      }, 2000);
    }
  };

  // Insert selected mention into textarea
  const insertMention = useCallback((participant) => {
    if (mentionStartIndex === -1) return;

    const before = text.slice(0, mentionStartIndex);
    const cursorPos = textareaRef.current?.selectionStart || text.length;
    const after = text.slice(cursorPos);
    const mentionText = `@${participant.name} `;
    const newText = before + mentionText + after;

    setText(newText);
    setMentionQuery(null);
    setMentionStartIndex(-1);
    setMentionActiveIndex(0);

    // Restore cursor position after mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos = before.length + mentionText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }, [text, mentionStartIndex]);

  const handleKeyDown = (e) => {
    // Handle mention dropdown keyboard navigation
    if (isMentionActive && filteredParticipants.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionActiveIndex((prev) =>
          prev < filteredParticipants.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionActiveIndex((prev) =>
          prev > 0 ? prev - 1 : filteredParticipants.length - 1
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredParticipants[mentionActiveIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setMentionStartIndex(-1);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Also detect on click/selection change in textarea
  const handleSelect = (e) => {
    if (participants.length) {
      detectMention(text, e.target.selectionStart);
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (onTypingChange && isTypingRef.current) {
      isTypingRef.current = false;
      onTypingChange(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }

    // Close mention dropdown on send
    setMentionQuery(null);
    setMentionStartIndex(-1);

    onSendMessage(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleAddEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    try {
      if (onUploadAttachment) {
        await onUploadAttachment(file);
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="relative border-t border-[#E2E8F0] bg-white p-3 sm:p-4 shrink-0">
      {/* Active typing indicator row */}
      {typingText && (
        <div className="absolute -top-7 left-4 sm:left-6 flex items-center gap-2 text-[11px] font-bold text-[#2563EB] bg-white/95 backdrop-blur-md px-3 py-1 rounded-t-[12px] border-t border-x border-[#E2E8F0] shadow-xs">
          <span className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-typing-dot-1" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-typing-dot-2" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-typing-dot-3" />
          </span>
          <span>{typingText}</span>
        </div>
      )}

      {/* @Mention Suggestion Dropdown */}
      {isMentionActive && filteredParticipants.length > 0 && (
        <div
          ref={mentionDropdownRef}
          className="absolute bottom-16 sm:bottom-20 left-3 sm:left-5 right-3 sm:right-5 bg-white/[0.98] backdrop-blur-xl rounded-2xl border border-[#E2E8F0] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-40 overflow-hidden"
          style={{ animation: 'mentionSlideUp 0.15s ease-out' }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#F1F5F9]">
            <AtSign className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Mention a person
            </span>
            {mentionQuery && (
              <span className="ml-auto text-[11px] font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                "{mentionQuery}"
              </span>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto overscroll-contain py-1">
            {filteredParticipants.map((p, idx) => {
              const roleInfo = getRoleInfo(p.role);
              const isActive = idx === mentionActiveIndex;
              return (
                <button
                  key={p.id}
                  ref={(el) => (mentionItemRefs.current[idx] = el)}
                  type="button"
                  onClick={() => insertMention(p)}
                  onMouseEnter={() => setMentionActiveIndex(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-100 cursor-pointer ${
                    isActive
                      ? 'bg-[#EFF6FF] border-l-2 border-[#2563EB]'
                      : 'hover:bg-[#F8FAFC] border-l-2 border-transparent'
                  }`}
                >
                  {/* Avatar circle */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${getAvatarColor(
                      p.role
                    )} ${isActive ? 'ring-2 ring-[#2563EB]/30 scale-105' : ''} transition-all duration-100`}
                  >
                    {getInitials(p.name)}
                  </div>

                  {/* Name + role */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${
                      isActive ? 'text-[#2563EB]' : 'text-[#081226]'
                    }`}>
                      {p.name}
                    </p>
                    <span
                      className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-full ${roleInfo.color} ${roleInfo.bg} border ${roleInfo.border}`}
                    >
                      {roleInfo.label}
                    </span>
                  </div>

                  {/* Keyboard hint */}
                  {isActive && (
                    <span className="text-[10px] text-[#94A3B8] font-medium shrink-0 hidden sm:block">
                      Enter ↵
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#F1F5F9] bg-[#FAFBFC]">
            <span className="text-[10px] text-[#94A3B8] font-medium">
              ↑↓ Navigate • Enter to select • Esc to close
            </span>
          </div>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 sm:bottom-20 left-3 sm:left-5 p-3 bg-white/98 backdrop-blur-xl rounded-[22px] border border-[#E2E8F0] shadow-floating z-30 animate-in fade-in zoom-in-95 duration-120 max-w-[90vw] card-bevel">
          <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] mb-2">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Quick Reactions</span>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(false)}
              className="p-1 min-h-[28px] min-w-[28px] flex items-center justify-center text-[#94A3B8] hover:text-[#081226] rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleAddEmoji(emoji)}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-lg hover:bg-[#F1F5F9] rounded-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input container bar */}
      <div className="flex items-end gap-1.5 sm:gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[22px] p-2 focus-within:border-[#2563EB] focus-within:ring-4 focus-within:ring-[#2563EB]/12 focus-within:bg-white transition-all duration-150 shadow-xs">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Action icons on left */}
        <div className="flex items-center gap-0.5 sm:gap-1 pb-0.5 sm:pb-1 text-[#64748B] shrink-0">
          {/* File Attachment */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || disabled}
            title="Attach Document or Image"
            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#64748B] hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-xl transition-all duration-120 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" /> : <Paperclip className="w-4 h-4" />}
          </button>

          {/* Share Candidate Resume Button */}
          {onOpenResumeModal && (
            <button
              type="button"
              onClick={onOpenResumeModal}
              disabled={disabled}
              title="Share Candidate Resume from Candidate Bank"
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#64748B] hover:text-[#F97316] hover:bg-[#FFF7ED] rounded-xl transition-all duration-120 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}

          {/* Share Job Opening Button */}
          {onOpenJobModal && (
            <button
              type="button"
              onClick={onOpenJobModal}
              disabled={disabled}
              title="Share Job Opening"
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-[#64748B] hover:text-[#0D9488] hover:bg-[#F0FDFA] rounded-xl transition-all duration-120 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Briefcase className="w-4 h-4" />
            </button>
          )}

          {/* @ Mention Trigger Button */}
          {participants.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (textareaRef.current) {
                  const cursorPos = textareaRef.current.selectionStart;
                  const before = text.slice(0, cursorPos);
                  const after = text.slice(cursorPos);
                  // Insert @ at cursor position
                  const needsSpace = before.length > 0 && !/\s$/.test(before);
                  const newText = before + (needsSpace ? ' @' : '@') + after;
                  setText(newText);
                  const newCursorPos = before.length + (needsSpace ? 2 : 1);
                  requestAnimationFrame(() => {
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                    detectMention(newText, newCursorPos);
                  });
                }
              }}
              disabled={disabled}
              title="Mention someone (@)"
              className={`p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl transition-all duration-120 hover:scale-105 active:scale-95 cursor-pointer ${
                isMentionActive
                  ? 'text-[#2563EB] bg-[#EFF6FF]'
                  : 'text-[#64748B] hover:text-[#2563EB] hover:bg-[#EFF6FF]'
              }`}
            >
              <AtSign className="w-4 h-4" />
            </button>
          )}

          {/* Emoji Trigger */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Insert Emoji"
            className={`p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl transition-all duration-120 hover:scale-105 active:scale-95 cursor-pointer ${
              showEmojiPicker ? 'text-[#2563EB] bg-[#EFF6FF]' : 'text-[#64748B] hover:text-[#081226] hover:bg-[#F1F5F9]'
            }`}
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        {/* Text area */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          placeholder="Type a message… (@ to mention, Enter to send)"
          disabled={disabled}
          className="flex-1 max-h-[140px] resize-none bg-transparent py-2.5 px-2 text-small text-[#081226] placeholder-[#94A3B8] focus:outline-none font-medium leading-relaxed transition-[height] duration-150"
        />

        {/* Send Button */}
        <div className="pb-0.5 shrink-0">
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className={`w-10 h-10 rounded-[14px] flex items-center justify-center transition-all duration-150 ${
              text.trim() && !disabled
                ? 'bg-gradient-to-b from-[#3B82F6] to-[#2563EB] text-white shadow-[0_2px_10px_rgba(37,99,235,0.4)] hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed opacity-60'
            }`}
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Mention dropdown animation keyframes */}
      <style>{`
        @keyframes mentionSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default ChatInput;
