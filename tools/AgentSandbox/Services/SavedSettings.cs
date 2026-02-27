using System.Text.Json;

namespace AgentSandbox.Services;

/// <summary>
/// Load/save app-level settings (e.g. default agent) to %APPDATA%/AgentSandbox/saved_settings.json.
/// </summary>
public static class SavedSettings
{
    private static readonly string Path =
        System.IO.Path.Combine(ResourceManager.AppDataRoot, "saved_settings.json");

    private const string DefaultAgentKey = "defaultAgent";
    private const string DefaultAgentValue = "opencode";

    public static string GetDefaultAgent()
    {
        try
        {
            if (!File.Exists(Path))
                return DefaultAgentValue;

            var json = File.ReadAllText(Path);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(DefaultAgentKey, out var v))
            {
                var s = v.GetString();
                if (!string.IsNullOrEmpty(s))
                    return s;
            }
        }
        catch { /* ignore */ }

        return DefaultAgentValue;
    }

    public static void SetDefaultAgent(string agent)
    {
        ResourceManager.EnsureExtracted();

        Dictionary<string, string> dict;
        if (File.Exists(Path))
        {
            try
            {
                var json = File.ReadAllText(Path);
                using var doc = JsonDocument.Parse(json);
                dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var p in doc.RootElement.EnumerateObject())
                    if (p.Value.ValueKind == JsonValueKind.String)
                        dict[p.Name] = p.Value.GetString() ?? "";
            }
            catch
            {
                dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            }
        }
        else
        {
            dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        dict[DefaultAgentKey] = string.IsNullOrEmpty(agent) ? DefaultAgentValue : agent;

        var dir = System.IO.Path.GetDirectoryName(Path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        var options = new JsonSerializerOptions { WriteIndented = true };
        var jsonOut = JsonSerializer.Serialize(dict, options);
        File.WriteAllText(Path, jsonOut);
    }
}
