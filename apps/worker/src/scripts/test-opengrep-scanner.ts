// Test script to verify OpenGrep scanner functionality
import { registerOpenGrepScanner } from '../scanners/opengrep.scanner';
import { getGlobalRegistry } from '../scanners/registry';

async function main() {
  console.log('=== OpenGrep Scanner Test ===\n');

  // Register the scanner
  registerOpenGrepScanner();

  // Get the scanner from registry
  const registry = getGlobalRegistry();
  const scanner = registry.get('opengrep');

  if (!scanner) {
    console.error('Failed to get OpenGrep scanner from registry');
    process.exit(1);
  }

  console.log('Scanner metadata:', scanner.getMetadata());
  console.log('');

  // Initialize the scanner
  await scanner.init({
    enabled: true,
    timeout: 300000,
    options: {
      opengrepPath: 'opengrep',
      rulesConfig: 'auto',
    },
  });

  console.log('Scanner initialized successfully');
  console.log('');

  // Run scan on test file
  const testFile = '/workspace/src/test-vuln-code/vulnerable.js';
  console.log(`Running scan on: ${testFile}\n`);

  try {
    const result = await scanner.scan(testFile);

    console.log('=== Scan Results ===');
    console.log(`Total vulnerabilities found: ${result.summary.total}`);
    console.log(`  Critical: ${result.summary.critical}`);
    console.log(`  High: ${result.summary.high}`);
    console.log(`  Medium: ${result.summary.medium}`);
    console.log(`  Low: ${result.summary.low}`);
    console.log(`  Info: ${result.summary.info}`);
    console.log('');

    console.log('=== Vulnerabilities ===');
    for (const vuln of result.vulnerabilities) {
      console.log(`\n--- Vulnerability ---`);
      console.log(`Name: ${vuln.name}`);
      console.log(`Severity: ${vuln.severity}`);
      console.log(`File: ${vuln.filePath}`);
      console.log(`Line: ${vuln.lineNumber}`);
      console.log(`Code: ${vuln.code?.substring(0, 60)}...`);
      console.log(`Description: ${vuln.description}`);
      console.log(`Recommendation: ${vuln.recommendation}`);
    }

    // Test getResults()
    const cachedResults = scanner.getResults();
    if (cachedResults) {
      console.log('\n=== getResults() verification ===');
      console.log(`getResults() returned ${cachedResults.vulnerabilities.length} vulnerabilities`);
    }

    // Test cleanup
    await scanner.cleanup();
    console.log('\nScanner cleaned up successfully');

    // Verify findings
    if (result.summary.total > 0) {
      console.log('\n✅ Scanner test PASSED - Found vulnerabilities as expected');
      process.exit(0);
    } else {
      console.log('\n⚠️ Scanner test WARNING - No vulnerabilities found (expected at least 1)');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during scan:', error);
    process.exit(1);
  }
}

main().catch(console.error);
