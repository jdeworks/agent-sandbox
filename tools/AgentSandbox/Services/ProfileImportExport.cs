using System.Text.Json;
using AgentSandbox.Models;

namespace AgentSandbox.Services;

public static class ProfileImportExport
{
    private const string FormatVersion = "agent-sandbox-profile/1";
    private const string AppVersion = "2.2.0";

    public static string Export(string profileName)
    {
        var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
        var profileJsonPath = Path.Combine(profileDir, "profile.json");

        if (!File.Exists(profileJsonPath))
            throw new FileNotFoundException($"Profile '{profileName}' not found.");

        var profileDoc = JsonDocument.Parse(File.ReadAllText(profileJsonPath));

        var envelope = new
        {
            _format = FormatVersion,
            _metadata = new
            {
                exported_at = DateTime.Now.ToString("O"),
                hostname = Environment.MachineName,
                version = AppVersion
            },
            profile = profileDoc.RootElement
        };

        var json = JsonSerializer.Serialize(envelope, new JsonSerializerOptions { WriteIndented = true });
        profileDoc.Dispose();
        return json;
    }

    public static ProfileSpec Import(string json, Dictionary<string, LanguageConfig> languages,
        Dictionary<string, PortConfig> portConfigs, Action<string> log)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // Validate format
        if (!root.TryGetProperty("_format", out var fmtEl) || fmtEl.GetString() != FormatVersion)
            throw new InvalidOperationException("Unknown or invalid profile format.");

        if (!root.TryGetProperty("profile", out var profileEl))
            throw new InvalidOperationException("Missing profile data.");

        var name = profileEl.TryGetProperty("name", out var nameEl) ? nameEl.GetString() ?? "" : "";
        if (string.IsNullOrEmpty(name))
            throw new InvalidOperationException("Profile has no name.");

        // Resolve name collisions: append -2, -3, etc.
        var baseName = name;
        var suffix = 1;
        while (Directory.Exists(Path.Combine(ResourceManager.PreparedDir, name)))
        {
            suffix++;
            name = $"{baseName}-{suffix}";
        }
        if (name != baseName)
            log($"[import] Profile '{baseName}' already exists, using '{name}' instead.");

        var profileDir = Path.Combine(ResourceManager.PreparedDir, name);

        // Write profile.json with resolved name
        Directory.CreateDirectory(profileDir);
        var profileObj = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(profileEl.GetRawText())
                         ?? new Dictionary<string, JsonElement>();
        profileObj["name"] = JsonSerializer.SerializeToElement(name);
        ResourceManager.WriteLf(Path.Combine(profileDir, "profile.json"),
            JsonSerializer.Serialize(profileObj, new JsonSerializerOptions { WriteIndented = true }));

        // Build ProfileSpec from imported data
        var spec = new ProfileSpec { Name = name };

        if (profileEl.TryGetProperty("languages", out var langsEl))
            spec.Languages = langsEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (!spec.Languages.Contains("node")) spec.Languages.Insert(0, "node");

        if (profileEl.TryGetProperty("agents", out var agentsEl))
            spec.Agents = agentsEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("plugins", out var pluginsEl))
            spec.Plugins = pluginsEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("additions", out var addEl))
            spec.Additions = addEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("vscode_extensions", out var vsExtEl))
            spec.VscodeExtensions = vsExtEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("mcp_servers", out var mcpEl))
            spec.McpServers = mcpEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("custom_plugins", out var cpEl2))
            spec.CustomPlugins = cpEl2.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("skills", out var skillsEl2))
            spec.Skills = skillsEl2.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("custom_dockerfile_lines", out var cdfEl))
            spec.CustomDockerfileLines = cdfEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("custom_startup_before", out var csbEl))
            spec.CustomStartupBefore = csbEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
        if (profileEl.TryGetProperty("custom_startup_after", out var csaEl))
            spec.CustomStartupAfter = csaEl.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();

        if (profileEl.TryGetProperty("versions", out var versEl))
            foreach (var prop in versEl.EnumerateObject())
                spec.Versions[prop.Name] = prop.Value.GetString() ?? "";

        // Compute ports
        var ports = new HashSet<int>();
        if (portConfigs.TryGetValue("base", out var baseCfg))
            foreach (var p in baseCfg.Ports) ports.Add(p);
        foreach (var lang in spec.Languages)
            if (portConfigs.TryGetValue(lang, out var lc))
                foreach (var p in lc.Default) ports.Add(p);

        var additionsPath = Path.Combine(ResourceManager.SandboxDir, "additions.json");
        if (File.Exists(additionsPath))
        {
            try
            {
                using var addDoc = JsonDocument.Parse(File.ReadAllText(additionsPath));
                foreach (var addition in spec.Additions)
                    if (addDoc.RootElement.TryGetProperty(addition, out var aEl) &&
                        aEl.TryGetProperty("port", out var portEl) &&
                        portEl.TryGetInt32(out var addPort))
                        ports.Add(addPort);
            }
            catch { /* ignore */ }
        }
        spec.Ports = ports.OrderBy(p => p).ToList();

        // Generate profile files
        log($"[import] Generating profile '{name}'...");
        ProfileGenerator.Generate(spec, languages);

        // Handle custom npm packages and skills
        {
            var extraLines = new List<string>();
            foreach (var p in spec.CustomPlugins)
                extraLines.Add($"RUN npm install -g {p}");
            foreach (var s in spec.Skills)
                extraLines.Add($"RUN claude skill install anthropics/skills --skill {s} || true");

            if (extraLines.Count > 0)
            {
                var dfPath = Path.Combine(profileDir, "Dockerfile.base");
                if (File.Exists(dfPath))
                {
                    var df = File.ReadAllText(dfPath);
                    df = df.Replace("ENTRYPOINT", string.Join("\n", extraLines) + "\n\nENTRYPOINT");
                    ResourceManager.WriteLf(dfPath, df);
                }
            }
        }

        // Build Docker image
        log("[import] Building Docker image...");
        var tag = $"agent-sandbox-{name}:latest";
        var dfFilePath = Path.Combine(profileDir, "Dockerfile.base");
        var exitCode = DockerRunner.Build(dfFilePath, tag, profileDir, log);
        if (exitCode != 0)
        {
            log("[import] Build failed. Cleaning up...");
            try { Directory.Delete(profileDir, true); } catch { }
            throw new InvalidOperationException("Docker build failed.");
        }

        log($"[import] Profile '{name}' imported and built.");
        return spec;
    }
}
