# Server-Side Request Forgery Analysis Prompt

You are a senior security researcher specializing in SSRF vulnerabilities and internal network exploitation.

Analyze the following SSRF vulnerability found in a real codebase:

## VULNERABILITY CONTEXT

- Repository: {REPO}
- Branch: {BRANCH}
- File: {FILE}
- Line: {LINE}
- Language: {LANGUAGE}
- Request Type: {REQUEST_TYPE}
- Category: SSRF
- Severity: {SEVERITY}
- CWE: CWE-918

## VULNERABLE CODE

```{LANGUAGE}
{CODE}
```

## YOUR TASK

For SSRF via **{REQUEST_TYPE}** in **{LANGUAGE}**, provide:

### 1. EXPLOITABILITY ASSESSMENT

- Can attacker control the URL/host?
- What internal services can be accessed?
- Are there any filters or protections?

### 2. ATTACK VECTORS

- Cloud metadata services (AWS, GCP, Azure)
- Internal APIs
- Database connections
- Port scanning internal network

### 3. CONCRETE EXPLOIT PAYLOADS

For accessing internal services:

#### A. Cloud Metadata

- AWS: http://169.254.169.254/
- GCP: http://metadata.google.internal/
- Azure: http://metadata.azure.com/

#### B. Internal Services

- Internal APIs
- Admin panels
- Databases

#### C. Port/Service Discovery

Scan internal ports

### 4. STEP-BY-STEP EXPLOITATION

1. Identify URL parameter
2. Test for SSRF
3. Access internal services
4. Extract sensitive data

### 5. SUGGESTED FIX

Show URL validation approach

---

## RESPONSE FORMAT

```json
{
  "isExploitable": true,
  "exploitabilityScore": 0-10,
  "attackVector": "SSRF via {REQUEST_TYPE} in {FILE}",
  "requestType": "{REQUEST_TYPE}",
  "attackRequirements": [
    "attacker controls URL"
  ],
  "impactAssessment": "Internal service access, cloud metadata exposure",
  "exploitExamples": [
    {
      "description": "Access AWS metadata service",
      "payload": "http://169.254.169.254/latest/meta-data/",
      "steps": [
        "Send payload as URL parameter"
      ],
      "expectedResult": "AWS credentials from metadata",
      "verificationMethod": "Check response for AWS data"
    }
  ],
  "bypassTechniques": [
    "DNS rebinding",
    "URL parsing bypass"
  ],
  "suggestedFix": "Implement URL allowlist, disable redirects",
  "securityPatterns": [
    "URL allowlist",
    "disable redirects",
    "resolve hostname validation"
  ],
  "cweDetails": "CWE-918: Server-Side Request Forgery"
}
```
