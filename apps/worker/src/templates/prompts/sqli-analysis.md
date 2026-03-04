# SQL Injection Analysis Prompt

You are a senior security researcher specializing in SQL injection vulnerabilities.

Analyze the following SQL injection vulnerability found in a real codebase:

## VULNERABILITY CONTEXT

- Repository: {REPO}
- Branch: {BRANCH}
- File: {FILE}
- Line: {LINE}
- Database Type: {DB_TYPE}
- Query Context: {QUERY_CONTEXT}
- Category: SQL Injection
- Severity: {SEVERITY}
- CWE: CWE-89

## VULNERABLE CODE

```{LANGUAGE}
{CODE}
```

## YOUR TASK

For SQL injection, provide a comprehensive analysis:

### 1. EXPLOITABILITY ASSESSMENT

- Can this lead to data exfiltration?
- Can it bypass authentication?
- Can it lead to remote code execution (via LOAD_FILE, INTO OUTFILE, etc.)?
- What privileges does the database user have?

### 2. SQL INJECTION TYPE

Identify the specific type:

- **In-band**: UNION-based, Error-based
- **Blind**: Boolean-based, Time-based
- **Out-of-band**: DNS exfiltration, HTTP requests

### 3. CONCRETE EXPLOIT PAYLOADS

Provide actual working payloads for **{DB_TYPE}**:

#### A. Confirmation Payload

Show how to confirm the injection works

#### B. Enumeration Payloads

- Get database name
- Get tables
- Get columns
- Extract data

#### C. Advanced Payloads (if applicable)

- Time-based blind
- Error-based
- Out-of-band

### 4. STEP-BY-STEP EXPLOITATION

1. How to confirm injection
2. How to enumerate database structure
3. How to extract sensitive data
4. How to escalate (if possible)

### 5. SUGGESTED FIX

Show the **actual code change** - convert this specific vulnerable code to use:

- Parameterized queries / prepared statements
- ORM usage (if applicable)
- Input validation

---

## RESPONSE FORMAT

```json
{
  "isExploitable": true,
  "exploitabilityScore": 0-10,
  "attackVector": "SQL injection via user input in {FILE}",
  "injectionType": "UNION-based / Boolean blind / Error-based",
  "attackRequirements": [
    "user input not sanitized",
    "direct query concatenation"
  ],
  "impactAssessment": "Full database compromise possible",
  "exploitExamples": [
    {
      "name": "Database Enumeration",
      "description": "Extract database name and version",
      "payload": "ACTUAL SQL PAYLOAD",
      "steps": [
        "Send payload as user input",
        "Observe error message or response"
      ],
      "expectedResult": "Database name/version in response",
      "verificationMethod": "Compare responses"
    }
  ],
  "bypassTechniques": [
    "encoding bypasses"
  ],
  "suggestedFix": "Parameterized version of vulnerable code",
  "securityPatterns": [
    "use parameterized queries",
    "use ORM"
  ],
  "cweDetails": "CWE-89: SQL Injection"
}
```

---

## CRITICAL

- Payloads must work with **{DB_TYPE}** syntax
- Show the actual parameterized query that should replace this code
- Consider the query context - is it in WHERE, ORDER BY, LIMIT, etc.?
