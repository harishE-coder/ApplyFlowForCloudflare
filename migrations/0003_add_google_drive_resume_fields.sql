-- Migration: Add Google Drive resume storage metadata fields
-- Targets: Neon PostgreSQL and SQLite compatible DDL

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS drive_web_view_link VARCHAR(1000);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS drive_download_link VARCHAR(1000);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS content_type VARCHAR(100) DEFAULT 'application/pdf';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Create indices for fast Google Drive file ID lookups, deduplication, and retention cleanup
CREATE INDEX IF NOT EXISTS ix_resumes_drive_file_id ON resumes(drive_file_id);
CREATE INDEX IF NOT EXISTS ix_resumes_file_hash ON resumes(file_hash);
CREATE INDEX IF NOT EXISTS ix_resumes_expires_at ON resumes(expires_at);
