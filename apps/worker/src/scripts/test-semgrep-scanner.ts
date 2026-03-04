// Test script for SemgrepScanner
import { SemgrepScanner, registerSemgrepScanner } from '../scanners/semgrep.scanner';
import { ScannerRegistry } from '../scanners/registry';

async function testSemgrepScanner() {
  console.log('=== Testing Semgrep Scanner ===\n');

  // Create a local registry for testing
  const registry = new ScannerRegistry();

  // Register the semgrep scanner
  registerSemgrepScanner(registry);

  console.log(`Registered scanners: ${registry.getAllNames().join(', ')}\n`);

  // Get the semgrep scanner
  const scanner = registry.get('semgrep');

  if (!scanner) {
    console.error('ERROR: Semgrep scanner not found in registry');
    process.exit(1);
  }

  console.log(`Scanner metadata: ${JSON.stringify(scanner.getMetadata(), null, 2)}\n`);

  // Initialize the scanner
  await scanner.init({ enabled: true });
  console.log('Scanner initialized\n');

  // Test canHandle
  console.log(`canHandle('test.py'): ${scanner.canHandle('test.py')}`);
  console.log(`canHandle('test.js'): ${scanner.canHandle('test.js')}`);
  console.log(`canHandle('/tmp/code'): ${scanner.canHandle('/tmp/code')}\n`);

  // Perform a scan on the test sample
  const target = '/tmp/semgrep-test-sample';
  console.log(`Scanning target: ${target}\n`);

  try {
    const result = await scanner.scan(target);

    console.log('=== Scan Results ===');
    console.log(`Scan ID: ${result.id}`);
    console.log(`Total vulnerabilities: ${result.summary.total}`);
    console.log(`  Critical: ${result.summary.critical}`);
    console.log(`  High: ${result.summary.high}`);
    console.log(`  Medium: ${result.summary.medium}`);
    console.log(`  Low: ${result.summary.low}`);
    console.log(`  Info: ${result.summary.info}\n`);

    if (result.vulnerabilities.length > 0) {
      console.log('=== Vulnerabilities Found ===');
      result.vulnerabilities.forEach((vuln, i) => {
        console.log(`\n[${i + 1}] ${vuln.name}`);
        console.log(`    Severity: ${vuln.severity}`);
        console.log(`    File: ${vuln.filePath}:${vuln.lineNumber}`);
        console.log(`    Description: ${vuln.description.substring(0, 100)}...`);
      });
    }

    console.log('\n=== Test PASSED ===');
  } catch (error) {
    console.error('Scan failed:', error);
    process.exit(1);
  }

  // Cleanup
  await scanner.cleanup();
  console.log('\nScanner cleaned up');
}

testSemgrepScanner().catch(console.error);
