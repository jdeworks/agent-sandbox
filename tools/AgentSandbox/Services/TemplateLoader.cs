using System.Text.Json;

namespace AgentSandbox.Services;

public record TemplateInfo(string Id, string Label, string Description, string UseCases, string AgentsMdExtra, string ProfileJson);

public static class TemplateLoader
{
    /// <summary>
    /// Load all template profiles from the extracted templates/profiles/ directory.
    /// Falls back to embedded resources if files haven't been extracted yet.
    /// </summary>
    public static List<TemplateInfo> LoadAll()
    {
        var results = new List<TemplateInfo>();
        var profilesDir = Path.Combine(ResourceManager.TemplatesDir, "profiles");

        if (!Directory.Exists(profilesDir))
            return results;

        foreach (var file in Directory.GetFiles(profilesDir, "*.json"))
        {
            try
            {
                var json = File.ReadAllText(file);
                var info = Parse(json);
                if (info != null) results.Add(info);
            }
            catch { /* skip invalid templates */ }
        }

        return results.OrderBy(t => t.Label).ToList();
    }

    private static TemplateInfo? Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        if (!root.TryGetProperty("_template", out var tmpl))
            return null;
        if (!root.TryGetProperty("profile", out _))
            return null;

        var id = tmpl.GetProperty("id").GetString() ?? "";
        var label = tmpl.GetProperty("label").GetString() ?? "";
        var description = tmpl.GetProperty("description").GetString() ?? "";
        var useCases = tmpl.TryGetProperty("use_cases", out var uc) ? uc.GetString() ?? "" : "";
        var agentsMdExtra = tmpl.TryGetProperty("agents_md_extra", out var ame) ? ame.GetString() ?? "" : "";

        return new TemplateInfo(id, label, description, useCases, agentsMdExtra, json);
    }

    /// <summary>
    /// Convert a template's profile JSON into a ProfileSpec ready for ProfileGenerator.
    /// </summary>
    public static Models.ProfileSpec ToProfileSpec(TemplateInfo template, string? nameOverride = null)
    {
        using var doc = JsonDocument.Parse(template.ProfileJson);
        var p = doc.RootElement.GetProperty("profile");

        var spec = new Models.ProfileSpec
        {
            Name = nameOverride ?? (p.TryGetProperty("name", out var n) ? n.GetString() ?? template.Id : template.Id),
            Template = template.Id
        };

        if (p.TryGetProperty("agents", out var agents) && agents.ValueKind == JsonValueKind.Array)
            spec.Agents.AddRange(agents.EnumerateArray().Select(a => a.GetString() ?? "").Where(a => a != ""));

        if (p.TryGetProperty("languages", out var langs) && langs.ValueKind == JsonValueKind.Array)
            spec.Languages.AddRange(langs.EnumerateArray().Select(l => l.GetString() ?? "").Where(l => l != ""));

        if (p.TryGetProperty("additions", out var adds) && adds.ValueKind == JsonValueKind.Array)
            spec.Additions.AddRange(adds.EnumerateArray().Select(a => a.GetString() ?? "").Where(a => a != ""));

        if (p.TryGetProperty("plugins", out var plugs) && plugs.ValueKind == JsonValueKind.Array)
            spec.Plugins.AddRange(plugs.EnumerateArray().Select(pl => pl.GetString() ?? "").Where(pl => pl != ""));

        if (p.TryGetProperty("custom_plugins", out var cp) && cp.ValueKind == JsonValueKind.Array)
            spec.CustomPlugins.AddRange(cp.EnumerateArray().Select(c => c.GetString() ?? "").Where(c => c != ""));

        if (p.TryGetProperty("skills", out var sk) && sk.ValueKind == JsonValueKind.Array)
            spec.Skills.AddRange(sk.EnumerateArray().Select(s => s.GetString() ?? "").Where(s => s != ""));

        if (p.TryGetProperty("vscode_extensions", out var ve) && ve.ValueKind == JsonValueKind.Array)
            spec.VscodeExtensions.AddRange(ve.EnumerateArray().Select(v => v.GetString() ?? "").Where(v => v != ""));

        if (p.TryGetProperty("mcp_servers", out var mcp) && mcp.ValueKind == JsonValueKind.Array)
            spec.McpServers.AddRange(mcp.EnumerateArray().Select(m => m.GetString() ?? "").Where(m => m != ""));

        if (p.TryGetProperty("versions", out var vers) && vers.ValueKind == JsonValueKind.Object)
            foreach (var kv in vers.EnumerateObject())
                spec.Versions[kv.Name] = kv.Value.GetString() ?? "";

        if (p.TryGetProperty("custom_dockerfile_lines", out var cdl) && cdl.ValueKind == JsonValueKind.Array)
            spec.CustomDockerfileLines.AddRange(cdl.EnumerateArray().Select(c => c.GetString() ?? "").Where(c => c != ""));

        if (p.TryGetProperty("custom_startup_before", out var csb) && csb.ValueKind == JsonValueKind.Array)
            spec.CustomStartupBefore.AddRange(csb.EnumerateArray().Select(c => c.GetString() ?? "").Where(c => c != ""));

        if (p.TryGetProperty("custom_startup_after", out var csa) && csa.ValueKind == JsonValueKind.Array)
            spec.CustomStartupAfter.AddRange(csa.EnumerateArray().Select(c => c.GetString() ?? "").Where(c => c != ""));

        return spec;
    }
}
