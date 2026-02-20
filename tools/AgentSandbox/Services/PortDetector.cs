using AgentSandbox.Models;

namespace AgentSandbox.Services;

public static class PortDetector
{
    private static readonly string[] ExcludedDirs =
        ["node_modules", ".venv", "target", "bin", "obj", ".git", "__pycache__"];

    public static (List<int> ports, List<string> frameworks) Detect(
        string projectPath,
        List<string> selectedLanguages,
        Dictionary<string, PortConfig> portConfigs)
    {
        var portSet = new HashSet<int>();
        var detectedFrameworks = new List<string>();

        if (portConfigs.TryGetValue("base", out var baseConfig))
        {
            foreach (var p in baseConfig.Ports)
                portSet.Add(p);
        }

        // Always include "node" in framework detection since the base image ships Node.
        var fwDetectLangs = new HashSet<string>(selectedLanguages) { "node" };

        foreach (var lang in selectedLanguages)
        {
            if (!portConfigs.TryGetValue(lang, out var config))
                continue;

            foreach (var p in config.Default)
                portSet.Add(p);
        }

        foreach (var lang in fwDetectLangs)
        {
            if (!portConfigs.TryGetValue(lang, out var config))
                continue;

            foreach (var (fwName, fw) in config.Frameworks)
            {
                if (FrameworkDetected(projectPath, fw))
                {
                    detectedFrameworks.Add(fwName);
                    foreach (var p in fw.Ports)
                        portSet.Add(p);
                }
            }
        }

        var sorted = portSet.OrderBy(p => p).ToList();
        return (sorted, detectedFrameworks);
    }

    private static bool FrameworkDetected(string projectPath, FrameworkPortConfig fw)
    {
        var files = FindFiles(projectPath, fw.DetectIn, maxDepth: 3);
        foreach (var file in files)
        {
            try
            {
                var content = File.ReadAllText(file);
                foreach (var pattern in fw.Patterns)
                {
                    if (content.Contains(pattern, StringComparison.Ordinal))
                        return true;
                }
            }
            catch { }
        }
        return false;
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
