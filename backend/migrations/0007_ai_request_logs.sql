-- Migration: Create ai_request_logs table for AI Usage Analytics, Telemetry, and Cost Tracking
-- Target: Neon PostgreSQL (ApplyFlow Serverless Backend)

CREATE TABLE IF NOT EXISTS ai_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(64) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    estimated_cost NUMERIC(10, 6) DEFAULT 0.0,
    latency_ms INT NOT NULL,
    success BOOLEAN NOT NULL,
    fallback_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup indices for dashboard filtering, provider health aggregation, and request tracing
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON ai_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_logs_provider ON ai_request_logs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_logs_request_id ON ai_request_logs(request_id);
