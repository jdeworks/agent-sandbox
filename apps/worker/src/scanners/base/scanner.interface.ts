import { Vulnerability, ScanResult } from '@security-analyzer/types';

// Re-export types for convenience
export type { Vulnerability, ScanResult };

/**
 * Scanner types supported by the system
 */
export type ScannerType =
  | 'static'        // SAST - Static code analysis
  | 'dynamic'       // DAST - Dynamic/runtime analysis
  | 'dependency'    // SCA - Dependency vulnerability scanning
  | 'secret'       // Secret detection
  | 'composition'  // Software composition analysis
  | 'iac'          // Infrastructure as Code scanning
  | 'mobile'       // Mobile application security
  | 'container'    // Container security
  | 'custom';      // Custom scanner type

/**
 * Scanner configuration options
 */
export interface ScannerConfig {
  enabled: boolean;
  timeout?: number;
  maxMemory?: number;
  parallel?: boolean;
  options?: Record<string, unknown>;
}

/**
 * Scanner metadata containing descriptive information
 */
export interface ScannerMetadata {
  name: string;
  type: ScannerType;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  supportedTargets?: string[];
  requiresNetwork?: boolean;
}

/**
 * Base interface that all scanners must implement
 */
export interface Scanner {
  /**
   * Unique identifier for the scanner
   */
  readonly name: string;

  /**
   * Type of scanner
   */
  readonly type: ScannerType;

  /**
   * Get scanner metadata
   */
  getMetadata(): ScannerMetadata;

  /**
   * Initialize the scanner with configuration
   * Called once before any scan operations
   */
  init(config: ScannerConfig): Promise<void>;

  /**
   * Execute a scan on the given target
   * @param target The target to scan (file path, URL, package name, etc.)
   * @param options Additional scan options
   */
  scan(target: string, options?: Record<string, unknown>): Promise<ScanResult>;

  /**
   * Get the results from the last scan
   */
  getResults(): ScanResult | null;

  /**
   * Clean up resources after scanning
   * Called after scan completion or on cancellation
   */
  cleanup(): Promise<void>;

  /**
   * Validate if the scanner can handle the given target
   */
  canHandle(target: string): boolean;
}

/**
 * Abstract base class providing common scanner functionality
 */
export abstract class BaseScanner implements Scanner {
  public abstract readonly name: string;
  public abstract readonly type: ScannerType;
  
  protected config: ScannerConfig | null = null;
  protected lastResults: ScanResult | null = null;
  protected initialized = false;

  abstract getMetadata(): ScannerMetadata;

  async init(config: ScannerConfig): Promise<void> {
    if (this.initialized) {
      console.warn(`[${this.name}] Scanner already initialized, skipping...`);
      return;
    }

    console.log(`[${this.name}] Initializing scanner with config:`, config);
    await this.onInit(config);
    this.config = config;
    this.initialized = true;
  }

  /**
   * Override this method to implement custom initialization logic
   */
  protected async onInit(config: ScannerConfig): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override to add custom initialization
  }

  async scan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    if (!this.initialized || !this.config) {
      throw new Error(`[${this.name}] Scanner not initialized. Call init() first.`);
    }

    if (!this.canHandle(target)) {
      throw new Error(`[${this.name}] Cannot handle target: ${target}`);
    }

    console.log(`[${this.name}] Starting scan for target: ${target}`);
    
    const result = await this.onScan(target, options);
    this.lastResults = result;
    
    console.log(`[${this.name}] Scan completed. Found ${result.vulnerabilities.length} vulnerabilities.`);
    
    return result;
  }

  /**
   * Override this method to implement actual scanning logic
   */
  protected abstract onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult>;

  getResults(): ScanResult | null {
    return this.lastResults;
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log(`[${this.name}] Cleaning up scanner resources...`);
    await this.onCleanup();
    this.config = null;
    this.lastResults = null;
    this.initialized = false;
  }

  /**
   * Override this method to implement custom cleanup logic
   */
  protected async onCleanup(): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override to add custom cleanup
  }

  abstract canHandle(target: string): boolean;

  /**
   * Helper method to create a vulnerability object
   */
  protected createVulnerability(
    scanId: string,
    name: string,
    description: string,
    severity: Vulnerability['severity'],
    additionalFields: Partial<Vulnerability> = {}
  ): Vulnerability {
    return {
      id: `${scanId}-${this.name}-${Date.now()}`,
      scanId,
      name,
      description,
      severity,
      createdAt: new Date().toISOString(),
      ...additionalFields,
    };
  }

  /**
   * Helper method to create a scan result
   */
  protected createScanResult(
    scanId: string,
    vulnerabilities: Vulnerability[]
  ): ScanResult {
    const summary = {
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length,
      info: vulnerabilities.filter(v => v.severity === 'info').length,
    };

    return {
      id: `result-${scanId}-${Date.now()}`,
      scanId,
      summary,
      vulnerabilities,
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * Factory function type for creating scanner instances
 */
export type ScannerFactory<T extends Scanner = Scanner> = (
  dependencies: Record<string, unknown>
) => T;

/**
 * Scanner registration data
 */
export interface ScannerRegistration {
  scanner?: Scanner;
  factory?: ScannerFactory;
  metadata: ScannerMetadata;
}
