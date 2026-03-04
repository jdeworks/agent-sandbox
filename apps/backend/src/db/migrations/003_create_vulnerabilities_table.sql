-- Migration: 003_create_vulnerabilities_table.sql
-- Description: Create vulnerabilities table for tracking discovered vulnerabilities
-- Created: 2026-02-26

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_result_id UUID REFERENCES scan_results(id) ON DELETE SET NULL,
    cve_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL,
    cvss_score DECIMAL(3, 1),
    affected_component VARCHAR(255),
    remediation TEXT,
    vuln_references TEXT[],
    status VARCHAR(20) DEFAULT 'open',
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vulnerabilities_scan_result_id ON vulnerabilities(scan_result_id);
CREATE INDEX idx_vulnerabilities_severity ON vulnerabilities(severity);
CREATE INDEX idx_vulnerabilities_status ON vulnerabilities(status);
CREATE INDEX idx_vulnerabilities_cve_id ON vulnerabilities(cve_id);
