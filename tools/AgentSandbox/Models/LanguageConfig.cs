using System.Text.Json.Serialization;

namespace AgentSandbox.Models;

public class LanguageConfig
{
    [JsonPropertyName("label")]
    public string Label { get; set; } = "";

    [JsonPropertyName("detect")]
    public string[] Detect { get; set; } = [];

    [JsonPropertyName("default_version")]
    public string DefaultVersion { get; set; } = "";

    [JsonPropertyName("version_detect")]
    public VersionDetectRule[] VersionDetect { get; set; } = [];

    [JsonPropertyName("dockerfile")]
    public string[] Dockerfile { get; set; } = [];

    [JsonPropertyName("version_dockerfile")]
    public string[] VersionDockerfile { get; set; } = [];

    [JsonPropertyName("volumes")]
    public Dictionary<string, string> Volumes { get; set; } = new();

    [JsonPropertyName("path_prepend")]
    public string PathPrepend { get; set; } = "";
}

public class VersionDetectRule
{
    [JsonPropertyName("file")]
    public string File { get; set; } = "";

    [JsonPropertyName("regex")]
    public string Regex { get; set; } = "";
}
