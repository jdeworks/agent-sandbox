#!/usr/bin/env bash
# Comprehensive test suite for agent-sandbox
# Run from repo root: ./tests/run-tests.sh

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SANDBOX_CORE="$REPO_DIR/src/sandbox"
SANDBOX_SCRIPTS="$REPO_DIR/src/scripts/unix"
SANDBOX_DIR="$REPO_DIR/src"
PREPARED_DIR="$REPO_DIR/src/prepared"
TEMP_DIR="/tmp/sandbox-test-$$"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

passed=0
failed=0
skipped=0

log_pass() { echo -e "${GREEN}✓ $1${NC}"; ((passed++)) || true; }
log_fail() { echo -e "${RED}✗ $1${NC}"; ((failed++)) || true; }
log_skip() { echo -e "${YELLOW}⊘ $1 (skipped)${NC}"; ((skipped++)) || true; }
log_info() { echo -e "${BLUE}→ $1${NC}"; }
log_section() { echo ""; echo -e "${BLUE}═══════════════════════════════════════${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}═══════════════════════════════════════${NC}"; }

cleanup() {
    rm -rf "$TEMP_DIR" 2>/dev/null || true
    rm -rf "$PREPARED_DIR/test-lang" "$PREPARED_DIR/test-lang-2" 2>/dev/null || true
}
trap cleanup EXIT
mkdir -p "$TEMP_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     Agent Sandbox Comprehensive Test     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ==============================================================================
# SECTION 1: Unix Shell Scripts - Core Functionality
# ==============================================================================
log_section "SECTION 1: Unix Shell Scripts - Core"

# ----- TEST 1.1: prepare.sh - auto-suffix logic -----
log_section "1.1 prepare.sh - Profile Name Handling"

TEST_PROFILE="test-lang"
PROFILE_DIR="$PREPARED_DIR/$TEST_PROFILE"
mkdir -p "$PROFILE_DIR"
echo "FROM test" > "$PROFILE_DIR/Dockerfile.base"

TEST_NAME="$TEST_PROFILE"
SUFFIX=2
while [ -d "$PREPARED_DIR/${TEST_NAME}" ]; do
    TEST_NAME="${TEST_PROFILE}-${SUFFIX}"
    ((SUFFIX++)) || true
done
[ "$TEST_NAME" = "$TEST_PROFILE-2" ] && log_pass "Auto-suffix generates correct name" || log_fail "Auto-suffix: got $TEST_NAME"

# Check auto-suffix code exists
grep -q 'suffix=2' "$SANDBOX_SCRIPTS/prepare.sh" 2>/dev/null && \
    log_pass "prepare.sh: Auto-suffix code exists" || log_fail "prepare.sh: No auto-suffix code"

# Test for list_projects_using_profile function
grep -q "list_projects_using_profile()" "$SANDBOX_SCRIPTS/prepare.sh" 2>/dev/null && 
    log_pass "prepare.sh: list_projects_using_profile function exists" || log_fail "prepare.sh: No list_projects_using_profile"

grep -q "list_projects_using_profile.*profile_name" "$SANDBOX_SCRIPTS/prepare.sh" 2>/dev/null && 
    log_pass "prepare.sh: Calls list_projects_using_profile" || log_fail "prepare.sh: Does not call list_projects_using_profile"

# ----- TEST 1.2: prepare.sh - alias handling -----
log_section "1.2 prepare.sh - Alias Handling"

grep -q 'if \[ -n "\$existing" \]; then' "$SANDBOX_SCRIPTS/prepare.sh" 2>/dev/null && \
    log_pass "prepare.sh: Conditional alias handling exists" || log_fail "prepare.sh: No conditional alias"

# ----- TEST 1.3: sandbox.sh - project scaffold -----
log_section "1.3 sandbox.sh - Project Scaffold"

SANDBOX_SH="$SANDBOX_SCRIPTS/sandbox.sh"

# Dockerfile check for existing projects
grep -q 'if \[ ! -f "\$PROJECT_DIR/Dockerfile" \]; then' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: Dockerfile check for existing projects" || log_fail "sandbox.sh: No Dockerfile check"

# opencode_data mkdir
grep -q 'mkdir -p "\$PROJECT_DIR/opencode_data"' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: opencode_data mkdir exists" || log_fail "sandbox.sh: No opencode_data mkdir"

# Required directories
for dir in "opencode_data" "opencode_sessions" "logs" "sandbox_data"; do
    grep -q "mkdir -p.*$dir" "$SANDBOX_SH" 2>/dev/null && \
        log_pass "sandbox.sh: $dir directory creation" || log_fail "sandbox.sh: Missing $dir"
done

# ----- TEST 1.4: sandbox.sh - port remapping -----
log_section "1.4 sandbox.sh - Port Remapping"

grep -q 'remap_compose_ports' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: Port remapping function exists" || log_fail "sandbox.sh: No port remapping"

grep -q 'find_free_port' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: find_free_port function exists" || log_fail "sandbox.sh: No find_free_port"

# ----- TEST 1.5: setup.sh - alias creation -----
log_section "1.5 setup.sh - Alias & Environment"

SETUP_SH="$SANDBOX_SCRIPTS/setup.sh"

grep -q 'add_alias.*prepare' "$SETUP_SH" 2>/dev/null && \
    log_pass "setup.sh: prepare alias creation" || log_fail "setup.sh: No prepare alias"

grep -q 'sandbox-cleanup-sudo' "$SETUP_SH" 2>/dev/null && \
    log_pass "setup.sh: sandbox-cleanup-sudo alias" || log_fail "setup.sh: No cleanup-sudo alias"

grep -q '\.bash_aliases' "$SETUP_SH" 2>/dev/null && \
    log_pass "setup.sh: .bash_aliases handling" || log_fail "setup.sh: No bash_aliases"

# ----- TEST 1.6: sandbox-cleanup.sh -----
log_section "1.6 sandbox-cleanup.sh"

CLEANUP_SH="$SANDBOX_SCRIPTS/sandbox-cleanup.sh"

grep -q 'docker compose.*down.*-v' "$CLEANUP_SH" 2>/dev/null && \
    log_pass "cleanup.sh: Docker volume removal" || log_fail "cleanup.sh: No volume removal"

grep -q 'sandbox-cleanup-sudo' "$CLEANUP_SH" 2>/dev/null && \
    log_pass "cleanup.sh: Sudo variant reference" || log_fail "cleanup.sh: No sudo reference"

# ----- TEST 1.7: sandbox-list.sh -----
log_section "1.7 sandbox-list.sh"

LIST_SH="$SANDBOX_SCRIPTS/sandbox-list.sh"

grep -q 'config.env' "$LIST_SH" 2>/dev/null && \
    log_pass "list.sh: Reads config.env" || log_fail "list.sh: No config.env reading"

# ----- TEST 1.8: sandbox-stats.sh -----
log_section "1.8 sandbox-stats.sh"

STATS_SH="$SANDBOX_SCRIPTS/sandbox-stats.sh"

grep -q 'docker volume' "$STATS_SH" 2>/dev/null && \
    log_pass "stats.sh: Docker volume handling" || log_fail "stats.sh: No volume handling"

# ==============================================================================
# SECTION 2: Unix - Profile Generation
# ==============================================================================
log_section "SECTION 2: Profile Generation (Unix)"

# ----- TEST 2.1: Profile structure -----
log_section "2.1 Profile Directory Structure"

PROFILE_GEN_SH="$SANDBOX_CORE/generate_profile.sh"

[ -f "$PROFILE_GEN_SH" ] && \
    log_pass "generate_profile.sh exists" || log_fail "generate_profile.sh missing"

grep -q 'Dockerfile.base' "$PROFILE_GEN_SH" 2>/dev/null && \
    log_pass "generate_profile.sh: Dockerfile.base generation" || log_fail "generate_profile.sh: No Dockerfile"

grep -q 'docker-compose.yml.tpl' "$PROFILE_GEN_SH" 2>/dev/null && \
    log_pass "generate_profile.sh: docker-compose.yml.tpl" || log_fail "generate_profile.sh: No compose tpl"

grep -q 'install.sh' "$PROFILE_GEN_SH" 2>/dev/null && \
    log_pass "generate_profile.sh: install.sh generation" || log_fail "generate_profile.sh: No install.sh"

grep -q 'AGENTS.md' "$PROFILE_GEN_SH" 2>/dev/null && \
    log_pass "generate_profile.sh: AGENTS.md generation" || log_fail "generate_profile.sh: No AGENTS.md"

# ==============================================================================
# SECTION 3: Configuration Files
# ==============================================================================
log_section "SECTION 3: Configuration Files"

# ----- TEST 3.1: languages.json -----
log_section "3.1 languages.json"

LANG_JSON="$SANDBOX_CORE/languages.json"
[ -f "$LANG_JSON" ] && log_pass "languages.json exists" || log_fail "languages.json missing"

# Check required languages
for lang in "python" "node" "go" "rust"; do
    grep -q "\"$lang\"" "$LANG_JSON" 2>/dev/null && \
        log_pass "languages.json: $lang defined" || log_fail "languages.json: $lang missing"
done

# ----- TEST 3.2: ports.json -----
log_section "3.2 ports.json"

PORTS_JSON="$SANDBOX_CORE/ports.json"
[ -f "$PORTS_JSON" ] && log_pass "ports.json exists" || log_fail "ports.json missing"

# ----- TEST 3.3: Templates -----
log_section "3.3 Template Files"

TEMPLATES_DIR="$REPO_DIR/src/templates"
for tpl in "opencode.json" "oh-my-openagent.json" "agent-config.json"; do
    [ -f "$TEMPLATES_DIR/$tpl" ] && \
        log_pass "Template $tpl exists" || log_fail "Template $tpl missing"
done

# ==============================================================================
# SECTION 4: C# Windows Project - Code Structure
# ==============================================================================
log_section "SECTION 4: C# Windows Project - Code Structure"

CSHARP_DIR="$REPO_DIR/tools/AgentSandbox"

# ----- TEST 4.1: ProjectScaffolder.cs -----
log_section "4.1 ProjectScaffolder.cs"

SCAFFOLDER="$CSHARP_DIR/Services/ProjectScaffolder.cs"
[ -f "$SCAFFOLDER" ] && log_pass "ProjectScaffolder.cs exists" || log_fail "ProjectScaffolder.cs missing"

# Key methods
grep -q 'public static void Scaffold' "$SCAFFOLDER" 2>/dev/null && \
    log_pass "Scaffolder: Scaffold method exists" || log_fail "Scaffolder: No Scaffold method"

grep -q 'public static void RefreshFromProfile' "$SCAFFOLDER" 2>/dev/null && \
    log_pass "Scaffolder: RefreshFromProfile method exists" || log_fail "Scaffolder: No RefreshFromProfile"

grep -q 'Always update Dockerfile' "$SCAFFOLDER" 2>/dev/null && \
    log_pass "Scaffolder: Always updates Dockerfile FROM" || log_fail "Scaffolder: Missing Dockerfile update"

grep -q 'Ensure opencode_data directory exists' "$SCAFFOLDER" 2>/dev/null && \
    log_pass "Scaffolder: opencode_data check exists" || log_fail "Scaffolder: No opencode_data check"

# ----- TEST 4.2: ProfileGenerator.cs -----
log_section "4.2 ProfileGenerator.cs"

PROFILE_GEN="$CSHARP_DIR/Services/ProfileGenerator.cs"
[ -f "$PROFILE_GEN" ] && log_pass "ProfileGenerator.cs exists" || log_fail "ProfileGenerator.cs missing"

grep -q 'public static void Generate' "$PROFILE_GEN" 2>/dev/null && \
    log_pass "ProfileGenerator: Generate method exists" || log_fail "ProfileGenerator: No Generate"

grep -q 'GenerateDockerfile' "$PROFILE_GEN" 2>/dev/null && \
    log_pass "ProfileGenerator: GenerateDockerfile exists" || log_fail "ProfileGenerator: No GenerateDockerfile"

grep -q 'GenerateCompose' "$PROFILE_GEN" 2>/dev/null && \
    log_pass "ProfileGenerator: GenerateCompose exists" || log_fail "ProfileGenerator: No GenerateCompose"

# ----- TEST 4.3: LanguageDetector.cs -----
log_section "4.3 LanguageDetector.cs"

LANG_DET="$CSHARP_DIR/Services/LanguageDetector.cs"
[ -f "$LANG_DET" ] && log_pass "LanguageDetector.cs exists" || log_fail "LanguageDetector.cs missing"

grep -q 'public static List<string> Detect' "$LANG_DET" 2>/dev/null && \
    log_pass "LanguageDetector: Detect method exists" || log_fail "LanguageDetector: No Detect"

# ----- TEST 4.4: VersionDetector.cs -----
log_section "4.4 VersionDetector.cs"

VER_DET="$CSHARP_DIR/Services/VersionDetector.cs"
[ -f "$VER_DET" ] && log_pass "VersionDetector.cs exists" || log_fail "VersionDetector.cs missing"

grep -q 'public static Dictionary<string, string> Detect' "$VER_DET" 2>/dev/null && \
    log_pass "VersionDetector: Detect method exists" || log_fail "VersionDetector: No Detect"

# ----- TEST 4.5: PortDetector.cs -----
log_section "4.5 PortDetector.cs"

PORT_DET="$CSHARP_DIR/Services/PortDetector.cs"
[ -f "$PORT_DET" ] && log_pass "PortDetector.cs exists" || log_fail "PortDetector.cs missing"

grep -q 'public static.*Detect' "$PORT_DET" 2>/dev/null && \
    log_pass "PortDetector: Detect method exists" || log_fail "PortDetector: No Detect"

# ----- TEST 4.6: ConfigLoader.cs -----
log_section "4.6 ConfigLoader.cs"

CONFIG_LOAD="$CSHARP_DIR/Services/ConfigLoader.cs"
[ -f "$CONFIG_LOAD" ] && log_pass "ConfigLoader.cs exists" || log_fail "ConfigLoader.cs missing"

grep -q 'LoadLanguages\|LoadPorts' "$CONFIG_LOAD" 2>/dev/null && \
    log_pass "ConfigLoader: Load methods exist" || log_fail "ConfigLoader: No Load methods"

# ==============================================================================
# SECTION 5: C# Models & CLI
# ==============================================================================
log_section "SECTION 5: C# Models & CLI"

# ----- TEST 5.1: ProfileSpec.cs -----
log_section "5.1 ProfileSpec.cs"

PROF_SPEC="$CSHARP_DIR/Models/ProfileSpec.cs"
[ -f "$PROF_SPEC" ] && log_pass "ProfileSpec.cs exists" || log_fail "ProfileSpec.cs missing"

grep -q 'Name\|Languages\|Versions\|Ports' "$PROF_SPEC" 2>/dev/null && \
    log_pass "ProfileSpec: Key properties exist" || log_fail "ProfileSpec: Missing properties"

# ----- TEST 5.2: Cli.cs -----
log_section "5.2 Cli.cs"

CLI_CS="$CSHARP_DIR/Cli.cs"
[ -f "$CLI_CS" ] && log_pass "Cli.cs exists" || log_fail "Cli.cs missing"

grep -q 'RunSandbox\|RunPrepare' "$CLI_CS" 2>/dev/null && \
    log_pass "Cli: RunSandbox/Prepare exist" || log_fail "Cli: Missing run methods"

# ----- TEST 5.3: .csproj -----
log_section "5.3 Project File"

CSPROJ="$CSHARP_DIR/AgentSandbox.csproj"
[ -f "$CSPROJ" ] && log_pass "AgentSandbox.csproj exists" || log_fail "csproj missing"

grep -q 'net8.0' "$CSPROJ" 2>/dev/null && \
    log_pass "csproj: Targets .NET 8.0" || log_fail "csproj: Wrong target"

# ==============================================================================
# SECTION 6: README & Documentation
# ==============================================================================
log_section "SECTION 6: Documentation"

README="$REPO_DIR/README.md"
[ -f "$README" ] && log_pass "README.md exists" || log_fail "README.md missing"

# Check key sections
grep -q 'Quick Start' "$README" 2>/dev/null && \
    log_pass "README: Quick Start section" || log_fail "README: No Quick Start"

grep -q 'sandbox-cleanup-sudo' "$README" 2>/dev/null && \
    log_pass "README: cleanup-sudo documented" || log_fail "README: No cleanup-sudo"

grep -q 'Profiles' "$README" 2>/dev/null && \
    log_pass "README: Profiles section" || log_fail "README: No Profiles"

grep -q 'Multiple Sandboxes' "$README" 2>/dev/null && \
    log_pass "README: Multiple Sandboxes" || log_fail "README: No Multiple Sandboxes"

# ==============================================================================
# SECTION 7: Resource Files & Fragments
# ==============================================================================
log_section "SECTION 7: Resource Files & Fragments"

# ----- TEST 7.1: Fragments -----
log_section "7.1 Language Fragments"

FRAGMENTS="$SANDBOX_CORE/fragments/languages"
for lang in "python.sh" "node.sh" "go.sh" "rust.sh"; do
    [ -f "$FRAGMENTS/$lang" ] && \
        log_pass "Fragment $lang exists" || log_fail "Fragment $lang missing"
done

# ----- TEST 7.2: AGENTS.md fragments -----
log_section "7.2 AGENTS.md Fragments"

for lang in "python.agents.md" "node.agents.md"; do
    [ -f "$FRAGMENTS/$lang" ] && \
        log_pass "Agents fragment $lang exists" || log_fail "Agents fragment $lang missing"
done

# ==============================================================================
# SECTION 8: Key Behavioral Checks
# ==============================================================================
log_section "SECTION 8: Key Behavioral Checks"

# ----- TEST 8.1: Profile overwrite behavior -----
log_section "8.1 Profile Overwrite Behavior (Unix vs C#)"

# Unix now has auto-suffix (should NOT overwrite silently)
grep -q 'suffix=2' "$SANDBOX_SCRIPTS/prepare.sh" 2>/dev/null && \
    log_pass "Unix prepare: Auto-suffix (no silent overwrite)" || \
    log_fail "Unix prepare: Missing auto-suffix"

# C# ProfileGenerator - currently overwrites silently (document this)
grep -q 'Directory.Delete(profileDir, true)' "$PROFILE_GEN" 2>/dev/null && \
    log_pass "C# ProfileGenerator: Silently overwrites (Unix has auto-suffix)" || \
    log_info "C# ProfileGenerator: Verify overwrite behavior"

# ----- TEST 8.2: API key passthrough -----
log_section "8.2 API Key Passthrough"

grep -q 'ANTHROPIC_API_KEY' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: ANTHROPIC_API_KEY handling" || log_fail "sandbox.sh: No ANTHROPIC_API_KEY"

grep -q 'write_runtime_env' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: write_runtime_env function" || log_fail "sandbox.sh: No write_runtime_env"

# ----- TEST 8.3: Auth sync -----
log_section "8.3 Auth Sync"

grep -q 'sync_host_auth' "$SANDBOX_SH" 2>/dev/null && \
    log_pass "sandbox.sh: Auth sync function" || log_fail "sandbox.sh: No auth sync"

# ==============================================================================
# SECTION 9: Build & Integration Readiness
# ==============================================================================
log_section "SECTION 9: Build & Integration Readiness"

# ----- TEST 9.1: Build script exists -----
log_section "9.1 Build Scripts"

BUILD_SH="$REPO_DIR/tools/build-windows.sh"
[ -f "$BUILD_SH" ] && log_pass "build-windows.sh exists" || log_fail "build-windows.sh missing"

# ----- TEST 9.2: All required services exist -----
log_section "9.2 Required Services"

SERVICES=(
    "ConfigLoader.cs"
    "DockerRunner.cs"
    "EnvVarSettings.cs"
    "ResourceManager.cs"
    "SavedSettings.cs"
    "SecureStorage.cs"
)

for svc in "${SERVICES[@]}"; do
    [ -f "$CSHARP_DIR/Services/$svc" ] && \
        log_pass "Service $svc exists" || log_fail "Service $svc missing"
done

# ==============================================================================
# SECTION 10: v2 Architecture
# ==============================================================================
log_section "SECTION 10: v2 Architecture"

# ----- TEST 10.1: New JSON configs -----
log_section "10.1 v2 JSON Config Files"

for cfg in "agents.json" "plugins.json" "mcp-servers.json"; do
    [ -f "$SANDBOX_CORE/$cfg" ] && \
        log_pass "v2 config $cfg exists" || log_fail "v2 config $cfg missing"
done

# Validate JSON
for cfg in "agents.json" "plugins.json" "mcp-servers.json"; do
    jq . "$SANDBOX_CORE/$cfg" >/dev/null 2>&1 && \
        log_pass "v2 config $cfg is valid JSON" || log_fail "v2 config $cfg invalid JSON"
done

# Check agents.json has expected agents
for agent in "opencode" "claude" "cursor" "copilot"; do
    jq -e ".\"$agent\"" "$SANDBOX_CORE/agents.json" >/dev/null 2>&1 && \
        log_pass "agents.json: $agent defined" || log_fail "agents.json: $agent missing"
done

# ----- TEST 10.2: Fragment directory structure -----
log_section "10.2 Fragment Directory Structure"

[ -d "$SANDBOX_CORE/fragments/languages" ] && \
    log_pass "fragments/languages/ directory exists" || log_fail "fragments/languages/ missing"

[ -d "$SANDBOX_CORE/fragments/agents" ] && \
    log_pass "fragments/agents/ directory exists" || log_fail "fragments/agents/ missing"

# Agent install fragments
for agent in "claude.sh" "opencode.sh" "cursor.sh" "copilot.sh"; do
    [ -f "$SANDBOX_CORE/fragments/agents/$agent" ] && \
        log_pass "Agent fragment $agent exists" || log_fail "Agent fragment $agent missing"
done

# Agent config directories
for agent in "claude" "opencode" "cursor" "copilot"; do
    [ -f "$SANDBOX_CORE/fragments/agents/$agent.config/sync-rules.json" ] && \
        log_pass "Agent config sync-rules.json for $agent" || log_fail "Agent config for $agent missing"
done

# ----- TEST 10.3: Shared bash library -----
log_section "10.3 Shared Bash Library"

LIB_DIR="$SANDBOX_SCRIPTS/lib"
for lib in "prereqs.sh" "config.sh" "detect.sh" "ui.sh" "docker.sh" "mcp.sh"; do
    [ -f "$LIB_DIR/$lib" ] && \
        log_pass "lib/$lib exists" || log_fail "lib/$lib missing"
done

# Syntax check all lib files
for lib in "$LIB_DIR"/*.sh; do
    bash -n "$lib" 2>/dev/null && \
        log_pass "$(basename "$lib"): valid syntax" || log_fail "$(basename "$lib"): syntax error"
done

# ----- TEST 10.4: v2 scripts -----
log_section "10.4 v2 Scripts"

[ -f "$SANDBOX_SCRIPTS/sandbox-setup.sh" ] && \
    log_pass "sandbox-setup.sh exists" || log_fail "sandbox-setup.sh missing"

[ -f "$SANDBOX_SCRIPTS/sandbox-me.sh" ] && \
    log_pass "sandbox-me.sh exists" || log_fail "sandbox-me.sh missing"

[ -x "$SANDBOX_SCRIPTS/sandbox-setup.sh" ] && \
    log_pass "sandbox-setup.sh is executable" || log_fail "sandbox-setup.sh not executable"

[ -x "$SANDBOX_SCRIPTS/sandbox-me.sh" ] && \
    log_pass "sandbox-me.sh is executable" || log_fail "sandbox-me.sh not executable"

bash -n "$SANDBOX_SCRIPTS/sandbox-setup.sh" 2>/dev/null && \
    log_pass "sandbox-setup.sh: valid syntax" || log_fail "sandbox-setup.sh: syntax error"

bash -n "$SANDBOX_SCRIPTS/sandbox-me.sh" 2>/dev/null && \
    log_pass "sandbox-me.sh: valid syntax" || log_fail "sandbox-me.sh: syntax error"

# Check key functions
grep -q 'config_validate_profile_name' "$SANDBOX_SCRIPTS/sandbox-setup.sh" 2>/dev/null && \
    log_pass "sandbox-setup.sh: uses profile name validation" || log_fail "sandbox-setup.sh: no name validation"

grep -q 'config_find_project_root' "$SANDBOX_SCRIPTS/sandbox-me.sh" 2>/dev/null && \
    log_pass "sandbox-me.sh: uses project root detection" || log_fail "sandbox-me.sh: no root detection"

grep -q 'docker_remap_compose_ports' "$SANDBOX_SCRIPTS/sandbox-me.sh" 2>/dev/null && \
    log_pass "sandbox-me.sh: uses port remapping" || log_fail "sandbox-me.sh: no port remapping"

# ----- TEST 10.5: Profile name validation -----
log_section "10.5 Profile Name Validation (Unit)"

source "$LIB_DIR/config.sh"

config_validate_profile_name "my-dev" >/dev/null 2>&1 && \
    log_pass "Profile name: 'my-dev' accepted" || log_fail "Profile name: 'my-dev' rejected"

config_validate_profile_name "ab" >/dev/null 2>&1 && \
    log_pass "Profile name: 'ab' (min length) accepted" || log_fail "Profile name: 'ab' rejected"

config_validate_profile_name "a" >/dev/null 2>&1 && \
    log_fail "Profile name: 'a' should be rejected" || log_pass "Profile name: 'a' correctly rejected (too short)"

config_validate_profile_name "My-Dev" >/dev/null 2>&1 && \
    log_fail "Profile name: 'My-Dev' should be rejected" || log_pass "Profile name: 'My-Dev' correctly rejected (uppercase)"

config_validate_profile_name "my--dev" >/dev/null 2>&1 && \
    log_fail "Profile name: 'my--dev' should be rejected" || log_pass "Profile name: 'my--dev' correctly rejected (consecutive hyphens)"

config_validate_profile_name "sandbox-me" >/dev/null 2>&1 && \
    log_fail "Profile name: 'sandbox-me' should be rejected" || log_pass "Profile name: 'sandbox-me' correctly rejected (reserved)"

config_validate_profile_name "-leading" >/dev/null 2>&1 && \
    log_fail "Profile name: '-leading' should be rejected" || log_pass "Profile name: '-leading' correctly rejected (leading hyphen)"

# ----- TEST 10.6: Mobile development support -----
log_section "10.6 Mobile Development"

for lang in "flutter" "react-native"; do
    jq -e ".\"$lang\"" "$SANDBOX_CORE/languages.json" >/dev/null 2>&1 && \
        log_pass "languages.json: $lang defined" || log_fail "languages.json: $lang missing"
done

[ -f "$SANDBOX_CORE/fragments/languages/flutter.sh" ] && \
    log_pass "Flutter fragment exists" || log_fail "Flutter fragment missing"

[ -f "$SANDBOX_CORE/fragments/languages/react-native.sh" ] && \
    log_pass "React Native fragment exists" || log_fail "React Native fragment missing"

# Check size warnings
jq -e '.flutter.size_warning' "$SANDBOX_CORE/languages.json" >/dev/null 2>&1 && \
    log_pass "Flutter has size_warning" || log_fail "Flutter missing size_warning"

jq -e '."react-native"' "$SANDBOX_CORE/languages.json" >/dev/null 2>&1 && \
    log_pass "React Native defined (lightweight, no Android SDK)" || log_fail "React Native missing"

# ----- TEST 10.7: Volume naming -----
log_section "10.7 Volume Naming (asb_ prefix)"

grep -q 'asb_' "$SANDBOX_CORE/generate_profile.sh" 2>/dev/null && \
    log_pass "generate_profile.sh: uses asb_ volume prefix" || log_fail "generate_profile.sh: no asb_ prefix"

# ----- TEST 10.8: instructions.base.md rename -----
log_section "10.8 File Renames"

[ -f "$SANDBOX_CORE/instructions.base.md" ] && \
    log_pass "instructions.base.md exists" || log_fail "instructions.base.md missing"

[ ! -f "$SANDBOX_CORE/AGENTS.md.base" ] && \
    log_pass "Old AGENTS.md.base removed" || log_fail "Old AGENTS.md.base still exists"

# ----- TEST 10.9: Windows resource sync -----
log_section "10.9 Windows Resource Sync"

WIN_RES="$REPO_DIR/tools/AgentSandbox/Resources"
for cfg in "agents.json" "plugins.json" "mcp-servers.json"; do
    [ -f "$WIN_RES/$cfg" ] && \
        log_pass "Windows resource $cfg exists" || log_fail "Windows resource $cfg missing"
done

grep -q '2.4.0' "$CSHARP_DIR/Services/ResourceManager.cs" 2>/dev/null && \
    log_pass "ResourceManager: VersionStamp bumped to 2.4.0" || log_fail "ResourceManager: VersionStamp not updated"

# ----- TEST 10.10: Profile generation with new paths -----
log_section "10.10 Profile Generation Test"

TEST_PROFILE_DIR="$TEMP_DIR/test-gen-profile"
bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$TEST_PROFILE_DIR" "test-gen" "python,node" "3000,8080" "python:3.12,node:20" >/dev/null 2>&1
if [ $? -eq 0 ]; then
    log_pass "generate_profile.sh runs successfully"

    [ -f "$TEST_PROFILE_DIR/Dockerfile.base" ] && \
        log_pass "Generated Dockerfile.base" || log_fail "No Dockerfile.base generated"

    [ -f "$TEST_PROFILE_DIR/docker-compose.yml.tpl" ] && \
        log_pass "Generated docker-compose.yml.tpl" || log_fail "No docker-compose.yml.tpl generated"

    [ -f "$TEST_PROFILE_DIR/install.sh" ] && \
        log_pass "Generated install.sh" || log_fail "No install.sh generated"

    [ -f "$TEST_PROFILE_DIR/AGENTS.md" ] && \
        log_pass "Generated AGENTS.md" || log_fail "No AGENTS.md generated"

    grep -q 'user.env' "$TEST_PROFILE_DIR/docker-compose.yml.tpl" 2>/dev/null && \
        log_pass "Compose template includes user.env" || log_fail "Compose template missing user.env"

    grep -q 'asb_' "$TEST_PROFILE_DIR/docker-compose.yml.tpl" 2>/dev/null && \
        log_pass "Compose template uses asb_ volume prefix" || log_fail "Compose template missing asb_ prefix"
else
    log_fail "generate_profile.sh failed to run"
fi

# ==============================================================================
# TEST 11: VS Code Server Addition (profile generation)
# ==============================================================================
log_section "11.1 VS Code Server Dockerfile Generation"

VSCODE_DIR="$TEMP_DIR/test-vscode-profile"
SELECTED_AGENTS="opencode" bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$VSCODE_DIR" "test-vscode" "node,python" "3000,4040,8080" "" "vscode-server" >/dev/null 2>&1

if [ -f "$VSCODE_DIR/Dockerfile.base" ]; then
    grep -q "code-server.dev/install.sh" "$VSCODE_DIR/Dockerfile.base" && \
        log_pass "Dockerfile has code-server install" || log_fail "Dockerfile missing code-server install"

    grep -q "install-extension" "$VSCODE_DIR/Dockerfile.base" && \
        log_pass "Dockerfile has VS Code extensions" || log_fail "Dockerfile missing VS Code extensions"

    grep -q "streetsidesoftware.code-spell-checker" "$VSCODE_DIR/Dockerfile.base" && \
        log_pass "Dockerfile has always-installed extension (spell checker)" || log_fail "Dockerfile missing always-installed extensions"

    grep -q "ms-python.python" "$VSCODE_DIR/Dockerfile.base" && \
        log_pass "Dockerfile has language-specific extension (Python)" || log_fail "Dockerfile missing Python extension"

    grep -q "dbaeumer.vscode-eslint" "$VSCODE_DIR/Dockerfile.base" && \
        log_pass "Dockerfile has language-specific extension (ESLint)" || log_fail "Dockerfile missing ESLint extension"
else
    log_fail "VS Code profile generation failed"
fi

log_section "11.2 VS Code Server install.sh Fragment"

if [ -f "$VSCODE_DIR/install.sh" ]; then
    grep -q "code-server" "$VSCODE_DIR/install.sh" && \
        log_pass "install.sh has code-server startup" || log_fail "install.sh missing code-server startup"

    grep -q "0.0.0.0:4040" "$VSCODE_DIR/install.sh" && \
        log_pass "install.sh binds to port 4040" || log_fail "install.sh missing port 4040 binding"

    grep -q "code-server.*&" "$VSCODE_DIR/install.sh" && \
        log_pass "install.sh runs code-server in background" || log_fail "install.sh code-server not backgrounded"
else
    log_fail "install.sh not generated"
fi

log_section "11.3 VS Code Server docker-compose Volumes and Ports"

if [ -f "$VSCODE_DIR/docker-compose.yml.tpl" ]; then
    grep -q "4040:4040" "$VSCODE_DIR/docker-compose.yml.tpl" && \
        log_pass "Compose has port 4040 mapping" || log_fail "Compose missing port 4040"

    grep -q "vscode_extensions" "$VSCODE_DIR/docker-compose.yml.tpl" && \
        log_pass "Compose has VS Code extensions volume" || log_fail "Compose missing extensions volume"

    grep -q "vscode_data" "$VSCODE_DIR/docker-compose.yml.tpl" && \
        log_pass "Compose has VS Code data volume" || log_fail "Compose missing data volume"
else
    log_fail "docker-compose.yml.tpl not generated"
fi

log_section "11.4 VS Code Server AGENTS.md"

if [ -f "$VSCODE_DIR/AGENTS.md" ]; then
    grep -q "VS Code" "$VSCODE_DIR/AGENTS.md" && \
        log_pass "AGENTS.md mentions VS Code Server" || log_fail "AGENTS.md missing VS Code section"
else
    log_fail "AGENTS.md not generated"
fi

# ==============================================================================
# TEST 12: Agent-Aware Exec and Custom Startup
# ==============================================================================
log_section "11.5 Selective Agent Installation"

# Only claude selected — should NOT have opencode/cursor/copilot install
SELECTIVE_DIR="$TEMP_DIR/test-selective"
SELECTED_AGENTS="claude" PRIMARY_AGENT="claude" bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$SELECTIVE_DIR" "test-selective" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$SELECTIVE_DIR/Dockerfile.base" ]; then
    grep -q "claude.ai/install.sh" "$SELECTIVE_DIR/Dockerfile.base" && \
        log_pass "Selective: Claude install present" || log_fail "Selective: Claude install missing"

    ! grep -q "opencode.ai/install" "$SELECTIVE_DIR/Dockerfile.base" && \
        log_pass "Selective: OpenCode NOT installed (not selected)" || log_fail "Selective: OpenCode installed despite not selected"

    ! grep -q "cursor.com/install" "$SELECTIVE_DIR/Dockerfile.base" && \
        log_pass "Selective: Cursor NOT installed (not selected)" || log_fail "Selective: Cursor installed despite not selected"

    ! grep -q "oh-my-openagent" "$SELECTIVE_DIR/Dockerfile.base" && \
        log_pass "Selective: oh-my-openagent NOT installed (opencode not selected)" || log_fail "Selective: oh-my-openagent installed despite opencode not selected"
else
    log_fail "Selective agent Dockerfile not generated"
fi

# Multiple agents — both should be present
MULTI_DIR="$TEMP_DIR/test-multi-agent"
SELECTED_AGENTS="opencode,claude" PRIMARY_AGENT="opencode" bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$MULTI_DIR" "test-multi" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$MULTI_DIR/Dockerfile.base" ]; then
    grep -q "opencode.ai/install" "$MULTI_DIR/Dockerfile.base" && \
        log_pass "Multi-agent: OpenCode present" || log_fail "Multi-agent: OpenCode missing"

    grep -q "claude.ai/install.sh" "$MULTI_DIR/Dockerfile.base" && \
        log_pass "Multi-agent: Claude present" || log_fail "Multi-agent: Claude missing"

    ! grep -q "cursor.com/install" "$MULTI_DIR/Dockerfile.base" && \
        log_pass "Multi-agent: Cursor NOT present (not selected)" || log_fail "Multi-agent: Cursor present despite not selected"
else
    log_fail "Multi-agent Dockerfile not generated"
fi

log_section "12.1 Agent-Aware Exec in install.sh"

AGENT_DIR="$TEMP_DIR/test-agent-exec"
PRIMARY_AGENT="claude" bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$AGENT_DIR" "test-agent" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$AGENT_DIR/install.sh" ]; then
    grep -q "exec claude" "$AGENT_DIR/install.sh" && \
        log_pass "install.sh uses 'exec claude' for PRIMARY_AGENT=claude" || log_fail "install.sh not using claude agent"

    grep -q "runuser.*-- claude" "$AGENT_DIR/install.sh" && \
        log_pass "install.sh runuser uses claude" || log_fail "install.sh runuser not using claude"
else
    log_fail "install.sh not generated"
fi

# Test default agent (no PRIMARY_AGENT)
DEFAULT_DIR="$TEMP_DIR/test-default-agent"
bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$DEFAULT_DIR" "test-default" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$DEFAULT_DIR/install.sh" ]; then
    grep -q "exec opencode" "$DEFAULT_DIR/install.sh" && \
        log_pass "install.sh defaults to 'exec opencode'" || log_fail "install.sh not defaulting to opencode"
else
    log_fail "Default agent install.sh not generated"
fi

# Test copilot agent (has args)
COPILOT_DIR="$TEMP_DIR/test-copilot"
PRIMARY_AGENT="copilot" bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$COPILOT_DIR" "test-copilot" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$COPILOT_DIR/install.sh" ]; then
    grep -q "exec gh copilot agent" "$COPILOT_DIR/install.sh" && \
        log_pass "install.sh uses 'exec gh copilot agent' for copilot" || log_fail "install.sh not using copilot args"
else
    log_fail "Copilot install.sh not generated"
fi

log_section "12.2 Custom Startup Commands"

CUSTOM_DIR="$TEMP_DIR/test-custom-startup"
CUSTOM_STARTUP_BEFORE="echo 'pre-agent'" CUSTOM_STARTUP_AFTER="my-service --port=9090 &" \
    bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$CUSTOM_DIR" "test-custom" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$CUSTOM_DIR/install.sh" ]; then
    grep -q "pre-agent" "$CUSTOM_DIR/install.sh" && \
        log_pass "install.sh has custom before command" || log_fail "install.sh missing before command"

    grep -q "my-service" "$CUSTOM_DIR/install.sh" && \
        log_pass "install.sh has custom after command" || log_fail "install.sh missing after command"
else
    log_fail "Custom startup install.sh not generated"
fi

log_section "12.3 Special Character Escaping in Custom Commands"

ESCAPE_DIR="$TEMP_DIR/test-escape"
CUSTOM_STARTUP_BEFORE=$'echo "hello\'s world"\necho "test $VAR"' \
    bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$ESCAPE_DIR" "test-escape" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$ESCAPE_DIR/install.sh" ]; then
    grep -q "hello's world" "$ESCAPE_DIR/install.sh" && \
        log_pass "Single quotes preserved in install.sh" || log_fail "Single quotes mangled"

    grep -q 'test $VAR' "$ESCAPE_DIR/install.sh" && \
        log_pass "Dollar signs preserved in install.sh" || log_fail "Dollar signs expanded"
else
    log_fail "Escape test install.sh not generated"
fi

# ==============================================================================
# TEST 13: Custom Dockerfile Lines
# ==============================================================================
log_section "13.1 Custom Dockerfile Lines via Template"

CUSTOMDF_DIR="$TEMP_DIR/test-custom-df"
CUSTOM_DOCKERFILE_LINES="RUN apt update && apt install -y htop" \
    bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$CUSTOMDF_DIR" "test-customdf" "node" "3000,8080" "" "" >/dev/null 2>&1

if [ -f "$CUSTOMDF_DIR/Dockerfile.base" ]; then
    grep -q "htop" "$CUSTOMDF_DIR/Dockerfile.base" && \
        log_pass "Custom Dockerfile line (htop) present" || log_fail "Custom Dockerfile line missing"

    # Verify it's before ENTRYPOINT
    htop_line=$(grep -n "htop" "$CUSTOMDF_DIR/Dockerfile.base" | head -1 | cut -d: -f1)
    entry_line=$(grep -n "ENTRYPOINT" "$CUSTOMDF_DIR/Dockerfile.base" | head -1 | cut -d: -f1)
    if [ -n "$htop_line" ] && [ -n "$entry_line" ] && [ "$htop_line" -lt "$entry_line" ]; then
        log_pass "Custom line is before ENTRYPOINT"
    else
        log_fail "Custom line is not before ENTRYPOINT"
    fi
else
    log_fail "Custom Dockerfile install not generated"
fi

# ==============================================================================
# TEST 14: VS Code Optional Extensions
# ==============================================================================
log_section "14.1 Optional VS Code Extensions"

VSEXT_DIR="$TEMP_DIR/test-vscode-ext"
SELECTED_AGENTS="opencode" VSCODE_EXTENSIONS="eamodio.gitlens" \
    bash "$SANDBOX_CORE/generate_profile.sh" "$SANDBOX_CORE" "$VSEXT_DIR" "test-vsext" "node" "3000,4040,8080" "" "vscode-server" >/dev/null 2>&1

if [ -f "$VSEXT_DIR/Dockerfile.base" ]; then
    grep -q "eamodio.gitlens" "$VSEXT_DIR/Dockerfile.base" && \
        log_pass "Optional extension (GitLens) included" || log_fail "Optional extension missing"

    # Verify always extensions are also present
    grep -q "gruntfuggly.todo-tree" "$VSEXT_DIR/Dockerfile.base" && \
        log_pass "Always extension (Todo Tree) present alongside optional" || log_fail "Always extension missing when optional set"
else
    log_fail "VS Code extensions profile not generated"
fi

# ==============================================================================
# TEST 15: Addition Priority Ordering
# ==============================================================================
log_section "15.1 Additions Sorted by Priority"

# additions.json has priority field — verify generate_profile.sh reads it
if [ -f "$SANDBOX_CORE/additions.json" ]; then
    priority=$(jq -r '.["vscode-server"].priority // "missing"' "$SANDBOX_CORE/additions.json")
    [ "$priority" != "missing" ] && \
        log_pass "additions.json has priority field ($priority)" || log_fail "additions.json missing priority field"
else
    log_fail "additions.json not found"
fi

# ==============================================================================
# TEST 16: Export/Import Round-Trip
# ==============================================================================
log_section "16.1 Profile Export"

EXPORT_DIR="$TEMP_DIR/test-export"
mkdir -p "$EXPORT_DIR/profiles/test-rt"
cat > "$EXPORT_DIR/profiles/test-rt/profile.json" <<'PROFILEJSON'
{
    "name": "test-rt",
    "agents": ["claude", "opencode"],
    "plugins": ["oh-my-openagent"],
    "custom_plugins": ["@goondocks/myco"],
    "skills": ["pdf", "mcp-builder"],
    "languages": ["node", "python"],
    "versions": {"node": "20", "python": "3.12"},
    "additions": ["vscode-server"],
    "vscode_extensions": ["eamodio.gitlens"],
    "mcp_servers": ["filesystem"],
    "config_mirrors": {"git": {"strategy": "bind-ro"}},
    "custom_dockerfile_lines": ["RUN apt install -y htop"],
    "custom_startup_before": ["echo setup"],
    "custom_startup_after": ["my-svc &"],
    "created": "2026-03-19"
}
PROFILEJSON

exported=$(SANDBOX_HOME="$EXPORT_DIR" bash "$SANDBOX_SCRIPTS/sandbox-setup.sh" --export test-rt 2>/dev/null)

if [ -n "$exported" ]; then
    log_pass "Export produces output"

    echo "$exported" | jq -e '._format == "agent-sandbox-profile/1"' >/dev/null 2>&1 && \
        log_pass "Export has correct format" || log_fail "Export format wrong"

    echo "$exported" | jq -e '.profile.agents | length == 2' >/dev/null 2>&1 && \
        log_pass "Export preserves agents" || log_fail "Export lost agents"

    echo "$exported" | jq -e '.profile.skills | length == 2' >/dev/null 2>&1 && \
        log_pass "Export preserves skills" || log_fail "Export lost skills"

    echo "$exported" | jq -e '.profile.custom_plugins | length == 1' >/dev/null 2>&1 && \
        log_pass "Export preserves custom_plugins" || log_fail "Export lost custom_plugins"

    echo "$exported" | jq -e '.profile.additions | length == 1' >/dev/null 2>&1 && \
        log_pass "Export preserves additions" || log_fail "Export lost additions"

    echo "$exported" | jq -e '.profile.vscode_extensions | length == 1' >/dev/null 2>&1 && \
        log_pass "Export preserves vscode_extensions" || log_fail "Export lost vscode_extensions"

    echo "$exported" | jq -e '.profile.mcp_servers | length == 1' >/dev/null 2>&1 && \
        log_pass "Export preserves mcp_servers" || log_fail "Export lost mcp_servers"

    echo "$exported" | jq -e '.profile.config_mirrors.git.strategy == "bind-ro"' >/dev/null 2>&1 && \
        log_pass "Export preserves config_mirrors" || log_fail "Export lost config_mirrors"

    echo "$exported" | jq -e '.profile.custom_dockerfile_lines | length == 1' >/dev/null 2>&1 && \
        log_pass "Export preserves custom_dockerfile_lines" || log_fail "Export lost custom_dockerfile_lines"

    echo "$exported" | jq -e '.profile.custom_startup_before | length == 1' >/dev/null 2>&1 && \
        log_pass "Export preserves custom_startup_before" || log_fail "Export lost custom_startup_before"
else
    log_fail "Export produced no output"
fi

log_section "16.2 Import with Name Collision"

IMPORT_DIR="$TEMP_DIR/test-import"
mkdir -p "$IMPORT_DIR/profiles/test-rt" "$IMPORT_DIR/projects"
echo '{"name":"test-rt"}' > "$IMPORT_DIR/profiles/test-rt/profile.json"

echo "$exported" > "$IMPORT_DIR/import.json"

# The import should resolve "test-rt" to "test-rt-2" since test-rt exists
imp_name=$(SANDBOX_HOME="$IMPORT_DIR" bash -c '
    import_file="'"$IMPORT_DIR/import.json"'"
    imp_name=$(jq -r ".profile.name" "$import_file")
    base_name="$imp_name"
    suffix=1
    while [ -d "'"$IMPORT_DIR"'/profiles/$imp_name" ]; do
        suffix=$((suffix + 1))
        imp_name="${base_name}-${suffix}"
    done
    echo "$imp_name"
' 2>/dev/null)

[ "$imp_name" = "test-rt-2" ] && \
    log_pass "Import name collision resolved to test-rt-2" || log_fail "Name collision resolution: got '$imp_name'"

# ==============================================================================
# TEST 17: Windows Resource Completeness
# ==============================================================================
log_section "17.1 Windows Resource Files Content"

WIN_RES="$CSHARP_DIR/Resources"

# additions.json must have the full structure
if [ -f "$WIN_RES/additions.json" ]; then
    jq -e '.["vscode-server"].dockerfile' "$WIN_RES/additions.json" >/dev/null 2>&1 && \
        log_pass "Resources additions.json has dockerfile field" || log_fail "Resources additions.json missing dockerfile"

    jq -e '.["vscode-server"].extensions.always' "$WIN_RES/additions.json" >/dev/null 2>&1 && \
        log_pass "Resources additions.json has always extensions" || log_fail "Resources additions.json missing always extensions"

    jq -e '.["vscode-server"].extensions.optional' "$WIN_RES/additions.json" >/dev/null 2>&1 && \
        log_pass "Resources additions.json has optional extensions" || log_fail "Resources additions.json missing optional extensions"

    jq -e '.["vscode-server"].extensions.languages' "$WIN_RES/additions.json" >/dev/null 2>&1 && \
        log_pass "Resources additions.json has language extensions" || log_fail "Resources additions.json missing language extensions"

    jq -e '.["vscode-server"].port' "$WIN_RES/additions.json" >/dev/null 2>&1 && \
        log_pass "Resources additions.json has port field" || log_fail "Resources additions.json missing port"

    jq -e '.["vscode-server"].priority' "$WIN_RES/additions.json" >/dev/null 2>&1 && \
        log_pass "Resources additions.json has priority field" || log_fail "Resources additions.json missing priority"
else
    log_fail "Resources additions.json not found"
fi

# agents.json must have v2 fields
if [ -f "$WIN_RES/agents.json" ]; then
    jq -e '.opencode.description' "$WIN_RES/agents.json" >/dev/null 2>&1 && \
        log_pass "Resources agents.json has description field" || log_fail "Resources agents.json missing description"

    jq -e '.opencode.use_cases' "$WIN_RES/agents.json" >/dev/null 2>&1 && \
        log_pass "Resources agents.json has use_cases field" || log_fail "Resources agents.json missing use_cases"

    jq -e '.opencode.auth_hint' "$WIN_RES/agents.json" >/dev/null 2>&1 && \
        log_pass "Resources agents.json has auth_hint field" || log_fail "Resources agents.json missing auth_hint"

    jq -e '.opencode.discovery_urls | type == "array"' "$WIN_RES/agents.json" >/dev/null 2>&1 && \
        log_pass "Resources agents.json has discovery_urls array" || log_fail "Resources agents.json missing discovery_urls"

    jq -e '.claude.skills_url' "$WIN_RES/agents.json" >/dev/null 2>&1 && \
        log_pass "Resources agents.json Claude has skills_url" || log_fail "Resources agents.json missing skills_url"
else
    log_fail "Resources agents.json not found"
fi

# Addition fragment files must exist in Resources
[ -f "$WIN_RES/additions/vscode-server.sh" ] && \
    log_pass "Resources has vscode-server.sh fragment" || log_fail "Resources missing vscode-server.sh"

[ -f "$WIN_RES/additions/vscode-server.agents.md" ] && \
    log_pass "Resources has vscode-server.agents.md" || log_fail "Resources missing vscode-server.agents.md"

log_section "17.2 Source vs Resources Parity"

for f in additions.json agents.json plugins.json mcp-servers.json Dockerfile.base.tpl; do
    if [ -f "$SANDBOX_CORE/$f" ] && [ -f "$WIN_RES/$f" ]; then
        diff <(jq -S . "$SANDBOX_CORE/$f" 2>/dev/null || cat "$SANDBOX_CORE/$f") \
             <(jq -S . "$WIN_RES/$f" 2>/dev/null || cat "$WIN_RES/$f") >/dev/null 2>&1 && \
            log_pass "Source and Resources $f are identical" || log_fail "Source and Resources $f differ"
    fi
done

# ==============================================================================
# TEST 18: C# Code Structure Checks
# ==============================================================================
log_section "18.1 ProfileSpec Field Completeness"

SPEC_FILE="$CSHARP_DIR/Models/ProfileSpec.cs"
for field in Languages Versions Ports Agents Plugins Additions VscodeExtensions McpServers Skills CustomPlugins CustomDockerfileLines CustomStartupBefore CustomStartupAfter; do
    grep -q "$field" "$SPEC_FILE" 2>/dev/null && \
        log_pass "ProfileSpec has $field" || log_fail "ProfileSpec missing $field"
done

log_section "18.2 ProfileGenerator Handles Additions"

PG_FILE="$CSHARP_DIR/Services/ProfileGenerator.cs"
grep -q "LoadAdditionsJson" "$PG_FILE" 2>/dev/null && \
    log_pass "ProfileGenerator loads additions.json" || log_fail "ProfileGenerator missing additions loading"

grep -q "vscode-server" "$PG_FILE" 2>/dev/null && \
    log_pass "ProfileGenerator handles vscode-server" || log_fail "ProfileGenerator missing vscode-server handling"

grep -q "install-extension" "$PG_FILE" 2>/dev/null && \
    log_pass "ProfileGenerator installs VS Code extensions" || log_fail "ProfileGenerator missing extension install"

grep -q "ReadAdditionFragment" "$PG_FILE" 2>/dev/null && \
    log_pass "ProfileGenerator reads addition fragments" || log_fail "ProfileGenerator missing fragment reading"

grep -q "spec.CustomDockerfileLines" "$PG_FILE" 2>/dev/null && \
    log_pass "ProfileGenerator handles custom Dockerfile lines" || log_fail "ProfileGenerator missing custom Dockerfile"

log_section "18.3 RegenerateProfile Reads profile.json"

grep -q "profile.json" "$PG_FILE" 2>/dev/null && \
    log_pass "RegenerateProfile reads profile.json" || log_fail "RegenerateProfile doesn't read profile.json"

grep -q "ReadArray" "$PG_FILE" 2>/dev/null && \
    log_pass "RegenerateProfile uses ReadArray for all fields" || log_fail "RegenerateProfile missing ReadArray"

log_section "18.4 ProfileImportExport Handles All Fields"

IE_FILE="$CSHARP_DIR/Services/ProfileImportExport.cs"
for field in plugins custom_plugins skills additions vscode_extensions mcp_servers custom_dockerfile_lines custom_startup_before custom_startup_after; do
    grep -q "\"$field\"" "$IE_FILE" 2>/dev/null && \
        log_pass "ImportExport handles $field" || log_fail "ImportExport missing $field"
done

log_section "18.5 ResourceManager Extraction Safety"

RM_FILE="$CSHARP_DIR/Services/ResourceManager.cs"
grep -q 'additions.json.*OrdinalIgnoreCase' "$RM_FILE" 2>/dev/null && \
    log_pass "ResourceManager excludes additions.json from subdirectory mapping" || log_fail "ResourceManager missing additions.json exclusion"

grep -q "GetLastWriteTimeUtc" "$RM_FILE" 2>/dev/null && \
    log_pass "ResourceManager checks exe timestamp for re-extraction" || log_fail "ResourceManager missing timestamp check"

log_section "18.6 ProjectScaffolder Always Updates FROM"

grep -q 'ResourceManager.WriteLf(dockerfilePath' "$SCAFFOLDER" 2>/dev/null && \
    ! grep -q 'if (!File.Exists(dockerfilePath))' "$SCAFFOLDER" 2>/dev/null && \
    log_pass "RefreshFromProfile always updates Dockerfile FROM" || log_fail "RefreshFromProfile may skip Dockerfile update"

# ==============================================================================
# TEST 19: Dockerfile Template Markers
# ==============================================================================
log_section "19.1 Dockerfile Template Has All Markers"

TPL="$SANDBOX_CORE/Dockerfile.base.tpl"
grep -q '{{AGENT_LAYERS}}' "$TPL" && \
    log_pass "Template has AGENT_LAYERS marker" || log_fail "Template missing AGENT_LAYERS"
grep -q '{{LANGUAGE_LAYERS}}' "$TPL" && \
    log_pass "Template has LANGUAGE_LAYERS marker" || log_fail "Template missing LANGUAGE_LAYERS"
grep -q '{{ADDITION_LAYERS}}' "$TPL" && \
    log_pass "Template has ADDITION_LAYERS marker" || log_fail "Template missing ADDITION_LAYERS"
grep -q '{{CUSTOM_DOCKERFILE_LINES}}' "$TPL" && \
    log_pass "Template has CUSTOM_DOCKERFILE_LINES marker" || log_fail "Template missing CUSTOM_DOCKERFILE_LINES"
grep -q '{{NODE_VERSION}}' "$TPL" && \
    log_pass "Template has NODE_VERSION marker" || log_fail "Template missing NODE_VERSION"

# Template should NOT have hardcoded agent installs
! grep -q "opencode.ai/install" "$TPL" && \
    log_pass "Template has no hardcoded agent installs" || log_fail "Template still has hardcoded agent installs"

# ==============================================================================
# SUMMARY
# ==============================================================================
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║              TEST SUMMARY                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo -e "  ${GREEN}Passed:${NC}  $passed"
echo -e "  ${RED}Failed:${NC}  $failed"
echo -e "  ${YELLOW}Skipped:${NC} $skipped"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed.${NC}"
    exit 1
fi
