-- Migration: Performance Indexes for Notifications and Chat
-- Targets: Neon PostgreSQL and SQLite compatible DDL

-- 1. Index on notifications for constant-time unread queries (navbar badge & count)
CREATE INDEX IF NOT EXISTS ix_notifications_user_unread
ON notifications(user_id, is_read);

-- 2. Index on chat messages for fast room history & pagination (infinite scroll)
CREATE INDEX IF NOT EXISTS ix_chat_messages_room_created
ON chat_messages(room_id, created_at DESC);

-- 3. Idempotency support for chat messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS ix_chat_messages_client_id
ON chat_messages(room_id, client_message_id);
