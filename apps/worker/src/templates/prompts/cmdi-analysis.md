# Command Injection Analysis Prompt

You are a senior security researcher specializing in OS Command Injection and Remote Code Execution vulnerabilities.

Analyze the following Command Injection vulnerability found in a real codebase:

## VULNERABILITY CONTEXT

- Repository: {REPO}
- Branch: {BRANCH}
- File: {FILE}
- Line: {LINE}
- OS Target: {OS_TYPE}
- Shell Used: {SHELL_USED}
- Category: Command Injection
- Severity: {SEVERITY}
- CWE: CWE-78

## VULNERABLE CODE

```{LANGUAGE}
{CODE}
```

## YOUR TASK

For Command Injection on **{OS_TYPE}** with **{SHELL_USED}**, provide:

### 1. EXPLOITABILITY ASSESSMENT

- Can this lead to RCE (Remote Code Execution)?
- What can be executed (commands, scripts, binaries)?
- Is there any input filtering?
- What is the privilege level of the process?

### 2. COMMAND INJECTION TYPE

- Is it direct shell?
  execution- Is it via system()/exec() with shell=true?
- Is it using command substitution?
- Are there any filters that can be bypassed?

### 3. CONCRETE EXPLOIT PAYLOADS

For **{OS_TYPE}**, provide working payloads:

#### A. Basic Command Execution

Test if injection works

#### B. Data Exfiltration

- Read sensitive files
- Read environment variables
- Extract network information

#### C. Reverse Shell

- Netcat reverse shell
- Bash reverse shell
- Alternative methods if netcat unavailable

#### D. Web Shell (if applicable)

Write a web shell for persistence

### 4. STEP-BY-STEP EXPLOITATION

1. Confirm command injection works
2. Determine what's available on system
3. Establish reverse shell
4. Escalate privileges (if possible)

### 5. SUGGESTED FIX

Show the safe alternative for this exact code:

- Use execFile() instead of exec() with shell
- Use array of arguments
- Avoid shell interpretation

---

## RESPONSE FORMAT

```json
{
  "isExploitable": true,
  "exploitabilityScore": 0-10,
  "attackVector": "Command injection via {FILE}",
  "shellType": "{SHELL_USED}",
  "attackRequirements": [
    "user input passed to shell"
  ],
  "impactAssessment": "Full system compromise possible",
  "exploitExamples": [
    {
      "name": "Read Sensitive File",
      "description": "Read /etc/passwd via command injection",
      "payload": "ACTUAL CMD PAYLOAD",
      "steps": [
        "Inject payload",
        "Observe command output"
      ],
      "expectedResult": "Contents of /etc/passwd",
      "verificationMethod": "Check if injected command executes"
    },
    {
      "name": "Reverse Shell",
      "description": "Get interactive shell",
      "payload": "ACTUAL REVERSE SHELL PAYLOAD",
      "steps": [
        "Start listener",
        "Inject payload",
        "Receive shell"
      ],
      "expectedResult": "Interactive shell on target",
      "verificationMethod": "Execute commands via shell"
    }
  ],
  "bypassTechniques": [
    "character encoding",
    "alternative commands"
  ],
  "suggestedFix": "Safe alternative using execFile or avoiding shell",
  "securityPatterns": [
    "avoid shell",
    "input validation",
    "allowlist"
  ],
  "cweDetails": "CWE-78: OS Command Injection"
}
```

---

## CRITICAL

- Payloads must work with **{OS_TYPE}** and **{SHELL_USED}**
- Show actual working reverse shell commands
- Provide the exact code change to fix this vulnerability
