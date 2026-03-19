using System.Diagnostics;
using System.Text.Json;
using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox.UI;

public sealed class WizardForm : Form
{
    private static readonly Color AccentBlue = Color.FromArgb(0, 120, 212);
    private static readonly Color TextPrimary = Color.FromArgb(24, 24, 27);
    private static readonly Color TextMuted = Color.FromArgb(113, 113, 122);
    private static readonly Color SurfaceLight = Color.FromArgb(250, 250, 250);
    private static readonly Color DangerRed = Color.FromArgb(220, 38, 38);

    private readonly Dictionary<string, LanguageConfig> _languages;
    private readonly Dictionary<string, PortConfig> _portConfigs;

    // Step panels
    private Panel _stepProfiles = null!;
    private Panel _stepLaunch = null!;

    // Step 0: Profile Management
    private ListView _lstProfiles = null!;
    private Button _btnCreateProfile = null!;
    private Button _btnDeleteProfile = null!;
    private Button _btnContinueToProject = null!;
    private Label _lblNoProfiles = null!;

    // Step 1: Project Selection + Launch
    private TextBox _txtPath = null!;
    private Button _btnBrowse = null!;
    private Label _lblRecent = null!;
    private ListView _lstRecent = null!;
    private ComboBox _cboProfile = null!;
    private Panel _pluginPanel = null!;
    private Label _lblPlugins = null!;
    private Label _lblProfileInfo = null!;
    private LinkLabel _lnkVsCode = null!;
    private Label _lblAgent = null!;
    private ComboBox _cboAgent = null!;
    private readonly List<string> _profileAgentKeys = new();
    private readonly List<Control> _launchTempControls = new();
    private bool _profileHasVsCode;
    private int _vsCodePort = 4040;
    private readonly List<CheckBox> _pluginChecks = new();
    private readonly List<string> _pluginKeys = new();
    private Button _btnLaunch = null!;
    private Button _btnBackToProfiles = null!;
    private Button _btnEditUserEnv = null!;
    // Settings removed — agent selection is on launch step, API keys in user.env
    private TextBox _txtLog = null!;
    private Button _btnBackOverview = null!;
    private Button _btnClose = null!;

    public WizardForm()
    {
        _languages = ConfigLoader.LoadLanguages();
        _portConfigs = ConfigLoader.LoadPorts();

        Text = "Agent Sandbox";
        Size = new Size(720, 700);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        Font = new Font("Segoe UI", 10f);
        BackColor = Color.White;
        try
        {
            var ico = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (ico != null) Icon = ico;
        }
        catch { /* ignore if icon missing */ }

        BuildStepProfiles();
        BuildStepLaunch();

        var hasProfiles = Directory.Exists(ResourceManager.PreparedDir)
            && Directory.GetDirectories(ResourceManager.PreparedDir).Length > 0;
        ShowStep(hasProfiles ? 1 : 0);
    }

    public void SetInitialPath(string path)
    {
        _txtPath.Text = path;
        ShowStep(1);
    }

    // ─── Step 0: Profile Management ────────────────────────────────────

    private void BuildStepProfiles()
    {
        _stepProfiles = new Panel { Dock = DockStyle.Fill, Visible = false };

        // Header area
        var headerPanel = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(720, 80),
            BackColor = SurfaceLight
        };
        var title = new Label
        {
            Text = "Agent Sandbox",
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 16),
            AutoSize = true
        };
        var subtitle = new Label
        {
            Text = "Manage your sandbox profiles",
            Font = new Font("Segoe UI", 10f),
            ForeColor = TextMuted,
            Location = new Point(32, 50),
            AutoSize = true
        };
        headerPanel.Controls.AddRange([title, subtitle]);

        _btnCreateProfile = new Button
        {
            Text = "+ New Profile",
            Location = new Point(32, 96),
            Size = new Size(160, 44),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnCreateProfile, AccentBlue, Color.White);
        _btnCreateProfile.Click += OnCreateProfileClicked;

        _lstProfiles = new ListView
        {
            Location = new Point(32, 152),
            Size = new Size(640, 340),
            View = View.Details,
            FullRowSelect = true,
            GridLines = false,
            MultiSelect = false,
            BorderStyle = BorderStyle.FixedSingle
        };
        _lstProfiles.Columns.Add("Name", 170);
        _lstProfiles.Columns.Add("Agents", 190);
        _lstProfiles.Columns.Add("Languages", 170);
        _lstProfiles.Columns.Add("Image Size", 100);

        _lblNoProfiles = new Label
        {
            Text = "No profiles yet — click \"+ New Profile\" to get started.",
            ForeColor = TextMuted,
            Font = new Font("Segoe UI", 10f, FontStyle.Italic),
            Location = new Point(32, 300),
            Size = new Size(640, 40),
            TextAlign = ContentAlignment.MiddleCenter,
            Visible = false
        };

        _btnDeleteProfile = new Button
        {
            Text = "Delete",
            Location = new Point(32, 504),
            Size = new Size(104, 44)
        };
        StyleFlatButton(_btnDeleteProfile, DangerRed);
        _btnDeleteProfile.Click += OnDeleteProfileClicked;

        var btnRebuildProfile = new Button
        {
            Text = "Rebuild Image",
            Location = new Point(152, 504),
            Size = new Size(136, 44)
        };
        StyleFlatButton(btnRebuildProfile, TextPrimary);
        btnRebuildProfile.Click += OnRebuildProfileClicked;

        var btnExportProfile = new Button
        {
            Text = "Export",
            Location = new Point(304, 504),
            Size = new Size(96, 44)
        };
        StyleFlatButton(btnExportProfile, TextPrimary);
        btnExportProfile.Click += OnExportProfileClicked;

        var btnImportProfile = new Button
        {
            Text = "Import",
            Location = new Point(408, 504),
            Size = new Size(96, 44)
        };
        StyleFlatButton(btnImportProfile, TextPrimary);
        btnImportProfile.Click += OnImportProfileClicked;

        _btnContinueToProject = new Button
        {
            Text = "Continue \u2192",
            Location = new Point(520, 504),
            Size = new Size(152, 44),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnContinueToProject, AccentBlue, Color.White);
        _btnContinueToProject.Click += (_, _) =>
        {
            RefreshProfileDropdown();
            RefreshRecentProjects();
            ShowStep(1);
        };

        _stepProfiles.Controls.AddRange([headerPanel, _btnCreateProfile, _lstProfiles,
            _lblNoProfiles, _btnDeleteProfile, btnRebuildProfile, btnExportProfile, btnImportProfile, _btnContinueToProject]);
        Controls.Add(_stepProfiles);

        RefreshProfileList();
    }

    private void OnCreateProfileClicked(object? sender, EventArgs e)
    {
        using var setupForm = new SetupForm(_languages, _portConfigs);
        if (setupForm.ShowDialog(this) == DialogResult.OK)
        {
            RefreshProfileList();
        }
    }

    private void OnDeleteProfileClicked(object? sender, EventArgs e)
    {
        if (_lstProfiles.SelectedItems.Count == 0)
        {
            MessageBox.Show("Select a profile to delete.", "Delete Profile",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var name = _lstProfiles.SelectedItems[0].Text;
        var result = MessageBox.Show(
            $"Delete profile '{name}'?\nThis will remove the profile directory and its Docker image.",
            "Confirm Delete", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

        if (result != DialogResult.Yes) return;

        try
        {
            var profileDir = Path.Combine(ResourceManager.PreparedDir, name);
            if (Directory.Exists(profileDir))
                Directory.Delete(profileDir, true);

            DockerRunner.RemoveImage($"agent-sandbox-{name}:latest");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error deleting profile: {ex.Message}", "Error",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        RefreshProfileList();
    }

    private async void OnRebuildProfileClicked(object? sender, EventArgs e)
    {
        if (_lstProfiles.SelectedItems.Count == 0)
        {
            MessageBox.Show("Select a profile to rebuild.", "Rebuild Image",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var name = _lstProfiles.SelectedItems[0].Text;
        var profileDir = Path.Combine(ResourceManager.PreparedDir, name);
        var dockerfilePath = Path.Combine(profileDir, "Dockerfile.base");

        if (!File.Exists(dockerfilePath))
        {
            MessageBox.Show($"Profile '{name}' is missing Dockerfile.base. Delete and recreate it.",
                "Rebuild Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var confirm = MessageBox.Show(
            $"Rebuild Docker image for '{name}' from scratch (no cache)?\n\nThis may take several minutes.",
            "Rebuild Image", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (confirm != DialogResult.Yes) return;

        var tag = $"agent-sandbox-{name}:latest";
        _btnCreateProfile.Enabled = false;
        _btnDeleteProfile.Enabled = false;
        _btnContinueToProject.Enabled = false;
        _lstProfiles.Enabled = false;

        var success = false;
        await Task.Run(() =>
        {
            // Regenerate profile files from profile.json before rebuilding
            // This ensures install.sh, Dockerfile.base, etc. reflect current templates
            try
            {
                ProfileGenerator.RegenerateProfile(name, _languages, _portConfigs);
            }
            catch { /* best effort — rebuild with existing files */ }

            success = DockerRunner.Build(
                Path.Combine(profileDir, "Dockerfile.base"), tag, profileDir, noCache: true) == 0;
        });

        _btnCreateProfile.Enabled = true;
        _btnDeleteProfile.Enabled = true;
        _btnContinueToProject.Enabled = true;
        _lstProfiles.Enabled = true;

        MessageBox.Show(
            success ? $"Image '{tag}' rebuilt successfully." : $"Image rebuild failed. Check Docker output.",
            "Rebuild Image", MessageBoxButtons.OK,
            success ? MessageBoxIcon.Information : MessageBoxIcon.Error);

        RefreshProfileList();
    }

    private void OnExportProfileClicked(object? sender, EventArgs e)
    {
        if (_lstProfiles.SelectedItems.Count == 0)
        {
            MessageBox.Show("Select a profile to export.", "Export Profile",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var name = _lstProfiles.SelectedItems[0].Text;
        using var sfd = new SaveFileDialog
        {
            FileName = $"{name}.json",
            Filter = "JSON files (*.json)|*.json",
            Title = "Export Profile"
        };

        if (sfd.ShowDialog() != DialogResult.OK) return;

        try
        {
            var json = ProfileImportExport.Export(name);
            File.WriteAllText(sfd.FileName, json);
            MessageBox.Show($"Profile '{name}' exported to:\n{sfd.FileName}", "Export Complete",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Export failed: {ex.Message}", "Error",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async void OnImportProfileClicked(object? sender, EventArgs e)
    {
        using var ofd = new OpenFileDialog
        {
            Filter = "JSON files (*.json)|*.json",
            Title = "Import Profile"
        };

        if (ofd.ShowDialog() != DialogResult.OK) return;

        try
        {
            var json = File.ReadAllText(ofd.FileName);
            _btnCreateProfile.Enabled = false;
            _btnDeleteProfile.Enabled = false;
            _lstProfiles.Enabled = false;

            await Task.Run(() =>
            {
                ProfileImportExport.Import(json, _languages, _portConfigs, msg =>
                    Invoke(() => Text = $"Agent Sandbox — {msg}"));
            });

            Text = "Agent Sandbox";
            MessageBox.Show("Profile imported and built successfully.", "Import Complete",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            Text = "Agent Sandbox";
            MessageBox.Show($"Import failed: {ex.Message}", "Error",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _btnCreateProfile.Enabled = true;
            _btnDeleteProfile.Enabled = true;
            _lstProfiles.Enabled = true;
        }

        RefreshProfileList();
    }

    private void RefreshProfileList()
    {
        _lstProfiles.Items.Clear();

        if (!Directory.Exists(ResourceManager.PreparedDir))
        {
            _lblNoProfiles.Visible = true;
            _lstProfiles.Visible = false;
            return;
        }

        var dirs = Directory.GetDirectories(ResourceManager.PreparedDir);
        if (dirs.Length == 0)
        {
            _lblNoProfiles.Visible = true;
            _lstProfiles.Visible = false;
            return;
        }

        _lblNoProfiles.Visible = false;
        _lstProfiles.Visible = true;

        foreach (var dir in dirs)
        {
            var name = Path.GetFileName(dir)!;
            var agents = "";
            var languages = "";
            var imageSize = "";

            var profileJson = Path.Combine(dir, "profile.json");
            if (File.Exists(profileJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(profileJson));
                    var root = doc.RootElement;

                    if (root.TryGetProperty("agents", out var agentsEl) && agentsEl.ValueKind == JsonValueKind.Array)
                        agents = string.Join(", ", agentsEl.EnumerateArray().Select(a => a.GetString() ?? ""));

                    if (root.TryGetProperty("languages", out var langsEl) && langsEl.ValueKind == JsonValueKind.Array)
                        languages = string.Join(", ", langsEl.EnumerateArray().Select(l => l.GetString() ?? ""));
                }
                catch { /* ignore parse errors */ }
            }

            // Try to get image size
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "docker",
                    Arguments = $"image inspect --format \"{{{{.Size}}}}\" agent-sandbox-{name}:latest",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var proc = Process.Start(psi);
                if (proc != null)
                {
                    var output = proc.StandardOutput.ReadToEnd().Trim();
                    proc.WaitForExit(5000);
                    if (proc.ExitCode == 0 && long.TryParse(output, out var bytes))
                    {
                        imageSize = bytes switch
                        {
                            >= 1_073_741_824 => $"{bytes / 1_073_741_824.0:F1} GB",
                            >= 1_048_576 => $"{bytes / 1_048_576.0:F0} MB",
                            _ => $"{bytes / 1024.0:F0} KB"
                        };
                    }
                }
            }
            catch { /* ignore */ }

            var item = new ListViewItem(name);
            item.SubItems.Add(agents);
            item.SubItems.Add(languages);
            item.SubItems.Add(imageSize);
            _lstProfiles.Items.Add(item);
        }
    }

    // ─── Step 1: Project Selection + Launch ────────────────────────────

    private void BuildStepLaunch()
    {
        _stepLaunch = new Panel { Dock = DockStyle.Fill, Visible = false };

        // Header area
        var headerPanel = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(720, 72),
            BackColor = SurfaceLight
        };
        var title = new Label
        {
            Text = "Launch Sandbox",
            Font = new Font("Segoe UI", 18f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 12),
            AutoSize = true
        };
        var subtitleLaunch = new Label
        {
            Text = "Select a project folder and profile to launch",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = TextMuted,
            Location = new Point(32, 44),
            AutoSize = true
        };
        headerPanel.Controls.AddRange([title, subtitleLaunch]);

        var lblPath = new Label
        {
            Text = "Project folder",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 82),
            AutoSize = true
        };

        _txtPath = new TextBox
        {
            Location = new Point(32, 104),
            Size = new Size(528, 28),
            Font = new Font("Segoe UI", 10f),
            ReadOnly = true,
            BackColor = Color.White
        };

        _btnBrowse = new Button
        {
            Text = "Browse\u2026",
            Location = new Point(568, 102),
            Size = new Size(104, 32)
        };
        StyleFlatButton(_btnBrowse, TextPrimary);
        _btnBrowse.Click += (_, _) =>
        {
            using var dlg = new FolderBrowserDialog
            {
                Description = "Select project folder",
                UseDescriptionForTitle = true
            };
            if (dlg.ShowDialog(this) == DialogResult.OK)
                _txtPath.Text = dlg.SelectedPath;
        };

        _lblRecent = new Label
        {
            Text = "Recent projects",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 140),
            AutoSize = true
        };

        _lstRecent = new ListView
        {
            Location = new Point(32, 162),
            Size = new Size(640, 120),
            View = View.Details,
            FullRowSelect = true,
            GridLines = false,
            MultiSelect = false,
            BorderStyle = BorderStyle.FixedSingle
        };
        _lstRecent.Columns.Add("Project", 160);
        _lstRecent.Columns.Add("Profile", 120);
        _lstRecent.Columns.Add("Last Used", 100);
        _lstRecent.Columns.Add("Workspace Path", 240);
        _lstRecent.SelectedIndexChanged += OnRecentProjectSelected;

        var lblProfile = new Label
        {
            Text = "Profile",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 294),
            AutoSize = true
        };

        _cboProfile = new ComboBox
        {
            Location = new Point(32, 316),
            Size = new Size(200, 28),
            DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 10f)
        };
        _cboProfile.SelectedIndexChanged += OnProfileSelectionChanged;

        // Agent selector (filtered by profile)
        _lblAgent = new Label
        {
            Text = "Agent",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(244, 296),
            AutoSize = true,
            Visible = false
        };
        _cboAgent = new ComboBox
        {
            Location = new Point(244, 316),
            Size = new Size(160, 28),
            DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 10f),
            Visible = false
        };

        _btnLaunch = new Button
        {
            Text = "Launch",
            Location = new Point(420, 310),
            Size = new Size(120, 40),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnLaunch, AccentBlue, Color.White);
        _btnLaunch.Click += OnLaunchClicked;

        // Profile info
        _lblProfileInfo = new Label
        {
            Text = "",
            Font = new Font("Segoe UI", 9f),
            ForeColor = TextMuted,
            Location = new Point(32, 350),
            Size = new Size(640, 18),
            Visible = false
        };

        // VS Code link (shown after launch, right below project folder)
        _lnkVsCode = new LinkLabel
        {
            Text = "",
            Font = new Font("Segoe UI", 9.5f),
            LinkColor = AccentBlue,
            Location = new Point(32, 134),
            AutoSize = true,
            Visible = false
        };
        _lnkVsCode.LinkClicked += (_, _) =>
        {
            try { System.Diagnostics.Process.Start(new ProcessStartInfo(_lnkVsCode.Tag?.ToString() ?? "") { UseShellExecute = true }); } catch { }
        };

        // Plugin toggles (populated dynamically when profile changes)
        _lblPlugins = new Label
        {
            Text = "Plugins (toggle for this launch)",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 356),
            AutoSize = true,
            Visible = false
        };

        _pluginPanel = new FlowLayoutPanel
        {
            Location = new Point(28, 376),
            Size = new Size(644, 48),
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = false,
            Visible = false
        };

        _btnBackToProfiles = new Button
        {
            Text = "\u2190 Back to Profiles",
            Location = new Point(32, 432),
            Size = new Size(160, 36)
        };
        StyleFlatButton(_btnBackToProfiles, TextMuted);
        _btnBackToProfiles.Click += (_, _) =>
        {
            RefreshProfileList();
            ShowStep(0);
        };

        _btnEditUserEnv = new Button
        {
            Text = "Edit user.env",
            Location = new Point(208, 432),
            Size = new Size(120, 36)
        };
        StyleFlatButton(_btnEditUserEnv, AccentBlue);
        _btnEditUserEnv.ForeColor = AccentBlue;
        _btnEditUserEnv.Click += OnEditUserEnvClicked;

        _txtLog = new TextBox
        {
            Location = new Point(32, 476),
            Size = new Size(640, 140),
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(24, 24, 27),
            ForeColor = Color.FromArgb(74, 222, 128),
            Font = new Font("Consolas", 9.5f),
            Visible = false
        };

        _btnBackOverview = new Button
        {
            Text = "Back to overview",
            Location = new Point(32, 620),
            Size = new Size(160, 40),
            Visible = false
        };
        StyleFlatButton(_btnBackOverview, TextPrimary);
        _btnBackOverview.Click += OnBackToOverviewClicked;

        _btnClose = new Button
        {
            Text = "Close",
            Location = new Point(208, 620),
            Size = new Size(104, 40),
            Visible = false
        };
        StyleFilledButton(_btnClose, Color.FromArgb(63, 63, 70), Color.White);
        _btnClose.Click += (_, _) => Close();

        _stepLaunch.Controls.AddRange([headerPanel, lblPath, _txtPath, _btnBrowse,
            _lblRecent, _lstRecent, lblProfile, _cboProfile,
            _lblAgent, _cboAgent, _btnLaunch,
            _lblProfileInfo, _lnkVsCode,
            _lblPlugins, _pluginPanel,
            _btnBackToProfiles, _btnEditUserEnv,
            _txtLog, _btnBackOverview, _btnClose]);
        Controls.Add(_stepLaunch);

        RefreshProfileDropdown();
        RefreshRecentProjects();
    }

    private void OnRecentProjectSelected(object? sender, EventArgs e)
    {
        if (_lstRecent.SelectedItems.Count == 0) return;
        var item = _lstRecent.SelectedItems[0];
        _txtPath.Text = item.SubItems[3].Text;
        AutoSelectProfileForPath(item.SubItems[3].Text, item.SubItems[1].Text);
    }

    /// <summary>Auto-select the profile for a project path. Reads .sandbox file first, then falls back to hint.</summary>
    private void AutoSelectProfileForPath(string path, string? hint = null)
    {
        string? profile = null;

        // Read .sandbox file in the project directory
        var sandboxFile = Path.Combine(path, ".sandbox");
        if (File.Exists(sandboxFile))
        {
            try
            {
                foreach (var line in File.ReadAllLines(sandboxFile))
                {
                    var trimmed = line.Trim();
                    if (trimmed.StartsWith("profile:", StringComparison.OrdinalIgnoreCase))
                    { profile = trimmed["profile:".Length..].Trim(); break; }
                }
            }
            catch { }
        }

        profile ??= hint;
        if (string.IsNullOrEmpty(profile)) return;

        for (int i = 0; i < _cboProfile.Items.Count; i++)
        {
            if (_cboProfile.Items[i] as string == profile)
            { _cboProfile.SelectedIndex = i; return; }
        }
    }

    private void OnProfileSelectionChanged(object? sender, EventArgs e)
    {
        _pluginPanel.Controls.Clear();
        _pluginChecks.Clear();
        _pluginKeys.Clear();
        _lblProfileInfo.Visible = false;
        _lnkVsCode.Visible = false;

        if (_cboProfile.SelectedItem is not string profileName) return;

        var profileJson = Path.Combine(ResourceManager.PreparedDir, profileName, "profile.json");
        if (!File.Exists(profileJson)) return;

        // Read profile data
        List<string> installedPlugins;
        var customItems = new HashSet<string>();
        var skillItems = new HashSet<string>();
        var agents = new List<string>();
        var hasVsCode = false;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(profileJson));
            var root = doc.RootElement;

            if (root.TryGetProperty("agents", out var agentsEl) && agentsEl.ValueKind == JsonValueKind.Array)
                agents = agentsEl.EnumerateArray().Select(a => a.GetString() ?? "").Where(a => a != "").ToList();

            if (root.TryGetProperty("additions", out var addEl) && addEl.ValueKind == JsonValueKind.Array)
                hasVsCode = addEl.EnumerateArray().Any(a => a.GetString() == "vscode-server");

            installedPlugins = new List<string>();
            if (root.TryGetProperty("plugins", out var pluginsEl) && pluginsEl.ValueKind == JsonValueKind.Array)
                installedPlugins.AddRange(pluginsEl.EnumerateArray().Select(p => p.GetString() ?? "").Where(p => p != ""));

            if (root.TryGetProperty("custom_plugins", out var cpEl) && cpEl.ValueKind == JsonValueKind.Array)
                foreach (var p in cpEl.EnumerateArray().Select(el2 => el2.GetString() ?? "").Where(s => s != ""))
                { installedPlugins.Add(p); customItems.Add(p); }

            if (root.TryGetProperty("skills", out var skEl) && skEl.ValueKind == JsonValueKind.Array)
                foreach (var s in skEl.EnumerateArray().Select(el2 => el2.GetString() ?? "").Where(s => s != ""))
                { installedPlugins.Add(s); skillItems.Add(s); }
        }
        catch { return; }

        // Populate agent selector from profile
        _cboAgent.Items.Clear();
        _profileAgentKeys.Clear();
        var agentsJsonPath = Path.Combine(ResourceManager.SandboxDir, "agents.json");
        JsonDocument? agentsDef = null;
        try { if (File.Exists(agentsJsonPath)) agentsDef = JsonDocument.Parse(File.ReadAllText(agentsJsonPath)); } catch { }
        foreach (var ag in agents)
        {
            var agLabel = ag;
            if (agentsDef?.RootElement.TryGetProperty(ag, out var agEl) == true && agEl.TryGetProperty("label", out var lbl))
                agLabel = lbl.GetString() ?? ag;
            _profileAgentKeys.Add(ag);
            _cboAgent.Items.Add(agLabel);
        }
        agentsDef?.Dispose();

        // Add "VS Code only" option if profile has vscode-server
        if (hasVsCode)
        {
            _profileAgentKeys.Add("_vscode");
            _cboAgent.Items.Add("VS Code only (no agent)");
        }

        // Pre-select the saved default agent if it's in this profile, otherwise first
        var savedAgent = SavedSettings.GetDefaultAgent();
        var savedIdx = _profileAgentKeys.IndexOf(savedAgent);
        _cboAgent.SelectedIndex = savedIdx >= 0 ? savedIdx : (_cboAgent.Items.Count > 0 ? 0 : -1);
        _lblAgent.Visible = _cboAgent.Items.Count > 0;
        _cboAgent.Visible = _cboAgent.Items.Count > 0;

        // VS Code state
        _profileHasVsCode = hasVsCode;
        _vsCodePort = 4040;
        if (hasVsCode)
        {
            var vsProjectPath = _txtPath.Text.Trim();
            if (!string.IsNullOrEmpty(vsProjectPath) && Directory.Exists(vsProjectPath))
            {
                try
                {
                    var pName = ProjectScaffolder.ResolveProjectName(vsProjectPath);
                    var composePath = Path.Combine(ProjectScaffolder.GetProjectDir(pName), "docker-compose.yml");
                    if (File.Exists(composePath))
                        foreach (var line in File.ReadAllLines(composePath))
                        {
                            var m = System.Text.RegularExpressions.Regex.Match(line, @"""(\d+):4040""");
                            if (m.Success && int.TryParse(m.Groups[1].Value, out var mapped))
                            { _vsCodePort = mapped; break; }
                        }
                }
                catch { }
            }
        }
        _lblProfileInfo.Text = "";
        _lblProfileInfo.Visible = false;
        _lnkVsCode.Visible = false;

        if (installedPlugins.Count == 0) return;

        // Read current project opencode.json to get active plugin state
        var activePlugins = new HashSet<string>();
        var projectPath = _txtPath.Text.Trim();
        if (!string.IsNullOrEmpty(projectPath) && Directory.Exists(projectPath))
        {
            var projectName = ProjectScaffolder.ResolveProjectName(projectPath);
            var opencodePath = Path.Combine(ProjectScaffolder.GetProjectDir(projectName), "opencode_data", "opencode.json");
            if (File.Exists(opencodePath))
            {
                try
                {
                    using var oc = JsonDocument.Parse(File.ReadAllText(opencodePath));
                    if (oc.RootElement.TryGetProperty("plugin", out var arr) && arr.ValueKind == JsonValueKind.Array)
                        foreach (var p in arr.EnumerateArray())
                            if (p.GetString() is string s) activePlugins.Add(s);
                }
                catch { /* ignore */ }
            }
            else
            {
                // No project yet — default to all plugins enabled (matches template)
                foreach (var p in installedPlugins) activePlugins.Add(p);
            }
        }
        else
        {
            // No path selected — default all on
            foreach (var p in installedPlugins) activePlugins.Add(p);
        }

        // Load plugin descriptions
        var pluginsJsonPath = Path.Combine(ResourceManager.SandboxDir, "plugins.json");
        JsonDocument? pluginsDef = null;
        try { if (File.Exists(pluginsJsonPath)) pluginsDef = JsonDocument.Parse(File.ReadAllText(pluginsJsonPath)); }
        catch { /* ignore */ }

        foreach (var plugin in installedPlugins)
        {
            var isFixed = skillItems.Contains(plugin) || customItems.Contains(plugin);
            string label;
            if (skillItems.Contains(plugin))
            {
                label = $"[skill] {plugin} (always active)";
            }
            else if (customItems.Contains(plugin))
            {
                label = $"[npm] {plugin} (always active)";
            }
            else
            {
                var desc = "";
                if (pluginsDef != null &&
                    pluginsDef.RootElement.TryGetProperty(plugin, out var pEl) &&
                    pEl.TryGetProperty("description", out var dEl))
                {
                    desc = dEl.GetString() ?? "";
                    var dot = desc.IndexOf(". ", StringComparison.Ordinal);
                    if (dot > 0) desc = desc[..dot];
                }
                label = string.IsNullOrEmpty(desc) ? plugin : $"{plugin} — {desc}";
            }
            var cb = new CheckBox
            {
                Text = label,
                Width = 620,
                Height = 22,
                Checked = isFixed || activePlugins.Contains(plugin),
                Enabled = !isFixed,
                Font = new Font("Segoe UI", 9f),
                ForeColor = isFixed ? TextMuted : TextPrimary,
                Margin = new Padding(4, 1, 0, 1)
            };
            _pluginChecks.Add(cb);
            _pluginKeys.Add(plugin);
            _pluginPanel.Controls.Add(cb);
        }
        pluginsDef?.Dispose();

        _lblPlugins.Visible = true;
        _pluginPanel.Visible = true;
    }

    /// <summary>
    /// Write the selected plugin state to the project's opencode.json before launch.
    /// </summary>
    private void ApplyPluginSelection(string projectName)
    {
        if (_pluginKeys.Count == 0) return;

        var opencodePath = Path.Combine(ProjectScaffolder.GetProjectDir(projectName), "opencode_data", "opencode.json");
        if (!File.Exists(opencodePath)) return;

        try
        {
            var json = File.ReadAllText(opencodePath);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // Build new plugin array from checkboxes
            var selectedPlugins = new List<string>();
            for (int i = 0; i < _pluginChecks.Count; i++)
                if (_pluginChecks[i].Checked)
                    selectedPlugins.Add(_pluginKeys[i]);

            // Reconstruct JSON with updated plugin array
            using var ms = new System.IO.MemoryStream();
            var pluginWritten = false;
            using (var writer = new Utf8JsonWriter(ms, new JsonWriterOptions { Indented = true }))
            {
                writer.WriteStartObject();
                foreach (var prop in root.EnumerateObject())
                {
                    if (prop.Name == "plugin")
                    {
                        writer.WritePropertyName("plugin");
                        writer.WriteStartArray();
                        foreach (var p in selectedPlugins)
                            writer.WriteStringValue(p);
                        writer.WriteEndArray();
                        pluginWritten = true;
                    }
                    else
                    {
                        prop.WriteTo(writer);
                    }
                }
                // Add plugin key if it didn't exist in the original file
                if (!pluginWritten)
                {
                    writer.WritePropertyName("plugin");
                    writer.WriteStartArray();
                    foreach (var p in selectedPlugins)
                        writer.WriteStringValue(p);
                    writer.WriteEndArray();
                }
                writer.WriteEndObject();
            }
            ResourceManager.WriteLf(opencodePath, System.Text.Encoding.UTF8.GetString(ms.ToArray()));
        }
        catch { /* don't block launch on plugin config failure */ }
    }

    private void OnEditUserEnvClicked(object? sender, EventArgs e)
    {
        var path = _txtPath.Text.Trim();
        if (string.IsNullOrEmpty(path))
        {
            MessageBox.Show("Select a project folder first.", "Edit user.env",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var projectName = ProjectScaffolder.ResolveProjectName(path);
        var userEnvPath = Path.Combine(ProjectScaffolder.GetProjectDir(projectName), "user.env");

        if (!File.Exists(userEnvPath))
        {
            // Create a default user.env if the project hasn't been scaffolded yet
            var projectDir = ProjectScaffolder.GetProjectDir(projectName);
            Directory.CreateDirectory(projectDir);
            ResourceManager.WriteLf(userEnvPath,
                "# User environment overrides (loaded after runtime.env)\n" +
                "# Your values here override any auto-generated values.\n");
        }

        try
        {
            Process.Start(new ProcessStartInfo(userEnvPath) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not open file: {ex.Message}", "Error",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void RefreshProfileDropdown()
    {
        var previousSelection = _cboProfile.SelectedItem as string;
        _cboProfile.Items.Clear();

        if (!Directory.Exists(ResourceManager.PreparedDir)) return;

        foreach (var dir in Directory.GetDirectories(ResourceManager.PreparedDir))
            _cboProfile.Items.Add(Path.GetFileName(dir)!);

        // Restore previous selection if still available
        if (!string.IsNullOrEmpty(previousSelection))
        {
            var idx = _cboProfile.Items.IndexOf(previousSelection);
            if (idx >= 0) { _cboProfile.SelectedIndex = idx; return; }
        }
        if (_cboProfile.Items.Count > 0)
            _cboProfile.SelectedIndex = 0;
    }

    private void RefreshRecentProjects()
    {
        _lstRecent.Items.Clear();

        var recents = ProjectScaffolder.GetRecentProjects();
        foreach (var rp in recents)
        {
            var item = new ListViewItem(rp.Name);
            item.SubItems.Add(rp.Profile);
            item.SubItems.Add(FormatTimeAgo(rp.LastStarted));
            item.SubItems.Add(rp.WorkspacePath);
            _lstRecent.Items.Add(item);
        }
    }

    // ─── Launch Logic ──────────────────────────────────────────────────

    private async void OnLaunchClicked(object? sender, EventArgs e)
    {
        var path = _txtPath.Text.Trim();
        if (string.IsNullOrEmpty(path) || !Directory.Exists(path))
        {
            MessageBox.Show("Please select a valid project folder.", "Launch",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        // Read the agent selection and profile BEFORE any refresh that could reset the dropdowns
        var selectedAgentKey = _cboAgent.SelectedIndex >= 0 && _cboAgent.SelectedIndex < _profileAgentKeys.Count
            ? _profileAgentKeys[_cboAgent.SelectedIndex] : "";

        if (_cboProfile.SelectedItem is not string profileName || string.IsNullOrEmpty(profileName))
        {
            MessageBox.Show("Please select a profile.", "Launch",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
        if (!Directory.Exists(profileDir))
        {
            MessageBox.Show($"Profile '{profileName}' no longer exists. Please select or create another profile.",
                "Profile Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            RefreshProfileDropdown();
            return;
        }

        if (!DockerRunner.IsDockerAvailable())
        {
            MessageBox.Show("Docker is not available. Please start Docker Desktop and try again.",
                "Docker Not Found", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        var isVsCodeLaunch = selectedAgentKey == "_vscode";

        // Resolve the agent command to use for exec (reattach or normal launch)
        string agentCommand;
        if (isVsCodeLaunch)
        {
            agentCommand = ""; // not used in VS Code mode
        }
        else if (!string.IsNullOrEmpty(selectedAgentKey))
        {
            SavedSettings.SetDefaultAgent(selectedAgentKey);
            agentCommand = ProjectScaffolder.MapAgentKeyToCommand(selectedAgentKey);
        }
        else
        {
            agentCommand = "opencode";
        }

        // Check if profile changed from .sandbox file — offer to update
        var sandboxFile = Path.Combine(path, ".sandbox");
        if (File.Exists(sandboxFile))
        {
            string? currentProfile = null;
            try
            {
                foreach (var line in File.ReadAllLines(sandboxFile))
                {
                    var trimmed = line.Trim();
                    if (trimmed.StartsWith("profile:", StringComparison.OrdinalIgnoreCase))
                    { currentProfile = trimmed["profile:".Length..].Trim(); break; }
                }
            }
            catch { }

            if (!string.IsNullOrEmpty(currentProfile) && currentProfile != profileName)
            {
                var change = MessageBox.Show(
                    $"This project currently uses profile '{currentProfile}'.\nYou selected '{profileName}'.\n\nUpdate the project to use '{profileName}' as default?",
                    "Profile Changed", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (change == DialogResult.Yes)
                {
                    try { File.WriteAllText(sandboxFile, $"profile: {profileName}\n"); }
                    catch { }
                }
            }
        }

        // Switch to launch mode — hide pre-launch controls, show log
        SetLaunchMode(true);

        await RunCoreLaunch(path, profileName, isVsCodeLaunch, agentCommand);
    }

    private async Task RunCoreLaunch(string workspacePath, string profileName, bool vsCodeOnly = false, string agentCommand = "opencode")
    {
        var portRemaps = new List<string>();

        void Log(string msg)
        {
            // Capture port remap messages for the summary notice
            if (msg.Contains("remapped to"))
                portRemaps.Add(msg);

            if (InvokeRequired)
                Invoke(() => Log(msg));
            else
            {
                _txtLog.AppendText(msg + Environment.NewLine);
                _txtLog.SelectionStart = _txtLog.TextLength;
                _txtLog.ScrollToCaret();
            }
        }

        try
        {
            var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
            if (!Directory.Exists(profileDir))
            {
                Log($"[sandbox] Error: profile directory not found: {profileDir}");
                return;
            }
            var projectName = ProjectScaffolder.ResolveProjectName(workspacePath);
            var projectDir = ProjectScaffolder.GetProjectDir(projectName);
            var containerName = $"sandbox-{projectName}";
            var tag = $"agent-sandbox-{profileName}:latest";

            // Check for already-running container
            if (DockerRunner.IsContainerRunning(containerName))
            {
                var composeFile = Path.Combine(projectDir, "docker-compose.yml");
                var containerId = DockerRunner.GetComposeContainerId(composeFile, projectDir) ?? containerName;

                var selectedLabel = vsCodeOnly ? "VS Code Server" : agentCommand;
                var dialogMsg = $"Container '{containerName}' is already running.\n\n" +
                    $"Yes = Attach '{selectedLabel}' as a new session in the running container\n" +
                    $"No = Restart the container with current settings\n" +
                    $"Cancel = Do nothing";

                var choice = MessageBox.Show(dialogMsg,
                    "Container Running",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button1,
                    0, false);

                // Relabel: Yes=Attach, No=Restart, Cancel=Cancel
                if (choice == DialogResult.Cancel)
                {
                    SetLaunchMode(false);
                    return;
                }

                if (choice == DialogResult.Yes)
                {
                    if (vsCodeOnly)
                    {
                        // VS Code — container already running, just show link
                        var actualPort = 4040;
                        var cf = Path.Combine(projectDir, "docker-compose.yml");
                        if (File.Exists(cf))
                            foreach (var line in File.ReadAllLines(cf))
                            {
                                var pm = System.Text.RegularExpressions.Regex.Match(line, @"""(\d+):4040""");
                                if (pm.Success && int.TryParse(pm.Groups[1].Value, out var mp))
                                { actualPort = mp; break; }
                            }
                        _vsCodePort = actualPort;
                        Log($"[sandbox] VS Code Server is running at http://localhost:{actualPort}");
                    }
                    else
                    {
                        // Attach new agent session in running container
                        Log($"[sandbox] Attaching new session to {containerName}...");
                        Log($"[sandbox] Launching: {agentCommand}");
                        DockerRunner.ExecInteractive(containerId, agentCommand, newWindow: true);
                        Log("[sandbox] Agent session launched in new window.");
                    }
                    Invoke(() =>
                    {
                        _btnBackOverview.Visible = true;
                        _btnClose.Visible = true;
                    });
                    return;
                }

                // Restart — stop existing container first
                Log($"[sandbox] Stopping existing container '{containerName}'...");
                await Task.Run(() =>
                {
                    if (File.Exists(composeFile))
                        DockerRunner.ComposeDown(composeFile, projectDir);
                    else
                    {
                        RunDockerCapture("docker", $"stop {containerName}");
                        RunDockerCapture("docker", $"rm {containerName}");
                    }
                });
                Log("[sandbox] Container stopped.");
            }

            await Task.Run(() =>
            {
                // Build image if needed
                Log($"[sandbox] Checking image '{tag}'...");
                var (exitCheck, output) = RunDockerCapture("docker", $"image inspect {tag}");
                if (exitCheck != 0)
                {
                    Log("[sandbox] Building Docker image...");
                    var dockerfilePath = Path.Combine(profileDir, "Dockerfile.base");
                    var buildExit = DockerRunner.Build(dockerfilePath, tag, profileDir, Log);
                    if (buildExit != 0)
                    {
                        Log("[sandbox] Image build failed. Aborting.");
                        return;
                    }
                    Log("[sandbox] Image built successfully.");
                }
                else
                {
                    Log("[sandbox] Image already exists.");
                }

                // Scaffold or refresh project
                if (!ProjectScaffolder.Exists(projectName))
                {
                    Log($"[sandbox] Scaffolding project '{projectName}'...");
                    ProjectScaffolder.Scaffold(projectName, workspacePath, profileName, profileDir);
                }
                else
                {
                    Log($"[sandbox] Refreshing project '{projectName}' from profile...");
                    ProjectScaffolder.RefreshFromProfile(projectName, workspacePath, profileDir);
                }

                // Apply plugin selection from UI checkboxes
                Invoke(() => ApplyPluginSelection(projectName));

                // Write runtime env and sync auth
                Log("[sandbox] Writing runtime environment...");
                ProjectScaffolder.WriteRuntimeEnv(projectName);
                ProjectScaffolder.SyncHostAuth(projectName, Log);

                // VS Code only mode: override entrypoint to skip agent entirely
                var composePath = Path.Combine(projectDir, "docker-compose.yml");
                SetComposeVsCodeOnly(composePath, vsCodeOnly);

                // Compose up with port retry
                var composeFile = Path.Combine(projectDir, "docker-compose.yml");
                var maxRetries = 3;
                for (int attempt = 1; attempt <= maxRetries; attempt++)
                {
                    Log($"[sandbox] Starting container (attempt {attempt}/{maxRetries})...");
                    var (composeExit, composeOutput) = DockerRunner.ComposeUpCapture(composeFile, projectDir);

                    if (composeExit == 0)
                    {
                        Log("[sandbox] Container started.");
                        break;
                    }

                    if (DockerRunner.TryParsePortFromComposeError(composeOutput, out var port) && attempt < maxRetries)
                    {
                        Log($"[sandbox] Port {port} conflict, remapping...");
                        ProjectScaffolder.RemapPort(projectName, port, Log);
                        continue;
                    }

                    Log($"[sandbox] compose up failed: {composeOutput}");
                    return;
                }

                // Wait for ready
                var containerId = DockerRunner.GetComposeContainerId(composeFile, projectDir);
                if (!string.IsNullOrEmpty(containerId))
                {
                    DockerRunner.WaitForReady(containerId, 120, Log);
                }
                else
                {
                    Log("[sandbox] Warning: could not determine container ID.");
                }

                // Update last started
                ProjectScaffolder.UpdateLastStarted(projectName);

                var containerTarget = containerId ?? $"{projectName}-agent-1";

                // Re-read the actual VS Code port from compose (may have been remapped)
                var actualVsPort = 4040;
                var composeForPort = Path.Combine(projectDir, "docker-compose.yml");
                if (File.Exists(composeForPort))
                    foreach (var line in File.ReadAllLines(composeForPort))
                    {
                        var pm = System.Text.RegularExpressions.Regex.Match(line, @"""(\d+):4040""");
                        if (pm.Success && int.TryParse(pm.Groups[1].Value, out var mp))
                        { actualVsPort = mp; break; }
                    }
                _vsCodePort = actualVsPort;

                // Verify code-server is actually in the Dockerfile
                var dfCheck = Path.Combine(profileDir, "Dockerfile.base");
                if (File.Exists(dfCheck) && !File.ReadAllText(dfCheck).Contains("code-server"))
                    Log("[sandbox] WARNING: VS Code Server is not in this profile's Dockerfile. Rebuild the profile to add it.");

                if (vsCodeOnly)
                {
                    Log("");
                    Log("  ╔══════════════════════════════════════════════════╗");
                    Log($"  ║  VS Code Server: http://localhost:{actualVsPort,-14}║");
                    Log("  ╚══════════════════════════════════════════════════╝");
                    Log("");
                    Log("[sandbox] The container is running in the background.");
                    Log("[sandbox] Open the URL above in your browser to start coding.");
                }
                else
                {
                    if (_profileHasVsCode)
                        Log($"[sandbox] VS Code Server also available at: http://localhost:{actualVsPort}");

                    Log($"[sandbox] Launching agent: {agentCommand}");
                    DockerRunner.ExecInteractive(containerTarget, agentCommand, newWindow: true);
                    Log("[sandbox] Agent launched in new window.");
                }
            });

            // Show completion buttons + update VS Code link with actual port
            Invoke(() =>
            {
                _btnBackOverview.Visible = true;
                _btnClose.Visible = true;

                // Update VS Code link with actual port (may differ from pre-launch value)
                if (_profileHasVsCode && _vsCodePort > 0)
                {
                    _lnkVsCode.Text = $"VS Code Server: http://localhost:{_vsCodePort}";
                    _lnkVsCode.Tag = $"http://localhost:{_vsCodePort}";
                    _lnkVsCode.Visible = true;
                }

                if (portRemaps.Count > 0)
                {
                    var remapText = string.Join("  |  ", portRemaps.Select(r =>
                    {
                        var m = System.Text.RegularExpressions.Regex.Match(r, @"Port (\d+).*remapped to (\d+):(\d+)");
                        return m.Success ? $"localhost:{m.Groups[1].Value} \u2192 localhost:{m.Groups[2].Value}" : r;
                    }));
                    var notice = new Label
                    {
                        Text = $"\u26a0 Port remapping: {remapText}",
                        Left = 32, Top = _txtLog.Top - 28,
                        Width = _txtLog.Width, Height = 22,
                        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                        ForeColor = Color.FromArgb(180, 120, 0)
                    };
                    _stepLaunch.Controls.Add(notice);
                    notice.BringToFront();
                    _launchTempControls.Add(notice);
                }
            });
        }
        catch (Exception ex)
        {
            Log($"[sandbox] Error: {ex.Message}");
            Invoke(() =>
            {
                _btnBackOverview.Visible = true;
                _btnClose.Visible = true;
            });
        }
    }

    private void OnBackToOverviewClicked(object? sender, EventArgs e)
    {
        // Remove dynamically created labels (port remap notices etc.)
        foreach (var c in _launchTempControls)
        {
            _stepLaunch.Controls.Remove(c);
            c.Dispose();
        }
        _launchTempControls.Clear();

        // Clear log
        _txtLog.Clear();
        _txtLog.Visible = false;
        _btnBackOverview.Visible = false;
        _btnClose.Visible = false;

        SetLaunchMode(false);
        RefreshProfileDropdown();
        RefreshRecentProjects();
    }

    /// <summary>
    /// Toggle between pre-launch (browse/select/configure) and launch (log output) UI states.
    /// </summary>
    private void SetLaunchMode(bool launching)
    {
        // Pre-launch controls: hide during launch, show when returning
        _lblRecent.Visible = !launching;
        _lstRecent.Visible = !launching;
        _btnBrowse.Visible = !launching;
        _lblAgent.Visible = !launching && _cboAgent.Items.Count > 0;
        _cboAgent.Visible = !launching && _cboAgent.Items.Count > 0;
        _lblProfileInfo.Visible = !launching && _lblProfileInfo.Text.Length > 0;
        _lblPlugins.Visible = !launching && _pluginChecks.Count > 0;
        _pluginPanel.Visible = !launching && _pluginChecks.Count > 0;
        _btnLaunch.Visible = !launching;
        _btnBackToProfiles.Visible = !launching;
        _btnEditUserEnv.Visible = !launching;

        // Hide VS Code link during launch transition; it will be shown
        // after launch completes with the actual (post-remap) port
        if (!launching)
            _lnkVsCode.Visible = false;

        // Path and profile: keep visible but readonly during launch
        _txtPath.ReadOnly = launching;
        _cboProfile.Enabled = !launching;

        if (launching)
        {
            // Move log up into the space freed by hidden controls
            _txtLog.Location = new Point(32, 356);
            _txtLog.Size = new Size(640, 240);
            _txtLog.Visible = true;
            _txtLog.Clear();
            _btnBackOverview.Location = new Point(32, 604);
            _btnClose.Location = new Point(208, 604);
        }
        else
        {
            // Restore log to default position (hidden)
            _txtLog.Location = new Point(32, 476);
            _txtLog.Size = new Size(640, 140);
            _txtLog.Visible = false;
            _btnBackOverview.Location = new Point(32, 620);
            _btnClose.Location = new Point(208, 620);
        }
        _btnBackOverview.Visible = false;
        _btnClose.Visible = false;
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private void ShowStep(int step)
    {
        _stepProfiles.Visible = step == 0;
        _stepLaunch.Visible = step == 1;
    }

    private static void StyleFlatButton(Button btn, Color fg, Color? hoverBg = null)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.ForeColor = fg;
        btn.FlatAppearance.BorderColor = Color.FromArgb(228, 228, 231);
        btn.FlatAppearance.MouseOverBackColor = hoverBg ?? Color.FromArgb(244, 244, 245);
        btn.FlatAppearance.MouseDownBackColor = Color.FromArgb(228, 228, 231);
        btn.Cursor = Cursors.Hand;
    }

    private static void StyleFilledButton(Button btn, Color bg, Color fg, Color? hoverBg = null)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.BackColor = bg;
        btn.ForeColor = fg;
        btn.FlatAppearance.BorderColor = bg;
        btn.FlatAppearance.MouseOverBackColor = hoverBg ?? ControlPaint.Light(bg, 0.15f);
        btn.FlatAppearance.MouseDownBackColor = ControlPaint.Dark(bg, 0.1f);
        btn.Cursor = Cursors.Hand;
    }

    private static string FormatTimeAgo(string isoTimestamp)
    {
        if (!DateTimeOffset.TryParse(isoTimestamp, out var dto))
            return isoTimestamp;

        var ago = DateTimeOffset.Now - dto;
        if (ago.TotalMinutes < 1) return "just now";
        if (ago.TotalHours < 1) return $"{(int)ago.TotalMinutes}m ago";
        if (ago.TotalDays < 1) return $"{(int)ago.TotalHours}h ago";
        if (ago.TotalDays < 30) return $"{(int)ago.TotalDays}d ago";
        return dto.ToString("yyyy-MM-dd");
    }

    private static (int exitCode, string output) RunDockerCapture(string exe, string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var proc = Process.Start(psi)!;
        var stdout = proc.StandardOutput.ReadToEnd();
        proc.WaitForExit();
        return (proc.ExitCode, stdout);
    }

    /// <summary>
    /// For VS Code only mode: override the entrypoint in docker-compose.yml to use
    /// install-vscode.sh (setup + code-server, no agent) instead of install.sh.
    /// For normal mode: ensure no entrypoint override is present.
    /// </summary>
    private static void SetComposeVsCodeOnly(string composePath, bool vsCodeOnly)
    {
        if (!File.Exists(composePath)) return;
        var lines = File.ReadAllLines(composePath).ToList();

        // Remove any existing entrypoint override we previously injected
        lines.RemoveAll(l => l.TrimStart().StartsWith("entrypoint:") && l.Contains("# vscode-only"));

        if (vsCodeOnly)
        {
            // Find the "    build:" line and insert entrypoint override after it
            for (int i = 0; i < lines.Count; i++)
            {
                if (lines[i].TrimEnd().StartsWith("    build:"))
                {
                    lines.Insert(i + 1, "    entrypoint: [\"/install-vscode.sh\"]  # vscode-only");
                    break;
                }
            }
        }

        ResourceManager.WriteLf(composePath, string.Join("\n", lines) + "\n");
    }
}
