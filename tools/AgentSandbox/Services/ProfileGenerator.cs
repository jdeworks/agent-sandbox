using System.Text;
using System.Text.Json;
using AgentSandbox.Models;

namespace AgentSandbox.Services;

public static class ProfileGenerator
{
    /// <summary>Regenerate an existing profile from profile.json and current templates.</summary>
    public static void RegenerateProfile(string profileName, Dictionary<string, LanguageConfig> languages, Dictionary<string, PortConfig> portConfigs)
    {
        var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
        var profileJsonPath = Path.Combine(profileDir, "profile.json");

        var spec = new ProfileSpec { Name = profileName };

        // Read from profile.json if available
        if (File.Exists(profileJsonPath))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(profileJsonPath));
                var root = doc.RootElement;

                List<string> ReadArray(string key) =>
                    root.TryGetProperty(key, out var el) && el.ValueKind == JsonValueKind.Array
                        ? el.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList()
                        : new List<string>();

                spec.Languages = ReadArray("languages");
                spec.Agents = ReadArray("agents");
                spec.Plugins = ReadArray("plugins");
                spec.Additions = ReadArray("additions");
                spec.VscodeExtensions = ReadArray("vscode_extensions");
                spec.McpServers = ReadArray("mcp_servers");
                spec.Skills = ReadArray("skills");
                spec.CustomPlugins = ReadArray("custom_plugins");
                spec.CustomDockerfileLines = ReadArray("custom_dockerfile_lines");
                spec.CustomStartupBefore = ReadArray("custom_startup_before");
                spec.CustomStartupAfter = ReadArray("custom_startup_after");

                if (root.TryGetProperty("versions", out var versEl) && versEl.ValueKind == JsonValueKind.Object)
                    foreach (var prop in versEl.EnumerateObject())
                        spec.Versions[prop.Name] = prop.Value.GetString() ?? "";
            }
            catch { /* fall through to defaults */ }
        }

        // Ensure node is always included
        if (!spec.Languages.Contains("node"))
            spec.Languages.Insert(0, "node");

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
                        aEl.TryGetProperty("port", out var portEl) && portEl.TryGetInt32(out var ap))
                        ports.Add(ap);
            }
            catch { }
        }
        spec.Ports = ports.OrderBy(p => p).ToList();

        Generate(spec, languages);

        // Write profile.json back (Generate deletes the directory)
        var manifest = JsonSerializer.Serialize(new
        {
            name = spec.Name,
            agents = spec.Agents,
            plugins = spec.Plugins,
            custom_plugins = spec.CustomPlugins,
            skills = spec.Skills,
            languages = spec.Languages,
            versions = spec.Versions,
            additions = spec.Additions,
            vscode_extensions = spec.VscodeExtensions,
            mcp_servers = spec.McpServers,
            custom_dockerfile_lines = spec.CustomDockerfileLines,
            custom_startup_before = spec.CustomStartupBefore,
            custom_startup_after = spec.CustomStartupAfter,
            regenerated = DateTime.Now.ToString("O")
        }, new JsonSerializerOptions { WriteIndented = true });
        ResourceManager.WriteLf(Path.Combine(profileDir, "profile.json"), manifest);
    }

    public static void Generate(ProfileSpec spec, Dictionary<string, LanguageConfig> languages)
    {
        var profileDir = Path.Combine(ResourceManager.PreparedDir, spec.Name);
        if (Directory.Exists(profileDir))
            Directory.Delete(profileDir, true);
        Directory.CreateDirectory(profileDir);

        var nodeVersion = spec.Versions.GetValueOrDefault("node",
            languages.GetValueOrDefault("node")?.DefaultVersion ?? "20");

        GenerateDockerfile(profileDir, spec, languages, nodeVersion);
        GenerateCompose(profileDir, spec, languages, nodeVersion);
        GenerateInstallSh(profileDir, spec);
        GenerateAgentsMd(profileDir, spec);
        GenerateVersionsEnv(profileDir, spec, nodeVersion);
    }

    private static string ResolveVersion(ProfileSpec spec, string lang, Dictionary<string, LanguageConfig> languages)
    {
        if (spec.Versions.TryGetValue(lang, out var ver))
            return ver;
        if (languages.TryGetValue(lang, out var config))
            return config.DefaultVersion;
        return "";
    }

    private static void GenerateDockerfile(string profileDir, ProfileSpec spec,
        Dictionary<string, LanguageConfig> languages, string nodeVersion)
    {
        // Build agent Dockerfile layers (only selected agents)
        var agentLayers = new StringBuilder();
        var agentsJsonPath = Path.Combine(ResourceManager.SandboxDir, "agents.json");
        if (File.Exists(agentsJsonPath))
        {
            try
            {
                using var agentsDoc = JsonDocument.Parse(File.ReadAllText(agentsJsonPath));
                foreach (var agent in spec.Agents)
                {
                    if (!agentsDoc.RootElement.TryGetProperty(agent, out var agentEl)) continue;
                    if (agentEl.TryGetProperty("dockerfile", out var dfArr))
                    {
                        if (agentLayers.Length > 0) agentLayers.AppendLine().AppendLine();
                        foreach (var line in dfArr.EnumerateArray())
                            agentLayers.AppendLine(line.GetString() ?? "");
                    }
                    if (agentEl.TryGetProperty("plugin_install", out var piEl))
                    {
                        var pi = piEl.GetString();
                        if (!string.IsNullOrEmpty(pi))
                        {
                            agentLayers.AppendLine();
                            agentLayers.AppendLine(pi);
                        }
                    }
                }
            }
            catch { }
        }

        var layers = new StringBuilder();

        foreach (var lang in spec.Languages)
        {
            if (!languages.TryGetValue(lang, out var config))
                continue;

            var version = ResolveVersion(spec, lang, languages);
            var useVersioned = false;

            if (!string.IsNullOrEmpty(version) && version != "system")
            {
                if (version != config.DefaultVersion && config.VersionDockerfile.Length > 0)
                    useVersioned = true;
            }

            var lines = useVersioned ? config.VersionDockerfile : config.Dockerfile;
            if (lines.Length == 0)
                continue;

            if (layers.Length > 0)
                layers.AppendLine().AppendLine();

            foreach (var line in lines)
                layers.AppendLine(line.Replace("{{VERSION}}", version));
        }

        // Build addition Dockerfile layers (sorted by priority)
        var additionLayers = new StringBuilder();
        var additionsDoc = LoadAdditionsJson();
        if (additionsDoc != null)
        {
            var sortedAdditions = spec.Additions
                .OrderBy(a => additionsDoc.RootElement.TryGetProperty(a, out var el) &&
                              el.TryGetProperty("priority", out var p) && p.TryGetInt32(out var pv) ? pv : 50)
                .ToList();
            foreach (var addition in sortedAdditions)
            {
                if (!additionsDoc.RootElement.TryGetProperty(addition, out var addEl))
                    continue;
                if (!addEl.TryGetProperty("dockerfile", out var dfArr))
                    continue;
                if (additionLayers.Length > 0)
                    additionLayers.AppendLine().AppendLine();
                foreach (var line in dfArr.EnumerateArray())
                    additionLayers.AppendLine(line.GetString() ?? "");

                // VS Code extensions: always + language-specific + optional (from VscodeExtensions)
                if (addition == "vscode-server" && addEl.TryGetProperty("extensions", out var extEl))
                {
                    var extIds = new List<string>();

                    // Always-installed extensions
                    if (extEl.TryGetProperty("always", out var alwaysObj))
                        foreach (var ext in alwaysObj.EnumerateObject())
                            extIds.Add(ext.Name);

                    // Language-specific extensions
                    if (extEl.TryGetProperty("languages", out var langObj))
                        foreach (var lang in spec.Languages)
                            if (langObj.TryGetProperty(lang, out var langExts))
                                foreach (var ext in langExts.EnumerateArray())
                                    if (ext.TryGetProperty("id", out var idEl))
                                    {
                                        var id = idEl.GetString();
                                        if (!string.IsNullOrEmpty(id) && !extIds.Contains(id))
                                            extIds.Add(id);
                                    }

                    // User-selected optional extensions
                    foreach (var extId in spec.VscodeExtensions)
                        if (!extIds.Contains(extId))
                            extIds.Add(extId);

                    if (extIds.Count > 0)
                    {
                        additionLayers.AppendLine();
                        additionLayers.AppendLine("# VS Code extensions");
                        var extArgs = string.Join(" ", extIds.Select(id => $"--install-extension {id}"));
                        additionLayers.AppendLine($"RUN code-server {extArgs}");
                    }
                }
            }
            additionsDoc.Dispose();
        }

        // Custom Dockerfile lines
        var customDockerLines = string.Join("\n", spec.CustomDockerfileLines);

        var template = ResourceManager.ReadSandboxFile("Dockerfile.base.tpl");
        var output = template
            .Replace("{{NODE_VERSION}}", nodeVersion)
            .Replace("# {{AGENT_LAYERS}}", agentLayers.ToString().TrimEnd())
            .Replace("# {{LANGUAGE_LAYERS}}", layers.ToString().TrimEnd())
            .Replace("# {{ADDITION_LAYERS}}", additionLayers.ToString().TrimEnd())
            .Replace("# {{CUSTOM_DOCKERFILE_LINES}}", customDockerLines);

        ResourceManager.WriteLf(Path.Combine(profileDir, "Dockerfile.base"), output);
    }

    private static JsonDocument? LoadAdditionsJson()
    {
        var path = Path.Combine(ResourceManager.SandboxDir, "additions.json");

        // Try extracted file first
        if (File.Exists(path))
        {
            try
            {
                var doc = JsonDocument.Parse(File.ReadAllText(path));
                // Validate it has the expected structure
                if (doc.RootElement.TryGetProperty("vscode-server", out var vs) && vs.TryGetProperty("dockerfile", out _))
                    return doc;
                doc.Dispose();
                // File exists but is incomplete/stale — fall through to re-extract
            }
            catch { }
        }

        // Force re-extraction and write directly
        try
        {
            var asm = System.Reflection.Assembly.GetExecutingAssembly();
            var resName = asm.GetManifestResourceNames()
                .FirstOrDefault(n => n.EndsWith(".additions.json", StringComparison.OrdinalIgnoreCase));
            if (resName != null)
            {
                using var stream = asm.GetManifestResourceStream(resName)!;
                using var reader = new System.IO.StreamReader(stream);
                var content = reader.ReadToEnd();
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                ResourceManager.WriteLf(path, content);
                return JsonDocument.Parse(content);
            }
        }
        catch { }

        return null;
    }

    private static void GenerateCompose(string profileDir, ProfileSpec spec,
        Dictionary<string, LanguageConfig> languages, string nodeVersion)
    {
        var pathParts = new List<string>();
        var volMounts = new List<string>();
        var volDefs = new List<string>();
        var envLines = new List<string>();

        foreach (var lang in spec.Languages)
        {
            if (!languages.TryGetValue(lang, out var config))
                continue;

            if (!string.IsNullOrEmpty(config.PathPrepend))
                pathParts.Add(config.PathPrepend);

            foreach (var (vname, mpath) in config.Volumes)
            {
                volMounts.Add($"      - asb_{vname}:{mpath}");
                volDefs.Add($"  asb_{vname}:");
            }

            if (lang != "node")
            {
                var version = ResolveVersion(spec, lang, languages);
                if (!string.IsNullOrEmpty(version) && version != "system")
                    envLines.Add($"      - {lang.ToUpperInvariant()}_VERSION={version}");
            }
        }

        envLines.Add($"      - NODE_VERSION={nodeVersion}");

        // Addition volumes
        var additionsDoc = LoadAdditionsJson();
        if (additionsDoc != null)
        {
            foreach (var addition in spec.Additions)
            {
                if (!additionsDoc.RootElement.TryGetProperty(addition, out var addEl))
                    continue;
                if (!addEl.TryGetProperty("volumes", out var volObj))
                    continue;
                foreach (var vol in volObj.EnumerateObject())
                {
                    var vname = vol.Name;
                    var mpath = vol.Value.GetString() ?? "";
                    volMounts.Add($"      - asb_{vname}:{mpath}");
                    volDefs.Add($"  asb_{vname}:");
                }
            }
            additionsDoc.Dispose();
        }

        pathParts.Add("/root/.local/bin:/root/.cursor/bin:/root/.claude/bin:/root/.npm-global/bin:/opt/opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
        var pathEnv = string.Join(":", pathParts);

        var sb = new StringBuilder();
        sb.AppendLine("services:");
        sb.AppendLine("  agent:");
        sb.AppendLine("    build: .");
        sb.AppendLine("    container_name: sandbox-{{PROJECT_NAME}}");
        sb.AppendLine("    working_dir: /workspace/src");
        sb.AppendLine("    environment:");
        sb.AppendLine($"      - HOME=/workspace");
        sb.AppendLine($"      - PATH={pathEnv}");
        sb.AppendLine("      - HOST_UID={{HOST_UID}}");
        sb.AppendLine("      - HOST_GID={{HOST_GID}}");
        foreach (var env in envLines)
            sb.AppendLine(env);
        sb.AppendLine("    volumes:");
        sb.AppendLine("      - {{WORKSPACE_PATH}}:/workspace/src");
        foreach (var vol in volMounts)
            sb.AppendLine(vol);
        sb.AppendLine("      - ./opencode_data:/workspace/.config/opencode");
        sb.AppendLine("      - ./opencode_sessions:/workspace/.local/share/opencode");
        sb.AppendLine("      - ./logs:/workspace/.local/share/opencode/log");
        sb.AppendLine("      - asb_agent_config_{{PROJECT_NAME}}:/workspace/.agent-config");
        sb.AppendLine("      - asb_agent_data_{{PROJECT_NAME}}:/workspace/.agent-data");
        sb.AppendLine("      - asb_sandbox_data_{{PROJECT_NAME}}:/workspace/.sandbox-vol");
        sb.AppendLine("      - asb_opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode");
        sb.AppendLine("      - ./sandbox_data:/workspace/.sandbox");
        sb.AppendLine("    ports:");
        foreach (var port in spec.Ports)
            sb.AppendLine($"      - \"{port}:{port}\"");
        sb.AppendLine("    env_file:");
        sb.AppendLine("      - ./runtime.env");
        sb.AppendLine("      - ./user.env");
        sb.AppendLine("    stdin_open: true");
        sb.AppendLine("    tty: true");
        sb.AppendLine("    security_opt:");
        sb.AppendLine("      - no-new-privileges:true");
        sb.AppendLine();
        sb.AppendLine("volumes:");
        foreach (var vd in volDefs)
            sb.AppendLine(vd);
        sb.AppendLine("  asb_agent_config_{{PROJECT_NAME}}:");
        sb.AppendLine("  asb_agent_data_{{PROJECT_NAME}}:");
        sb.AppendLine("  asb_sandbox_data_{{PROJECT_NAME}}:");
        sb.Append("  asb_opencode_cache_{{PROJECT_NAME}}:");

        ResourceManager.WriteLf(Path.Combine(profileDir, "docker-compose.yml.tpl"), sb.ToString());
    }

    private static void GenerateInstallSh(string profileDir, ProfileSpec spec)
    {
        var sb = new StringBuilder();
        sb.AppendLine("#!/usr/bin/env bash");
        sb.AppendLine("set -e");
        sb.AppendLine();
        sb.AppendLine("########################################");
        sb.AppendLine("# Ensure OpenCode cache dir exists");
        sb.AppendLine("########################################");
        sb.AppendLine("mkdir -p /workspace/.cache/opencode");
        sb.AppendLine();
        sb.AppendLine("[ -d /workspace/.cache ] && chmod -R a+rwX /workspace/.cache");
        sb.AppendLine("[ -d /workspace/.config ] && chmod -R a+rwX /workspace/.config");
        sb.AppendLine("[ -d /workspace/.npm ] && chmod -R a+rwX /workspace/.npm");
        sb.AppendLine();
        sb.AppendLine("########################################");
        sb.AppendLine("# Ensure CLI agent symlinks exist");
        sb.AppendLine("########################################");
        sb.AppendLine("for bin in agent claude; do");
        sb.AppendLine("  if [ ! -x \"/usr/local/bin/$bin\" ] || head -1 \"/usr/local/bin/$bin\" 2>/dev/null | grep -q '^#!/bin/bash'; then");
        sb.AppendLine("    for dir in /root/.local/bin /root/.cursor/bin /root/.claude/bin; do");
        sb.AppendLine("      if [ -x \"$dir/$bin\" ]; then ln -sf \"$dir/$bin\" \"/usr/local/bin/$bin\"; break; fi");
        sb.AppendLine("    done");
        sb.AppendLine("  fi");
        sb.AppendLine("done");
        sb.AppendLine("export PATH=\"/root/.local/bin:$PATH\"");
        sb.AppendLine();

        foreach (var lang in spec.Languages)
        {
            try
            {
                var fragment = ResourceManager.ReadFragment($"{lang}.sh");
                sb.AppendLine(fragment);
                sb.AppendLine();
            }
            catch (FileNotFoundException) { }
        }

        // Addition fragments (e.g. vscode-server)
        var additionsDoc = LoadAdditionsJson();
        if (additionsDoc != null)
        {
            foreach (var addition in spec.Additions)
            {
                if (!additionsDoc.RootElement.TryGetProperty(addition, out var addEl))
                    continue;
                if (!addEl.TryGetProperty("fragment", out var fragEl))
                    continue;
                var fragName = fragEl.GetString();
                if (string.IsNullOrEmpty(fragName)) continue;
                try
                {
                    string additionFragment;
                    try { additionFragment = ResourceManager.ReadAdditionFragment(fragName); }
                    catch (FileNotFoundException)
                    {
                        // Fragment not extracted yet — read directly from embedded resource
                        var asm = System.Reflection.Assembly.GetExecutingAssembly();
                        var resName = asm.GetManifestResourceNames()
                            .FirstOrDefault(n => n.EndsWith($".additions.{fragName}", StringComparison.OrdinalIgnoreCase));
                        if (resName == null) continue;
                        using var stream = asm.GetManifestResourceStream(resName)!;
                        using var reader = new System.IO.StreamReader(stream);
                        additionFragment = reader.ReadToEnd();
                        // Also write to disk for next time
                        var fragPath = Path.Combine(ResourceManager.AdditionsFragmentsDir, fragName);
                        Directory.CreateDirectory(Path.GetDirectoryName(fragPath)!);
                        ResourceManager.WriteLf(fragPath, additionFragment);
                    }
                    sb.AppendLine(additionFragment);
                    sb.AppendLine();
                }
                catch { }
            }
            additionsDoc.Dispose();
        }

        // Resolve primary agent command
        var agentCmd = "opencode";
        var agentArgs = "";
        if (spec.Agents.Count > 0)
        {
            var agentsPath = Path.Combine(ResourceManager.SandboxDir, "agents.json");
            if (File.Exists(agentsPath))
            {
                try
                {
                    using var agentsDoc = JsonDocument.Parse(File.ReadAllText(agentsPath));
                    var primaryAgent = spec.Agents[0];
                    if (agentsDoc.RootElement.TryGetProperty(primaryAgent, out var agentEl))
                    {
                        if (agentEl.TryGetProperty("command", out var cmdEl))
                            agentCmd = cmdEl.GetString() ?? "opencode";
                        if (agentEl.TryGetProperty("args", out var argsEl))
                        {
                            var argsList = argsEl.EnumerateArray().Select(a => a.GetString() ?? "").Where(a => a != "");
                            agentArgs = string.Join(" ", argsList);
                        }
                    }
                }
                catch { /* fallback to opencode */ }
            }
        }
        var fullCmd = string.IsNullOrEmpty(agentArgs) ? agentCmd : $"{agentCmd} {agentArgs}";

        sb.AppendLine("echo \"[sandbox] Ready.\"");
        sb.AppendLine("touch /tmp/.sandbox-ready");

        // Custom pre-agent startup commands
        foreach (var cmd in spec.CustomStartupBefore)
            sb.AppendLine(cmd);

        // Custom background startup commands
        foreach (var cmd in spec.CustomStartupAfter)
            sb.AppendLine(cmd.EndsWith(" &") ? cmd : $"{cmd} &");

        // Everything up to here is shared between install.sh and install-vscode.sh
        var sharedSetup = sb.ToString();

        // --- install-vscode.sh: setup + sleep (no agent) ---
        var vscodeSb = new StringBuilder(sharedSetup);
        vscodeSb.AppendLine("echo \"[sandbox] VS Code Server mode — agent skipped.\"");
        vscodeSb.AppendLine("exec tail -f /dev/null");
        ResourceManager.WriteLf(Path.Combine(profileDir, "install-vscode.sh"), vscodeSb.ToString());

        // --- install.sh: setup + exec agent ---
        sb.AppendLine("if [ -n \"${HOST_UID:-}\" ] && [ -n \"${HOST_GID:-}\" ]; then");
        sb.AppendLine("  run_as_user=dev");
        sb.AppendLine("  if getent passwd \"$HOST_UID\" >/dev/null 2>&1; then");
        sb.AppendLine("    run_as_user=$(getent passwd \"$HOST_UID\" | cut -d: -f1)");
        sb.AppendLine("  else");
        sb.AppendLine("    groupadd -g \"$HOST_GID\" dev 2>/dev/null || true");
        sb.AppendLine("    useradd -u \"$HOST_UID\" -g \"$HOST_GID\" -m -s /bin/bash dev 2>/dev/null || true");
        sb.AppendLine("  fi");
        sb.AppendLine("  chown -R \"$HOST_UID:$HOST_GID\" /workspace");
        sb.AppendLine($"  exec runuser -u \"$run_as_user\" -- {fullCmd}");
        sb.AppendLine("fi");
        sb.AppendLine($"exec {fullCmd}");

        ResourceManager.WriteLf(Path.Combine(profileDir, "install.sh"), sb.ToString());
    }

    private static void GenerateAgentsMd(string profileDir, ProfileSpec spec)
    {
        var sb = new StringBuilder();
        sb.Append(ResourceManager.ReadSandboxFile("AGENTS.md.base"));

        foreach (var lang in spec.Languages)
        {
            try
            {
                var fragment = ResourceManager.ReadFragment($"{lang}.agents.md");
                sb.AppendLine(fragment);
            }
            catch (FileNotFoundException) { }
        }

        // Addition agent instructions
        var additionsDoc = LoadAdditionsJson();
        if (additionsDoc != null)
        {
            foreach (var addition in spec.Additions)
            {
                if (!additionsDoc.RootElement.TryGetProperty(addition, out var addEl))
                    continue;
                if (!addEl.TryGetProperty("agents_md", out var mdEl))
                    continue;
                var mdName = mdEl.GetString();
                if (string.IsNullOrEmpty(mdName)) continue;
                try
                {
                    var additionMd = ResourceManager.ReadAdditionFragment(mdName);
                    sb.AppendLine(additionMd);
                }
                catch (FileNotFoundException) { }
            }
            additionsDoc.Dispose();
        }

        if (spec.Ports.Count > 0)
        {
            var portList = string.Join(", ", spec.Ports);
            sb.AppendLine();
            sb.AppendLine("## Available Ports");
            sb.AppendLine();
            sb.AppendLine($"The following ports are published to the host: {portList}. " +
                          "Use one of these for your dev server so it is reachable at " +
                          "`http://localhost:<port>` on the host.");
        }

        ResourceManager.WriteLf(Path.Combine(profileDir, "AGENTS.md"), sb.ToString());

        var socraticContent = ResourceManager.ReadSandboxFile("socratic.md");
        ResourceManager.WriteLf(Path.Combine(profileDir, "socratic.md"), socraticContent);
    }

    private static void GenerateVersionsEnv(string profileDir, ProfileSpec spec, string nodeVersion)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# Auto-generated version pins for profile: {spec.Name}");
        sb.AppendLine($"NODE_VERSION={nodeVersion}");

        foreach (var lang in spec.Languages)
        {
            if (spec.Versions.TryGetValue(lang, out var ver) && !string.IsNullOrEmpty(ver))
                sb.AppendLine($"{lang.ToUpperInvariant()}_VERSION={ver}");
        }

        ResourceManager.WriteLf(Path.Combine(profileDir, "versions.env"), sb.ToString());
    }
}
