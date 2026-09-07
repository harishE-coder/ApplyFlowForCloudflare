import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  FileText,
  Briefcase,
  Smile,
  Loader2,
  X,
} from 'lucide-react';

const QUICK_EMOJIS = ['👍', '👋', '🎯', '📄', '🚀', '✅', '👏', '🔥', '💼', '⭐', '🤝', '🎉'];

export function ChatInput({
  onSendMessage,
  onUploadAttachment,
  onOpenResumeModal,
  onOpenJobModal,
  onTypingChange,
  typingText = '',
  disabled = false,
}) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  const lastTypingSentRef = useRef(0);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
    <div className="relative border-t border-[#E2E8F0] bg-white p-2.5 sm:p-4 shrink-0">
      {/* Active typing indicator row */}
      {typingText && (
        <div className="absolute -top-7 left-3 sm:left-5 flex items-center gap-1.5 text-[11px] font-medium text-[#2563EB] bg-white/95 backdrop-blur-xs px-2.5 py-0.5 rounded-t-lg border-t border-x border-[#E2E8F0] shadow-xs">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>{typingText}</span>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 sm:bottom-20 left-2 sm:left-4 p-3 bg-white rounded-2xl border border-[#CBD5E1] shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100 max-w-[90vw]">
          <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] mb-2">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Quick Reactions</span>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(false)}
              className="p-1 min-h-[32px] min-w-[32px] flex items-center justify-center text-[#94A3B8] hover:text-[#081226] rounded-md"
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
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-lg hover:bg-[#F1F5F9] rounded-lg transition-transform hover:scale-120 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input container bar */}
      <div className="flex items-end gap-1.5 sm:gap-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-2xl p-1.5 sm:p-2 focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/15 focus-within:bg-white transition-all">
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
            className="p-2 min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center text-[#64748B] hover:text-[#2563EB] hover:bg-[#E2E8F0]/60 rounded-xl transition-colors cursor-pointer"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" /> : <Paperclip className="w-4 h-4" />}
          </button>

          {/* Share Candidate Resume Button (Available for all roles including Client) */}
          {onOpenResumeModal && (
            <button
              type="button"
              onClick={onOpenResumeModal}
              disabled={disabled}
              title="Share Candidate Resume from Candidate Bank"
              className="p-2 min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center text-[#64748B] hover:text-[#F97316] hover:bg-[#F97316]/10 rounded-xl transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}

          {/* Share Job Opening Button (Available for all roles) */}
          {onOpenJobModal && (
            <button
              type="button"
              onClick={onOpenJobModal}
              disabled={disabled}
              title="Share Job Opening"
              className="p-2 min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center text-[#64748B] hover:text-[#0D9488] hover:bg-[#0D9488]/10 rounded-xl transition-colors cursor-pointer"
            >
              <Briefcase className="w-4 h-4" />
            </button>
          )}

          {/* Emoji Trigger */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Insert Emoji"
            className={`p-2 min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              showEmojiPicker ? 'text-[#2563EB] bg-[#EFF6FF]' : 'text-[#64748B] hover:text-[#081226] hover:bg-[#E2E8F0]/60'
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
          placeholder="Type a message…"
          disabled={disabled}
          className="flex-1 max-h-[120px] resize-none bg-transparent py-2 px-1.5 sm:px-2 text-small text-[#081226] placeholder-[#94A3B8] focus:outline-hidden font-medium leading-relaxed"
        />

        {/* Send Button */}
        <div className="pb-0.5 shrink-0">
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all ${
              text.trim() && !disabled
                ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-md hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
