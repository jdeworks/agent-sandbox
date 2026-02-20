using AgentSandbox.Models;

namespace AgentSandbox.Services;

public static class LanguageDetector
{
    private static readonly string[] ExcludedDirs =
        ["node_modules", ".venv", "target", "bin", "obj", ".git", "__pycache__"];

    public static List<string> Detect(string projectPath, Dictionary<string, LanguageConfig> languages)
    {
        var detected = new List<string>();

        foreach (var (key, config) in languages.OrderBy(kv => kv.Key))
        {
            foreach (var pattern in config.Detect)
            {
                if (FindFile(projectPath, pattern, maxDepth: 3))
                {
                    detected.Add(key);
                    break;
                }
            }
        }

        return detected;
    }

    private static bool FindFile(string root, string pattern, int maxDepth)
    {
        return SearchDirectory(root, pattern, 0, maxDepth);
    }

    private static bool SearchDirectory(string dir, string pattern, int depth, int maxDepth)
    {
        if (depth > maxDepth)
            return false;

        try
        {
            foreach (var file in Directory.EnumerateFiles(dir))
            {
                if (MatchesPattern(Path.GetFileName(file), pattern))
                    return true;
            }

            foreach (var subDir in Directory.EnumerateDirectories(dir))
            {
                var dirName = Path.GetFileName(subDir);
                if (ExcludedDirs.Contains(dirName))
                    continue;
                if (SearchDirectory(subDir, pattern, depth + 1, maxDepth))
                    return true;
            }
        }
        catch (UnauthorizedAccessException) { }

        return false;
    }

    private static bool MatchesPattern(string fileName, string pattern)
    {
        if (pattern.StartsWith("*."))
        {
            var ext = pattern[1..]; // e.g. ".kt"
            return fileName.EndsWith(ext, StringComparison.OrdinalIgnoreCase);
        }

        return string.Equals(fileName, pattern, StringComparison.OrdinalIgnoreCase);
    }
}
