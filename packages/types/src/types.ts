/**
 * Severity levels for vulnerabilities
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Status of a scan
 */
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Vulnerability type
 */
export interface Vulnerability {
  id: string;
  scanId: string;
  name: string;
  description: string;
  severity: SeverityLevel;
  filePath?: string;
  lineNumber?: number;
  code?: string;
  cve?: string;
  recommendation?: string;
  createdAt: string;
}

/**
 * Scan entity
 */
export interface Scan {
  id: string;
  name: string;
  target: string;
  status: ScanStatus;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scan result containing vulnerabilities and metadata
 */
export interface ScanResult {
  id: string;
  scanId: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  vulnerabilities: Vulnerability[];
  createdAt: string;
}

/**
 * Application settings
 */
export interface Settings {
  id: string;
  apiUrl: string;
  scanTimeout: number;
  maxConcurrentScans: number;
  notificationEmail?: string;
  enableNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  createdAt: string;
  updatedAt: string;
}

/**
 * Scanner type
 */
export type ScannerType = 
  | 'static'       // SAST - Static code analysis
  | 'dynamic'     // DAST - Dynamic/runtime analysis
  | 'dependency'  // SCA - Dependency vulnerability scanning
  | 'secret'      // Secret detection
  | 'composition' // Software composition analysis
  | 'iac'         // Infrastructure as Code scanning
  | 'mobile'      // Mobile application security
  | 'container';  // Container security

/**
 * Scanner metadata
 */
export interface ScannerMetadata {
  name: string;
  type: ScannerType;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  supportedTargets?: string[];
  requiresNetwork?: boolean;
}

/**
 * Scanner configuration for a scan
 */
export interface ScannerConfig {
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/**
 * Input for creating a new scan
 */
export interface CreateScanInput {
  name: string;
  target: string;
  scanners?: ScannerConfig[];
}

/**
 * Input for creating a new scan
 */
export interface CreateScanInput {
  name: string;
  target: string;
}

/**
 * Input for updating settings
 */
export interface UpdateSettingsInput {
  apiUrl?: string;
  scanTimeout?: number;
  maxConcurrentScans?: number;
  notificationEmail?: string;
  enableNotifications?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
