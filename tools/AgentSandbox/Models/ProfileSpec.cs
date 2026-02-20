namespace AgentSandbox.Models;

public class ProfileSpec
{
    public string Name { get; set; } = "";
    public List<string> Languages { get; set; } = new();
    public Dictionary<string, string> Versions { get; set; } = new();
    public List<int> Ports { get; set; } = new();
    public List<string> DetectedFrameworks { get; set; } = new();
}
