-- Migration 0004: Ensure password_hash column in users table matches Neon schema
-- Supports seamless migration from legacy hashed_password to password_hash

DO $$
BEGIN
    -- If hashed_password exists but password_hash does not, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'hashed_password'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users RENAME COLUMN hashed_password TO password_hash;
    END IF;

    -- If both exist or if password_hash is missing, ensure password_hash exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
    END IF;
END $$;
