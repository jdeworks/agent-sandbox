# AGENTS.md.base Enhancement Plan

## TL;DR

> **Quick Summary**: Enhance AGENTS.md.base with Socratic method guidance and remove user-facing runtime sections that aren't relevant to the agent.
> 
> **Deliverables**:
> - Copied socratic.md to Unix sandbox directory
> - Updated Unix AGENTS.md.base (removed sections, added socratic reference)
> - Updated Windows AGENTS.md.base (same changes)
> - Added socratic.md to Windows embedded resources
> - Updated Unix generation script (copies socratic.md to profile)
> - Updated Windows C# profile generator (copies socratic.md to profile)
> - Updated Unix sandbox.sh (copies socratic.md on launch for new + existing projects)
> - Updated Windows ProjectScaffolder.cs (copies socratic.md on launch for new + existing projects)
> 
> **Estimated Effort**: Quick (8 tasks, ~45 min)
> **Parallel Execution**: PARTIAL - some tasks can run in parallel
> **Critical Path**: Update templates → Update scripts → Copy on launch

---

## Context

### Original Request
User wants to:
1. Include `socratic.md` in AGENTS.md.base for development tasks
2. Remove irrelevant sections from AGENTS.md.base (Switching Agents, Authentication, API Keys) since this file is read by the agent, not the user

### User Decisions (confirmed via questions)
- **Socratic inclusion**: Reference by relative path `./socratic.md` (both files copied to same directory in container)
- **Remove sections**: Remove Switching Agents AND Authentication/API Keys

### Container Path Verification
- AGENTS.md → `/workspace/.config/opencode/AGENTS.md`
- socratic.md → `/workspace/.config/opencode/socratic.md` (same directory)
- Reference should be `./socratic.md` or just `socratic.md`

---

## Work Objectives

### Core Objective
Enhance AGENTS.md.base to include Socratic method guidance and remove agent-irrelevant sections.

### Concrete Deliverables
1. Edit `/workspace/src/agent-worker/sandbox/AGENTS.md.base`
2. Edit `/workspace/src/tools/AgentSandbox/Resources/AGENTS.md.base`
3. Update `/workspace/src/agent-worker/sandbox/generate_profile.sh` to copy socratic.md
4. Update `/workspace/src/tools/AgentSandbox/Services/ProfileGenerator.cs` to copy socratic.md

### Definition of Done
- [ ] AGENTS.md.base has reference to socratic.md
- [ ] "Switching Agents" section removed (lines ~143-155)
- [ ] "Authentication" and "API Keys" sections removed (lines ~157-169)
- [ ] Generation scripts copy socratic.md alongside AGENTS.md

### Must Have
- Both AGENTS.md.base files updated identically
- Both generation scripts updated to copy socratic.md

### Must NOT Have
- No changes to language-specific .agents.md fragments (22 files)
- No changes to existing project AGENTS.md (regenerated on next launch)

---

## Verification Strategy

> Not applicable - this is a documentation/template change, not executable code.

---

## Execution Strategy

### Task Structure
All tasks are quick edits. Can be done sequentially or with minor parallelism.

```
Task 1: Edit Unix AGENTS.md.base
Task 2: Edit Windows AGENTS.md.base  
Task 3: Update Unix generation script
Task 4: Update Windows C# profile generator
```

---

## TODOs

- [ ] 1. Edit Unix AGENTS.md.base

  **What to do**:
  - Read `/workspace/src/agent-worker/sandbox/AGENTS.md.base`
  - Remove sections 132-169: "Available CLI Agents" table + "Switching Agents" + "Authentication" + "API Keys"
  - Add Socratic reference near top (after critical warning, around line 10)
  - Reference text: `For development tasks, follow the Socratic method in ./socratic.md`

  **Must NOT do**:
  - Don't modify any other sections
  - Don't change line numbers of existing content (removals shift line numbers, that's fine)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Simple edit task, no research needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] grep -i "socratic" AGENTS.md.base returns the reference
  - [ ] grep -i "Switching Agents\|Authentication\|API Keys" AGENTS.md.base returns empty

  **Commit**: NO (will commit with Task 8)

- [ ] 0b. Copy socratic.md to Unix sandbox directory

  **What to do**:
  - Copy `/workspace/src/socratic.md` to `/workspace/src/agent-worker/sandbox/socratic.md`
  - This ensures generate_profile.sh can find and copy it to profiles

  **Must NOT do**:
  - Modify the content

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1

  **Acceptance Criteria**:
  - [ ] socratic.md exists in agent-worker/sandbox/

  **Commit**: NO

- [ ] 2. Edit Windows AGENTS.md.base

  **What to do**:
  - Read `/workspace/src/tools/AgentSandbox/Resources/AGENTS.md.base`
  - Apply same changes as Task 1 (identical file content goal)

  **Must NOT do**:
  - Deviate from Unix version's content

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Same grep checks pass as Task 1

  **Commit**: NO (will commit with Task 4)

- [ ] 3. Update Unix generate_profile.sh

  **What to do**:
  - Read `/workspace/src/agent-worker/sandbox/generate_profile.sh`
  - Find `generate_agents_md()` function (line ~239)
  - After copying AGENTS.md.base, also copy socratic.md:
    ```bash
    cp "$SANDBOX_DIR/socratic.md" "$PROFILE_DIR/socratic.md"
    ```
  - Note: Need to verify socratic.md exists in SANDBOX_DIR or adjust source path

  **Must NOT do**:
  - Break existing AGENTS.md generation logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 completing to know exact edit location)
  - **Sequential**

  **Acceptance Criteria**:
  - [ ] generate_profile.sh contains copy command for socratic.md

  **Commit**: NO

- [ ] 4. Update Windows ProfileGenerator.cs

  **What to do**:
  - Read `/workspace/src/tools/AgentSandbox/Services/ProfileGenerator.cs`
  - Find `GenerateAgentsMd()` method (line ~248)
  - After writing AGENTS.md, also write socratic.md:
    ```csharp
    var socraticContent = ResourceManager.ReadSandboxFile("socratic.md");
    ResourceManager.WriteLf(Path.Combine(profileDir, "socratic.md"), socraticContent);
    ```

  **Must NOT do**:
  - Break existing AGENTS.md generation logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after Task 3)
  - **Sequential**

  **Acceptance Criteria**:
  - [ ] ProfileGenerator.cs contains copy/write logic for socratic.md

  **Commit**: NO

- [ ] 4b. Add socratic.md to Windows embedded resources

  **What to do**:
  - Copy `/workspace/src/socratic.md` to `/workspace/src/tools/AgentSandbox/Resources/socratic.md`
  - This ensures Windows exe extracts it to `%APPDATA%/AgentSandbox/sandbox/`

  **Must NOT do**:
  - Modify the content, just copy

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 1 (with Task 4)

  **Acceptance Criteria**:
  - [ ] socratic.md exists in tools/AgentSandbox/Resources/

  **Commit**: NO

- [ ] 5. Update Unix sandbox.sh for new projects

  **What to do**:
  - Read `/workspace/src/agent-worker/scripts/unix/sandbox.sh`
  - Find line ~409 where AGENTS.md is copied for new projects
  - Add: `cp "$SANDBOX_PROFILE_DIR/socratic.md" "$PROJECT_DIR/opencode_data/socratic.md"`
  - Add after the AGENTS.md copy line

  **Must NOT do**:
  - Break existing scaffolding logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential)
  - **Sequential**

  **Acceptance Criteria**:
  - [ ] sandbox.sh copies socratic.md for new projects

  **Commit**: NO

- [ ] 6. Update Unix sandbox.sh for existing projects

  **What to do**:
  - Read `/workspace/src/agent-worker/scripts/unix/sandbox.sh`
  - Find line ~444 where AGENTS.md is copied for existing projects
  - Add: `cp "$SANDBOX_PROFILE_DIR/socratic.md" "$PROJECT_DIR/opencode_data/socratic.md"`
  - Add after the AGENTS.md copy line

  **Must NOT do**:
  - Break existing regeneration logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after Task 5)
  - **Sequential**

  **Acceptance Criteria**:
  - [ ] sandbox.sh copies socratic.md for existing projects on re-launch

  **Commit**: YES
  - Message: `feat(sandbox): add socratic.md to AGENTS.md and generation scripts`
  - Files: `agent-worker/sandbox/AGENTS.md.base`, `tools/AgentSandbox/Resources/AGENTS.md.base`, `agent-worker/sandbox/generate_profile.sh`, `tools/AgentSandbox/Services/ProfileGenerator.cs`, `agent-worker/scripts/unix/sandbox.sh`

- [ ] 7. Update Windows ProjectScaffolder.cs for new projects

  **What to do**:
  - Read `/workspace/src/tools/AgentSandbox/Services/ProjectScaffolder.cs`
  - Find lines ~122-124 where AGENTS.md is copied for new projects
  - Add similar copy for socratic.md:
    ```csharp
    File.Copy(
        Path.Combine(profileDir, "socratic.md"),
        Path.Combine(projectDir, "opencode_data", "socratic.md"), true);
    ```

  **Must NOT do**:
  - Break existing scaffolding logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential)
  - **Sequential**

  **Acceptance Criteria**:
  - [ ] ProjectScaffolder.cs copies socratic.md for new projects

  **Commit**: NO

- [ ] 8. Update Windows ProjectScaffolder.cs for existing projects

  **What to do**:
  - Read `/workspace/src/tools/AgentSandbox/Services/ProjectScaffolder.cs`
  - Find lines ~193-195 where RefreshFromProfile() copies AGENTS.md
  - Add similar copy for socratic.md after the AGENTS.md copy

  **Must NOT do**:
  - Break existing refresh logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after Task 7)
  - **Sequential**

  **Acceptance Criteria**:
  - [ ] ProjectScaffolder.cs RefreshFromProfile() copies socratic.md

  **Commit**: YES
  - Message: `feat(sandbox): copy socratic.md on project launch for existing projects`
  - Files: `agent-worker/scripts/unix/sandbox.sh`, `tools/AgentSandbox/Services/ProjectScaffolder.cs`

---

## Final Verification Wave

> Not applicable for this small change set.

---

## Success Criteria

### Verification Commands
```bash
# Verify socratic reference exists
grep -i "socratic" agent-worker/sandbox/AGENTS.md.base
grep -i "socratic" tools/AgentSandbox/Resources/AGENTS.md.base

# Verify removed sections are gone
grep -i "Switching Agents\|Authentication\|API Keys" agent-worker/sandbox/AGENTS.md.base
grep -i "Switching Agents\|Authentication\|API Keys" tools/AgentSandbox/Resources/AGENTS.md.base

# Verify script changes
grep -i "socratic" agent-worker/sandbox/generate_profile.sh
grep -i "socratic" tools/AgentSandbox/Services/ProfileGenerator.cs
```

### Final Checklist
- [ ] Both AGENTS.md.base files have socratic reference
- [ ] Both AGENTS.md.base files lack removed sections
- [ ] Both generation scripts copy socratic.md
- [ ] All changes committed
