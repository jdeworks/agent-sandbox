using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AgentSandbox.Services;

/// <summary>
/// Manages per-project data under %APPDATA%/AgentSandbox/projects/<name>/,
/// mirroring the unix sandbox.sh project scaffolding.
/// </summary>
public static class ProjectScaffolder
{
    public record RecentProject(string Name, string Profile, string WorkspacePath, string LastStarted);

    private static readonly string[] ApiKeyVars =
        ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "OPENCODE_API_KEY", "GEMINI_API_KEY", "CURSOR_API_KEY", "GITHUB_COPILOT_API_KEY"];

    public static string GetProjectDir(string projectName) =>
        Path.Combine(ResourceManager.ProjectsDir, projectName);

    public static string ResolveProjectName(string workspacePath)
    {
        var baseName = Path.GetFileName(workspacePath)!;
        var projectDir = GetProjectDir(baseName);

        if (!Directory.Exists(projectDir))
            return baseName;

        var config = ParseConfigEnv(Path.Combine(projectDir, "config.env"));
        if (config.TryGetValue("WORKSPACE_PATH", out var existingPath))
        {
            var normalizedExisting = existingPath.Replace('\\', '/').TrimEnd('/');
            var normalizedNew = workspacePath.Replace('\\', '/').TrimEnd('/');
            if (normalizedExisting != normalizedNew)
            {
                var hash = Convert.ToHexString(
                    MD5.HashData(Encoding.UTF8.GetBytes(workspacePath)))[..6].ToLower();
                return $"{baseName}-{hash}";
            }
        }

        return baseName;
    }

    public static bool Exists(string projectName) =>
        Directory.Exists(GetProjectDir(projectName));

    public static List<RecentProject> GetRecentProjects()
    {
        var result = new List<RecentProject>();
        if (!Directory.Exists(ResourceManager.ProjectsDir))
            return result;

        foreach (var dir in Directory.GetDirectories(ResourceManager.ProjectsDir))
        {
            var configPath = Path.Combine(dir, "config.env");
            if (!File.Exists(configPath)) continue;

            var config = ParseConfigEnv(configPath);
            result.Add(new RecentProject(
                Path.GetFileName(dir)!,
                config.GetValueOrDefault("PROFILE", ""),
                config.GetValueOrDefault("WORKSPACE_PATH", ""),
                config.GetValueOrDefault("LAST_STARTED", "")
            ));
        }

        return result.OrderByDescending(p => p.LastStarted).ToList();
    }

    private static Dictionary<string, string> ParseConfigEnv(string path)
    {
        var dict = new Dictionary<string, string>();
        foreach (var line in File.ReadAllLines(path))
        {
            var eq = line.IndexOf('=');
            if (eq > 0)
                dict[line[..eq]] = line[(eq + 1)..];
        }
        return dict;
    }

    public static void Scaffold(string projectName, string workspacePath, string profileName, string profileDir)
    {
        var projectDir = GetProjectDir(projectName);
        Directory.CreateDirectory(projectDir);

        var composeTpl = File.ReadAllText(Path.Combine(profileDir, "docker-compose.yml.tpl"));
        var dockerPath = workspacePath.Replace('\\', '/');
        var compose = composeTpl
            .Replace("{{PROJECT_NAME}}", projectName)
            .Replace("{{WORKSPACE_PATH}}", dockerPath)
            .Replace("{{HOST_UID}}", "")  // Unix scripts substitute; Windows runs container as root
            .Replace("{{HOST_GID}}", "");
        ResourceManager.WriteLf(Path.Combine(projectDir, "docker-compose.yml"), compose);

        var baseImage = $"agent-sandbox-{profileName}:latest";
        ResourceManager.WriteLf(Path.Combine(projectDir, "Dockerfile"), $"FROM {baseImage}\n");

        Directory.CreateDirectory(Path.Combine(projectDir, "sandbox_data"));
        File.WriteAllText(Path.Combine(projectDir, "sandbox_data", "changes.txt"), "");

        var agentConfigSrc = Path.Combine(ResourceManager.TemplatesDir, "agent-config.json");
        var agentConfigDst = Path.Combine(projectDir, "sandbox_data", "agent-config.json");
        if (File.Exists(agentConfigSrc))
        {
            var agentJson = File.ReadAllText(agentConfigSrc);
            var savedAgent = SavedSettings.GetDefaultAgent();
            if (!string.IsNullOrEmpty(savedAgent))
                agentJson = ApplyDefaultAgentToJson(agentJson, savedAgent);
            ResourceManager.WriteLf(agentConfigDst, agentJson);
        }

        Directory.CreateDirectory(Path.Combine(projectDir, "opencode_data"));
        File.Copy(
            Path.Combine(ResourceManager.TemplatesDir, "opencode.json"),
            Path.Combine(projectDir, "opencode_data", "opencode.json"), true);
        File.Copy(
            Path.Combine(ResourceManager.TemplatesDir, "oh-my-opencode.json"),
            Path.Combine(projectDir, "opencode_data", "oh-my-opencode.json"), true);
        File.Copy(
            Path.Combine(profileDir, "AGENTS.md"),
            Path.Combine(projectDir, "opencode_data", "AGENTS.md"), true);

        Directory.CreateDirectory(Path.Combine(projectDir, "opencode_sessions"));
        Directory.CreateDirectory(Path.Combine(projectDir, "logs"));

        var versionsEnvPath = Path.Combine(profileDir, "versions.env");
        var versionLines = "";
        if (File.Exists(versionsEnvPath))
        {
            versionLines = string.Join("\n",
                File.ReadAllLines(versionsEnvPath)
                    .Where(l => !l.StartsWith("#") && !string.IsNullOrWhiteSpace(l)));
        }

        var configEnv = $"""
            WORKSPACE_PATH={workspacePath}
            PROJECT_NAME={projectName}
            PROFILE={profileName}
            CREATED={DateTime.Now:O}
            LAST_STARTED={DateTime.Now:O}
            {versionLines}
            """;
        ResourceManager.WriteLf(Path.Combine(projectDir, "config.env"), configEnv.TrimEnd() + "\n");
    }

    /// <summary>
    /// Regenerate docker-compose.yml and AGENTS.md from the current profile
    /// template so that port/volume/instruction changes from re-prepare are
    /// picked up automatically on existing projects. User-editable configs
    /// (opencode.json, oh-my-opencode.json) are NOT overwritten.
    /// </summary>
    public static void RefreshFromProfile(string projectName, string workspacePath, string profileDir)
    {
        var projectDir = GetProjectDir(projectName);

        var agentConfigDst = Path.Combine(projectDir, "sandbox_data", "agent-config.json");
        if (!File.Exists(agentConfigDst))
        {
            var agentConfigSrc = Path.Combine(ResourceManager.TemplatesDir, "agent-config.json");
            if (File.Exists(agentConfigSrc))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(agentConfigDst)!);
                var agentJson = File.ReadAllText(agentConfigSrc);
                var savedAgent = SavedSettings.GetDefaultAgent();
                if (!string.IsNullOrEmpty(savedAgent))
                    agentJson = ApplyDefaultAgentToJson(agentJson, savedAgent);
                ResourceManager.WriteLf(agentConfigDst, agentJson);
            }
        }

        var composeTpl = File.ReadAllText(Path.Combine(profileDir, "docker-compose.yml.tpl"));
        var dockerPath = workspacePath.Replace('\\', '/');
        var compose = composeTpl
            .Replace("{{PROJECT_NAME}}", projectName)
            .Replace("{{WORKSPACE_PATH}}", dockerPath)
            .Replace("{{HOST_UID}}", "")
            .Replace("{{HOST_GID}}", "");
        ResourceManager.WriteLf(Path.Combine(projectDir, "docker-compose.yml"), compose);

        // Ensure Dockerfile exists (e.g., projects created before this step was added)
        var profileName = Path.GetFileName(profileDir);
        var dockerfilePath = Path.Combine(projectDir, "Dockerfile");
        if (!File.Exists(dockerfilePath))
            ResourceManager.WriteLf(dockerfilePath, $"FROM agent-sandbox-{profileName}:latest\n");

        // Ensure opencode_data directory exists before copying AGENTS.md
        Directory.CreateDirectory(Path.Combine(projectDir, "opencode_data"));


        var agentsMd = Path.Combine(profileDir, "AGENTS.md");
        if (File.Exists(agentsMd))
            File.Copy(agentsMd, Path.Combine(projectDir, "opencode_data", "AGENTS.md"), true);
    }

    public static void UpdateLastStarted(string projectName)
    {
        var configPath = Path.Combine(GetProjectDir(projectName), "config.env");
        if (!File.Exists(configPath)) return;

        var lines = File.ReadAllLines(configPath).ToList();
        var idx = lines.FindIndex(l => l.StartsWith("LAST_STARTED="));
        var newLine = $"LAST_STARTED={DateTime.Now:O}";
        if (idx >= 0)
            lines[idx] = newLine;
        else
            lines.Add(newLine);
        ResourceManager.WriteLf(configPath, string.Join("\n", lines) + "\n");
    }

    public static void UpdateWorkspacePath(string projectName, string workspacePath)
    {
        var configPath = Path.Combine(GetProjectDir(projectName), "config.env");
        if (!File.Exists(configPath)) return;

        var lines = File.ReadAllLines(configPath).ToList();
        var idx = lines.FindIndex(l => l.StartsWith("WORKSPACE_PATH="));
        if (idx >= 0)
            lines[idx] = $"WORKSPACE_PATH={workspacePath}";
        ResourceManager.WriteLf(configPath, string.Join("\n", lines) + "\n");
    }

    public static void SyncHostAuth(string projectName, Action<string>? log = null)
    {
        var sessionsDir = Path.Combine(GetProjectDir(projectName), "opencode_sessions");
        Directory.CreateDirectory(sessionsDir);

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var hostAuth = Path.Combine(home, ".local", "share", "opencode", "auth.json");

        if (!File.Exists(hostAuth))
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            hostAuth = Path.Combine(appData, "opencode", "auth.json");
        }

        if (!File.Exists(hostAuth)) return;

        var info = new FileInfo(hostAuth);
        if (info.Length <= 2) return;

        var dest = Path.Combine(sessionsDir, "auth.json");
        if (!File.Exists(dest) || File.GetLastWriteTimeUtc(hostAuth) > File.GetLastWriteTimeUtc(dest))
        {
            File.Copy(hostAuth, dest, true);
            log?.Invoke("[sandbox] Synced host OpenCode auth.");
        }
    }

    public static void WriteRuntimeEnv(string projectName, Dictionary<string, string>? overrides = null)
    {
        var envPath = Path.Combine(GetProjectDir(projectName), "runtime.env");
        var sb = new StringBuilder();
        
        // Collect all env vars (host env + overrides)
        var allVars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        
        // Add host environment variables
        foreach (var key in ApiKeyVars)
        {
            var val = Environment.GetEnvironmentVariable(key);
            if (!string.IsNullOrEmpty(val))
                allVars[key] = val;
        }
        
        // Override with UI-provided values (these take precedence)
        if (overrides != null)
        {
            foreach (var kvp in overrides)
            {
                if (!string.IsNullOrEmpty(kvp.Value))
                    allVars[kvp.Key] = kvp.Value;
            }
        }
        
        foreach (var kvp in allVars)
        {
            var encryptedValue = SecureStorage.Encrypt(kvp.Value);
            sb.AppendLine($"{kvp.Key}={encryptedValue}");
        }
        
        ResourceManager.WriteLf(envPath, sb.ToString());
    }

    // Read and decrypt runtime env vars for UI display
    public static Dictionary<string, string> ReadRuntimeEnvForUI(string projectName)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var envPath = Path.Combine(GetProjectDir(projectName), "runtime.env");
        
        if (!File.Exists(envPath))
            return result;
        
        var lines = File.ReadAllLines(envPath);
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line) || !line.Contains('='))
                continue;
            
            var idx = line.IndexOf('=');
            var key = line[..idx];
            var value = line[(idx + 1)..];
            
            if (!string.IsNullOrEmpty(value))
                value = SecureStorage.Decrypt(value);
            
            result[key] = value;
        }
        
        return result;
    }

    public static void RemapPorts(string projectName, Action<string>? log = null)
    {
        var composePath = Path.Combine(GetProjectDir(projectName), "docker-compose.yml");
        if (!File.Exists(composePath)) return;

        var lines = File.ReadAllLines(composePath);
        var changed = false;
        // Match YAML port line: optional whitespace, "- ", optional space, quote, hostPort:containerPort, quote, rest (e.g. "5000:5000")
        var regex = new Regex(@"^(\s*-\s*[""])(\d+):(\d+)([""].*)$");

        for (int i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            var match = regex.Match(line);
            if (!match.Success) continue;

            var hostPort = int.Parse(match.Groups[2].Value);
            var containerPort = int.Parse(match.Groups[3].Value);
            var freePort = DockerRunner.FindFreePort(hostPort);

            if (freePort != hostPort)
            {
                lines[i] = $"{match.Groups[1].Value}{freePort}:{containerPort}{match.Groups[4].Value}";
                log?.Invoke($"[sandbox] Port {hostPort} in use -> remapped to {freePort}:{containerPort}");
                changed = true;
            }
        }

        if (changed)
            ResourceManager.WriteLf(composePath, string.Join("\n", lines) + "\n");
    }

    /// <summary>Remap a single host port in docker-compose.yml to the next free port (used when ComposeUp fails with port already allocated).</summary>
    public static bool RemapPort(string projectName, int hostPort, Action<string>? log = null)
    {
        var composePath = Path.Combine(GetProjectDir(projectName), "docker-compose.yml");
        if (!File.Exists(composePath)) return false;

        var lines = File.ReadAllLines(composePath);
        var regex = new Regex(@"^(\s*-\s*[""])(\d+):(\d+)([""].*)$");
        for (int i = 0; i < lines.Length; i++)
        {
            var match = regex.Match(lines[i]);
            if (!match.Success) continue;
            var lineHostPort = int.Parse(match.Groups[2].Value);
            if (lineHostPort != hostPort) continue;

            var containerPort = int.Parse(match.Groups[3].Value);
            var freePort = DockerRunner.FindFreePort(hostPort);
            lines[i] = $"{match.Groups[1].Value}{freePort}:{containerPort}{match.Groups[4].Value}";
            log?.Invoke($"[sandbox] Port {hostPort} in use -> remapped to {freePort}:{containerPort}");
            ResourceManager.WriteLf(composePath, string.Join("\n", lines) + "\n");
            return true;
        }
        return false;
    }

    public static void RemoveProject(string projectName)
    {
        var projectDir = GetProjectDir(projectName);
        var composeFile = Path.Combine(projectDir, "docker-compose.yml");
        if (File.Exists(composeFile))
            DockerRunner.ComposeDownVolumes(composeFile, projectDir);

        if (Directory.Exists(projectDir))
            Directory.Delete(projectDir, true);
    }

    public static bool HasDockerfileExtension(string projectName)
    {
        var path = Path.Combine(GetProjectDir(projectName), "sandbox_data", "Dockerfile.extension");
        return File.Exists(path);
    }

    public static void BakeDockerfileExtension(string projectName)
    {
        var projectDir = GetProjectDir(projectName);
        var extPath = Path.Combine(projectDir, "sandbox_data", "Dockerfile.extension");
        if (!File.Exists(extPath)) return;

        var dockerfilePath = Path.Combine(projectDir, "Dockerfile");
        var commands = File.ReadAllLines(extPath)
            .Select(l => l.Trim())
            .Where(l => !string.IsNullOrEmpty(l));

        var existing = File.ReadAllText(dockerfilePath);
        var appended = string.Join("\n", commands.Select(cmd => $"RUN {cmd}"));
        ResourceManager.WriteLf(dockerfilePath, existing.TrimEnd() + "\n" + appended + "\n");

        File.Delete(extPath);
    }

    // ─── Agent config (mirrors unix get_agent_command) ────────────────────────

    /// <summary>Returns the CLI command to run in the container (e.g. opencode, agent, gh copilot agent, claude). Uses the saved default from Settings so changing the default applies to all projects (including existing ones).</summary>
    public static string GetAgentCommand(string projectName)
    {
        var savedDefault = SavedSettings.GetDefaultAgent();
        if (!string.IsNullOrEmpty(savedDefault))
            return MapAgentToCommand(savedDefault);

        var configPath = Path.Combine(GetProjectDir(projectName), "sandbox_data", "agent-config.json");
        if (!File.Exists(configPath))
            return "opencode";

        try
        {
            var json = File.ReadAllText(configPath);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var defaultAgent = root.TryGetProperty("defaultAgent", out var da) ? da.GetString() ?? "opencode" : "opencode";
            if (!root.TryGetProperty("agentSettings", out var settings) || !settings.TryGetProperty(defaultAgent, out var agentNode))
                return MapAgentToCommand(defaultAgent);

            var cmd = agentNode.TryGetProperty("command", out var c) ? c.GetString() ?? "" : "";
            var args = new List<string>();
            if (agentNode.TryGetProperty("args", out var a) && a.ValueKind == JsonValueKind.Array)
            {
                foreach (var arg in a.EnumerateArray())
                    if (arg.ValueKind == JsonValueKind.String) args.Add(arg.GetString() ?? "");
            }
            if (string.IsNullOrEmpty(cmd))
                return MapAgentToCommand(defaultAgent);
            return args.Count > 0 ? $"{cmd} {string.Join(" ", args)}" : cmd;
        }
        catch
        {
            return "opencode";
        }
    }

    private static string MapAgentToCommand(string agent)
    {
        return agent switch
        {
            "cursor" => "agent",
            "copilot" => "gh copilot agent",
            "claude" => "claude",
            _ => "opencode"
        };
    }

    /// <summary>Patch agent-config.json string to set defaultAgent. Used when scaffolding so saved default is applied.</summary>
    public static string ApplyDefaultAgentToJson(string agentConfigJson, string defaultAgent)
    {
        if (string.IsNullOrEmpty(defaultAgent)) return agentConfigJson;
        return Regex.Replace(agentConfigJson, @"(""defaultAgent""\s*:\s*)""[^""]*""", $"$1\"{defaultAgent}\"");
    }
}
