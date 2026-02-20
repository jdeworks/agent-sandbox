using System.Text.Json.Serialization;

namespace AgentSandbox.Models;

public class PortConfig
{
    [JsonPropertyName("ports")]
    public int[] Ports { get; set; } = [];

    [JsonPropertyName("label")]
    public string Label { get; set; } = "";

    [JsonPropertyName("default")]
    public int[] Default { get; set; } = [];

    [JsonPropertyName("frameworks")]
    public Dictionary<string, FrameworkPortConfig> Frameworks { get; set; } = new();
}

public class FrameworkPortConfig
{
    [JsonPropertyName("ports")]
    public int[] Ports { get; set; } = [];

    [JsonPropertyName("detect_in")]
    public string DetectIn { get; set; } = "";

    [JsonPropertyName("patterns")]
    public string[] Patterns { get; set; } = [];
}
