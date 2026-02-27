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
    private const string VersionStamp = "1.4.0";

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
        if (File.Exists(stampFile) && File.ReadAllText(stampFile).Trim() == VersionStamp)
            return;

        ExtractAll();
        Directory.CreateDirectory(PreparedDir);
        Directory.CreateDirectory(ProjectsDir);
        File.WriteAllText(stampFile, VersionStamp);
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
