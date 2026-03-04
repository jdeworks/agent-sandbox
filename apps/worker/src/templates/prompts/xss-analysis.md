# XSS Analysis Prompt

You are a senior security researcher specializing in Cross-Site Scripting (XSS) vulnerabilities.

Analyze the following XSS vulnerability found in a real codebase:

## VULNERABILITY CONTEXT

- Repository: {REPO}
- Branch: {BRANCH}
- File: {FILE}
- Line: {LINE}
- Output Context: {CONTEXT}
- XSS Type: {IS_REFLECTED} / {IS_STORED}
- Category: XSS
- Severity: {SEVERITY}
- CWE: CWE-79

## VULNERABLE CODE

```{LANGUAGE}
{CODE}
```

## YOUR TASK

For XSS in **{CONTEXT}** context, provide:

### 1. EXPLOITABILITY ASSESSMENT

- Can this lead to session hijacking?
- Can it steal cookies or tokens?
- Can it perform keylogging?
- Can it redirect users to malicious sites?
- Can it bypass CSP (Content Security Policy)?

### 2. XSS CONTEXT ANALYSIS

Analyze how the input flows:

- Is it in HTML body, attribute, JavaScript, CSS, URL?
- What encoding is applied (if any)?
- Are there any filters or sanitization?

### 3. CONCRETE XSS PAYLOADS

For **{CONTEXT}** context, provide working payloads:

#### A. Basic Proof of Concept

Simple alert/console.log to confirm XSS

#### B. Context-Specific Payloads

- If HTML: tag injection, event handlers
- If Attribute: quote breakout, event handlers
- If JavaScript: script injection, DOM manipulation
- If URL: protocol handler injection
- If CSS: expression injection

#### C. Bypass Techniques

If there are filters, show bypasses

### 4. ATTACK SCENARIOS

Describe realistic attack scenarios:

- Cookie theft with exfiltration
- Session hijacking
- Keylogging
- Phishing via iframe injection

### 5. STEP-BY-STEP EXPLOITATION

1. How to trigger the XSS
2. How to steal session/cookies
3. How to maintain persistence (if stored)

### 6. SUGGESTED FIX

Show proper encoding/sanitization for **{CONTEXT}** context

---

## RESPONSE FORMAT

```json
{
  "isExploitable": true,
  "exploitabilityScore": 0-10,
  "attackVector": "XSS via {CONTEXT} in {FILE}",
  "xssType": "Reflected / Stored / DOM",
  "context": "{CONTEXT}",
  "attackRequirements": ["user input reflected without encoding"],
  "impactAssessment": "Session hijacking, credential theft, malware delivery",
  "exploitExamples": [
    {
      "name": "Cookie Theft",
      "description": "Steal session cookie via XSS",
      "payload": "ACTUAL XSS PAYLOAD",
      "steps": [
        "Inject payload",
        "Trigger reflection",
        "Victim visits page",
        "Cookie sent to attacker"
      ],
      "expectedResult": "JavaScript executes, cookie exfiltrated",
      "verificationMethod": "Check attacker-controlled server"
    }
  ],
  "bypassTechniques": ["filter bypasses"],
  "suggestedFix": "Proper encoding for {CONTEXT} context",
  "securityPatterns": [
    "output encoding",
    "Content Security Policy",
    "use safelist"
  ],
  "cweDetails": "CWE-79: Cross-site Scripting"
}
```

---

## CRITICAL

- Payloads must work in **{CONTEXT}** specifically
- Consider what encoding is applied automatically by the browser
- Show the actual fix for this code
