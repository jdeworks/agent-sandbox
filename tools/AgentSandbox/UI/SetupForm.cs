using System.Text.Json;
using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox.UI;

/// <summary>
/// v2 Setup wizard — tabbed profile builder with top/bottom layout.
/// Top = selection list, Bottom = info panel for selected item.
/// Steps: Name → Agents → Editors → Languages → Plugins → MCP → Summary/Build
/// </summary>
public class SetupForm : Form
{
    private readonly Dictionary<string, LanguageConfig> _languages;
    private readonly Dictionary<string, PortConfig> _portConfigs;

    private readonly JsonDocument _agentsDoc;
    private readonly JsonDocument _pluginsDoc;
    private readonly JsonDocument _additionsDoc;
    private readonly JsonDocument _mcpDoc;
    private JsonDocument? _langDoc;

    private const int StepCount = 7;
    private int _currentStep;
    private readonly Panel[] _steps = new Panel[StepCount];
    private readonly Label[] _sidebarLabels = new Label[StepCount];
    private Panel _sidebarPanel = null!;
    private Panel _contentArea = null!;
    private Panel _navPanel = null!;
    private Button _btnBack = null!;
    private Button _btnNext = null!;
    private Button _btnBuild = null!;

    // Step 1: Agents
    private CheckedListBox _agentList = null!;
    private readonly List<string> _agentKeys = new();
    private RichTextBox _agentInfoBox = null!;
    private LinkLabel _agentLink = null!;

    // Step 0: Name
    private TextBox _nameBox = null!;
    private Label _nameError = null!;

    // Step 2: Editors
    private CheckBox _chkVsCode = null!;
    private TextBox _extInfoBox = null!;
    private Label _extOptLabel = null!;
    private CheckedListBox _optionalExtList = null!;
    private readonly List<string> _optionalExtKeys = new();
    private RichTextBox _editorInfoBox = null!;

    // Step 3: Languages
    private CheckedListBox _langList = null!;
    private readonly List<string> _langKeys = new();
    private RichTextBox _langInfoBox = null!;
    private Label _versionLabel = null!;
    private TextBox _versionBox = null!;
    private readonly Dictionary<string, string> _versionOverrides = new();

    // Step 4: Plugins
    private CheckedListBox _pluginList = null!;
    private readonly List<string> _pluginKeys = new();
    private int _registryPluginCount;
    private readonly Dictionary<string, DiscoveredPlugin> _discoveredPluginInfo = new();
    private TextBox _txtCustomPlugins = null!;
    private RichTextBox _pluginInfoBox = null!;
    private LinkLabel _pluginLink = null!;

    // Step 5: MCP
    private CheckedListBox _mcpList = null!;
    private readonly List<string> _mcpKeys = new();
    private RichTextBox _mcpInfoBox = null!;

    // Step 6: Summary / Build
    private Label _summaryLabel = null!;
    private TextBox _logBox = null!;

    public ProfileSpec? CreatedProfile { get; private set; }

    private static readonly Color AccentBlue = Color.FromArgb(0, 120, 212);
    private static readonly Color TextPrimary = Color.FromArgb(24, 24, 27);
    private static readonly Color TextMuted = Color.FromArgb(113, 113, 122);
    private static readonly Color SurfaceLight = Color.FromArgb(250, 250, 250);
    private static readonly Font SidebarFont = new("Segoe UI", 9.5f);
    private static readonly Font SidebarBoldFont = new("Segoe UI", 9.5f, FontStyle.Bold);

    private static readonly string[] StepNames =
        { "Profile Name", "AI Agents", "Code Editors", "Languages", "Plugins", "MCP Servers", "Summary" };

    // Content width inside content area (form 920 - sidebar 170 = 750, minus padding)
    private const int CW = 680;

    public SetupForm(Dictionary<string, LanguageConfig> languages, Dictionary<string, PortConfig> portConfigs)
    {
        _languages = languages;
        _portConfigs = portConfigs;

        _agentsDoc = LoadJson("agents.json");
        _pluginsDoc = LoadJson("plugins.json");
        _additionsDoc = LoadJson("additions.json");
        _mcpDoc = LoadJson("mcp-servers.json");
        try { _langDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(ResourceManager.SandboxDir, "languages.json"))); } catch { }

        Text = "Agent Sandbox \u2014 Profile Setup";
        Size = new Size(920, 680);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 10f);
        BackColor = Color.White;

        BuildUI();
        ShowStep(0);
    }

    private static JsonDocument LoadJson(string name)
    {
        var path = Path.Combine(ResourceManager.SandboxDir, name);
        return File.Exists(path) ? JsonDocument.Parse(File.ReadAllText(path)) : JsonDocument.Parse("{}");
    }

    // ─── Layout scaffold ────────────────────────────────────────────────

    private void BuildUI()
    {
        _sidebarPanel = new Panel { Dock = DockStyle.Left, Width = 170, BackColor = SurfaceLight, Padding = new Padding(12, 20, 12, 12) };
        _sidebarPanel.Controls.Add(new Label { Text = "Setup", Font = new Font("Segoe UI", 14f, FontStyle.Bold), ForeColor = TextPrimary, Location = new Point(16, 12), AutoSize = true });
        for (int i = 0; i < StepCount; i++)
        {
            _sidebarLabels[i] = new Label { Text = $"  {StepNames[i]}", Font = SidebarFont, ForeColor = TextMuted, Location = new Point(12, 52 + i * 28), Size = new Size(146, 24) };
            _sidebarPanel.Controls.Add(_sidebarLabels[i]);
        }

        _navPanel = new Panel { Dock = DockStyle.Bottom, Height = 56 };
        _btnBack = MakeButton("Back", false, new Point(16, 8));
        _btnBack.Click += (_, _) => ShowStep(_currentStep - 1);
        _btnNext = MakeButton("Next", true, new Point(600, 8));
        _btnNext.Click += OnNextClicked;
        _btnBuild = MakeButton("Create Profile", true, new Point(540, 8));
        _btnBuild.Width = 160; _btnBuild.Visible = false;
        _btnBuild.Click += OnBuildClicked;
        _navPanel.Controls.AddRange(new Control[] { _btnBack, _btnNext, _btnBuild });

        _contentArea = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };

        Controls.Add(_contentArea);
        Controls.Add(_navPanel);
        Controls.Add(_sidebarPanel);

        BuildStepName();
        BuildStepAgents();
        BuildStepEditors();
        BuildStepLanguages();
        BuildStepPlugins();
        BuildStepMcp();
        BuildStepSummary();

        for (int i = 0; i < StepCount; i++)
        {
            _steps[i].Dock = DockStyle.Fill;
            _steps[i].Visible = false;
            _contentArea.Controls.Add(_steps[i]);
        }
    }

    // ─── Step 0: Profile Name ───────────────────────────────────────────

    private void BuildStepName()
    {
        var p = new Panel();
        _steps[0] = p;
        int y = 16;
        AddTitle(p, "Profile Name", ref y);
        AddHint(p, "Lowercase alphanumeric + hyphens, min 2 chars", ref y);
        y += 8;
        _nameBox = new TextBox { Left = 16, Top = y, Width = 300, Font = new Font("Segoe UI", 12f) };
        _nameBox.TextChanged += (_, _) => ValidateName();
        p.Controls.Add(_nameBox);
        _nameError = new Label { Left = 330, Top = y + 4, Width = 300, ForeColor = Color.FromArgb(220, 38, 38), Font = new Font("Segoe UI", 9.5f) };
        p.Controls.Add(_nameError);
        y += 44;
        AddHint(p, "A profile is a Docker image with your chosen agents, languages, and tools. Multiple projects can share the same profile.", ref y);
    }

    // ─── Step 1: AI Agents ──────────────────────────────────────────────

    private void BuildStepAgents()
    {
        var p = new Panel();
        _steps[1] = p;
        int y = 16;
        AddTitle(p, "AI Agents", ref y);
        AddHint(p, "Select the coding agents to install (you can pick multiple)", ref y);
        y += 4;

        _agentList = new CheckedListBox { Left = 16, Top = y, Width = 500, Height = 100, CheckOnClick = true, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10f) };
        foreach (var prop in _agentsDoc.RootElement.EnumerateObject())
        {
            if (prop.Value.ValueKind != JsonValueKind.Object) continue;
            var label = prop.Value.TryGetProperty("label", out var l) ? l.GetString() ?? prop.Name : prop.Name;
            _agentKeys.Add(prop.Name);
            _agentList.Items.Add(label);
        }
        _agentList.SelectedIndexChanged += (_, _) => UpdateAgentInfo();
        p.Controls.Add(_agentList);
        y += 108;

        _agentInfoBox = MakeInfoBox(16, y, CW, 320);
        p.Controls.Add(_agentInfoBox);
        y += 326;

        _agentLink = new LinkLabel { Left = 16, Top = y, AutoSize = true, Font = new Font("Segoe UI", 9.5f), LinkColor = AccentBlue, Text = "" };
        _agentLink.LinkClicked += (_, _) => { try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(_agentLink.Tag?.ToString() ?? "") { UseShellExecute = true }); } catch { } };
        p.Controls.Add(_agentLink);

        if (_agentList.Items.Count > 0) _agentList.SelectedIndex = 0;
    }

    private void UpdateAgentInfo()
    {
        var idx = _agentList.SelectedIndex;
        if (idx < 0 || idx >= _agentKeys.Count) { _agentInfoBox.Clear(); return; }
        var key = _agentKeys[idx];
        if (!_agentsDoc.RootElement.TryGetProperty(key, out var el)) { _agentInfoBox.Clear(); return; }

        var lines = new List<string>();
        var label = el.TryGetProperty("label", out var l) ? l.GetString() ?? key : key;
        lines.Add(label.ToUpperInvariant());
        lines.Add("");
        if (el.TryGetProperty("description", out var desc))
            lines.Add(desc.GetString() ?? "");
        if (el.TryGetProperty("use_cases", out var uc))
        { lines.Add(""); lines.Add(uc.GetString() ?? ""); }
        if (el.TryGetProperty("auth_hint", out var auth))
        { lines.Add(""); lines.Add(auth.GetString() ?? ""); }
        var urlStr = el.TryGetProperty("url", out var url) ? url.GetString() ?? "" : "";

        SetInfoText(_agentInfoBox, string.Join(Environment.NewLine, lines));
        if (lines.Count <= 2)
            SetInfoText(_agentInfoBox, $"{label}\r\n(No details found — agents.json may need re-extraction. Delete %APPDATA%\\AgentSandbox\\.version to force it.)");

        _agentLink.Text = string.IsNullOrEmpty(urlStr) ? "" : $"Open documentation: {urlStr}";
        _agentLink.Tag = urlStr;
    }

    // ─── Step 2: Code Editors ───────────────────────────────────────────

    private void BuildStepEditors()
    {
        var p = new Panel();
        _steps[2] = p;
        int y = 16;
        AddTitle(p, "Code Editors", ref y);
        AddHint(p, "Optional browser-based editor running inside the container", ref y);
        y += 8;

        _chkVsCode = new CheckBox { Text = "Enable VS Code Server (code-server)", Left = 16, Top = y, Width = CW, Font = new Font("Segoe UI", 10f), ForeColor = TextPrimary };
        p.Controls.Add(_chkVsCode);
        y += 32;

        // Build extensions info as a text block
        var extLines = new List<string>();
        extLines.Add("ALWAYS INCLUDED:");
        var foundAlways = false;
        if (_additionsDoc.RootElement.TryGetProperty("vscode-server", out var vsEl) && vsEl.TryGetProperty("extensions", out var extEl) && extEl.TryGetProperty("always", out var alwaysObj))
        {
            var names = new List<string>();
            foreach (var ext in alwaysObj.EnumerateObject())
                names.Add(ext.Value.TryGetProperty("label", out var el2) ? el2.GetString() ?? ext.Name : ext.Name);
            extLines.Add(string.Join(", ", names));
            foundAlways = true;
        }
        if (!foundAlways)
            extLines.Add("Code Spell Checker, Todo Tree, Error Lens, EditorConfig, Prettier");
        extLines.Add("");
        extLines.Add("Language-specific extensions (Python, ESLint, Go, etc.) are added automatically based on your language choices.");

        _extInfoBox = new TextBox { Left = 16, Top = y, Width = CW, Height = 80, Multiline = true, ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = SurfaceLight, Font = new Font("Segoe UI", 9.5f), ForeColor = Color.FromArgb(50, 50, 50), WordWrap = true, Visible = false };
        _extInfoBox.Text = string.Join(Environment.NewLine, extLines);

        // Optional extensions (below the info)
        _extOptLabel = new Label { Text = "Optional extensions:", Left = 16, Top = y + 86, Width = 200, Height = 18, Font = new Font("Segoe UI", 9f, FontStyle.Bold), ForeColor = TextPrimary, Visible = false };
        _optionalExtList = new CheckedListBox { Left = 16, Top = y + 106, Width = 400, CheckOnClick = true, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 9.5f), Visible = false };
        var foundOptional = false;
        if (_additionsDoc.RootElement.TryGetProperty("vscode-server", out var vsEl2) && vsEl2.TryGetProperty("extensions", out var extEl2) && extEl2.TryGetProperty("optional", out var optObj))
        {
            foreach (var ext in optObj.EnumerateObject())
            {
                var extLabel = ext.Value.TryGetProperty("label", out var el3) ? el3.GetString() ?? ext.Name : ext.Name;
                var extDesc = ext.Value.TryGetProperty("description", out var dd) ? $" \u2014 {dd.GetString()}" : "";
                _optionalExtKeys.Add(ext.Name);
                _optionalExtList.Items.Add($"{extLabel}{extDesc}");
                foundOptional = true;
            }
        }
        if (!foundOptional)
        {
            // Fallback if additions.json hasn't been re-extracted yet
            _optionalExtKeys.Add("eamodio.gitlens");
            _optionalExtList.Items.Add("GitLens \u2014 Git blame, history, visual comparisons (~50MB)");
        }
        _optionalExtList.Height = Math.Max(28, _optionalExtList.Items.Count * 22 + 8);
        _optionalExtList.IntegralHeight = false;

        // Rewire visibility — remove initial handler, add new one
        _chkVsCode.CheckedChanged += (_, _) =>
        {
            _extInfoBox.Visible = _chkVsCode.Checked;
            _extOptLabel.Visible = _chkVsCode.Checked;
            _optionalExtList.Visible = _chkVsCode.Checked;
            UpdateEditorInfo();
        };

        p.Controls.Add(_extInfoBox);
        p.Controls.Add(_extOptLabel);
        p.Controls.Add(_optionalExtList);

        var infoTop = y + 170;
        _editorInfoBox = MakeInfoBox(16, infoTop, CW, 220);
        p.Controls.Add(_editorInfoBox);
        UpdateEditorInfo();
    }

    private void UpdateEditorInfo()
    {
        if (!_chkVsCode.Checked)
        {
            SetInfoText(_editorInfoBox, "No Editor Selected\r\nEnable VS Code Server above to get a browser-based editor at http://localhost:4040 alongside your AI agent.");
            return;
        }
        SetInfoText(_editorInfoBox, "VS Code Server\r\nBrowser-based VS Code powered by code-server. Accessible at http://localhost:4040 after container launch (no authentication, localhost only).\r\n\r\nExtensions and settings persist across restarts via Docker volumes. Adds ~300MB to the Docker image.");
    }

    // ─── Step 3: Languages ──────────────────────────────────────────────

    private void BuildStepLanguages()
    {
        var p = new Panel();
        _steps[3] = p;
        int y = 16;
        AddTitle(p, "Languages", ref y);
        AddHint(p, "Node.js is always included. Select additional languages your project needs.", ref y);
        y += 4;

        _langList = new CheckedListBox { Left = 16, Top = y, Width = CW, Height = 200, CheckOnClick = true, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10f) };
        foreach (var kvp in _languages.OrderBy(k => k.Key))
        {
            var locked = kvp.Key == "node" ? " [required]" : "";
            _langKeys.Add(kvp.Key);
            var idx = _langList.Items.Add($"{kvp.Value.Label}{locked}");
            if (kvp.Key == "node") _langList.SetItemChecked(idx, true);
        }
        _langList.ItemCheck += (_, e) => { if (_langKeys[e.Index] == "node" && e.NewValue == CheckState.Unchecked) e.NewValue = CheckState.Checked; };
        _langList.SelectedIndexChanged += (_, _) => { UpdateLangInfo(); UpdateVersionBox(); };
        p.Controls.Add(_langList);
        y += 208;

        _versionLabel = new Label { Text = "Version override:", Left = 16, Top = y, Width = 130, Font = new Font("Segoe UI", 9f), ForeColor = TextMuted, Visible = false };
        p.Controls.Add(_versionLabel);
        _versionBox = new TextBox { Left = 150, Top = y - 2, Width = 100, Font = new Font("Segoe UI", 10f), Visible = false };
        _versionBox.Leave += (_, _) => SaveVersionOverride();
        p.Controls.Add(_versionBox);
        y += 28;

        _langInfoBox = MakeInfoBox(16, y, CW, 200);
        p.Controls.Add(_langInfoBox);

        if (_langList.Items.Count > 0) _langList.SelectedIndex = 0;
    }

    private void UpdateLangInfo()
    {
        var idx = _langList.SelectedIndex;
        if (idx < 0 || idx >= _langKeys.Count) { _langInfoBox.Clear(); return; }
        var key = _langKeys[idx];
        var lines = new List<string>();

        if (_languages.TryGetValue(key, out var config))
        {
            lines.Add(config.Label.ToUpperInvariant());
            lines.Add($"Default version: {config.DefaultVersion}");
        }
        if (_langDoc?.RootElement.TryGetProperty(key, out var langEl) == true)
        {
            if (langEl.TryGetProperty("size_warning", out var sw))
                lines.Add($"Size: {sw.GetString()}");
            if (langEl.TryGetProperty("detect", out var detectArr))
                lines.Add($"Detection files: {string.Join(", ", detectArr.EnumerateArray().Select(e => e.GetString()))}");
        }
        if (_chkVsCode.Checked && _additionsDoc.RootElement.TryGetProperty("vscode-server", out var vsEl) && vsEl.TryGetProperty("extensions", out var extEl) && extEl.TryGetProperty("languages", out var langExts) && langExts.TryGetProperty(key, out var exts))
        {
            lines.Add(""); lines.Add("VS Code extensions (auto-installed):");
            foreach (var ext in exts.EnumerateArray())
            {
                var elabel = ext.TryGetProperty("label", out var ll) ? ll.GetString() : "";
                var edesc = ext.TryGetProperty("description", out var dd) ? dd.GetString() : "";
                lines.Add($"  \u2022 {elabel} \u2014 {edesc}");
            }
        }
        SetInfoText(_langInfoBox, string.Join(Environment.NewLine, lines));
    }

    private void UpdateVersionBox()
    {
        var idx = _langList.SelectedIndex;
        if (idx < 0 || idx >= _langKeys.Count) { _versionLabel.Visible = false; _versionBox.Visible = false; return; }
        _versionLabel.Visible = true; _versionBox.Visible = true;
        _versionBox.Text = _versionOverrides.GetValueOrDefault(_langKeys[idx], "");
    }

    private void SaveVersionOverride()
    {
        var idx = _langList.SelectedIndex;
        if (idx < 0 || idx >= _langKeys.Count) return;
        var ver = _versionBox.Text.Trim();
        if (string.IsNullOrEmpty(ver)) _versionOverrides.Remove(_langKeys[idx]);
        else _versionOverrides[_langKeys[idx]] = ver;
    }

    // ─── Step 4: Plugins ────────────────────────────────────────────────

    private void BuildStepPlugins()
    {
        var p = new Panel();
        _steps[4] = p;
        int y = 16;
        AddTitle(p, "Plugins", ref y);
        AddHint(p, "Agent plugins and custom npm packages", ref y);
        y += 4;

        _pluginList = new CheckedListBox { Left = 16, Top = y, Width = CW, Height = 140, CheckOnClick = true, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10f) };
        // Populated dynamically in RefreshPluginList
        _pluginList.SelectedIndexChanged += (_, _) => UpdatePluginInfo();
        p.Controls.Add(_pluginList);
        y += 148;

        var btnDiscover = new Button { Text = "Discover online plugins...", Left = 16, Top = y, Width = 220, Height = 30, Font = new Font("Segoe UI", 9f), FlatStyle = FlatStyle.Flat, ForeColor = AccentBlue, Cursor = Cursors.Hand };
        btnDiscover.FlatAppearance.BorderColor = AccentBlue;
        btnDiscover.Click += OnDiscoverPluginsClicked;
        p.Controls.Add(btnDiscover);

        var lblCustom = new Label { Text = "Additional npm packages:", Left = 260, Top = y + 4, Width = 180, Font = new Font("Segoe UI", 9f), ForeColor = TextMuted };
        p.Controls.Add(lblCustom);
        _txtCustomPlugins = new TextBox { Left = 448, Top = y, Width = CW - 448 + 16, Height = 28, Font = new Font("Segoe UI", 10f) };
        p.Controls.Add(_txtCustomPlugins);
        y += 38;

        _pluginInfoBox = MakeInfoBox(16, y, CW, 210);
        p.Controls.Add(_pluginInfoBox);
        y += 216;

        _pluginLink = new LinkLabel { Left = 16, Top = y, AutoSize = true, Font = new Font("Segoe UI", 9.5f), LinkColor = AccentBlue, Text = "" };
        _pluginLink.LinkClicked += (_, _) => { try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(_pluginLink.Tag?.ToString() ?? "") { UseShellExecute = true }); } catch { } };
        p.Controls.Add(_pluginLink);
    }

    private void RefreshPluginList()
    {
        var selectedAgents = GetCheckedKeys(_agentList, _agentKeys);
        var checkedPlugins = new HashSet<string>();
        for (int i = 0; i < _pluginList.Items.Count && i < _pluginKeys.Count; i++)
            if (_pluginList.GetItemChecked(i)) checkedPlugins.Add(_pluginKeys[i]);

        _pluginList.Items.Clear();
        _pluginKeys.Clear();

        foreach (var prop in _pluginsDoc.RootElement.EnumerateObject())
        {
            if (prop.Value.ValueKind != JsonValueKind.Object) continue;
            var agent = prop.Value.TryGetProperty("agent", out var a) ? a.GetString() ?? "" : "";
            if (!string.IsNullOrEmpty(agent) && !selectedAgents.Contains(agent)) continue;
            _pluginKeys.Add(prop.Name);
            var agentLabel = !string.IsNullOrEmpty(agent) ? $"[{agent}] " : "";
            var idx = _pluginList.Items.Add($"{agentLabel}{prop.Name}");
            if (checkedPlugins.Contains(prop.Name)) _pluginList.SetItemChecked(idx, true);
        }
        _registryPluginCount = _pluginKeys.Count;
        if (_pluginList.Items.Count > 0) _pluginList.SelectedIndex = 0;
    }

    private void UpdatePluginInfo()
    {
        var idx = _pluginList.SelectedIndex;
        if (idx < 0 || idx >= _pluginKeys.Count) { _pluginInfoBox.Clear(); _pluginLink.Text = ""; return; }
        var key = _pluginKeys[idx];
        var lines = new List<string>();

        if (idx >= _registryPluginCount)
        {
            lines.Add(key.ToUpperInvariant());
            if (_discoveredPluginInfo.TryGetValue(key, out var dp))
            {
                lines.Add(""); lines.Add(dp.Description);
                if (dp.Type == "skill")
                {
                    lines.Add(""); lines.Add("Type: Claude Code Skill (SKILL.md)");
                    lines.Add("Install: claude skill install anthropics/skills --skill " + key);
                    _pluginLink.Text = $"View on GitHub: https://github.com/anthropics/skills/tree/main/skills/{key}";
                    _pluginLink.Tag = $"https://github.com/anthropics/skills/tree/main/skills/{key}";
                }
                else
                {
                    if (dp.WeeklyDownloads > 0)
                    {
                        var dlLabel = dp.WeeklyDownloads >= 1000 ? $"{dp.WeeklyDownloads / 1000}k downloads/week" : $"{dp.WeeklyDownloads} downloads/week";
                        lines.Add(""); lines.Add(dlLabel);
                    }
                    lines.Add(""); lines.Add("Type: npm package");
                    lines.Add($"Install: npm install -g {key}");
                    _pluginLink.Text = $"Open on npm: https://www.npmjs.com/package/{key}";
                    _pluginLink.Tag = $"https://www.npmjs.com/package/{key}";
                }
            }
            SetInfoText(_pluginInfoBox, string.Join(Environment.NewLine, lines));
            return;
        }

        if (!_pluginsDoc.RootElement.TryGetProperty(key, out var el)) { _pluginInfoBox.Clear(); _pluginLink.Text = ""; return; }
        lines.Add(key.ToUpperInvariant());
        if (el.TryGetProperty("description", out var d)) { lines.Add(""); lines.Add(d.GetString() ?? ""); }
        if (el.TryGetProperty("agent", out var ag)) { lines.Add(""); lines.Add($"Agent: {ag.GetString()}"); }
        SetInfoText(_pluginInfoBox, string.Join(Environment.NewLine, lines));

        var urlStr = el.TryGetProperty("url", out var url) ? url.GetString() ?? "" : "";
        _pluginLink.Text = string.IsNullOrEmpty(urlStr) ? "" : $"Open project page: {urlStr}";
        _pluginLink.Tag = urlStr;
    }

    private async void OnDiscoverPluginsClicked(object? sender, EventArgs e)
    {
        var selectedAgents = GetCheckedKeys(_agentList, _agentKeys);
        if (selectedAgents.Count == 0) { MessageBox.Show("Select agents first (step 1).", "Discovery", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }

        if (sender is Button btn) btn.Enabled = false;
        SetInfoText(_pluginInfoBox, "Searching...\r\nFetching from npm registry...");

        Dictionary<string, List<DiscoveredPlugin>>? results = null;
        string? error = null;
        try { results = await Task.Run(() => PluginDiscovery.FetchForAgents(selectedAgents).Result); }
        catch (Exception ex)
        {
            // Show full stack trace for debugging
            var inner = ex.InnerException ?? ex;
            error = $"{inner.GetType().Name}: {inner.Message}\r\n\r\nStack trace:\r\n{inner.StackTrace}";
        }

        if (error != null)
        {
            SetInfoText(_pluginInfoBox, $"Discovery Failed\r\n{error}");
        }
        else if (results == null || results.Count == 0)
        {
            SetInfoText(_pluginInfoBox, "No Results\r\nNo plugins found. This may be a network issue.");
        }
        else
        {
            var added = 0;
            foreach (var (agent, plugins) in results)
                foreach (var plugin in plugins)
                {
                    if (_pluginKeys.Contains(plugin.Name)) continue;
                    _discoveredPluginInfo[plugin.Name] = plugin;
                    string label;
                    if (plugin.Type == "skill")
                        label = $"[{agent} skill] {plugin.Name}";
                    else
                    {
                        var dlLabel = plugin.WeeklyDownloads >= 1000 ? $"{plugin.WeeklyDownloads / 1000}k/wk" : $"{plugin.WeeklyDownloads}/wk";
                        label = $"[{agent}] {plugin.Name}  ({dlLabel})";
                    }
                    _pluginKeys.Add(plugin.Name);
                    _pluginList.Items.Add(label);
                    added++;
                }
            SetInfoText(_pluginInfoBox, $"Discovery Complete\r\nAdded {added} item(s). Plugins are installed via npm. Skills are SKILL.md files installed via 'claude skill install'.");
        }
        if (sender is Button b) b.Enabled = true;
    }

    // ─── Step 5: MCP Servers ────────────────────────────────────────────

    private void BuildStepMcp()
    {
        var p = new Panel();
        _steps[5] = p;
        int y = 16;
        AddTitle(p, "MCP Servers", ref y);
        AddHint(p, "Advanced \u2014 skip this step if you're unsure. Most users don't need MCP servers.", ref y);
        y += 4;

        _mcpList = new CheckedListBox { Left = 16, Top = y, Width = CW, Height = 140, CheckOnClick = true, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10f) };
        foreach (var prop in _mcpDoc.RootElement.EnumerateObject())
        {
            if (prop.Value.ValueKind != JsonValueKind.Object) continue;
            _mcpKeys.Add(prop.Name);
            _mcpList.Items.Add(prop.Name);
        }
        _mcpList.SelectedIndexChanged += (_, _) => UpdateMcpInfo();
        p.Controls.Add(_mcpList);
        y += 148;

        _mcpInfoBox = MakeInfoBox(16, y, CW, 280);
        p.Controls.Add(_mcpInfoBox);

        if (_mcpList.Items.Count > 0) _mcpList.SelectedIndex = 0;
    }

    private void UpdateMcpInfo()
    {
        var idx = _mcpList.SelectedIndex;
        if (idx < 0 || idx >= _mcpKeys.Count) { _mcpInfoBox.Clear(); return; }
        var key = _mcpKeys[idx];
        if (!_mcpDoc.RootElement.TryGetProperty(key, out var el)) { _mcpInfoBox.Clear(); return; }
        var lines = new List<string> { key.ToUpperInvariant() };
        if (el.TryGetProperty("description", out var d)) { lines.Add(""); lines.Add(d.GetString() ?? ""); }
        if (el.TryGetProperty("compatible_agents", out var agents))
        { lines.Add(""); lines.Add($"Works with: {string.Join(", ", agents.EnumerateArray().Select(a => a.GetString()))}"); }
        if (el.TryGetProperty("env_vars", out var evArr))
        {
            var envs = evArr.EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s != "").ToList();
            if (envs.Count > 0) { lines.Add($"Requires: {string.Join(", ", envs)} (set in user.env)"); }
        }
        if (el.TryGetProperty("url", out var url)) { lines.Add(""); lines.Add(url.GetString() ?? ""); }
        SetInfoText(_mcpInfoBox, string.Join(Environment.NewLine, lines));
    }

    // ─── Step 6: Summary / Build ────────────────────────────────────────

    private void BuildStepSummary()
    {
        var p = new Panel();
        _steps[6] = p;
        int y = 16;
        AddTitle(p, "Summary", ref y);
        y += 4;
        _summaryLabel = new Label { Left = 16, Top = y, Width = CW, Height = 200, Font = new Font("Segoe UI", 10f), ForeColor = TextPrimary };
        p.Controls.Add(_summaryLabel);

        _logBox = new TextBox { Left = 16, Top = y + 210, Width = CW, Height = 280, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, BackColor = Color.FromArgb(24, 24, 27), ForeColor = Color.FromArgb(74, 222, 128), Font = new Font("Consolas", 9.5f), Visible = false };
        p.Controls.Add(_logBox);
    }

    private void UpdateSummary()
    {
        var lines = new List<string> { $"Profile: {_nameBox.Text.Trim()}", "" };
        lines.Add($"Agents: {string.Join(", ", GetCheckedKeys(_agentList, _agentKeys))}");
        if (_chkVsCode.Checked) lines.Add("Editor: VS Code Server");
        lines.Add($"Languages: {string.Join(", ", GetCheckedKeys(_langList, _langKeys))}");
        var plugins = GetCheckedKeys(_pluginList, _pluginKeys);
        if (plugins.Count > 0) lines.Add($"Plugins: {string.Join(", ", plugins)}");
        var custom = _txtCustomPlugins.Text.Trim();
        if (!string.IsNullOrEmpty(custom)) lines.Add($"Custom npm: {custom}");
        var mcp = GetCheckedKeys(_mcpList, _mcpKeys);
        if (mcp.Count > 0) lines.Add($"MCP: {string.Join(", ", mcp)}");

        var ports = new HashSet<int>();
        if (_portConfigs.TryGetValue("base", out var bc)) foreach (var pp in bc.Ports) ports.Add(pp);
        foreach (var lang in GetCheckedKeys(_langList, _langKeys))
            if (_portConfigs.TryGetValue(lang, out var lc)) foreach (var pp in lc.Default) ports.Add(pp);
        if (_chkVsCode.Checked)
        {
            if (_additionsDoc.RootElement.TryGetProperty("vscode-server", out var vs) && vs.TryGetProperty("port", out var pe) && pe.TryGetInt32(out var vp))
                ports.Add(vp);
            else
                ports.Add(4040); // fallback if additions.json not yet re-extracted
        }
        lines.Add($"\nPorts: {string.Join(", ", ports.OrderBy(pp => pp))}");
        _summaryLabel.Text = string.Join("\n", lines);
    }

    // ─── Navigation ─────────────────────────────────────────────────────

    private void ShowStep(int step)
    {
        if (step < 0 || step >= StepCount) return;
        _currentStep = step;
        for (int i = 0; i < StepCount; i++) _steps[i].Visible = i == step;
        _btnBack.Visible = step > 0;
        _btnNext.Visible = step < StepCount - 1;
        _btnBuild.Visible = step == StepCount - 1;

        for (int i = 0; i < StepCount; i++)
        {
            _sidebarLabels[i].ForeColor = i == step ? AccentBlue : i < step ? TextPrimary : TextMuted;
            _sidebarLabels[i].Font = i == step ? SidebarBoldFont : SidebarFont;
        }

        switch (step)
        {
            case 1: UpdateAgentInfo(); break;
            case 2: UpdateEditorInfo(); break;
            case 3: UpdateLangInfo(); UpdateVersionBox(); break;
            case 4: RefreshPluginList(); break;
            case 5: UpdateMcpInfo(); break;
            case 6: UpdateSummary(); break;
        }
    }

    private void OnNextClicked(object? sender, EventArgs e)
    {
        if (!ValidateCurrentStep()) return;
        ShowStep(_currentStep + 1);
    }

    private bool ValidateCurrentStep() => _currentStep switch
    {
        0 => ValidateNameCheck(),
        1 => GetCheckedKeys(_agentList, _agentKeys).Count > 0 || ShowWarn("Select at least one agent."),
        _ => true
    };

    private bool ValidateNameCheck()
    {
        ValidateName();
        if (!string.IsNullOrEmpty(_nameError.Text) || string.IsNullOrEmpty(_nameBox.Text.Trim()))
            return ShowWarn("Please fix the profile name.");
        return true;
    }

    private static bool ShowWarn(string msg) { MessageBox.Show(msg, "Validation", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false; }

    // ─── Build ──────────────────────────────────────────────────────────

    private async void OnBuildClicked(object? sender, EventArgs e)
    {
        if (!ValidateCurrentStep()) return;
        if (!DockerRunner.IsDockerAvailable()) { MessageBox.Show("Docker is not running.", "Docker Required", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

        var name = _nameBox.Text.Trim();
        var selectedAgents = GetCheckedKeys(_agentList, _agentKeys);
        var selectedLangs = GetCheckedKeys(_langList, _langKeys);
        if (!selectedLangs.Contains("node")) selectedLangs.Insert(0, "node");
        var selectedMcp = GetCheckedKeys(_mcpList, _mcpKeys);

        var selectedPlugins = new List<string>();
        var discoveredNpmPlugins = new List<string>();
        var discoveredSkills = new List<string>();
        for (int i = 0; i < _pluginList.Items.Count; i++)
        {
            if (!_pluginList.GetItemChecked(i)) continue;
            if (i < _registryPluginCount)
            {
                selectedPlugins.Add(_pluginKeys[i]);
            }
            else
            {
                var key = _pluginKeys[i];
                if (_discoveredPluginInfo.TryGetValue(key, out var dp) && dp.Type == "skill")
                    discoveredSkills.Add(key);
                else
                    discoveredNpmPlugins.Add(key);
            }
        }

        var selectedAdditions = new List<string>();
        if (_chkVsCode.Checked) selectedAdditions.Add("vscode-server");
        var selectedVscodeExts = GetCheckedKeys(_optionalExtList, _optionalExtKeys);

        var customPlugins = _txtCustomPlugins.Text.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
        customPlugins.AddRange(discoveredNpmPlugins);

        var ports = new HashSet<int>();
        if (_portConfigs.TryGetValue("base", out var bc)) foreach (var pp in bc.Ports) ports.Add(pp);
        foreach (var lang in selectedLangs) if (_portConfigs.TryGetValue(lang, out var lc)) foreach (var pp in lc.Default) ports.Add(pp);
        foreach (var add in selectedAdditions)
        {
            if (_additionsDoc.RootElement.TryGetProperty(add, out var ae) && ae.TryGetProperty("port", out var pe2) && pe2.TryGetInt32(out var ap))
                ports.Add(ap);
            else if (add == "vscode-server")
                ports.Add(4040);
        }

        SaveVersionOverride();
        var spec = new ProfileSpec
        {
            Name = name,
            Languages = selectedLangs,
            Versions = new Dictionary<string, string>(_versionOverrides),
            Ports = ports.OrderBy(pp => pp).ToList(),
            Agents = selectedAgents,
            Plugins = selectedPlugins,
            Additions = selectedAdditions,
            VscodeExtensions = selectedVscodeExts,
            McpServers = selectedMcp,
            Skills = discoveredSkills,
            CustomPlugins = customPlugins
        };

        _btnBuild.Enabled = false; _btnBack.Enabled = false; _logBox.Visible = true;
        void Log(string msg) { if (InvokeRequired) Invoke(() => Log(msg)); else { _logBox.AppendText(msg + Environment.NewLine); _logBox.SelectionStart = _logBox.TextLength; _logBox.ScrollToCaret(); } }

        try
        {
            await Task.Run(() =>
            {
                Log($"[setup] Generating profile '{name}'...");
                ProfileGenerator.Generate(spec, _languages);
                var profileDir = Path.Combine(ResourceManager.PreparedDir, name);
                var manifest = System.Text.Json.JsonSerializer.Serialize(new
                {
                    name,
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
                    created = DateTime.Now.ToString("O")
                }, new JsonSerializerOptions { WriteIndented = true });
                ResourceManager.WriteLf(Path.Combine(profileDir, "profile.json"), manifest);

                var dfPath = Path.Combine(profileDir, "Dockerfile.base");
                if (File.Exists(dfPath))
                {
                    var extraLines = new List<string>();
                    foreach (var p in spec.CustomPlugins)
                        extraLines.Add($"RUN npm install -g {p}");
                    foreach (var s in spec.Skills)
                        extraLines.Add($"RUN claude skill install anthropics/skills --skill {s} || true");
                    if (extraLines.Count > 0)
                    {
                        var df = File.ReadAllText(dfPath);
                        df = df.Replace("ENTRYPOINT", string.Join("\n", extraLines) + "\n\nENTRYPOINT");
                        ResourceManager.WriteLf(dfPath, df);
                    }
                }

                Log("[setup] Building Docker image...");
                var tag = $"agent-sandbox-{name}:latest";
                var dfFilePath = Path.Combine(profileDir, "Dockerfile.base");
                var exitCode = DockerRunner.Build(dfFilePath, tag, profileDir, Log);
                if (exitCode != 0) { Log("[setup] Build failed."); try { Directory.Delete(profileDir, true); } catch { } return; }
                Log($"[setup] Profile '{name}' ready.");
            });

            CreatedProfile = spec;
            Invoke(() =>
            {
                _btnBuild.Visible = false;
                var doneBtn = MakeButton("Done", true, new Point(600, 8));
                doneBtn.Click += (_, _) => { DialogResult = DialogResult.OK; Close(); };
                _navPanel.Controls.Add(doneBtn);
            });
        }
        catch (Exception ex) { Log($"[setup] Error: {ex.Message}"); _btnBack.Enabled = true; }
    }

    // ─── Validation ─────────────────────────────────────────────────────

    private void ValidateName()
    {
        var n = _nameBox.Text.Trim();
        if (string.IsNullOrEmpty(n)) { _nameError.Text = ""; return; }
        if (n.Length < 2) { _nameError.Text = "Min 2 chars"; return; }
        if (n.Length > 50) { _nameError.Text = "Max 50 chars"; return; }
        if (!System.Text.RegularExpressions.Regex.IsMatch(n, @"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")) { _nameError.Text = "Lowercase + hyphens only"; return; }
        if (n.Contains("--")) { _nameError.Text = "No consecutive hyphens"; return; }
        if (new[] { "sandbox-setup", "sandbox-me", "sandbox", "help", "version", "list", "update", "setup" }.Contains(n)) { _nameError.Text = "Reserved name"; return; }
        if (Directory.Exists(Path.Combine(ResourceManager.PreparedDir, n))) { _nameError.Text = "Already exists"; return; }
        _nameError.Text = "";
    }

    // ─── UI helpers ─────────────────────────────────────────────────────

    private static void AddTitle(Panel p, string text, ref int y)
    {
        p.Controls.Add(new Label { Text = text, Left = 16, Top = y, AutoSize = true, Font = new Font("Segoe UI", 14f, FontStyle.Bold), ForeColor = TextPrimary });
        y += 32;
    }

    private static void AddHint(Panel p, string text, ref int y)
    {
        p.Controls.Add(new Label { Text = text, Left = 16, Top = y, AutoSize = true, MaximumSize = new Size(CW, 0), Font = new Font("Segoe UI", 9f), ForeColor = TextMuted });
        y += 20;
    }

    private static void AddSmallLabel(Panel p, string text, ref int y, bool bold = false, bool muted = false)
    {
        var font = bold ? new Font("Segoe UI", 9f, FontStyle.Bold) : new Font("Segoe UI", 9f);
        var lbl = new Label { Text = text, Left = 0, Top = y, Font = font, ForeColor = muted ? TextMuted : TextPrimary, AutoSize = true, MaximumSize = new Size(CW, 0) };
        p.Controls.Add(lbl);
        y += lbl.Height + 2;
    }

    private static RichTextBox MakeInfoBox(int left, int top, int width, int height) => new()
    {
        Left = left, Top = top, Width = width, Height = height,
        ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = SurfaceLight,
        Font = new Font("Segoe UI", 10f), ForeColor = Color.FromArgb(50, 50, 50),
        ScrollBars = RichTextBoxScrollBars.Vertical, DetectUrls = false
    };

    /// <summary>Set info box text with the first line rendered bold as a title.</summary>
    private static void SetInfoText(RichTextBox box, string text)
    {
        box.Clear();
        box.Text = text;
        // Bold the first line
        var firstNewline = text.IndexOf('\n');
        if (firstNewline > 0)
        {
            box.Select(0, firstNewline);
            box.SelectionFont = new Font("Segoe UI", 11f, FontStyle.Bold);
            box.SelectionColor = Color.FromArgb(24, 24, 27);
        }
        box.Select(0, 0);
    }

    private static Button MakeButton(string text, bool filled, Point location)
    {
        var btn = new Button { Text = text, Width = 120, Height = 38, Location = location, Font = new Font("Segoe UI", 10f, FontStyle.Bold), Cursor = Cursors.Hand, FlatStyle = FlatStyle.Flat };
        if (filled) { btn.BackColor = AccentBlue; btn.ForeColor = Color.White; btn.FlatAppearance.BorderColor = AccentBlue; btn.FlatAppearance.MouseOverBackColor = ControlPaint.Light(AccentBlue, 0.15f); }
        else { btn.ForeColor = TextMuted; btn.FlatAppearance.BorderColor = Color.FromArgb(228, 228, 231); btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(244, 244, 245); }
        return btn;
    }

    private static List<string> GetCheckedKeys(CheckedListBox clb, List<string> keys)
    {
        var result = new List<string>();
        for (int i = 0; i < clb.Items.Count; i++) if (clb.GetItemChecked(i)) result.Add(keys[i]);
        return result;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _agentsDoc.Dispose(); _pluginsDoc.Dispose(); _additionsDoc.Dispose(); _mcpDoc.Dispose(); _langDoc?.Dispose(); }
        base.Dispose(disposing);
    }
}
