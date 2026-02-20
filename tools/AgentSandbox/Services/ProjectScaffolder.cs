namespace AgentSandbox.Services;

/// <summary>
/// Manages per-project data under %APPDATA%/AgentSandbox/projects/<name>/,
/// mirroring the unix sandbox.sh project scaffolding.
/// </summary>
public static class ProjectScaffolder
{
    public static string GetProjectDir(string projectName) =>
        Path.Combine(ResourceManager.ProjectsDir, projectName);

    public static bool Exists(string projectName) =>
        Directory.Exists(GetProjectDir(projectName));

    public static void Scaffold(string projectName, string workspacePath, string profileName, string profileDir)
    {
        var projectDir = GetProjectDir(projectName);
        Directory.CreateDirectory(projectDir);

        var composeTpl = File.ReadAllText(Path.Combine(profileDir, "docker-compose.yml.tpl"));
        var dockerPath = workspacePath.Replace('\\', '/');
        var compose = composeTpl
            .Replace("{{PROJECT_NAME}}", projectName)
            .Replace("{{WORKSPACE_PATH}}", dockerPath);
        ResourceManager.WriteLf(Path.Combine(projectDir, "docker-compose.yml"), compose);

        var baseImage = $"agent-sandbox-{profileName}:latest";
        ResourceManager.WriteLf(Path.Combine(projectDir, "Dockerfile"), $"FROM {baseImage}\n");

        Directory.CreateDirectory(Path.Combine(projectDir, "sandbox_data"));
        File.WriteAllText(Path.Combine(projectDir, "sandbox_data", "changes.txt"), "");

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
}
