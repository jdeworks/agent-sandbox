#!/usr/bin/env node
/**
 * Security Scanner Test Suite - JavaScript Version
 * Comprehensive vulnerability testing across multiple repositories
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Attack vectors with detailed descriptions
const ATTACK_VECTORS = {
  SQLi: {
    name: 'SQL Injection',
    cwe: 'CWE-89',
    description: 'Injection of malicious SQL code through user input',
    severity: 'critical',
    attackVector: 'User input is directly concatenated into SQL query without proper sanitization',
    exploitExample: "' OR '1'='1' --",
    remediation: 'Use parameterized queries (prepared statements) or ORM',
  },
  XSS: {
    name: 'Cross-Site Scripting',
    cwe: 'CWE-79',
    description: 'Injection of malicious scripts into web pages',
    severity: 'high',
    attackVector: 'User input is reflected in HTML output without proper encoding',
    exploitExample: '<script>alert(document.cookie)</script>',
    remediation: 'Use output encoding and Content Security Policy',
  },
  CMDi: {
    name: 'Command Injection',
    cwe: 'CWE-78',
    description: 'Execution of arbitrary commands through system calls',
    severity: 'critical',
    attackVector: 'User input is passed to system shell without sanitization',
    exploitExample: '; rm -rf /',
    remediation: 'Avoid shell execution, use exec with array arguments',
  },
  PT: {
    name: 'Path Traversal',
    cwe: 'CWE-22',
    description: 'Accessing files outside the web root folder',
    severity: 'high',
    attackVector: 'File path input contains ../ allowing directory escape',
    exploitExample: '../../../etc/passwd',
    remediation: 'Validate and sanitize file paths, use chroot',
  },
  Deser: {
    name: 'Insecure Deserialization',
    cwe: 'CWE-502',
    description: 'Deserializing untrusted data leading to code execution',
    severity: 'critical',
    attackVector: 'Application deserializes data from untrusted source',
    exploitExample: 'pickle.loads(user_data)',
    remediation: 'Use JSON instead of pickle, validate input',
  },
  HardSecret: {
    name: 'Hardcoded Secrets',
    cwe: 'CWE-798',
    description: 'Hardcoded passwords, API keys, tokens in source code',
    severity: 'critical',
    attackVector: 'Sensitive credentials are hardcoded in source code',
    exploitExample: 'password = "admin123"',
    remediation: 'Use environment variables or secrets management',
  },
  Eval: {
    name: 'Eval Injection',
    cwe: 'CWE-95',
    description: 'Use of eval() with untrusted input',
    severity: 'high',
    attackVector: 'User input is passed to eval() function',
    exploitExample: 'eval("os.system(\'ls\')")',
    remediation: 'Avoid eval(), use safer alternatives',
  },
  SSTI: {
    name: 'Server-Side Template Injection',
    cwe: 'CWE-1336',
    description: 'Injection into template engines leading to RCE',
    severity: 'critical',
    attackVector: 'User input is passed to template engine without sanitization',
    exploitExample: '{{config.items()}}',
    remediation: 'Sandbox templates, disable dangerous features',
  },
  AuthBypass: {
    name: 'Authentication Bypass',
    cwe: 'CWE-287',
    description: 'Circumventing authentication mechanisms',
    severity: 'critical',
    attackVector: 'Authentication checks can be bypassed',
    exploitExample: 'if user.is_admin: # missing decorator',
    remediation: 'Use established auth frameworks, proper decorators',
  },
  WeakCrypto: {
    name: 'Weak Cryptography',
    cwe: 'CWE-327',
    description: 'Use of weak cryptographic algorithms',
    severity: 'high',
    attackVector: 'Weak encryption algorithms like MD5, SHA1 used',
    exploitExample: 'hashlib.md5(data)',
    remediation: 'Use SHA-256+ for hashing, AES-256 for encryption',
  },
  SSRF: {
    name: 'Server-Side Request Forgery',
    cwe: 'CWE-918',
    description: 'Making server perform requests to internal resources',
    severity: 'high',
    attackVector: 'URL parameter can be manipulated to access internal services',
    exploitExample: 'http://169.254.169.254/latest/meta-data/',
    remediation: 'Validate URLs, disable redirect following',
  },
  XXE: {
    name: 'XML External Entity',
    cwe: 'CWE-611',
    description: 'Processing of external entity references in XML',
    severity: 'high',
    attackVector: 'XML parser processes external entities',
    exploitExample: '<!ENTITY xxe SYSTEM "file:///etc/passwd">',
    remediation: 'Disable external entities in XML parser',
  },
  Race: {
    name: 'Race Condition',
    cwe: 'CWE-362',
    description: 'Timing window vulnerability in concurrent operations',
    severity: 'high',
    attackVector: 'Concurrent access to shared resource without proper locking',
    exploitExample: 'Check-then-act pattern in multi-threaded code',
    remediation: 'Use proper locking, atomic operations',
  },
  LDAPi: {
    name: 'LDAP Injection',
    cwe: 'CWE-90',
    description: 'Injection of LDAP statements',
    severity: 'high',
    attackVector: 'User input in LDAP query without sanitization',
    exploitExample: '*)(uid=*))(|(uid=*',
    remediation: 'Escape special characters in LDAP queries',
  },
  PathExp: {
    name: 'Path Exposure',
    cwe: 'CWE-200',
    description: 'Exposure of sensitive file paths',
    severity: 'medium',
    attackVector: 'Error messages reveal full file paths',
    exploitExample: 'Error: /var/www/app/config.php not found',
    remediation: 'Disable detailed errors in production',
  },
};

// Popular repositories to scan
const REPOSITORIES = [
  { name: 'django', url: 'https://github.com/django/django', lang: 'Python' },
  { name: 'flask', url: 'https://github.com/pallets/flask', lang: 'Python' },
  { name: 'express', url: 'https://github.com/expressjs/express', lang: 'JavaScript' },
  { name: 'fastapi', url: 'https://github.com/tiangolo/fastapi', lang: 'Python' },
  { name: 'requests', url: 'https://github.com/psf/requests', lang: 'Python' },
  { name: 'lodash', url: 'https://github.com/lodash/lodash', lang: 'JavaScript' },
  { name: 'ansible', url: 'https://github.com/ansible/ansible', lang: 'Python' },
];

// Vulnerability patterns to detect
const SCAN_PATTERNS = {
  SQLi: [
    { pattern: /execute\s*\(\s*["\'].*%s.*["\'].*\)/, lang: 'Python' },
    { pattern: /query\s*\(\s*["\'].*\+.*["\'].*\)/, lang: 'JavaScript' },
  ],
  XSS: [
    { pattern: /dangerouslySetInnerHTML/, lang: 'JavaScript' },
    { pattern: /innerHTML\s*=/, lang: 'JavaScript' },
    { pattern: /render_template_string/, lang: 'Python' },
  ],
  CMDi: [
    { pattern: /os\.system\s*\(/, lang: 'Python' },
    { pattern: /subprocess\.call\s*\(\s*shell\s*=\s*True/, lang: 'Python' },
    { pattern: /exec\s*\(\s*.*\+.*\)/, lang: 'Python' },
  ],
  HardSecret: [
    { pattern: /password\s*=\s*["\'][^"\']{3,}["\']/, lang: 'all' },
    { pattern: /api[_-]?key\s*=\s*["\'][^"\']{10,}["\']/, lang: 'all' },
    { pattern: /secret\s*=\s*["\'][^"\']{10,}["\']/, lang: 'all' },
  ],
  Eval: [
    { pattern: /eval\s*\(/, lang: 'JavaScript' },
    { pattern: /eval\s*\(/, lang: 'Python' },
    { pattern: /Function\s*\(/, lang: 'JavaScript' },
  ],
  WeakCrypto: [
    { pattern: /hashlib\.md5\s*\(/, lang: 'Python' },
    { pattern: /hashlib\.sha1\s*\(/, lang: 'Python' },
  ],
  Deser: [
    { pattern: /pickle\.loads\s*\(/, lang: 'Python' },
    { pattern: /yaml\.load\s*\([^,)]*\)/, lang: 'Python' },
  ],
};

class SecurityScannerTestSuite {
  constructor() {
    this.results = [];
    this.clonedRepos = [];
    this.tempDir = '/tmp/security-scans';
  }

  async initialize() {
    console.log('🛡️  Security Scanner Test Suite - Comprehensive Analysis');
    console.log('='.repeat(60));

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async cloneRepository(repoUrl, branch = 'main') {
    const repoName = repoUrl.split('/').pop();
    const targetDir = path.join(this.tempDir, repoName);

    if (fs.existsSync(targetDir)) {
      console.log(`  📁 Using cached: ${repoName}`);
      return targetDir;
    }

    console.log(`  📥 Cloning: ${repoName}`);
    try {
      execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${targetDir}`, {
        stdio: 'pipe',
        timeout: 180000,
      });
      this.clonedRepos.push(targetDir);
      return targetDir;
    } catch (error) {
      try {
        execSync(`git clone --depth 1 ${repoUrl} ${targetDir}`, {
          stdio: 'pipe',
          timeout: 180000,
        });
        this.clonedRepos.push(targetDir);
        return targetDir;
      } catch (e) {
        console.error(`  ❌ Failed to clone: ${repoName}`);
        return null;
      }
    }
  }

  async scanWithGrep(targetDir, pattern, filePattern = '*.py') {
    try {
      const output = execSync(
        `grep -rn "${pattern}" --include="${filePattern}" ${targetDir} 2>/dev/null | head -30`,
        { encoding: 'utf8', timeout: 30000 }
      );
      return output.split('\n').filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  async runBanditScan(targetDir) {
    console.log(`  🔍 Running Bandit scan...`);
    try {
      const output = execSync(`bandit -r ${targetDir} -f json -ll 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 180000,
      });
      return JSON.parse(output);
    } catch (error) {
      try {
        const output = execSync(`bandit -r ${targetDir} -f txt 2>&1 | head -100`, {
          encoding: 'utf8',
          timeout: 180000,
        });
        return { results: this.parseBanditText(output) };
      } catch {
        return { results: [] };
      }
    }
  }

  parseBanditText(output) {
    const results = [];
    const lines = output.split('\n');
    let currentIssue = {};

    for (const line of lines) {
      const severityMatch = line.match(/Severity: (\w+)/);
      const issueMatch = line.match(/Issue: (.+)/);
      const lineMatch = line.match(/Line: (\d+)/);
      const fileMatch = line.match(/([^:]+):\d+/);

      if (severityMatch || issueMatch) {
        if (currentIssue.issue) results.push(currentIssue);
        currentIssue = {
          severity: severityMatch ? severityMatch[1].toLowerCase() : 'medium',
          issue: issueMatch ? issueMatch[1] : '',
          line_number: lineMatch ? parseInt(lineMatch[1]) : 0,
          filename: fileMatch ? fileMatch[1] : '',
        };
      }
    }
    if (currentIssue.issue) results.push(currentIssue);
    return results;
  }

  async runSemgrepScan(targetDir) {
    console.log(`  🔍 Running Semgrep scan...`);
    try {
      const output = execSync(`semgrep --json --config=auto ${targetDir} 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 180000,
      });
      return JSON.parse(output);
    } catch {
      return { results: [] };
    }
  }

  async runGitleaksScan(targetDir) {
    console.log(`  🔍 Running Gitleaks scan...`);
    try {
      const output = execSync(
        `gitleaks detect --source=${targetDir} --format=json 2>/dev/null || echo "[]"`,
        { encoding: 'utf8', timeout: 120000 }
      );
      return JSON.parse(output || '[]');
    } catch {
      return [];
    }
  }

  categorizeVulnerability(filePath, code, line) {
    for (const [category, patterns] of Object.entries(SCAN_PATTERNS)) {
      for (const p of patterns) {
        if (p.pattern.test(code) || p.pattern.test(line)) {
          return {
            category,
            ...ATTACK_VECTORS[category],
            file: filePath,
            line: typeof line === 'string' ? line.split(':')[0] : line,
            code: code.substring(0, 200),
          };
        }
      }
    }
    return null;
  }

  async scanRepository(repo) {
    console.log(`\n📊 Scanning: ${repo.name} (${repo.lang})`);

    const targetDir = await this.cloneRepository(repo.url, 'main');
    if (!targetDir) return;

    const banditResults = await this.runBanditScan(targetDir);
    const semgrepResults = await this.runSemgrepScan(targetDir);
    const gitleaksResults = await this.runGitleaksScan(targetDir);

    // Process Bandit results
    if (banditResults.results) {
      for (const issue of banditResults.results.slice(0, 10)) {
        this.results.push({
          repo: repo.name,
          lang: repo.lang,
          scanner: 'bandit',
          category: 'Security Best Practices',
          ...ATTACK_VECTORS['CMDi'],
          file: issue.filename || issue.file,
          line: issue.line_number,
          code: issue.code || '',
          severity: issue.severity || 'medium',
        });
      }
    }

    // Process Semgrep results
    if (semgrepResults.results) {
      for (const result of semgrepResults.results.slice(0, 10)) {
        const vuln = this.categorizeVulnerability(
          result.path,
          result.extra?.lines || '',
          result.start?.line
        );
        if (vuln) {
          this.results.push({
            repo: repo.name,
            lang: repo.lang,
            scanner: 'semgrep',
            ...vuln,
          });
        }
      }
    }

    // Process Gitleaks results
    for (const leak of gitleaksResults.slice(0, 5)) {
      this.results.push({
        repo: repo.name,
        lang: repo.lang,
        scanner: 'gitleaks',
        ...ATTACK_VECTORS['HardSecret'],
        file: leak.File || 'unknown',
        line: leak.StartLine || 0,
        code: leak.Match || '',
        severity: 'critical',
      });
    }

    // Additional pattern scanning
    for (const [category, patterns] of Object.entries(SCAN_PATTERNS)) {
      const filePattern = repo.lang === 'Python' ? '*.py' : '*.js';

      for (const p of patterns) {
        const matches = await this.scanWithGrep(targetDir, p.source, filePattern);
        for (const match of matches.slice(0, 3)) {
          const parts = match.split(':');
          if (parts.length >= 3) {
            const [, file, line, ...codeParts] = parts;
            const code = codeParts.join(':').substring(0, 100);
            const vector = ATTACK_VECTORS[category];

            if (vector) {
              this.results.push({
                repo: repo.name,
                lang: repo.lang,
                scanner: 'grep',
                category,
                ...vector,
                file: file,
                line: parseInt(line) || 0,
                code,
                severity: vector.severity,
              });
            }
          }
        }
      }
    }

    console.log(`  ✅ Found ${this.results.filter((r) => r.repo === repo.name).length} issues`);
  }

  async run() {
    await this.initialize();

    for (const repo of REPOSITORIES) {
      await this.scanRepository(repo);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 COMPREHENSIVE SECURITY SCAN RESULTS');
    console.log('='.repeat(60));

    console.log(`\n🎯 Total vulnerabilities found: ${this.results.length}`);

    const bySeverity = {};
    for (const r of this.results) {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    }
    console.log('\n📊 By Severity:');
    for (const [sev, count] of Object.entries(bySeverity)) {
      console.log(`  ${sev.toUpperCase()}: ${count}`);
    }

    const byRepo = {};
    for (const r of this.results) {
      byRepo[r.repo] = (byRepo[r.repo] || 0) + 1;
    }
    console.log('\n📊 By Repository:');
    for (const [repo, count] of Object.entries(byRepo)) {
      console.log(`  ${repo}: ${count}`);
    }

    const byCategory = {};
    for (const r of this.results) {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    }
    console.log('\n📊 By Category:');
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${count}`);
    }

    const outputFile = '/tmp/security-scan-results.json';
    fs.writeFileSync(outputFile, JSON.stringify(this.results, null, 2));
    console.log(`\n💾 Results saved to: ${outputFile}`);

    return this.results;
  }
}

const suite = new SecurityScannerTestSuite();
suite
  .run()
  .then((results) => {
    console.log('\n🎯 Comprehensive security scan complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
