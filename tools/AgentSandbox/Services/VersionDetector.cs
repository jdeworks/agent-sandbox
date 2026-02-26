using System.Diagnostics;
using System.Text.RegularExpressions;
using AgentSandbox.Models;

namespace AgentSandbox.Services;

public enum VersionSource { Detected, Default, System, Unknown }

public record VersionInfo(string Version, VersionSource Source);

public static class VersionDetector
{
    private static readonly string[] ExcludedDirs =
        ["node_modules", ".venv", "target", "bin", "obj", ".git", "__pycache__"];

    private static readonly Dictionary<string, (string Cmd, string Args, string Pattern)> SystemProbes = new()
    {
        ["python"] = ("python3", "--version", @"[0-9]+\.[0-9]+"),
        ["node"]   = ("node", "--version", @"[0-9]+"),
        ["go"]     = ("go", "version", @"[0-9]+\.[0-9]+"),
        ["ruby"]   = ("ruby", "--version", @"[0-9]+\.[0-9]+"),
        ["php"]    = ("php", "--version", @"[0-9]+\.[0-9]+"),
        ["rust"]   = ("rustc", "--version", @"[0-9]+\.[0-9]+\.[0-9]+"),
        ["java"]   = ("java", "--version", @"[0-9]+(\.[0-9]+)*"),
        ["kotlin"] = ("java", "--version", @"[0-9]+(\.[0-9]+)*"),
        ["dotnet"] = ("dotnet", "--version", @"[0-9]+\.[0-9]+"),
        ["dart"]   = ("dart", "--version", @"[0-9]+\.[0-9]+"),
        ["cpp"]    = ("gcc", "--version", @"[0-9]+\.[0-9]+"),
    };

    public static Dictionary<string, string> Detect(
        string projectPath,
        List<string> selectedLanguages,
        Dictionary<string, LanguageConfig> languages)
    {
        var versions = new Dictionary<string, string>();

        foreach (var lang in selectedLanguages)
        {
            if (!languages.TryGetValue(lang, out var config))
                continue;

            var detected = DetectForLanguage(projectPath, config);
            if (detected != null)
            {
                versions[lang] = detected;
            }
            else if (!string.IsNullOrEmpty(config.DefaultVersion))
            {
                versions[lang] = config.DefaultVersion;
            }
        }

        return versions;
    }

    public static Dictionary<string, VersionInfo> DetectWithSources(
        string projectPath,
        List<string> selectedLanguages,
        Dictionary<string, LanguageConfig> languages)
    {
        var results = new Dictionary<string, VersionInfo>();

        foreach (var lang in selectedLanguages)
        {
            if (!languages.TryGetValue(lang, out var config))
                continue;

            var detected = DetectForLanguage(projectPath, config);
            if (detected != null)
            {
                results[lang] = new VersionInfo(detected, VersionSource.Detected);
            }
            else if (!string.IsNullOrEmpty(config.DefaultVersion) && config.DefaultVersion != "system")
            {
                results[lang] = new VersionInfo(config.DefaultVersion, VersionSource.Default);
            }
            else
            {
                var sysVer = ProbeSystemVersion(lang);
                if (sysVer != null)
                    results[lang] = new VersionInfo(sysVer, VersionSource.System);
                else
                    results[lang] = new VersionInfo("system", VersionSource.Unknown);
            }
        }

        return results;
    }

    public static string? ProbeSystemVersion(string lang)
    {
        if (!SystemProbes.TryGetValue(lang, out var probe))
            return null;

        try
        {
            var psi = new ProcessStartInfo(probe.Cmd, probe.Args)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            if (proc == null) return null;

            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(3000);

            var output = string.IsNullOrEmpty(stdout) ? stderr : stdout;
            var match = Regex.Match(output, probe.Pattern);
            return match.Success ? match.Value : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? DetectForLanguage(string projectPath, LanguageConfig config)
    {
        foreach (var rule in config.VersionDetect)
        {
            var files = FindFiles(projectPath, rule.File, maxDepth: 3);
            foreach (var file in files)
            {
                var version = ExtractVersion(file, rule.Regex);
                if (version != null)
                    return version;
            }
        }
        return null;
    }

    private static string? ExtractVersion(string filePath, string pattern)
    {
        try
        {
            var content = File.ReadAllText(filePath);
            var match = Regex.Match(content, pattern, RegexOptions.Multiline);
            if (!match.Success)
                return null;

            var captured = match.Groups.Count > 1 ? match.Groups[1].Value : match.Value;
            var verMatch = Regex.Match(captured, @"[0-9]+(\.[0-9]+)*");
            return verMatch.Success ? verMatch.Value : null;
        }
        catch
        {
            return null;
        }
    }

    private static List<string> FindFiles(string root, string pattern, int maxDepth)
    {
        var results = new List<string>();
        SearchFiles(root, pattern, 0, maxDepth, results);
        return results;
    }

    private static void SearchFiles(string dir, string pattern, int depth, int maxDepth, List<string> results)
    {
        if (depth > maxDepth)
            return;

        try
        {
            foreach (var file in Directory.EnumerateFiles(dir))
            {
                var name = Path.GetFileName(file);
                if (MatchesPattern(name, pattern))
                    results.Add(file);
            }

            foreach (var subDir in Directory.EnumerateDirectories(dir))
            {
                var dirName = Path.GetFileName(subDir);
                if (ExcludedDirs.Contains(dirName))
                    continue;
                SearchFiles(subDir, pattern, depth + 1, maxDepth, results);
            }
        }
        catch (UnauthorizedAccessException) { }
    }

    private static bool MatchesPattern(string fileName, string pattern)
    {
        if (pattern.StartsWith("*."))
            return fileName.EndsWith(pattern[1..], StringComparison.OrdinalIgnoreCase);
        return string.Equals(fileName, pattern, StringComparison.OrdinalIgnoreCase);
    }
}
