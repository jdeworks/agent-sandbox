# Unsafe Code Evaluation Analysis Prompt

You are a senior security researcher specializing in code injection vulnerabilities.

Analyze the following unsafe code evaluation vulnerability found in a real codebase:

## VULNERABILITY CONTEXT

- Repository: {REPO}
- Branch: {BRANCH}
- File: {FILE}
- Line: {LINE}
- Language: {LANGUAGE}
- Input Source: {INPUT_SOURCE}
- Category: Unsafe Code Evaluation
- Severity: {SEVERITY}
- CWE: CWE-95

## VULNERABLE CODE

```{LANGUAGE}
{CODE}
```

## YOUR TASK

For unsafe evaluation in **{LANGUAGE}**, provide:

### 1. EXPLOITABILITY ASSESSMENT

- Can attacker-controlled input reach the eval?
- What can be executed?
- Is it limited to specific operations or full code execution?

### 2. EXPLOITATION TYPE

- Direct code injection
- Expression injection
- Object property access
- Built-in function abuse

### 3. CONCRETE EXPLOIT PAYLOADS

For **{LANGUAGE}**, provide working payloads:

#### A. Basic Code Execution

Show how to execute arbitrary code

#### B. System Access

- Read files
- Execute commands
- Access environment

#### C. The User's Example

The user specifically wants payloads like:

```
[(_ for _ in ()).throw(SyntaxError(str(__import__('os').environ)))]
```

Show how similar techniques could work here.

### 4. STEP-BY-STEP EXPLOITATION

1. Identify controllable input
2. Craft payload
3. Execute arbitrary code

### 5. SUGGESTED FIX

Show safe alternative - how to replace eval() with safe alternatives

---

## RESPONSE FORMAT

```json
{
  "isExploitable": true,
  "exploitabilityScore": 0-10,
  "attackVector": "Code injection via eval() in {FILE}",
  "language": "{LANGUAGE}",
  "attackRequirements": [
    "user input reaches eval"
  ],
  "impactAssessment": "Arbitrary code execution possible",
  "exploitExamples": [
    {
      "description": "Read environment variables via eval injection",
      "payload": "ACTUAL PAYLOAD FOR {LANGUAGE}",
      "steps": [
        "Send payload to eval input"
      ],
      "expectedResult": "Environment variables exposed",
      "verificationMethod": "Check response"
    }
  ],
  "bypassTechniques": ["encoding"],
  "suggestedFix": "Replace eval with safe alternatives",
  "securityPatterns": [
    "avoid eval",
    "use safe parsers",
    "input validation"
  ],
  "cweDetails": "CWE-95: Eval Injection"
}
```
