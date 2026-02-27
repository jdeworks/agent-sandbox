using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox;

/// <summary>
/// All console-based (CLI) subcommands. Used when invoked from a terminal
/// with explicit subcommands like "prepare", "sandbox", "list", etc.
/// </summary>
internal static class Cli
{
    public static int ShowHelp()
    {
        Console.WriteLine("""
            Agent Sandbox - Windows Launcher

            Usage:
              agent-sandbox                          GUI wizard (folder picker + detection)
              agent-sandbox <path>                   GUI wizard pre-filled with path
              agent-sandbox setup                    CLI: guided first-time setup (create default profiles)
              agent-sandbox prepare [<path>]         CLI: prepare a profile for a project
              agent-sandbox sandbox <path>           CLI: launch sandbox for a project
              agent-sandbox sandbox --profile <name> <path>  Launch with a specific profile
              agent-sandbox list                     CLI: list all projects
              agent-sandbox stats                    CLI: show disk usage
              agent-sandbox cleanup [<project>]      CLI: remove a project (or --all)
              agent-sandbox profiles                 CLI: list prepared profiles
              agent-sandbox profiles delete <name>   CLI: delete a profile
              agent-sandbox help                     Show this help

            Data stored in: %APPDATA%\AgentSandbox
            """);
        return 0;
    }

    // ─── Setup ─────────────────────────────────────────────────────────

    public static int RunSetup(string[] args)
    {
        Console.WriteLine("=== Agent Sandbox Setup ===");
        Console.WriteLine();

        Console.WriteLine("[setup] Checking Docker...");
        if (!DockerRunner.IsDockerAvailable())
        {
            Console.WriteLine("[setup] Error: Docker is not available. Is Docker Desktop running?");
            return 1;
        }
        Console.WriteLine($"[setup] Docker is ready.");
        Console.WriteLine();

        var languages = ConfigLoader.LoadLanguages();
        var portConfigs = ConfigLoader.LoadPorts();
        var sorted = languages.OrderBy(kv => kv.Key).ToList();

        Console.WriteLine("[setup] Default profiles let you sandbox projects immediately without");
        Console.WriteLine("  running 'prepare' first.");
        Console.WriteLine();
        Console.WriteLine("  Available:");

        for (var i = 0; i < sorted.Count; i++)
        {
            var key = sorted[i].Key;
            var existing = Directory.Exists(Path.Combine(ResourceManager.PreparedDir, key))
                ? " [already exists]"
                : "";
            Console.WriteLine($"    {i + 1,2}) {sorted[i].Value.Label,-20} -> sandbox {key}{existing}");
        }

        Console.WriteLine();
        Console.Write("  Create profiles (comma-separated, e.g. 1,2,3) or Enter to skip: ");
        var input = Console.ReadLine()?.Trim();

        if (!string.IsNullOrEmpty(input))
        {
            foreach (var part in input.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                if (!int.TryParse(part.Trim(), out var idx) || idx < 1 || idx > sorted.Count)
                {
                    Console.WriteLine($"  [setup] Warning: invalid selection '{part.Trim()}', skipping.");
                    continue;
                }

                var lang = sorted[idx - 1];
                var profileDir = Path.Combine(ResourceManager.PreparedDir, lang.Key);
                if (Directory.Exists(profileDir))
                {
                    Console.WriteLine($"  [setup] Profile '{lang.Key}' already exists, skipping.");
                    continue;
                }

                var basePorts = portConfigs.TryGetValue("base", out var baseCfg) ? baseCfg.Ports.ToList() : new List<int>();
                var langPorts = portConfigs.TryGetValue(lang.Key, out var langCfg) ? langCfg.Default.ToList() : new List<int>();
                var allPorts = basePorts.Union(langPorts).Distinct().OrderBy(p => p).ToList();

                var spec = new ProfileSpec
                {
                    Name = lang.Key,
                    Languages = [lang.Key],
                    Versions = new Dictionary<string, string>(),
                    Ports = allPorts
                };

                Console.WriteLine($"  [setup] Creating profile '{lang.Key}' ({lang.Value.Label})...");
                ProfileGenerator.Generate(spec, languages);
                Console.WriteLine($"    -> ready. Use: agent-sandbox sandbox --profile {lang.Key} <path>");
            }
        }

        Console.WriteLine();
        Console.WriteLine("[setup] Done.");
        Console.WriteLine();
        Console.WriteLine("  Quick start:");
        Console.WriteLine("    agent-sandbox sandbox C:\\path\\to\\project");
        Console.WriteLine();
        Console.WriteLine("  Or run 'agent-sandbox prepare C:\\path' for a custom multi-language profile.");
        return 0;
    }

    // ─── Prepare ────────────────────────────────────────────────────────

    public static int RunPrepare(string[] args)
    {
        string? projectPath = args.Length > 0 ? Path.GetFullPath(args[0]) : null;

        if (projectPath != null && !Directory.Exists(projectPath))
        {
            Console.WriteLine($"Error: folder not found: {projectPath}");
            return 1;
        }

        Console.WriteLine("=== Sandbox Prepare ===");
        Console.WriteLine();

        var languages = ConfigLoader.LoadLanguages();
        var portConfigs = ConfigLoader.LoadPorts();

        List<string> selected;
        var versions = new Dictionary<string, string>();
        var ports = new List<int>();
        var frameworks = new List<string>();

        if (projectPath != null)
        {
            Console.WriteLine($"[prepare] Scanning {projectPath}...");
            selected = LanguageDetector.Detect(projectPath, languages);
            if (selected.Count == 0)
            {
                Console.WriteLine("  No languages detected.");
                selected = ManualLanguageSelect(languages);
            }
            else
            {
                foreach (var l in selected)
                    Console.WriteLine($"  Detected: {languages[l].Label}");
            }

            var versionInfos = VersionDetector.DetectWithSources(projectPath, selected, languages);
            Console.WriteLine();
            Console.WriteLine("[prepare] Detecting versions...");
            foreach (var lang in selected)
            {
                if (versionInfos.TryGetValue(lang, out var info))
                {
                    var tag = info.Source switch
                    {
                        VersionSource.Detected => "detected",
                        VersionSource.Default => "default",
                        VersionSource.System => "system",
                        _ => "system default"
                    };
                    Console.WriteLine(info.Source == VersionSource.Unknown
                        ? $"  {lang}: system default"
                        : $"  {lang}: {info.Version} ({tag})");
                    versions[lang] = info.Source is VersionSource.Detected or VersionSource.Default
                        ? info.Version
                        : (languages.TryGetValue(lang, out var cfg) ? cfg.DefaultVersion : "");
                }
            }

            (ports, frameworks) = PortDetector.Detect(projectPath, selected, portConfigs);
        }
        else
        {
            selected = ManualLanguageSelect(languages);
        }

        if (selected.Count == 0)
        {
            Console.WriteLine("No languages selected.");
            return 1;
        }

        var defaultName = string.Join("-", selected);
        Console.Write($"Profile name [{defaultName}]: ");
        var profileName = Console.ReadLine()?.Trim();
        if (string.IsNullOrEmpty(profileName))
            profileName = defaultName;

        var spec = new ProfileSpec
        {
            Name = profileName,
            Languages = selected,
            Versions = versions,
            Ports = ports,
            DetectedFrameworks = frameworks
        };

        ProfileGenerator.Generate(spec, languages);
        Console.WriteLine($"Profile '{profileName}' generated in {ResourceManager.PreparedDir}");
        return 0;
    }

    // ─── Sandbox ────────────────────────────────────────────────────────

    public static int RunSandbox(string[] args)
    {
        string? projectPath = null;
        string? profileName = null;

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--profile" && i + 1 < args.Length)
                profileName = args[++i];
            else if (projectPath == null)
                projectPath = args[i];
        }

        if (projectPath == null)
        {
            // Show recent projects picker
            var recent = ProjectScaffolder.GetRecentProjects();
            if (recent.Count == 0)
            {
                Console.WriteLine("No recent projects. Usage: agent-sandbox sandbox <path>");
                return 1;
            }

            Console.WriteLine("[sandbox] Recent projects:");
            Console.WriteLine();
            for (var i = 0; i < recent.Count; i++)
            {
                var marker = Directory.Exists(recent[i].WorkspacePath) ? "" : " [PATH MISSING]";
                Console.WriteLine($"  {i + 1}) {recent[i].Name,-25} {recent[i].Profile,-18} {recent[i].WorkspacePath}{marker}");
                Console.WriteLine($"     Last used: {recent[i].LastStarted}");
            }
            Console.WriteLine();
            Console.Write($"Select [1-{recent.Count}], enter a path, or 'q' to quit: ");
            var input = Console.ReadLine()?.Trim();

            if (string.IsNullOrEmpty(input) || input.ToLower() == "q")
                return 0;

            if (int.TryParse(input, out var idx) && idx > 0 && idx <= recent.Count)
            {
                var picked = recent[idx - 1];
                if (!Directory.Exists(picked.WorkspacePath))
                {
                    Console.WriteLine($"Error: workspace path no longer exists: {picked.WorkspacePath}");
                    return 1;
                }
                projectPath = picked.WorkspacePath;
                profileName ??= picked.Profile;
            }
            else if (Directory.Exists(input))
            {
                projectPath = Path.GetFullPath(input);
            }
            else
            {
                Console.WriteLine($"Error: '{input}' is not a valid selection or directory.");
                return 1;
            }
        }
        else
        {
            projectPath = Path.GetFullPath(projectPath);
        }

        if (!Directory.Exists(projectPath))
        {
            Console.WriteLine($"Error: folder not found: {projectPath}");
            return 1;
        }

        if (profileName == null)
        {
            if (!Directory.Exists(ResourceManager.PreparedDir))
            {
                Console.WriteLine("No profiles found. Run 'agent-sandbox prepare' first.");
                return 1;
            }

            var profiles = Directory.GetDirectories(ResourceManager.PreparedDir)
                .Select(Path.GetFileName)
                .Where(n => n != null)
                .ToList();

            if (profiles.Count == 0)
            {
                Console.WriteLine("No profiles found. Run 'agent-sandbox prepare' first.");
                return 1;
            }

            if (profiles.Count == 1)
            {
                profileName = profiles[0]!;
            }
            else
            {
                Console.WriteLine("Available profiles:");
                for (var i = 0; i < profiles.Count; i++)
                    Console.WriteLine($"  {i + 1}) {profiles[i]}");
                Console.Write("Select profile: ");
                if (int.TryParse(Console.ReadLine()?.Trim(), out var idx) && idx > 0 && idx <= profiles.Count)
                    profileName = profiles[idx - 1]!;
                else
                    return 1;
            }
        }

        return LaunchSandbox(projectPath, profileName);
    }

    // ─── Core sandbox launch (CLI) ──────────────────────────────────────

    private static int LaunchSandbox(string projectPath, string profileName)
    {
        if (!DockerRunner.IsDockerAvailable())
        {
            Console.WriteLine("Error: Docker is not available. Is Docker Desktop running?");
            return 1;
        }

        var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
        if (!Directory.Exists(profileDir))
        {
            Console.WriteLine($"Error: profile '{profileName}' not found.");
            return 1;
        }

        var projectName = ProjectScaffolder.ResolveProjectName(projectPath);
        var containerName = $"sandbox-{projectName}";
        var baseImage = $"agent-sandbox-{profileName}:latest";
        var projectDir = ProjectScaffolder.GetProjectDir(projectName);

        Console.WriteLine($"[sandbox] Profile:   {profileName}");
        Console.WriteLine($"[sandbox] Workspace: {projectPath}");
        Console.WriteLine($"[sandbox] Project:   {projectName}");

        if (DockerRunner.IsContainerRunning(containerName))
        {
            Console.WriteLine();
            Console.WriteLine($"[sandbox] Container '{containerName}' is already running.");
            Console.WriteLine("  1) Reattach");
            Console.WriteLine("  2) Rebuild");
            Console.Write("Choice [1]: ");
            var choice = Console.ReadLine()?.Trim();

            if (string.IsNullOrEmpty(choice) || choice == "1")
            {
                var reattachCmd = ProjectScaffolder.GetAgentCommand(projectName);
                Console.WriteLine($"[sandbox] Attaching to {containerName}...");
                DockerRunner.ExecInteractive(containerName, reattachCmd);
                PostSessionCheck(projectName, containerName);
                return 0;
            }

            Console.WriteLine("[sandbox] Stopping existing container...");
            var cf = Path.Combine(projectDir, "docker-compose.yml");
            if (File.Exists(cf))
                DockerRunner.ComposeDown(cf, projectDir);
            else
                DockerRunner.StopContainer(containerName);
        }

        Console.WriteLine($"[sandbox] Building base image {baseImage}...");
        if (DockerRunner.Build(Path.Combine(profileDir, "Dockerfile.base"), baseImage, profileDir) != 0)
        {
            Console.WriteLine("Error: Docker build failed.");
            return 1;
        }

        if (!ProjectScaffolder.Exists(projectName))
        {
            Console.WriteLine("[sandbox] New project. Setting up...");
            ProjectScaffolder.Scaffold(projectName, projectPath, profileName, profileDir);
            Console.WriteLine("[sandbox] Project scaffolded.");
        }
        else
        {
            Console.WriteLine("[sandbox] Existing project found. Refreshing config from profile...");
            ProjectScaffolder.RefreshFromProfile(projectName, projectPath, profileDir);
        }

        ProjectScaffolder.UpdateLastStarted(projectName);
        ProjectScaffolder.UpdateWorkspacePath(projectName, projectPath);
        ProjectScaffolder.SyncHostAuth(projectName, Console.WriteLine);
        ProjectScaffolder.WriteRuntimeEnv(projectName);
        ProjectScaffolder.RemapPorts(projectName, Console.WriteLine);

        if (ProjectScaffolder.HasDockerfileExtension(projectName))
        {
            Console.Write("[sandbox] Dockerfile.extension found. Bake into project Dockerfile? [y/N]: ");
            var resp = Console.ReadLine()?.Trim();
            if (resp?.ToLower() is "y" or "yes")
            {
                ProjectScaffolder.BakeDockerfileExtension(projectName);
                Console.WriteLine("[sandbox] Changes applied.");
            }
        }

        Console.WriteLine($"[sandbox] Starting container {containerName}...");
        var composeFile = Path.Combine(projectDir, "docker-compose.yml");
        var upResult = DockerRunner.ComposeUp(composeFile, projectDir);
        for (var retry = 0; retry < 10 && upResult != 0; retry++)
        {
            var (_, captureOutput) = DockerRunner.ComposeUpCapture(composeFile, projectDir);
            if (!DockerRunner.TryParsePortFromComposeError(captureOutput, out var failedPort) ||
                !ProjectScaffolder.RemapPort(projectName, failedPort, Console.WriteLine))
                break;
            Console.WriteLine($"[sandbox] Retrying after remapping port {failedPort}...");
            upResult = DockerRunner.ComposeUp(composeFile, projectDir);
        }
        if (upResult != 0)
        {
            Console.WriteLine("Error: docker compose up failed.");
            return 1;
        }

        var runningContainer = DockerRunner.GetComposeContainerId(composeFile, projectDir) ?? containerName;
        DockerRunner.WaitForReady(runningContainer, 120, msg => Console.Write(msg));
        Console.WriteLine();

        var agentCmd = ProjectScaffolder.GetAgentCommand(projectName);
        Console.WriteLine($"[sandbox] Attaching to {containerName}...");
        DockerRunner.ExecInteractive(runningContainer, agentCmd);

        PostSessionCheck(projectName, containerName);
        return 0;
    }

    private static void PostSessionCheck(string projectName, string containerName)
    {
        if (!ProjectScaffolder.HasDockerfileExtension(projectName))
            return;

        Console.WriteLine();
        Console.WriteLine("[sandbox] Dockerfile.extension detected -- the agent requested system changes.");
        Console.Write("[sandbox] Bake into project Dockerfile now? [Y/n]: ");
        var resp = Console.ReadLine()?.Trim();
        if (string.IsNullOrEmpty(resp) || resp.ToLower() is "y" or "yes")
        {
            ProjectScaffolder.BakeDockerfileExtension(projectName);
            Console.WriteLine("[sandbox] Changes applied. Stopping container for rebuild...");
            var projectDir = ProjectScaffolder.GetProjectDir(projectName);
            var composeFile = Path.Combine(projectDir, "docker-compose.yml");
            if (File.Exists(composeFile))
                DockerRunner.ComposeDown(composeFile, projectDir);
            else
                DockerRunner.StopContainer(containerName);
        }
    }

    // ─── List ───────────────────────────────────────────────────────────

    public static int RunList()
    {
        Console.WriteLine($"{"PROJECT",-25} {"PROFILE",-20} {"LAST STARTED",-25} {"WORKSPACE"}");
        Console.WriteLine(new string('-', 100));

        if (!Directory.Exists(ResourceManager.ProjectsDir))
        {
            Console.WriteLine("  (no projects)");
            return 0;
        }

        foreach (var dir in Directory.GetDirectories(ResourceManager.ProjectsDir))
        {
            var name = Path.GetFileName(dir)!;
            var config = ReadConfigEnv(dir);
            Console.WriteLine(
                $"{name,-25} " +
                $"{config.GetValueOrDefault("PROFILE", "-"),-20} " +
                $"{config.GetValueOrDefault("LAST_STARTED", "-"),-25} " +
                $"{config.GetValueOrDefault("WORKSPACE_PATH", "-")}");
        }

        return 0;
    }

    // ─── Stats ──────────────────────────────────────────────────────────

    public static int RunStats()
    {
        if (!Directory.Exists(ResourceManager.ProjectsDir))
        {
            Console.WriteLine("  (no projects)");
            return 0;
        }

        foreach (var dir in Directory.GetDirectories(ResourceManager.ProjectsDir))
        {
            var name = Path.GetFileName(dir)!;
            var size = GetDirectorySize(dir);
            Console.WriteLine($"  {name}: {FormatSize(size)}");
        }

        return 0;
    }

    // ─── Cleanup ────────────────────────────────────────────────────────

    public static int RunCleanup(string[] args)
    {
        if (!Directory.Exists(ResourceManager.ProjectsDir))
        {
            Console.WriteLine("No projects to clean up.");
            return 0;
        }

        string? target = args.Length > 0 ? args[0] : null;

        if (target == "--all")
        {
            Console.Write("Remove ALL projects and volumes? [y/N]: ");
            if (Console.ReadLine()?.Trim().ToLower() != "y")
                return 0;

            foreach (var dir in Directory.GetDirectories(ResourceManager.ProjectsDir))
                CleanupProject(dir);

            Console.WriteLine("All projects removed.");
            return 0;
        }

        if (target != null)
        {
            var dir = Path.Combine(ResourceManager.ProjectsDir, target);
            if (!Directory.Exists(dir))
            {
                Console.WriteLine($"Project '{target}' not found.");
                return 1;
            }
            CleanupProject(dir);
            return 0;
        }

        Console.WriteLine("Available projects:");
        var dirs = Directory.GetDirectories(ResourceManager.ProjectsDir);
        for (var i = 0; i < dirs.Length; i++)
            Console.WriteLine($"  {i + 1}) {Path.GetFileName(dirs[i])}");
        Console.Write("Select project to remove (or 'all'): ");
        var input = Console.ReadLine()?.Trim();
        if (input?.ToLower() == "all")
        {
            foreach (var d in dirs) CleanupProject(d);
        }
        else if (int.TryParse(input, out var idx) && idx > 0 && idx <= dirs.Length)
        {
            CleanupProject(dirs[idx - 1]);
        }

        return 0;
    }

    private static void CleanupProject(string projectDir)
    {
        var name = Path.GetFileName(projectDir)!;
        var composeFile = Path.Combine(projectDir, "docker-compose.yml");
        if (File.Exists(composeFile))
            DockerRunner.ComposeDownVolumes(composeFile, projectDir);

        Directory.Delete(projectDir, true);
        Console.WriteLine($"  Removed: {name}");
    }

    // ─── Profiles ──────────────────────────────────────────────────────

    public static int RunProfiles(string[] args)
    {
        if (args.Length > 0 && args[0].ToLower() == "delete")
        {
            var name = args.Length > 1 ? args[1] : null;
            if (string.IsNullOrEmpty(name))
            {
                Console.WriteLine("Usage: agent-sandbox profiles delete <profile-name>");
                return 1;
            }

            var dir = Path.Combine(ResourceManager.PreparedDir, name);
            if (!Directory.Exists(dir))
            {
                Console.WriteLine($"Profile '{name}' not found.");
                return 1;
            }

            Console.Write($"Delete profile '{name}'? [y/N]: ");
            if (Console.ReadLine()?.Trim().ToLower() != "y")
                return 0;

            Directory.Delete(dir, true);
            Console.WriteLine($"Profile '{name}' deleted.");
            return 0;
        }

        Console.WriteLine("Prepared profiles:");
        if (!Directory.Exists(ResourceManager.PreparedDir))
        {
            Console.WriteLine("  (none)");
            return 0;
        }

        foreach (var dir in Directory.GetDirectories(ResourceManager.PreparedDir))
        {
            var name = Path.GetFileName(dir)!;
            var versionsPath = Path.Combine(dir, "versions.env");
            var versions = "";
            if (File.Exists(versionsPath))
            {
                versions = string.Join(", ", File.ReadAllLines(versionsPath)
                    .Where(l => !l.StartsWith("#") && !string.IsNullOrWhiteSpace(l)));
            }
            Console.WriteLine($"  {name,-30} {versions}");
        }

        return 0;
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private static List<string> ManualLanguageSelect(Dictionary<string, LanguageConfig> languages)
    {
        var sorted = languages.OrderBy(kv => kv.Key).ToList();
        Console.WriteLine("Available languages:");
        for (var i = 0; i < sorted.Count; i++)
            Console.WriteLine($"  {i + 1}) {sorted[i].Value.Label}");

        Console.Write("Select languages (comma-separated, e.g. 1,3,5): ");
        var input = Console.ReadLine()?.Trim() ?? "";
        var selected = new List<string>();

        foreach (var part in input.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            if (int.TryParse(part.Trim(), out var idx) && idx > 0 && idx <= sorted.Count)
                selected.Add(sorted[idx - 1].Key);
        }

        return selected;
    }

    private static Dictionary<string, string> ReadConfigEnv(string projectDir)
    {
        var path = Path.Combine(projectDir, "config.env");
        var dict = new Dictionary<string, string>();
        if (!File.Exists(path)) return dict;

        foreach (var line in File.ReadAllLines(path))
        {
            var eq = line.IndexOf('=');
            if (eq > 0)
                dict[line[..eq]] = line[(eq + 1)..];
        }
        return dict;
    }

    private static long GetDirectorySize(string path)
    {
        try
        {
            return new DirectoryInfo(path)
                .EnumerateFiles("*", SearchOption.AllDirectories)
                .Sum(f => f.Length);
        }
        catch { return 0; }
    }

    private static string FormatSize(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024.0:F1} KB",
        < 1024 * 1024 * 1024 => $"{bytes / (1024.0 * 1024):F1} MB",
        _ => $"{bytes / (1024.0 * 1024 * 1024):F1} GB"
    };
}
