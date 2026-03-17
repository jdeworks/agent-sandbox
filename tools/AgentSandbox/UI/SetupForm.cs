using System.Text.Json;
using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox.UI;

/// <summary>
/// v2 Setup modal — interactive profile builder for selecting agents, plugins,
/// languages, MCP servers, and building a named Docker image.
/// </summary>
public class SetupForm : Form
{
    private readonly Dictionary<string, LanguageConfig> _languages;
    private readonly Dictionary<string, PortConfig> _portConfigs;

    // JSON data loaded from embedded resources
    private readonly JsonDocument _agentsDoc;
    private readonly JsonDocument _pluginsDoc;
    private readonly JsonDocument _mcpDoc;

    // UI controls
    private TextBox _nameBox = null!;
    private Label _nameError = null!;
    private CheckedListBox _agentList = null!;
    private CheckedListBox _pluginList = null!;
    private CheckedListBox _langList = null!;
    private CheckedListBox _mcpList = null!;
    private TextBox _logBox = null!;
    private Button _buildBtn = null!;
    private Button _cancelBtn = null!;
    private Panel _mainPanel = null!;

    // Lookup for list index → key
    private readonly List<string> _agentKeys = new();
    private readonly List<string> _pluginKeys = new();
    private readonly List<string> _langKeys = new();
    private readonly List<string> _mcpKeys = new();

    public ProfileSpec? CreatedProfile { get; private set; }

    public SetupForm(Dictionary<string, LanguageConfig> languages, Dictionary<string, PortConfig> portConfigs)
    {
        _languages = languages;
        _portConfigs = portConfigs;

        // Load agent/plugin/MCP JSON
        var agentsPath = Path.Combine(ResourceManager.SandboxDir, "agents.json");
        var pluginsPath = Path.Combine(ResourceManager.SandboxDir, "plugins.json");
        var mcpPath = Path.Combine(ResourceManager.SandboxDir, "mcp-servers.json");

        _agentsDoc = File.Exists(agentsPath) ? JsonDocument.Parse(File.ReadAllText(agentsPath)) : JsonDocument.Parse("{}");
        _pluginsDoc = File.Exists(pluginsPath) ? JsonDocument.Parse(File.ReadAllText(pluginsPath)) : JsonDocument.Parse("{}");
        _mcpDoc = File.Exists(mcpPath) ? JsonDocument.Parse(File.ReadAllText(mcpPath)) : JsonDocument.Parse("{}");

        Text = "Agent Sandbox — Profile Setup";
        Size = new Size(600, 750);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        BuildUI();
    }

    private void BuildUI()
    {
        _mainPanel = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(20) };
        Controls.Add(_mainPanel);

        var y = 10;

        // ── Profile Name ──
        AddLabel("Profile Name", ref y, bold: true);
        _nameBox = new TextBox { Left = 20, Top = y, Width = 300 };
        _nameBox.TextChanged += (_, _) => ValidateName();
        _mainPanel.Controls.Add(_nameBox);
        _nameError = new Label { Left = 330, Top = y + 2, Width = 220, ForeColor = Color.Red, Font = new Font(Font.FontFamily, 8f) };
        _mainPanel.Controls.Add(_nameError);
        y += 30;
        AddLabel("Lowercase alphanumeric + hyphens, min 2 chars", ref y, muted: true);

        // ── Agents ──
        AddLabel("Coding Agents", ref y, bold: true);
        _agentList = new CheckedListBox { Left = 20, Top = y, Width = 540, Height = 90, CheckOnClick = true };
        foreach (var prop in _agentsDoc.RootElement.EnumerateObject())
        {
            var label = prop.Value.TryGetProperty("label", out var l) ? l.GetString() ?? prop.Name : prop.Name;
            // Check if env var is found
            var envHint = "";
            if (prop.Value.TryGetProperty("env_vars", out var evArr))
            {
                foreach (var ev in evArr.EnumerateArray())
                {
                    var evName = ev.GetString();
                    if (!string.IsNullOrEmpty(evName) && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(evName)))
                    {
                        envHint = $" — {evName} found";
                        break;
                    }
                }
            }
            _agentKeys.Add(prop.Name);
            _agentList.Items.Add($"{label}{envHint}");
        }
        _mainPanel.Controls.Add(_agentList);
        y += 95;

        // ── Plugins ──
        AddLabel("Plugins", ref y, bold: true);
        _pluginList = new CheckedListBox { Left = 20, Top = y, Width = 540, Height = 60, CheckOnClick = true };
        foreach (var prop in _pluginsDoc.RootElement.EnumerateObject())
        {
            var desc = prop.Value.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
            _pluginKeys.Add(prop.Name);
            _pluginList.Items.Add($"{prop.Name} — {desc}");
        }
        _mainPanel.Controls.Add(_pluginList);
        y += 65;

        // ── Languages ──
        AddLabel("Languages (Node.js always included)", ref y, bold: true);
        _langList = new CheckedListBox { Left = 20, Top = y, Width = 540, Height = 180, CheckOnClick = true };

        // Read size_warning fields once (not per-language)
        JsonDocument? langDoc = null;
        try
        {
            langDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(ResourceManager.SandboxDir, "languages.json")));
        }
        catch { /* ignore */ }

        foreach (var kvp in _languages.OrderBy(k => k.Key))
        {
            var sizeWarn = "";
            if (langDoc != null &&
                langDoc.RootElement.TryGetProperty(kvp.Key, out var langEl) &&
                langEl.TryGetProperty("size_warning", out var sw))
                sizeWarn = $" — {sw.GetString()}";

            var locked = kvp.Key == "node" ? " [required]" : "";
            _langKeys.Add(kvp.Key);
            var idx = _langList.Items.Add($"{kvp.Value.Label} (default: {kvp.Value.DefaultVersion}){locked}{sizeWarn}");
            if (kvp.Key == "node")
                _langList.SetItemChecked(idx, true);
        }
        _langList.ItemCheck += (_, e) =>
        {
            // Prevent unchecking Node.js
            if (_langKeys[e.Index] == "node" && e.NewValue == CheckState.Unchecked)
                e.NewValue = CheckState.Checked;
        };
        langDoc?.Dispose();
        _mainPanel.Controls.Add(_langList);
        y += 185;

        // ── MCP Servers (advanced, collapsed by default) ──
        var mcpCheck = new CheckBox
        {
            Text = "Include MCP servers (advanced)",
            Left = 20, Top = y, Width = 300,
            Font = new Font(Font.FontFamily, 9.5f, FontStyle.Bold)
        };
        _mainPanel.Controls.Add(mcpCheck);
        y += 25;

        _mcpList = new CheckedListBox { Left = 20, Top = y, Width = 540, Height = 100, CheckOnClick = true, Visible = false };
        foreach (var prop in _mcpDoc.RootElement.EnumerateObject())
        {
            var desc = prop.Value.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
            _mcpKeys.Add(prop.Name);
            _mcpList.Items.Add($"{prop.Name} — {desc}");
        }
        mcpCheck.CheckedChanged += (_, _) => _mcpList.Visible = mcpCheck.Checked;
        _mainPanel.Controls.Add(_mcpList);
        y += 105;

        // ── Buttons ──
        _buildBtn = new Button
        {
            Text = "Create Profile",
            Left = 20, Top = y, Width = 150, Height = 35,
            BackColor = Color.FromArgb(0, 120, 212),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        _buildBtn.Click += OnBuildClicked;
        _mainPanel.Controls.Add(_buildBtn);

        _cancelBtn = new Button
        {
            Text = "Cancel",
            Left = 180, Top = y, Width = 100, Height = 35
        };
        _cancelBtn.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };
        _mainPanel.Controls.Add(_cancelBtn);
        y += 45;

        // ── Log area (hidden until build starts) ──
        _logBox = new TextBox
        {
            Left = 20, Top = y, Width = 540, Height = 120,
            Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(30, 30, 30), ForeColor = Color.FromArgb(0, 200, 80),
            Font = new Font("Consolas", 9f),
            Visible = false
        };
        _mainPanel.Controls.Add(_logBox);
    }

    private void AddLabel(string text, ref int y, bool bold = false, bool muted = false)
    {
        var lbl = new Label
        {
            Text = text,
            Left = 20, Top = y,
            Width = 540, Height = 18,
            Font = bold ? new Font(Font.FontFamily, 9.5f, FontStyle.Bold) : Font,
            ForeColor = muted ? Color.Gray : Color.FromArgb(40, 40, 40)
        };
        _mainPanel.Controls.Add(lbl);
        y += 20;
    }

    private void ValidateName()
    {
        var name = _nameBox.Text.Trim();
        if (string.IsNullOrEmpty(name))
        {
            _nameError.Text = "";
            return;
        }
        if (name.Length < 2) { _nameError.Text = "Min 2 chars"; return; }
        if (name.Length > 50) { _nameError.Text = "Max 50 chars"; return; }
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, @"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"))
        { _nameError.Text = "Lowercase + hyphens only"; return; }
        if (name.Contains("--")) { _nameError.Text = "No consecutive hyphens"; return; }

        var reserved = new[] { "sandbox-setup", "sandbox-me", "sandbox", "help", "version", "list", "update", "setup" };
        if (reserved.Contains(name)) { _nameError.Text = "Reserved name"; return; }

        if (Directory.Exists(Path.Combine(ResourceManager.PreparedDir, name)))
        { _nameError.Text = "Already exists"; return; }

        _nameError.Text = "";
    }

    private async void OnBuildClicked(object? sender, EventArgs e)
    {
        // Validate
        var name = _nameBox.Text.Trim();
        ValidateName();
        if (!string.IsNullOrEmpty(_nameError.Text) || string.IsNullOrEmpty(name))
        {
            MessageBox.Show("Please fix the profile name.", "Validation", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var selectedAgents = GetCheckedKeys(_agentList, _agentKeys);
        if (selectedAgents.Count == 0)
        {
            MessageBox.Show("Select at least one coding agent.", "Validation", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (!DockerRunner.IsDockerAvailable())
        {
            MessageBox.Show("Docker is not running. Start Docker Desktop and try again.", "Docker Required", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var selectedPlugins = GetCheckedKeys(_pluginList, _pluginKeys);
        var selectedLangs = GetCheckedKeys(_langList, _langKeys);
        if (!selectedLangs.Contains("node")) selectedLangs.Insert(0, "node");
        var selectedMcp = GetCheckedKeys(_mcpList, _mcpKeys);

        // Compute ports
        var ports = new HashSet<int>();
        if (_portConfigs.TryGetValue("base", out var baseCfg))
            foreach (var p in baseCfg.Ports) ports.Add(p);
        foreach (var lang in selectedLangs)
            if (_portConfigs.TryGetValue(lang, out var lc))
                foreach (var p in lc.Default) ports.Add(p);

        var spec = new ProfileSpec
        {
            Name = name,
            Languages = selectedLangs,
            Versions = new Dictionary<string, string>(),
            Ports = ports.OrderBy(p => p).ToList(),
            Agents = selectedAgents,
            Plugins = selectedPlugins,
            McpServers = selectedMcp
        };

        // Switch to build mode
        _buildBtn.Enabled = false;
        _cancelBtn.Enabled = false;
        _logBox.Visible = true;
        Size = new Size(Size.Width, Size.Height + 130);

        void Log(string msg)
        {
            if (InvokeRequired)
                Invoke(() => Log(msg));
            else
            {
                _logBox.AppendText(msg + Environment.NewLine);
                _logBox.SelectionStart = _logBox.TextLength;
                _logBox.ScrollToCaret();
            }
        }

        try
        {
            await Task.Run(() =>
            {
                Log($"[setup] Generating profile '{name}'...");
                ProfileGenerator.Generate(spec, _languages);

                // Write profile.json manifest
                var profileDir = Path.Combine(ResourceManager.PreparedDir, name);
                var manifest = JsonSerializer.Serialize(new
                {
                    name,
                    agents = selectedAgents,
                    plugins = selectedPlugins,
                    languages = selectedLangs,
                    mcp_servers = selectedMcp,
                    created = DateTime.Now.ToString("O")
                }, new JsonSerializerOptions { WriteIndented = true });
                ResourceManager.WriteLf(Path.Combine(profileDir, "profile.json"), manifest);

                Log("[setup] Building Docker image...");
                var tag = $"agent-sandbox-{name}:latest";
                var dockerfilePath = Path.Combine(profileDir, "Dockerfile.base");
                var exitCode = DockerRunner.Build(dockerfilePath, tag, profileDir, Log);

                if (exitCode != 0)
                {
                    Log("[setup] Build failed.");
                    return;
                }

                Log($"[setup] Profile '{name}' ready.");
            });

            CreatedProfile = spec;
            Invoke(() =>
            {
                var doneBtn = new Button
                {
                    Text = "Done",
                    Width = 100, Height = 35,
                    Left = 20, Top = _logBox.Bottom + 10,
                    BackColor = Color.FromArgb(0, 120, 212),
                    ForeColor = Color.White,
                    FlatStyle = FlatStyle.Flat
                };
                doneBtn.Click += (_, _) => { DialogResult = DialogResult.OK; Close(); };
                _mainPanel.Controls.Add(doneBtn);
            });
        }
        catch (Exception ex)
        {
            Log($"[setup] Error: {ex.Message}");
            _cancelBtn.Enabled = true;
        }
    }

    private static List<string> GetCheckedKeys(CheckedListBox clb, List<string> keys)
    {
        var result = new List<string>();
        for (int i = 0; i < clb.Items.Count; i++)
            if (clb.GetItemChecked(i))
                result.Add(keys[i]);
        return result;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _agentsDoc.Dispose();
            _pluginsDoc.Dispose();
            _mcpDoc.Dispose();
        }
        base.Dispose(disposing);
    }
}
