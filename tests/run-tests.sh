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
for tpl in "opencode.json" "oh-my-opencode.json" "agent-config.json"; do
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

grep -q 'Ensure Dockerfile exists' "$SCAFFOLDER" 2>/dev/null && \
    log_pass "Scaffolder: Dockerfile check exists" || log_fail "Scaffolder: No Dockerfile check"

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

jq -e '."react-native".size_warning' "$SANDBOX_CORE/languages.json" >/dev/null 2>&1 && \
    log_pass "React Native has size_warning" || log_fail "React Native missing size_warning"

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

grep -q '2.0.0' "$CSHARP_DIR/Services/ResourceManager.cs" 2>/dev/null && \
    log_pass "ResourceManager: VersionStamp bumped to 2.0.0" || log_fail "ResourceManager: VersionStamp not updated"

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
