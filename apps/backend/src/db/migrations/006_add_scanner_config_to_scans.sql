-- Migration: 006_add_scanner_config_to_scans.sql
-- Description: Add scanner configuration column to scans table
-- Created: 2026-03-04

ALTER TABLE scans ADD COLUMN IF NOT EXISTS config JSONB;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_mode VARCHAR(50) DEFAULT 'url';
