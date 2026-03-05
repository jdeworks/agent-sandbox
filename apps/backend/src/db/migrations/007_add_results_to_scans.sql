-- Migration: 007_add_results_to_scans.sql
-- Description: Add results JSONB column to scans table for storing scan results
-- Created: 2026-03-04

ALTER TABLE scans ADD COLUMN IF NOT EXISTS results JSONB;
