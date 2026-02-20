using System.Text.Json;
using AgentSandbox.Models;

namespace AgentSandbox.Services;

public static class ConfigLoader
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    public static Dictionary<string, LanguageConfig> LoadLanguages()
    {
        var json = ResourceManager.ReadSandboxFile("languages.json");
        return JsonSerializer.Deserialize<Dictionary<string, LanguageConfig>>(json, JsonOpts)
               ?? new Dictionary<string, LanguageConfig>();
    }

    public static Dictionary<string, PortConfig> LoadPorts()
    {
        var json = ResourceManager.ReadSandboxFile("ports.json");
        return JsonSerializer.Deserialize<Dictionary<string, PortConfig>>(json, JsonOpts)
               ?? new Dictionary<string, PortConfig>();
    }
}
