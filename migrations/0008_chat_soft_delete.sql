-- Migration 0008: Chat Soft Delete & Admin Audit View
-- Stores soft deletion state, who deleted it, and when, preserving full audit capability for Admins.

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_chat_messages_is_deleted
ON chat_messages(room_id, is_deleted);
