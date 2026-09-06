-- Migration: Add Cloudflare R2 object storage metadata and retention fields to resumes table
-- Target: Neon PostgreSQL and SQLite compatible DDL

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS r2_key VARCHAR(500);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS content_type VARCHAR(100) DEFAULT 'application/pdf';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Create indices for fast R2 key lookups and automated retention cleanup
CREATE INDEX IF NOT EXISTS ix_resumes_r2_key ON resumes(r2_key);
CREATE INDEX IF NOT EXISTS ix_resumes_expires_at ON resumes(expires_at);
