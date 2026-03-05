-- Migration: 002_create_scan_results_table.sql
-- Description: Create scan_results table for storing individual scan results
-- Created: 2026-02-26

CREATE TABLE IF NOT EXISTS scan_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    result_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20),
    title TEXT,
    description TEXT,
    affected_url TEXT,
    remediation TEXT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_results_scan_id ON scan_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_severity ON scan_results(severity);
