using AgentSandbox.Services;

namespace AgentSandbox;

internal static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        ResourceManager.EnsureExtracted();

        if (args.Length == 0)
            return RunInteractiveWizard(null);

        return args[0].ToLowerInvariant() switch
        {
            "prepare" => RunPrepare(args.Skip(1).ToArray()),
            "sandbox" => RunSandbox(args.Skip(1).ToArray()),
            "list" => RunList(),
            "stats" => RunStats(),
            "cleanup" => RunCleanup(args.Skip(1).ToArray()),
            "help" or "--help" or "-h" => ShowHelp(),
            _ => RunInteractiveWizard(args[0])
        };
    }

    static int ShowHelp()
    {
        Console.WriteLine("""
            Agent Sandbox - Windows Launcher

            Usage:
              agent-sandbox                      Interactive wizard (folder picker)
              agent-sandbox <path>               Detect + prepare + launch for path
              agent-sandbox prepare [<path>]     Prepare a profile for a project
              agent-sandbox sandbox <path>       Launch sandbox for a project
              agent-sandbox list                 List all projects
              agent-sandbox stats                Show disk usage
              agent-sandbox cleanup [<project>]  Remove a project (or all)
              agent-sandbox help                 Show this help

            Data stored in: %APPDATA%\AgentSandbox
            """);
        return 0;
    }

    // ─── Interactive Wizard (double-click or `agent-sandbox <path>`) ────────

    static int RunInteractiveWizard(string? pathArg)
    {
        Console.WriteLine("=== Agent Sandbox - Windows ===");
        Console.WriteLine();

        string projectPath;
        if (!string.IsNullOrEmpty(pathArg) && Directory.Exists(pathArg))
        {
            projectPath = Path.GetFullPath(pathArg);
        }
        else
        {
            Console.Write("Path to project folder: ");
            var input = Console.ReadLine()?.Trim();
            if (string.IsNullOrEmpty(input) || !Directory.Exists(input))
            {
                Console.WriteLine("Error: invalid folder path.");
                WaitForKey();
                return 1;
            }
            projectPath = Path.GetFullPath(input);
        }

        Console.WriteLine($"  Project: {projectPath}");
        Console.WriteLine();

        var languages = ConfigLoader.LoadLanguages();
        var portConfigs = ConfigLoader.LoadPorts();

        // Detect
        Console.WriteLine("[prepare] Detecting languages...");
        var detected = LanguageDetector.Detect(projectPath, languages);
        if (detected.Count == 0)
        {
            Console.WriteLine("  No languages detected. Select manually.");
            detected = ManualLanguageSelect(languages);
        }
        else
        {
            foreach (var lang in detected)
                Console.WriteLine($"  Detected: {languages[lang].Label} ({lang})");

            Console.Write("Proceed with detected languages? [Y/n]: ");
            var confirm = Console.ReadLine()?.Trim();
            if (!string.IsNullOrEmpty(confirm) && confirm.ToLower() != "y")
                detected = ManualLanguageSelect(languages);
        }

        if (detected.Count == 0)
        {
            Console.WriteLine("No languages selected. Aborting.");
            WaitForKey();
            return 1;
        }

        // Versions
        Console.WriteLine();
        Console.WriteLine("[prepare] Detecting versions...");
        var versions = VersionDetector.Detect(projectPath, detected, languages);
        foreach (var (lang, ver) in versions)
            Console.WriteLine($"  {lang}: {ver}");

        Console.Write("Override any versions? (e.g. python:3.11,java:17) or Enter to accept: ");
        var overrideInput = Console.ReadLine()?.Trim();
        if (!string.IsNullOrEmpty(overrideInput))
        {
            foreach (var pair in overrideInput.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = pair.Trim().Split(':', 2);
                if (parts.Length == 2)
                    versions[parts[0].Trim()] = parts[1].Trim();
            }
        }

        // Ports
        Console.WriteLine();
        Console.WriteLine("[prepare] Detecting ports...");
        var (ports, frameworks) = PortDetector.Detect(projectPath, detected, portConfigs);
        if (frameworks.Count > 0)
            Console.WriteLine($"  Frameworks: {string.Join(", ", frameworks)}");
        Console.WriteLine($"  Ports: {string.Join(", ", ports)}");

        Console.Write("Add extra ports (comma-separated) or Enter to accept: ");
        var extraPorts = Console.ReadLine()?.Trim();
        if (!string.IsNullOrEmpty(extraPorts))
        {
            foreach (var p in extraPorts.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                if (int.TryParse(p.Trim(), out var port))
                    ports.Add(port);
            }
            ports = ports.Distinct().OrderBy(p => p).ToList();
        }

        // Profile name
        var defaultName = string.Join("-", detected);
        Console.Write($"Profile name [{defaultName}]: ");
        var profileName = Console.ReadLine()?.Trim();
        if (string.IsNullOrEmpty(profileName))
            profileName = defaultName;

        var spec = new Models.ProfileSpec
        {
            Name = profileName,
            Languages = detected,
            Versions = versions,
            Ports = ports,
            DetectedFrameworks = frameworks
        };

        Console.WriteLine();
        Console.WriteLine($"[prepare] Generating profile '{profileName}'...");
        ProfileGenerator.Generate(spec, languages);
        Console.WriteLine("  Profile generated.");

        // Now launch the sandbox
        Console.WriteLine();
        return LaunchSandbox(projectPath, profileName);
    }

    // ─── Prepare (just generate profile, don't launch) ─────────────────────

    static int RunPrepare(string[] args)
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

            versions = VersionDetector.Detect(projectPath, selected, languages);
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

        var spec = new Models.ProfileSpec
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

    // ─── Sandbox (launch for existing profile) ─────────────────────────────

    static int RunSandbox(string[] args)
    {
        if (args.Length < 1)
        {
            Console.WriteLine("Usage: agent-sandbox sandbox <path> [--profile <name>]");
            return 1;
        }

        var projectPath = Path.GetFullPath(args[0]);
        if (!Directory.Exists(projectPath))
        {
            Console.WriteLine($"Error: folder not found: {projectPath}");
            return 1;
        }

        string? profileName = null;
        for (int i = 1; i < args.Length; i++)
        {
            if (args[i] == "--profile" && i + 1 < args.Length)
                profileName = args[++i];
        }

        if (profileName == null)
        {
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

    // ─── Core sandbox launch logic ─────────────────────────────────────────

    static int LaunchSandbox(string projectPath, string profileName)
    {
        if (!DockerRunner.IsDockerAvailable())
        {
            Console.WriteLine("Error: Docker is not available. Is Docker Desktop running?");
            WaitForKey();
            return 1;
        }

        var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
        if (!Directory.Exists(profileDir))
        {
            Console.WriteLine($"Error: profile '{profileName}' not found.");
            return 1;
        }

        var projectName = Path.GetFileName(projectPath)!;
        var containerName = $"sandbox-{projectName}";
        var baseImage = $"agent-sandbox-{profileName}:latest";
        var projectDir = ProjectScaffolder.GetProjectDir(projectName);

        Console.WriteLine($"[sandbox] Profile:   {profileName}");
        Console.WriteLine($"[sandbox] Workspace: {projectPath}");
        Console.WriteLine($"[sandbox] Project:   {projectName}");

        // Check running container
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
                Console.WriteLine($"[sandbox] Attaching to {containerName}...");
                DockerRunner.ExecInteractive(containerName, "opencode");
                PostSessionCheck(projectName, containerName);
                return 0;
            }

            Console.WriteLine("[sandbox] Stopping existing container...");
            var composeFile = Path.Combine(projectDir, "docker-compose.yml");
            if (File.Exists(composeFile))
                DockerRunner.ComposeDown(composeFile, projectDir);
            else
                DockerRunner.StopContainer(containerName);
        }

        // Build base image
        Console.WriteLine($"[sandbox] Building base image {baseImage}...");
        var buildResult = DockerRunner.Build(
            Path.Combine(profileDir, "Dockerfile.base"), baseImage, profileDir);
        if (buildResult != 0)
        {
            Console.WriteLine("Error: Docker build failed.");
            WaitForKey();
            return 1;
        }

        // Scaffold project if new
        if (!ProjectScaffolder.Exists(projectName))
        {
            Console.WriteLine("[sandbox] New project. Setting up...");
            ProjectScaffolder.Scaffold(projectName, projectPath, profileName, profileDir);
            Console.WriteLine("[sandbox] Project scaffolded.");
        }
        else
        {
            Console.WriteLine("[sandbox] Existing project found.");
        }

        ProjectScaffolder.UpdateLastStarted(projectName);

        // Check Dockerfile.extension before start
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

        // Start container
        Console.WriteLine($"[sandbox] Starting container {containerName}...");
        var composeFilePath = Path.Combine(projectDir, "docker-compose.yml");
        var upResult = DockerRunner.ComposeUp(composeFilePath, projectDir);
        if (upResult != 0)
        {
            Console.WriteLine("Error: Docker compose up failed.");
            WaitForKey();
            return 1;
        }

        Console.WriteLine($"[sandbox] Attaching to {containerName}...");
        DockerRunner.ExecInteractive(containerName, "opencode");

        PostSessionCheck(projectName, containerName);
        return 0;
    }

    static void PostSessionCheck(string projectName, string containerName)
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

    // ─── List ───────────────────────────────────────────────────────────────

    static int RunList()
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

    // ─── Stats ──────────────────────────────────────────────────────────────

    static int RunStats()
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

    // ─── Cleanup ────────────────────────────────────────────────────────────

    static int RunCleanup(string[] args)
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

    static void CleanupProject(string projectDir)
    {
        var name = Path.GetFileName(projectDir)!;
        var composeFile = Path.Combine(projectDir, "docker-compose.yml");
        if (File.Exists(composeFile))
            DockerRunner.ComposeDownVolumes(composeFile, projectDir);

        Directory.Delete(projectDir, true);
        Console.WriteLine($"  Removed: {name}");
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    static List<string> ManualLanguageSelect(Dictionary<string, Models.LanguageConfig> languages)
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

    static Dictionary<string, string> ReadConfigEnv(string projectDir)
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

    static long GetDirectorySize(string path)
    {
        try
        {
            return new DirectoryInfo(path)
                .EnumerateFiles("*", SearchOption.AllDirectories)
                .Sum(f => f.Length);
        }
        catch { return 0; }
    }

    static string FormatSize(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024.0:F1} KB",
        < 1024 * 1024 * 1024 => $"{bytes / (1024.0 * 1024):F1} MB",
        _ => $"{bytes / (1024.0 * 1024 * 1024):F1} GB"
    };

    static void WaitForKey()
    {
        Console.WriteLine();
        Console.Write("Press any key to exit...");
        Console.ReadKey(true);
    }
}
