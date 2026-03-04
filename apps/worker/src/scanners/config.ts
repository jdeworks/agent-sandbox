import { z } from 'zod';
import { ScannerConfig } from './base';

/**
 * Scanner type enum
 */
export const ScannerTypeSchema = z.enum([
  'static',       // SAST - Static code analysis
  'dynamic',     // DAST - Dynamic/runtime analysis
  'dependency',  // SCA - Dependency vulnerability scanning
  'secret',      // Secret detection
  'composition', // Software composition analysis
  'iac',         // Infrastructure as Code scanning
  'mobile',      // Mobile application security
  'container',   // Container security
  'custom',      // Custom scanner type
]);

/**
 * Scanner type enum
 */

export type ScannerTypeEnum = z.infer<typeof ScannerTypeSchema>;

/**
 * Severity level enum
 */
export const SeverityLevelSchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

/**
 * Individual scanner configuration
 */
export const ScannerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.number().positive().optional(),
  maxMemory: z.number().positive().optional(),
  parallel: z.boolean().default(false),
  options: z.record(z.unknown()).optional(),
});

export type ScannerConfigInput = z.infer<typeof ScannerConfigSchema>;

/**
 * Scanner metadata configuration
 */
export const ScannerMetadataConfigSchema = z.object({
  name: z.string().min(1),
  type: ScannerTypeSchema,
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  supportedTargets: z.array(z.string()).optional(),
  requiresNetwork: z.boolean().optional(),
});

export type ScannerMetadataConfig = z.infer<typeof ScannerMetadataConfigSchema>;

/**
 * Scanner registration configuration
 */
export const ScannerRegistrationConfigSchema = z.object({
  metadata: ScannerMetadataConfigSchema,
  config: ScannerConfigSchema,
});

export type ScannerRegistrationConfig = z.infer<typeof ScannerRegistrationConfigSchema>;

/**
 * Complete scanners configuration for the application
 */
export const ScannersConfigSchema = z.object({
  scanners: z.record(z.string(), ScannerRegistrationConfigSchema),
  defaults: ScannerConfigSchema.optional(),
});

export type ScannersConfig = z.infer<typeof ScannersConfigSchema>;

/**
 * Default scanner configuration
 */
export const DEFAULT_SCANNER_CONFIG: ScannerConfigInput = {
  enabled: true,
  timeout: 300000, // 5 minutes
  maxMemory: 512, // 512MB
  parallel: false,
};

/**
 * Validate scanner configuration
 */
export function validateScannerConfig(config: unknown): ScannerConfigInput {
  return ScannerConfigSchema.parse(config);
}

/**
 * Validate scanners configuration
 */
export function validateScannersConfig(config: unknown): ScannersConfig {
  return ScannersConfigSchema.parse(config);
}

/**
 * Merge scanner configs with defaults
 */
export function mergeWithDefaults(
  scannerConfigs: Record<string, ScannerRegistrationConfig>,
  defaults?: ScannerConfigInput
): Record<string, ScannerConfig> {
  const result: Record<string, ScannerConfig> = {};
  const defaultConfig = { ...DEFAULT_SCANNER_CONFIG, ...defaults };

  for (const [name, registration] of Object.entries(scannerConfigs)) {
    result[name] = {
      ...defaultConfig,
      ...registration.config,
    };
  }

  return result;
}
