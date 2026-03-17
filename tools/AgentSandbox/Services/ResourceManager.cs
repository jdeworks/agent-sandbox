using System.Reflection;

namespace AgentSandbox.Services;

/// <summary>
/// Extracts embedded resources to %APPDATA%/AgentSandbox on first run
/// or when the embedded version stamp differs from the on-disk one.
/// </summary>
public static class ResourceManager
{
    private static readonly Assembly Asm = Assembly.GetExecutingAssembly();
    private const string Prefix = "AgentSandbox.Resources.";
    private const string VersionStamp = "2.0.0";

    public static string AppDataRoot { get; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AgentSandbox");

    public static string SandboxDir => Path.Combine(AppDataRoot, "sandbox");
    public static string FragmentsDir => Path.Combine(SandboxDir, "fragments");
    public static string TemplatesDir => Path.Combine(AppDataRoot, "templates");
    public static string PreparedDir => Path.Combine(AppDataRoot, "prepared");
    public static string ProjectsDir => Path.Combine(AppDataRoot, "projects");

    public static void EnsureExtracted()
    {
        var stampFile = Path.Combine(AppDataRoot, ".version");
        var oldVersion = File.Exists(stampFile) ? File.ReadAllText(stampFile).Trim() : "";
        if (oldVersion == VersionStamp)
            return;

        // Migrate from v1 to v2: clean stale project configurations
        if (!string.IsNullOrEmpty(oldVersion) && oldVersion.StartsWith("1."))
            MigrateFromV1();

        ExtractAll();
        Directory.CreateDirectory(PreparedDir);
        Directory.CreateDirectory(ProjectsDir);
        File.WriteAllText(stampFile, VersionStamp);
    }

    /// <summary>
    /// Migrate from v1 data layout. Remove old prepared profiles and project
    /// configs so they are cleanly regenerated under the v2 structure.
    /// Also attempts to remove old Docker images using the v1 naming convention.
    /// </summary>
    private static void MigrateFromV1()
    {
        var removedProfiles = new List<string>();

        // Remove v1 prepared profiles and their Docker images
        if (Directory.Exists(PreparedDir))
        {
            foreach (var dir in Directory.GetDirectories(PreparedDir))
            {
                var profileName = Path.GetFileName(dir);
                removedProfiles.Add(profileName);
                // Try to remove the v1-style Docker image (agent-sandbox-<name>:latest)
                TryRemoveDockerImage($"agent-sandbox-{profileName}:latest");
            }
            try { Directory.Delete(PreparedDir, true); } catch { /* best effort */ }
        }

        // Remove v1 project configs (compose files reference old volume names)
        if (Directory.Exists(ProjectsDir))
        {
            foreach (var projectDir in Directory.GetDirectories(ProjectsDir))
            {
                // Delete generated files that will be regenerated.
                // Preserve sandbox_data/ (user's Dockerfile.extension, changes.txt)
                // Preserve opencode_data/ (user's customized opencode.json, oh-my-openagent.json)
                // Preserve opencode_sessions/ and logs/
                foreach (var f in new[] { "docker-compose.yml", "Dockerfile", "config.env", "runtime.env" })
                {
                    var path = Path.Combine(projectDir, f);
                    if (File.Exists(path))
                        try { File.Delete(path); } catch { /* best effort */ }
                }
            }
        }

        Console.WriteLine("[agent-sandbox] Upgraded from v1 to v2.");
        if (removedProfiles.Count > 0)
            Console.WriteLine($"  Removed {removedProfiles.Count} old profile(s): {string.Join(", ", removedProfiles)}");
        Console.WriteLine("  Profiles need to be recreated (templates changed).");
        Console.WriteLine("  Project data (sessions, logs, customizations) was preserved.");
    }

    /// <summary>Try to remove a Docker image. Fails silently if Docker is unavailable or image doesn't exist.</summary>
    private static void TryRemoveDockerImage(string tag)
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo("docker", $"rmi {tag}")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            var proc = System.Diagnostics.Process.Start(psi);
            proc?.WaitForExit(5000);
        }
        catch { /* best effort — Docker may not be running */ }
    }

    private static void ExtractAll()
    {
        var names = Asm.GetManifestResourceNames();
        foreach (var name in names)
        {
            if (!name.StartsWith(Prefix))
                continue;

            var relative = name[Prefix.Length..];
            var diskPath = MapResourceToPath(relative);
            if (diskPath == null)
                continue;

            Directory.CreateDirectory(Path.GetDirectoryName(diskPath)!);
            using var stream = Asm.GetManifestResourceStream(name)!;
            using var reader = new StreamReader(stream);
            var content = reader.ReadToEnd();
            WriteLf(diskPath, content);
        }
    }

    private static string? MapResourceToPath(string embeddedName)
    {
        // Embedded resource names use '.' as separator. We need to reconstruct paths.
        // Known prefixes: "fragments.", "templates."
        // Top-level files: "languages.json", "ports.json", "Dockerfile.base.tpl", "AGENTS.md.base"
        if (embeddedName.StartsWith("fragments."))
        {
            var fileName = embeddedName["fragments.".Length..];
            fileName = RestoreFileName(fileName);
            return Path.Combine(FragmentsDir, fileName);
        }

        if (embeddedName.StartsWith("templates."))
        {
            var fileName = embeddedName["templates.".Length..];
            fileName = RestoreFileName(fileName);
            return Path.Combine(TemplatesDir, fileName);
        }

        // Top-level sandbox files
        var topFile = RestoreFileName(embeddedName);
        return Path.Combine(SandboxDir, topFile);
    }

    /// <summary>
    /// .NET preserves dots within filenames in embedded resource names.
    /// Directory separators become dots, but file-level dots are kept.
    /// We match known multi-dot extensions to extract the stem correctly.
    /// Ordered longest-first so ".agents.md" matches before ".md".
    /// </summary>
    private static string RestoreFileName(string embedded)
    {
        var knownExtensions = new[]
        {
            ".agents.md", ".base.tpl", ".md.base",
            ".json", ".sh", ".tpl", ".md"
        };

        foreach (var ext in knownExtensions)
        {
            if (embedded.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            {
                var stem = embedded[..^ext.Length];
                return stem + ext;
            }
        }

        return embedded;
    }

    public static string ReadSandboxFile(string fileName) =>
        NormalizeLf(File.ReadAllText(Path.Combine(SandboxDir, fileName)));

    public static string ReadFragment(string fileName) =>
        NormalizeLf(File.ReadAllText(Path.Combine(FragmentsDir, fileName)));

    public static string ReadTemplate(string fileName) =>
        NormalizeLf(File.ReadAllText(Path.Combine(TemplatesDir, fileName)));

    /// <summary>
    /// Write a file with LF line endings regardless of OS.
    /// All files that end up inside Docker containers MUST use this.
    /// </summary>
    public static void WriteLf(string path, string content)
    {
        File.WriteAllText(path, NormalizeLf(content));
    }

    /// <summary>Strip \r so all content uses LF only.</summary>
    public static string NormalizeLf(string text) =>
        text.Replace("\r\n", "\n").Replace("\r", "\n");
}
