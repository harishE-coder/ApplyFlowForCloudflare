-- Migration 0009: Add work_date to resumes for decoupling productivity from audit timestamps
ALTER TABLE resumes
ADD COLUMN IF NOT EXISTS work_date DATE NOT NULL
DEFAULT ((NOW() AT TIME ZONE 'Asia/Kolkata')::date);

-- Backfill existing records with resume_date or upload_date in IST
UPDATE resumes
SET work_date = COALESCE(
    resume_date,
    (upload_date AT TIME ZONE 'Asia/Kolkata')::date,
    (NOW() AT TIME ZONE 'Asia/Kolkata')::date
)
WHERE work_date IS NULL;

-- Performance indexes for productivity queries and recruiter aggregation
CREATE INDEX IF NOT EXISTS idx_resumes_work_date
ON resumes(work_date);

CREATE INDEX IF NOT EXISTS idx_resumes_work_date_uploaded_by
ON resumes(work_date, uploaded_by);
