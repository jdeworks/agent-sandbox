/**
 * Test script for InputDetector service
 * Tests: Git URLs, Local paths, URLs, Binary files
 */

import * as fs from 'fs';
import * as path from 'path';
import { InputDetector, InputType } from '../services/inputDetector';

async function runTests() {
  console.log('=== InputDetector Test Suite ===\n');

  // Create temp test directory
  const testDir = path.join(__dirname, 'test-temp');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const detector = new InputDetector(testDir);
  let passed = 0;
  let failed = 0;

  // Test helper
  async function test(name: string, result: any, expectedType: InputType, shouldBeValid: boolean) {
    console.log(`\n[Test] ${name}`);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.type === expectedType && result.isValid === shouldBeValid) {
      console.log(`✅ PASSED`);
      passed++;
    } else {
      console.log(`❌ FAILED - Expected type: ${expectedType}, valid: ${shouldBeValid}`);
      failed++;
    }
  }

  try {
    // === TEST 1: Local Path Detection ===
    console.log('\n--- Testing Local Path Detection ---');

    // Test existing file
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const result1 = await detector.analyze(packageJsonPath);
    await test('Local file (package.json)', result1, InputType.LOCAL, true);

    // Test existing directory
    const result2 = await detector.analyze(__dirname);
    await test('Local directory', result2, InputType.LOCAL, true);

    // Test non-existent path (now should return LOCAL with isValid=false)
    const result3 = await detector.analyze('/nonexistent/path/to/nowhere');
    await test('Non-existent path', result3, InputType.LOCAL, false);

    // === TEST 2: URL Detection ===
    console.log('\n--- Testing URL Detection ---');

    // Test reachable URL
    const result4 = await detector.analyze('https://httpbin.org/status/200');
    await test('Reachable URL (httpbin)', result4, InputType.URL, true);

    // Test invalid URL (non-existent domain)
    const result5 = await detector.analyze(
      'https://this-domain-does-not-exist-12345.xyz/status/200'
    );
    await test('Unreachable URL', result5, InputType.URL, false);

    // === TEST 3: Git URL Detection ===
    console.log('\n--- Testing Git URL Detection ---');

    // Test GitHub URL (this will actually clone - may take time)
    console.log('Note: Git clone tests will clone repos to temp directory...');
    const result6 = await detector.analyze('https://github.com/octocat/Hello-World.git');
    await test('GitHub URL (octocat/Hello-World)', result6, InputType.GIT, true);

    // Cleanup git clone
    if (result6.clonePath && fs.existsSync(result6.clonePath)) {
      fs.rmSync(result6.clonePath, { recursive: true, force: true });
    }

    // Test invalid git URL
    const result7 = await detector.analyze(
      'https://github.com/this-repo-does-not-exist-12345/repo.git'
    );
    await test('Invalid GitHub URL', result7, InputType.GIT, false);

    // === TEST 4: Binary File Detection ===
    console.log('\n--- Testing Binary File Detection ---');

    // Binary detection is a fallback for non-path inputs
    // Test with direct binary analysis method since existing files are detected as local

    // Create test binary files
    const zipPath = path.join(testDir, 'test.zip');
    const pngPath = path.join(testDir, 'test.png');
    const elfPath = path.join(testDir, 'test.elf');
    const textPath = path.join(testDir, 'test.txt');

    // Create a minimal ZIP file (PK\x03\x04)
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    fs.writeFileSync(zipPath, zipBuffer);

    // Create a minimal PNG file
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(pngPath, pngBuffer);

    // Create a minimal ELF file
    const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00]);
    fs.writeFileSync(elfPath, elfBuffer);

    // Create a text file
    fs.writeFileSync(textPath, 'This is a plain text file');

    // Test binary detection using analyzeBinary directly
    const result8 = await detector.analyzeBinary(zipPath);
    await test('ZIP binary file (direct)', result8, InputType.BINARY, true);
    console.log('  MimeType:', result8.metadata?.mimeType);

    const result9 = await detector.analyzeBinary(pngPath);
    await test('PNG binary file (direct)', result9, InputType.BINARY, true);
    console.log('  MimeType:', result9.metadata?.mimeType);

    const result10 = await detector.analyzeBinary(elfPath);
    await test('ELF binary file (direct)', result10, InputType.BINARY, true);
    console.log('  MimeType:', result10.metadata?.mimeType);

    const result11 = await detector.analyzeBinary(textPath);
    await test('Text file (should fail binary detection)', result11, InputType.BINARY, false);

    // Test non-existent binary
    const result12 = await detector.analyzeBinary('/nonexistent/file.bin');
    await test('Non-existent binary file', result12, InputType.BINARY, false);

    // === TEST 5: Helper Methods ===
    console.log('\n--- Testing Helper Methods ---');

    const testUrl = 'https://github.com/microsoft/vscode.git';
    console.log(`isGitUrl('${testUrl}'): ${detector.isGitUrl(testUrl)}`);
    console.log(`isUrl('${testUrl}'): ${detector.isUrl(testUrl)}`);
    console.log(`looksLikePath('/some/path'): ${detector.looksLikePath('/some/path')}`);
    console.log(`looksLikePath('https://url'): ${detector.looksLikePath('https://url')}`);
    console.log(`isLocalPath('${packageJsonPath}'): ${detector.isLocalPath(packageJsonPath)}`);

    // === Cleanup ===
    console.log('\n--- Cleanup ---');
    detector.cleanup();

    // Remove test files
    fs.rmSync(testDir, { recursive: true, force: true });

    // === Summary ===
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}/${passed + failed}`);
    console.log(`Failed: ${failed}/${passed + failed}`);

    if (failed > 0) {
      console.log('\n⚠️  Some tests failed!');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Test execution error:', error);
    detector.cleanup();
    // Cleanup test dir
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    process.exit(1);
  }
}

runTests();
