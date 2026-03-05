# Security Scanner Extension Plan

## Overview

This document outlines additional security tools that can be integrated into the Security Analyzer platform, based on research from HelpNetSecurity articles (December 2025 and June 2025).

## Currently Integrated Scanners (15)

### SAST (Static Analysis)

- Bandit
- Semgrep
- OpenGrep

### DAST (Dynamic Analysis)

- Nuclei
- OWASP ZAP
- SQLMap
- Nmap
- SSL/TLS Scanner

### Secrets Detection

- Gitleaks
- TruffleHog

### SCA / Dependency

- Trivy
- Grype

### IaC

- Checkov

### Mobile

- MobSF

---

## Planned Extensions (Priority Order)

### Phase 1: AI/LLM Security (High Priority)

| Tool          | Category     | Description                                                                     | Integration Effort |
| ------------- | ------------ | ------------------------------------------------------------------------------- | ------------------ |
| **Garak**     | LLM Security | Detects vulnerabilities in LLMs (hallucinations, prompt injections, jailbreaks) | Medium             |
| **Vulnhuntr** | AI Security  | Uses LLMs to find remotely exploitable vulnerabilities                          | Medium             |
| **Buttercup** | AI Security  | AI-powered vulnerability detection and patching                                 | Medium             |

### Phase 2: Web Application Security

| Tool            | Category          | Description                                    | Integration Effort |
| --------------- | ----------------- | ---------------------------------------------- | ------------------ |
| **Artemis**     | Web Scanning      | Modular vulnerability scanner for websites     | Low                |
| **Dalfox**      | XSS               | Open-source XSS scanner and parameter analyzer | Low                |
| **Commix**      | Command Injection | Automates command injection detection          | Low                |
| **Autoswagger** | API Security      | Scans OpenAPI APIs for authorization flaws     | Low                |

### Phase 3: Cloud & Infrastructure

| Tool                 | Category              | Description                                     | Integration Effort |
| -------------------- | --------------------- | ----------------------------------------------- | ------------------ |
| **Falco**            | Runtime Security      | Cloud-native runtime security for Linux         | Medium             |
| **Dependency-Track** | SCA                   | Continuous component analysis platform          | High               |
| **cnspec**           | Cloud Security        | Cloud-native security and policy enforcement    | Medium             |
| **Vuls**             | Vulnerability Scanner | Agentless vulnerability scanner for OS/firmware | Medium             |

### Phase 4: Network & Reconnaissance

| Tool                | Category               | Description                                           | Integration Effort |
| ------------------- | ---------------------- | ----------------------------------------------------- | ------------------ |
| **BadDNS**          | DNS Security           | Detects domain/subdomain takeovers                    | Low                |
| **OWASP Nettacker** | Recon/Nmap alternative | Automated reconnaissance and vulnerability assessment | Medium             |
| **Maltrail**        | Network Security       | Malicious traffic detection system                    | Medium             |

### Phase 5: Advanced/Research Tools

| Tool           | Category         | Description                                 | Integration Effort |
| -------------- | ---------------- | ------------------------------------------- | ------------------ |
| **Metis**      | Code Review      | AI-driven deep security code review         | High               |
| **RIFT**       | Malware Analysis | Analyze Rust malware                        | High               |
| **Woodpecker** | Red Teaming      | Automated red teaming for AI, K8s, APIs     | High               |
| **DefectDojo** | VM Platform      | DevSecOps vulnerability management platform | Very High          |

---

## Implementation Guidelines

### Adding a New Scanner

1. Create scanner file: `apps/worker/src/scanners/<name>.scanner.ts`
2. Extend base scanner class
3. Implement `canHandle()` and `onScan()` methods
4. Add to scanner metadata in `apps/backend/src/routes/scanners.ts`
5. Update Settings UI with new scanner toggle

### Scanner Interface Requirements

```typescript
interface BaseScanner {
  readonly name: string;
  readonly type: ScannerType;
  readonly description?: string;

  canHandle(target: string): boolean;
  onScan(target: string, options?: ScanOptions): Promise<ScanResult>;
}
```

---

## Integration Status

| Scanner     | Status       | Notes                            |
| ----------- | ------------ | -------------------------------- |
| Bandit      | ✅ Active    | Python SAST                      |
| Semgrep     | ✅ Active    | Multi-language SAST              |
| OpenGrep    | ✅ Active    | Semantic analysis                |
| Nuclei      | ✅ Active    | Template-based DAST              |
| OWASP ZAP   | ✅ Available | Web app security                 |
| SQLMap      | ✅ Available | SQL injection                    |
| Nmap        | ✅ Available | Network scanning                 |
| SSL Scanner | ✅ Available | TLS analysis                     |
| Gitleaks    | ✅ Active    | Secrets detection                |
| TruffleHog  | ✅ Active    | Advanced secrets                 |
| Trivy       | ✅ Active    | Container/dep vulnerabilities    |
| Grype       | ✅ Active    | Lightweight container scanner    |
| Checkov     | ✅ Active    | IaC security                     |
| MobSF       | ✅ Available | Mobile security                  |
| Garak       | 🔜 Planned   | LLM vulnerability scanner        |
| Dalfox      | 🔜 Planned   | XSS scanner                      |
| Vulnhuntr   | 🔜 Planned   | AI-powered vulnerability finding |
| Falco       | 🔜 Planned   | Runtime security                 |
| Artemis     | 🔜 Planned   | Web vulnerability scanner        |
| BadDNS      | 🔜 Planned   | Subdomain takeover detection     |

---

## Resources

- [HelpNetSecurity - 40 Open Source Tools (Dec 2025)](https://www.helpnetsecurity.com/2025/12/11/free-open-source-security-software/)
- [HelpNetSecurity - 35 Open Source Tools (June 2025)](https://www.helpnetsecurity.com/2025/06/18/free-open-source-security-tools/)
