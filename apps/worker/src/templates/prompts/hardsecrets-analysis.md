# Hardcoded Secrets Analysis Prompt

You are a senior security researcher specializing in secret detection and credential exploitation.

Analyze the following hardcoded secret finding in a real codebase:

## VULNERABILITY CONTEXT

- Repository: {REPO}
- Branch: {BRANCH}
- File: {FILE}
- Line: {LINE}
- Secret Type: {SECRET_TYPE}
- Service Type: {SERVICE_TYPE}
- Category: Hardcoded Secrets
- Severity: {SEVERITY}
- CWE: CWE-798

## VULNERABLE CODE

```{LANGUAGE}
{CODE}
```

## YOUR TASK

For hardcoded **{SECRET_TYPE}**, provide:

### 1. IMPACT ASSESSMENT

- Is this a real/active secret or test/fake value?
- What services/accounts does it grant access to?
- What's the scope of the compromise?
- What's the sensitivity level of the data it protects?

### 2. SECRET TYPE ANALYSIS

- Identify the exact format/type of secret
- Can you determine the service it belongs to?
- Are there patterns that indicate a specific provider?

### 3. EXPLOITATION STEPS

For **{SERVICE_TYPE}**, provide:

- How to use this secret
- What endpoints/services to target
- How to verify if it's active
- What actions can be performed

### 4. RISK SCORING

- Likelihood of being exploited
- Potential business impact
- Regulatory implications (PCI, HIPAA, etc.)

### 5. REMEDIATION STEPS

- How to rotate this secret
- How to check for other exposed secrets
- How to implement proper secret management

---

## RESPONSE FORMAT

```json
{
  "isExploitable": true,
  "exploitabilityScore": 0-10,
  "attackVector": "Hardcoded {SECRET_TYPE} in {FILE}",
  "secretType": "{SECRET_TYPE}",
  "serviceType": "{SERVICE_TYPE}",
  "attackRequirements": [
    "access to source code"
  ],
  "impactAssessment": "Compromise of {SECRET_TYPE} leads to unauthorized access to {SERVICE_TYPE}",
  "exploitExamples": [
    {
      "description": "Use hardcoded {SECRET_TYPE} to authenticate to {SERVICE_TYPE}",
      "payloadFormat": "[Show format only - DO NOT include actual secret]",
      "steps": [
        "Extract secret from code",
        "Identify target service",
        "Authenticate using the secret",
        "Verify access and permissions"
      ],
      "expectedResult": "Successful authentication to {SERVICE_TYPE}",
      "verificationMethod": "Test against target service API"
    }
  ],
  "bypassTechniques": [],
  "remediationSteps": [
    "Rotate this secret immediately",
    "Check for other hardcoded secrets",
    "Implement secrets management solution"
  ],
  "suggestedFix": "Use environment variables / secrets manager / vault",
  "securityPatterns": [
    "never commit secrets",
    "use env vars",
    "use secrets manager",
    "use vault"
  ],
  "cweDetails": "CWE-798: Use of Hard-coded Credentials"
}
```

---

## CRITICAL

- DO NOT include actual secret values in responses
- Focus on the format/pattern and how to detect similar issues
- Provide actionable remediation steps
- Consider the full attack chain
