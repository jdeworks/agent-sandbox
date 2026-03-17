namespace AgentSandbox.Models;

public class ProfileSpec
{
    public string Name { get; set; } = "";
    public List<string> Languages { get; set; } = new();
    public Dictionary<string, string> Versions { get; set; } = new();
    public List<int> Ports { get; set; } = new();
    public List<string> DetectedFrameworks { get; set; } = new();

    // v2 fields
    public List<string> Agents { get; set; } = new();
    public List<string> Plugins { get; set; } = new();
    public List<string> McpServers { get; set; } = new();
}
