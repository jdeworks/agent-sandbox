/**
 * Unit tests for Scanner Configuration
 */

import {
  ScannerTypeSchema,
  ScannerConfigSchema,
  SeverityLevelSchema,
  ScannersConfigSchema,
  validateScannerConfig,
  validateScannersConfig,
  mergeWithDefaults,
  DEFAULT_SCANNER_CONFIG,
  ScannerConfigInput,
  ScannersConfig,
} from '../config';

describe('ScannerTypeSchema', () => {
  it('should validate standard scanner types', () => {
    expect(ScannerTypeSchema.safeParse('static').success).toBe(true);
    expect(ScannerTypeSchema.safeParse('dynamic').success).toBe(true);
    expect(ScannerTypeSchema.safeParse('dependency').success).toBe(true);
    expect(ScannerTypeSchema.safeParse('secret').success).toBe(true);
  });

  it('should validate new scanner types', () => {
    expect(ScannerTypeSchema.safeParse('iac').success).toBe(true);
    expect(ScannerTypeSchema.safeParse('mobile').success).toBe(true);
    expect(ScannerTypeSchema.safeParse('container').success).toBe(true);
  });

  it('should reject invalid scanner types', () => {
    expect(ScannerTypeSchema.safeParse('invalid').success).toBe(false);
    expect(ScannerTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('ScannerConfigSchema', () => {
  it('should validate minimal config', () => {
    const result = ScannerConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate full config', () => {
    const config = {
      enabled: true,
      timeout: 60000,
      maxMemory: 1024,
      parallel: true,
      options: { customOption: 'value' },
    };

    const result = ScannerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should use defaults for missing fields', () => {
    const result = ScannerConfigSchema.parse({});

    expect(result.enabled).toBe(true);
    expect(result.parallel).toBe(false);
  });

  it('should reject negative timeout', () => {
    const result = ScannerConfigSchema.safeParse({ timeout: -1 });
    expect(result.success).toBe(false);
  });
});

describe('SeverityLevelSchema', () => {
  it('should validate all severity levels', () => {
    expect(SeverityLevelSchema.safeParse('critical').success).toBe(true);
    expect(SeverityLevelSchema.safeParse('high').success).toBe(true);
    expect(SeverityLevelSchema.safeParse('medium').success).toBe(true);
    expect(SeverityLevelSchema.safeParse('low').success).toBe(true);
    expect(SeverityLevelSchema.safeParse('info').success).toBe(true);
  });

  it('should reject invalid severity', () => {
    expect(SeverityLevelSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('ScannersConfigSchema', () => {
  it('should validate scanner configurations', () => {
    const config = {
      scanners: {
        semgrep: {
          metadata: { name: 'semgrep', type: 'static' },
          config: { enabled: true },
        },
        gitleaks: {
          metadata: { name: 'gitleaks', type: 'secret' },
          config: { enabled: false },
        },
      },
    };

    const result = ScannersConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should allow defaults', () => {
    const config = {
      scanners: {
        semgrep: {
          metadata: { name: 'semgrep', type: 'static' },
          config: { enabled: true },
        },
      },
      defaults: {
        timeout: 120000,
      },
    };

    const result = ScannersConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe('validateScannerConfig', () => {
  it('should return parsed config', () => {
    const input = { enabled: true, timeout: 60000 };
    const result = validateScannerConfig(input);

    expect(result.enabled).toBe(true);
    expect(result.timeout).toBe(60000);
  });

  it('should throw on invalid config', () => {
    expect(() => validateScannerConfig({ timeout: -1 })).toThrow();
  });
});

describe('validateScannersConfig', () => {
  it('should validate full config', () => {
    const input: any = {
      scanners: {
        test: {
          metadata: { name: 'test', type: 'static' },
          config: { enabled: true },
        },
      },
    };

    const result = validateScannersConfig(input);
    expect(result.scanners).toBeDefined();
  });
});

describe('mergeWithDefaults', () => {
  it('should merge scanner configs with defaults', () => {
    const scannerConfigs = {
      semgrep: {
        metadata: { name: 'semgrep', type: 'static' },
        config: { enabled: true, timeout: 120000 },
      },
      gitleaks: {
        metadata: { name: 'gitleaks', type: 'secret' },
        config: { enabled: false },
      },
    };

    const result = mergeWithDefaults(scannerConfigs);

    // semgrep should have its timeout, but also defaults
    expect(result.semgrep.enabled).toBe(true);
    expect(result.semgrep.timeout).toBe(120000);
    expect(result.semgrep.maxMemory).toBe(DEFAULT_SCANNER_CONFIG.maxMemory);

    // gitleaks should have default timeout
    expect(result.gitleaks.enabled).toBe(false);
    expect(result.gitleaks.timeout).toBe(DEFAULT_SCANNER_CONFIG.timeout);
  });

  it('should use custom defaults when provided', () => {
    const scannerConfigs = {
      semgrep: {
        metadata: { name: 'semgrep', type: 'static' },
        config: { enabled: true },
      },
    };

    const customDefaults = { timeout: 180000 };
    const result = mergeWithDefaults(scannerConfigs, customDefaults);

    expect(result.semgrep.timeout).toBe(180000);
  });
});

describe('DEFAULT_SCANNER_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_SCANNER_CONFIG.enabled).toBe(true);
    expect(DEFAULT_SCANNER_CONFIG.timeout).toBe(300000);
    expect(DEFAULT_SCANNER_CONFIG.maxMemory).toBe(512);
    expect(DEFAULT_SCANNER_CONFIG.parallel).toBe(false);
  });
});
