// Simple UUID v4 generator (inline to avoid external dependency)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';

/**
 * Test Scanner - A demo scanner that simulates scanning for vulnerabilities
 * This scanner is used for testing the scanner plugin system
 */
export class TestScanner extends BaseScanner {
  public readonly name = 'test-scanner';
  public readonly type: ScannerType = 'static';

  private scanCount = 0;

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'A test scanner for verifying the scanner plugin system',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['test', 'demo', 'example'],
      supportedTargets: ['*.js', '*.ts', '*.py', '*'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    // Custom initialization logic
    console.log(`[TestScanner] Custom initialization with options:`, config.options);
    this.scanCount = 0;
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    this.scanCount++;
    const scanId = generateUUID();

    console.log(`[TestScanner] Performing test scan #${this.scanCount} on: ${target}`);

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Generate mock vulnerabilities based on target
    const vulnerabilities = this.generateMockVulnerabilities(scanId, target, options);

    return this.createScanResult(scanId, vulnerabilities);
  }

  private generateMockVulnerabilities(
    scanId: string,
    target: string,
    options?: Record<string, unknown>
  ): ScanResult['vulnerabilities'] {
    const vulnerabilities: ScanResult['vulnerabilities'] = [];

    // Generate some mock vulnerabilities
    const vulnCount = (options?.vulnCount as number) ?? Math.floor(Math.random() * 3);

    for (let i = 0; i < vulnCount; i++) {
      const severity = ['critical', 'high', 'medium', 'low', 'info'][
        i % 5
      ] as ScanResult['vulnerabilities'][0]['severity'];

      vulnerabilities.push(
        this.createVulnerability(
          scanId,
          `Test Vulnerability ${i + 1}`,
          `This is a mock vulnerability found in ${target}`,
          severity,
          {
            filePath: target,
            lineNumber: Math.floor(Math.random() * 1000),
            code: 'const vulnerable = "example";',
            recommendation: 'Update to a secure version',
          }
        )
      );
    }

    return vulnerabilities;
  }

  protected async onCleanup(): Promise<void> {
    // Custom cleanup logic
    console.log(`[TestScanner] Cleanup completed. Total scans performed: ${this.scanCount}`);
    this.scanCount = 0;
  }

  canHandle(target: string): boolean {
    // Can handle any target for testing purposes
    return true;
  }

  /**
   * Get the number of scans performed
   */
  getScanCount(): number {
    return this.scanCount;
  }
}

/**
 * Factory function for creating TestScanner instances
 * Used for dependency injection
 */
export function createTestScanner(dependencies: Record<string, unknown>): TestScanner {
  console.log(
    '[TestScanner] Creating new TestScanner instance with dependencies:',
    Object.keys(dependencies)
  );
  return new TestScanner();
}

/**
 * Scanner plugin definition
 * This can be auto-loaded by the plugin discovery system
 */
export const testScannerPlugin: ScannerPlugin = {
  name: 'test-scanner',
  type: 'static',
  metadata: {
    description: 'A test scanner for verifying the scanner plugin system',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['test', 'demo', 'example'],
    supportedTargets: ['*.js', '*.ts', '*.py', '*'],
    requiresNetwork: false,
  },
  factory: createTestScanner,
};

/**
 * Register the test scanner with a registry
 */
export function registerTestScanner(registry?: ScannerRegistry): void {
  const reg = registry ?? getGlobalRegistry();

  // Register using the plugin
  reg.registerFactory(
    testScannerPlugin.name,
    testScannerPlugin.type,
    testScannerPlugin.factory,
    testScannerPlugin.metadata
  );

  console.log('[TestScanner] Registered with scanner registry');
}

// Auto-register when imported (for testing purposes)
// This allows the scanner to be auto-discovered
let autoRegistered = false;

/**
 * Enable auto-registration for this scanner
 */
export function enableAutoRegistration(): void {
  if (!autoRegistered) {
    registerTestScanner();
    autoRegistered = true;
  }
}

// Export the scanner class as default for convenience
export default TestScanner;
