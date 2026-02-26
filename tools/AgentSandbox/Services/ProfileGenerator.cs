using System.Text;
using AgentSandbox.Models;

namespace AgentSandbox.Services;

public static class ProfileGenerator
{
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

        var template = ResourceManager.ReadSandboxFile("Dockerfile.base.tpl");
        var output = template
            .Replace("{{NODE_VERSION}}", nodeVersion)
            .Replace("# {{LANGUAGE_LAYERS}}", layers.ToString().TrimEnd());

        ResourceManager.WriteLf(Path.Combine(profileDir, "Dockerfile.base"), output);
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
                volMounts.Add($"      - {vname}:{mpath}");
                volDefs.Add($"  {vname}:");
            }

            if (lang != "node")
            {
                var version = ResolveVersion(spec, lang, languages);
                if (!string.IsNullOrEmpty(version) && version != "system")
                    envLines.Add($"      - {lang.ToUpperInvariant()}_VERSION={version}");
            }
        }

        envLines.Add($"      - NODE_VERSION={nodeVersion}");

        pathParts.Add("/opt/opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
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
        foreach (var env in envLines)
            sb.AppendLine(env);
        sb.AppendLine("    volumes:");
        sb.AppendLine("      - {{WORKSPACE_PATH}}:/workspace/src");
        foreach (var vol in volMounts)
            sb.AppendLine(vol);
        sb.AppendLine("      - ./opencode_data:/workspace/.config/opencode");
        sb.AppendLine("      - ./opencode_sessions:/workspace/.local/share/opencode");
        sb.AppendLine("      - ./logs:/workspace/.local/share/opencode/log");
        sb.AppendLine("      - opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode");
        sb.AppendLine("      - ./sandbox_data:/workspace/.sandbox");
        sb.AppendLine("    ports:");
        foreach (var port in spec.Ports)
            sb.AppendLine($"      - \"{port}:{port}\"");
        sb.AppendLine("    env_file:");
        sb.AppendLine("      - ./runtime.env");
        sb.AppendLine("    stdin_open: true");
        sb.AppendLine("    tty: true");
        sb.AppendLine("    security_opt:");
        sb.AppendLine("      - no-new-privileges:true");
        sb.AppendLine();
        sb.AppendLine("volumes:");
        foreach (var vd in volDefs)
            sb.AppendLine(vd);
        sb.Append("  opencode_cache_{{PROJECT_NAME}}:");

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

        sb.AppendLine("echo \"[sandbox] Ready.\"");
        sb.AppendLine("touch /tmp/.sandbox-ready");
        sb.AppendLine("exec opencode");

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
