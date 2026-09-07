-- Migration 0005: Allow nullable requirement client_id for global job openings
-- Enables requirements to be created as "Global for All" where client_id is NULL

ALTER TABLE requirements ALTER COLUMN client_id DROP NOT NULL;
