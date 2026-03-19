using System.Text.Json;

namespace AgentSandbox.Services;

public record DiscoveredPlugin(string Name, string Description, string Agent, int WeeklyDownloads, string Type);

public static class PluginDiscovery
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private static readonly TimeSpan CacheTtl = TimeSpan.FromHours(24);

    private static string CacheDir =>
        Path.Combine(ResourceManager.AppDataRoot, ".cache", "plugin-discovery");

    private static async Task<string?> FetchCached(string url, string cacheFile)
    {
        Directory.CreateDirectory(CacheDir);
        if (File.Exists(cacheFile) && (DateTime.UtcNow - File.GetLastWriteTimeUtc(cacheFile)) < CacheTtl)
            return await File.ReadAllTextAsync(cacheFile);
        try
        {
            var content = await Http.GetStringAsync(url);
            await File.WriteAllTextAsync(cacheFile, content);
            return content;
        }
        catch { return null; }
    }

    /// <summary>Fetch npm packages from registry search API.</summary>
    private static async Task<List<DiscoveredPlugin>> FetchNpmPlugins(string agent, List<string> urls)
    {
        var allResults = new Dictionary<string, DiscoveredPlugin>();

        foreach (var url in urls)
        {
            var cacheKey = Math.Abs(url.GetHashCode()).ToString("x8");
            var content = await FetchCached(url, Path.Combine(CacheDir, $"{agent}_npm_{cacheKey}.json"));
            if (content == null) continue;

            try
            {
                using var doc = JsonDocument.Parse(content);
                if (!doc.RootElement.TryGetProperty("objects", out var objects)) continue;
                foreach (var obj in objects.EnumerateArray())
                {
                    if (!obj.TryGetProperty("package", out var pkg)) continue;
                    var name = pkg.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                    if (string.IsNullOrEmpty(name) || allResults.ContainsKey(name)) continue;
                    var desc = pkg.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                    var weekly = 0;
                    if (obj.TryGetProperty("downloads", out var dl) && dl.TryGetProperty("weekly", out var w))
                        w.TryGetInt32(out weekly);
                    allResults[name] = new DiscoveredPlugin(name, desc, agent, weekly, "npm");
                }
            }
            catch { }
        }

        return allResults.Values.OrderByDescending(p => p.WeeklyDownloads).Take(20).ToList();
    }

    /// <summary>Fetch skills from a GitHub marketplace.json (Claude Code skills format).</summary>
    private static async Task<List<DiscoveredPlugin>> FetchGitHubSkills(string agent, string url)
    {
        var content = await FetchCached(url, Path.Combine(CacheDir, $"{agent}_skills.json"));
        if (content == null) return new();

        var results = new List<DiscoveredPlugin>();
        try
        {
            using var doc = JsonDocument.Parse(content);
            if (!doc.RootElement.TryGetProperty("plugins", out var plugins)) return results;

            foreach (var plugin in plugins.EnumerateArray())
            {
                var groupName = plugin.TryGetProperty("name", out var gn) ? gn.GetString() ?? "" : "";
                var groupDesc = plugin.TryGetProperty("description", out var gd) ? gd.GetString() ?? "" : "";

                if (!plugin.TryGetProperty("skills", out var skills)) continue;
                foreach (var skill in skills.EnumerateArray())
                {
                    var path = skill.GetString() ?? "";
                    // Extract skill name from path like "./skills/pdf"
                    var name = path.Split('/').LastOrDefault() ?? path;
                    if (string.IsNullOrEmpty(name)) continue;

                    var desc = string.IsNullOrEmpty(groupDesc) ? $"Skill: {name}" : $"{groupDesc}";
                    results.Add(new DiscoveredPlugin(name, desc, agent, 0, "skill"));
                }
            }
        }
        catch { }

        return results;
    }

    public static async Task<Dictionary<string, List<DiscoveredPlugin>>> FetchForAgents(List<string> agents)
    {
        var results = new Dictionary<string, List<DiscoveredPlugin>>();

        var agentsPath = Path.Combine(ResourceManager.SandboxDir, "agents.json");
        if (!File.Exists(agentsPath)) return results;

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(agentsPath));

        foreach (var agent in agents)
        {
            if (!doc.RootElement.TryGetProperty(agent, out var agentEl)) continue;
            var allForAgent = new List<DiscoveredPlugin>();

            // npm discovery
            var urls = new List<string>();
            if (agentEl.TryGetProperty("discovery_urls", out var urlsEl) && urlsEl.ValueKind == JsonValueKind.Array)
                foreach (var u in urlsEl.EnumerateArray())
                {
                    var s = u.GetString();
                    if (!string.IsNullOrEmpty(s)) urls.Add(s);
                }
            else if (agentEl.TryGetProperty("discovery_url", out var urlEl))
            {
                var s = urlEl.GetString();
                if (!string.IsNullOrEmpty(s)) urls.Add(s);
            }
            if (urls.Count > 0)
                allForAgent.AddRange(await FetchNpmPlugins(agent, urls));

            // GitHub skills discovery
            if (agentEl.TryGetProperty("skills_url", out var skillsUrlEl))
            {
                var skillsUrl = skillsUrlEl.GetString();
                if (!string.IsNullOrEmpty(skillsUrl))
                    allForAgent.AddRange(await FetchGitHubSkills(agent, skillsUrl));
            }

            if (allForAgent.Count > 0)
                results[agent] = allForAgent;
        }

        return results;
    }
}
