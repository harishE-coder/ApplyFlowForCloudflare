-- Migration 0006: Ensure resumes and applications have created_at column
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE resumes SET created_at = upload_date WHERE created_at IS NULL AND upload_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes (created_at);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE applications SET created_at = applied_date WHERE created_at IS NULL AND applied_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications (created_at);
CREATE INDEX IF NOT EXISTS idx_applications_applied_date ON applications (applied_date);
