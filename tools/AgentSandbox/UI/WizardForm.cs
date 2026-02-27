using System.Diagnostics;
using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox.UI;

public sealed class WizardForm : Form
{
    private readonly Dictionary<string, LanguageConfig> _languages;
    private readonly Dictionary<string, PortConfig> _portConfigs;

    // Step panels
    private Panel _stepSetup = null!;
    private Panel _stepFolder = null!;
    private Panel _stepDetect = null!;
    private Panel _stepEnvVars = null!;
    private Panel _stepLaunch = null!;

    // Step 0: setup / manage profiles
    private CheckedListBox _lstSetupLangs = null!;
    private Button _btnCreateProfiles = null!;
    private Button _btnSkipSetup = null!;
    private Button _btnBackSetup = null!;
    private Label _lblSetupStatus = null!;

    // Step 1: folder + recent projects
    private TextBox _txtPath = null!;
    private Button _btnBrowse = null!;
    private Button _btnScan = null!;
    private ListView _lstRecent = null!;
    private Button _btnContinue = null!;
    private Button _btnRescan = null!;
    private Button _btnRemove = null!;
    private Button _btnRegenerate = null!;
    private Button _btnManageProfiles = null!;
    private Button _btnSettings = null!;

    // Step 2: detection results
    private CheckedListBox _lstLanguages = null!;
    private DataGridView _gridVersions = null!;
    private TextBox _txtPorts = null!;
    private Label _lblFrameworks = null!;
    private TextBox _txtProfileName = null!;
    private Button _btnBack = null!;
    private Button _btnLaunch = null!;

    // Step 3: env vars
    private TextBox _txtAnthropicKey = null!;
    private TextBox _txtOpenAIKey = null!;
    private TextBox _txtCursorKey = null!;
    private TextBox _txtGitHubCopilotKey = null!;
    private TextBox _txtOpenRouterKey = null!;
    private TextBox _txtOpenCodeKey = null!;
    private TextBox _txtGeminiKey = null!;
    private Button _btnBackEnv = null!;
    private Button _btnContinueEnv = null!;

    // Step 4: launching
    private TextBox _txtLog = null!;

    // State
    private string _projectPath = "";
    private List<string> _sortedKeys = new();
    private Dictionary<string, string> _detectedVersions = new();
    private List<int> _detectedPorts = new();
    private bool _forceNoCache;
    private ProfileSpec? _pendingSpec;

    public WizardForm()
    {
        _languages = ConfigLoader.LoadLanguages();
        _portConfigs = ConfigLoader.LoadPorts();
        _sortedKeys = _languages.Keys.OrderBy(k => k).ToList();

        Text = "Agent Sandbox";
        Size = new Size(680, 720);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        Font = new Font("Segoe UI", 9.5f);
        BackColor = Color.White;
        try
        {
            var ico = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (ico != null) Icon = ico;
        }
        catch { /* ignore if icon missing */ }

        BuildStepSetup();
        BuildStepFolder();
        BuildStepDetect();
        BuildStepEnvVars();
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

    // ─── Step 0: Setup / Manage Profiles ────────────────────────────────

    private void BuildStepSetup()
    {
        _stepSetup = new Panel { Dock = DockStyle.Fill, Visible = false };

        var title = new Label
        {
            Text = "Quick Setup",
            Font = new Font("Segoe UI", 18f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30),
            Location = new Point(30, 20),
            AutoSize = true
        };

        var subtitle = new Label
        {
            Text = "Create default profiles so you can sandbox projects immediately.\nEach profile sets up a ready-to-use environment for that language.",
            ForeColor = Color.FromArgb(100, 100, 100),
            Location = new Point(32, 58),
            Size = new Size(600, 40)
        };

        var lblPick = new Label
        {
            Text = "Select languages to create profiles for:",
            Location = new Point(30, 110),
            AutoSize = true
        };

        _lstSetupLangs = new CheckedListBox
        {
            Location = new Point(30, 135),
            Size = new Size(600, 350),
            CheckOnClick = true,
            BorderStyle = BorderStyle.FixedSingle
        };

        RefreshSetupLanguageList();

        _lblSetupStatus = new Label
        {
            Text = "",
            ForeColor = Color.FromArgb(46, 139, 87),
            Location = new Point(30, 498),
            Size = new Size(600, 20)
        };

        _btnBackSetup = new Button
        {
            Text = "\u2190 Back",
            Location = new Point(30, 530),
            Size = new Size(100, 44),
        };
        StyleFlatButton(_btnBackSetup, Color.FromArgb(80, 80, 80));
        _btnBackSetup.Click += (_, _) => ShowStep(1);

        _btnCreateProfiles = new Button
        {
            Text = "Create Selected Profiles",
            Location = new Point(145, 530),
            Size = new Size(220, 44),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnCreateProfiles, Color.FromArgb(0, 120, 212), Color.White);
        _btnCreateProfiles.Click += OnCreateProfilesClicked;

        _btnSkipSetup = new Button
        {
            Text = "Continue to Project Selection \u2192",
            Location = new Point(380, 530),
            Size = new Size(250, 44),
            Font = new Font("Segoe UI", 10f)
        };
        StyleFilledButton(_btnSkipSetup, Color.FromArgb(60, 60, 60), Color.White);
        _btnSkipSetup.Click += (_, _) => ShowStep(1);

        _stepSetup.Controls.AddRange([title, subtitle, lblPick, _lstSetupLangs,
            _lblSetupStatus, _btnBackSetup, _btnCreateProfiles, _btnSkipSetup]);
        Controls.Add(_stepSetup);
    }

    private void RefreshSetupLanguageList()
    {
        _lstSetupLangs.Items.Clear();
        foreach (var key in _sortedKeys)
        {
            var exists = Directory.Exists(Path.Combine(ResourceManager.PreparedDir, key));
            var marker = exists ? "  [profile exists]" : "";
            _lstSetupLangs.Items.Add($"{_languages[key].Label}  ({key}){marker}", isChecked: false);
        }
    }

    private void OnCreateProfilesClicked(object? sender, EventArgs e)
    {
        var selected = new List<string>();
        for (int i = 0; i < _lstSetupLangs.Items.Count; i++)
        {
            if (_lstSetupLangs.GetItemChecked(i))
                selected.Add(_sortedKeys[i]);
        }

        if (selected.Count == 0)
        {
            MessageBox.Show(this, "Please check at least one language.", "No Selection",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _btnCreateProfiles.Enabled = false;
        _lblSetupStatus.Text = "Creating profiles...";
        _lblSetupStatus.ForeColor = Color.FromArgb(100, 100, 100);

        _ = Task.Run(() =>
        {
            var created = new List<string>();
            var skipped = new List<string>();

            foreach (var key in selected)
            {
                var profileDir = Path.Combine(ResourceManager.PreparedDir, key);
                if (Directory.Exists(profileDir))
                {
                    skipped.Add(key);
                    continue;
                }

                var basePorts = _portConfigs.TryGetValue("base", out var baseCfg)
                    ? baseCfg.Ports.ToList() : new List<int>();
                var langPorts = _portConfigs.TryGetValue(key, out var langCfg)
                    ? langCfg.Default.ToList() : new List<int>();
                var allPorts = basePorts.Union(langPorts).Distinct().OrderBy(p => p).ToList();

                var spec = new ProfileSpec
                {
                    Name = key,
                    Languages = [key],
                    Versions = new Dictionary<string, string>(),
                    Ports = allPorts
                };

                ProfileGenerator.Generate(spec, _languages);
                created.Add(key);
            }

            Invoke(() =>
            {
                _btnCreateProfiles.Enabled = true;
                RefreshSetupLanguageList();

                var parts = new List<string>();
                if (created.Count > 0)
                    parts.Add($"Created: {string.Join(", ", created)}");
                if (skipped.Count > 0)
                    parts.Add($"Already existed: {string.Join(", ", skipped)}");

                _lblSetupStatus.Text = string.Join("  |  ", parts);
                _lblSetupStatus.ForeColor = Color.FromArgb(46, 139, 87);
            });
        });
    }

    // ─── Step 1: Folder Selection + Recent Projects ─────────────────────

    private void BuildStepFolder()
    {
        _stepFolder = new Panel { Dock = DockStyle.Fill };

        var title = new Label
        {
            Text = "Agent Sandbox",
            Font = new Font("Segoe UI", 18f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30),
            Location = new Point(30, 20),
            AutoSize = true
        };

        var subtitle = new Label
        {
            Text = "Select a project folder to create an isolated Docker sandbox.",
            ForeColor = Color.FromArgb(100, 100, 100),
            Location = new Point(32, 55),
            AutoSize = true
        };

        var lblPath = new Label
        {
            Text = "Project folder:",
            Location = new Point(30, 100),
            AutoSize = true
        };

        _txtPath = new TextBox
        {
            Location = new Point(30, 122),
            Size = new Size(480, 28),
            PlaceholderText = @"C:\Users\you\projects\my-app",
            Font = new Font("Segoe UI", 10f)
        };

        _btnBrowse = new Button
        {
            Text = "Browse...",
            Location = new Point(520, 120),
            Size = new Size(100, 30),
        };
        StyleFlatButton(_btnBrowse, Color.FromArgb(80, 80, 80));
        _btnBrowse.Click += (_, _) =>
        {
            using var dlg = new FolderBrowserDialog
            {
                Description = "Select project folder",
                UseDescriptionForTitle = true,
                ShowNewFolderButton = false
            };
            if (!string.IsNullOrEmpty(_txtPath.Text) && Directory.Exists(_txtPath.Text))
                dlg.SelectedPath = _txtPath.Text;

            if (dlg.ShowDialog(this) == DialogResult.OK)
                _txtPath.Text = dlg.SelectedPath;
        };

        _btnScan = new Button
        {
            Text = "Scan && Continue \u2192",
            Location = new Point(30, 168),
            Size = new Size(200, 40),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnScan, Color.FromArgb(0, 120, 212), Color.White);
        _btnScan.Click += OnScanClicked;

        _btnManageProfiles = new Button
        {
            Text = "Manage Profiles...",
            Location = new Point(242, 168),
            Size = new Size(140, 40),
        };
        StyleFlatButton(_btnManageProfiles, Color.FromArgb(0, 120, 212));
        _btnManageProfiles.Click += (_, _) =>
        {
            RefreshSetupLanguageList();
            _lblSetupStatus.Text = "";
            ShowStep(0);
        };

        _btnSettings = new Button
        {
            Text = "Settings\u2026",
            Location = new Point(392, 168),
            Size = new Size(120, 40),
        };
        StyleFlatButton(_btnSettings, Color.FromArgb(0, 120, 212));
        _btnSettings.Click += (_, _) =>
        {
            using var settingsForm = new SettingsForm();
            settingsForm.ShowDialog(this);
        };

        // Recent projects section
        var lblRecent = new Label
        {
            Text = "Recent Projects",
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(60, 60, 60),
            Location = new Point(30, 235),
            AutoSize = true
        };

        _lstRecent = new ListView
        {
            Location = new Point(30, 262),
            Size = new Size(600, 300),
            View = View.Details,
            FullRowSelect = true,
            GridLines = true,
            MultiSelect = false,
            HeaderStyle = ColumnHeaderStyle.Nonclickable,
            BorderStyle = BorderStyle.FixedSingle
        };
        _lstRecent.Columns.Add("Project", 130);
        _lstRecent.Columns.Add("Profile", 110);
        _lstRecent.Columns.Add("Last Used", 110);
        _lstRecent.Columns.Add("Path", 240);

        _lstRecent.SelectedIndexChanged += (_, _) =>
        {
            var hasSelection = _lstRecent.SelectedItems.Count > 0;
            _btnContinue.Enabled = hasSelection;
            _btnRescan.Enabled = hasSelection;
            _btnRemove.Enabled = hasSelection;
            _btnRegenerate.Enabled = hasSelection;
        };
        _lstRecent.DoubleClick += OnContinueClicked;

        _btnRemove = new Button
        {
            Text = "Remove",
            Location = new Point(30, 572),
            Size = new Size(100, 40),
            Enabled = false
        };
        StyleFlatButton(_btnRemove, Color.FromArgb(180, 40, 40));
        _btnRemove.Click += OnRemoveClicked;

        _btnRescan = new Button
        {
            Text = "Re-scan \u2192",
            Location = new Point(140, 572),
            Size = new Size(110, 40),
            Enabled = false
        };
        StyleFlatButton(_btnRescan, Color.FromArgb(0, 120, 212));
        _btnRescan.Click += OnRescanClicked;

        _btnRegenerate = new Button
        {
            Text = "Regenerate environment",
            Location = new Point(260, 572),
            Size = new Size(160, 40),
            Font = new Font("Segoe UI", 8.25f),
            Enabled = false
        };
        StyleFlatButton(_btnRegenerate, Color.FromArgb(0, 120, 212));
        _btnRegenerate.Paint += (s, pe) =>
        {
            var btn = (Button)s!;
            var isHover = btn.ClientRectangle.Contains(btn.PointToClient(Cursor.Position));
            var bg = !btn.Enabled ? btn.BackColor
                : isHover ? btn.FlatAppearance.MouseOverBackColor
                : btn.BackColor;
            pe.Graphics.Clear(bg);
            using var pen = new Pen(btn.Enabled ? btn.FlatAppearance.BorderColor : SystemColors.GrayText);
            pe.Graphics.DrawRectangle(pen, 0, 0, btn.Width - 1, btn.Height - 1);
            var textColor = btn.Enabled ? btn.ForeColor : SystemColors.GrayText;
            TextRenderer.DrawText(pe.Graphics, btn.Text, btn.Font, btn.ClientRectangle, textColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        };
        _btnRegenerate.MouseEnter += (_, _) => _btnRegenerate.Invalidate();
        _btnRegenerate.MouseLeave += (_, _) => _btnRegenerate.Invalidate();
        _btnRegenerate.Click += OnRegenerateClicked;

        _btnContinue = new Button
        {
            Text = "Continue with Selected \u2192",
            Location = new Point(430, 572),
            Size = new Size(200, 40),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            Enabled = false
        };
        StyleFilledButton(_btnContinue, Color.FromArgb(46, 139, 87), Color.White);
        _btnContinue.Click += OnContinueClicked;

        PopulateRecentProjects();

        _stepFolder.Controls.AddRange([title, subtitle, lblPath, _txtPath, _btnBrowse,
            _btnScan, _btnManageProfiles, _btnSettings, lblRecent, _lstRecent, _btnRemove, _btnRescan, _btnRegenerate, _btnContinue]);
        Controls.Add(_stepFolder);
    }

    private void PopulateRecentProjects()
    {
        _lstRecent.Items.Clear();
        var projects = ProjectScaffolder.GetRecentProjects();
        foreach (var p in projects)
        {
            var item = new ListViewItem(p.Name);
            item.SubItems.Add(p.Profile);
            item.SubItems.Add(FormatTimeAgo(p.LastStarted));
            item.SubItems.Add(p.WorkspacePath);
            item.Tag = p;
            _lstRecent.Items.Add(item);
        }

        _btnContinue.Enabled = false;
        _btnRescan.Enabled = false;
        _btnRemove.Enabled = false;
        _btnRegenerate.Enabled = false;
    }

    private void OnContinueClicked(object? sender, EventArgs e)
    {
        if (_lstRecent.SelectedItems.Count == 0) return;

        var project = (ProjectScaffolder.RecentProject)_lstRecent.SelectedItems[0].Tag!;

        if (!Directory.Exists(project.WorkspacePath))
        {
            MessageBox.Show(this,
                $"Workspace folder no longer exists:\n{project.WorkspacePath}",
                "Folder Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var profileDir = Path.Combine(ResourceManager.PreparedDir, project.Profile);
        if (!Directory.Exists(profileDir))
        {
            MessageBox.Show(this,
                $"Profile '{project.Profile}' not found.\nRun a fresh scan to regenerate it.",
                "Profile Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _projectPath = project.WorkspacePath;
        ShowStep(4);
        _ = Task.Run(() => RunCoreLaunch(project.Profile));
    }

    private void OnRemoveClicked(object? sender, EventArgs e)
    {
        if (_lstRecent.SelectedItems.Count == 0) return;

        var project = (ProjectScaffolder.RecentProject)_lstRecent.SelectedItems[0].Tag!;
        var result = MessageBox.Show(this,
            $"Remove project '{project.Name}'?\n\nThis will stop the container and delete all project data (config, logs, sessions).\nYour source code is NOT affected.",
            "Remove Project", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

        if (result != DialogResult.Yes) return;

        try
        {
            ProjectScaffolder.RemoveProject(project.Name);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Cleanup error (non-fatal): {ex.Message}", "Warning",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        PopulateRecentProjects();
    }

    private void OnRegenerateClicked(object? sender, EventArgs e)
    {
        if (_lstRecent.SelectedItems.Count == 0) return;

        var project = (ProjectScaffolder.RecentProject)_lstRecent.SelectedItems[0].Tag!;

        var result = MessageBox.Show(this,
            "Regenerate the base environment and do a full rebuild?\n\n" +
            "This will:\n" +
            "• Stop and remove the container\n" +
            "• Remove project data (config, logs, sessions)\n" +
            "• Regenerate the profile from the current template\n" +
            "• Remove the base Docker image\n" +
            "• Then automatically run a full rebuild and launch\n\n" +
            "Your source code is not affected.",
            "Regenerate environment", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

        if (result != DialogResult.Yes) return;

        try
        {
            ProfileGenerator.RegenerateProfile(project.Profile, _languages, _portConfigs);

            var projectDir = ProjectScaffolder.GetProjectDir(project.Name);
            var composeFile = Path.Combine(projectDir, "docker-compose.yml");

            if (File.Exists(composeFile))
                DockerRunner.ComposeDownVolumes(composeFile, projectDir);
            else
            {
                var containerName = $"sandbox-{project.Name}";
                if (DockerRunner.IsContainerRunning(containerName))
                    DockerRunner.StopContainer(containerName);
            }

            ProjectScaffolder.RemoveProject(project.Name);

            var baseImageTag = $"agent-sandbox-{project.Profile}:latest";
            DockerRunner.RemoveImage(baseImageTag);

            var composeImageTag = $"{project.Name}-agent:latest";
            DockerRunner.RemoveImage(composeImageTag);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Regenerate error: {ex.Message}", "Error",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        PopulateRecentProjects();
        _txtPath.Text = project.WorkspacePath;
        _projectPath = project.WorkspacePath;
        _forceNoCache = true;
        ShowStep(4);
        _ = Task.Run(() => RunCoreLaunch(project.Profile));
    }

    private void OnRescanClicked(object? sender, EventArgs e)
    {
        if (_lstRecent.SelectedItems.Count == 0) return;

        var project = (ProjectScaffolder.RecentProject)_lstRecent.SelectedItems[0].Tag!;

        if (!Directory.Exists(project.WorkspacePath))
        {
            MessageBox.Show(this,
                $"Workspace folder no longer exists:\n{project.WorkspacePath}",
                "Folder Missing", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _projectPath = project.WorkspacePath;
        _txtPath.Text = project.WorkspacePath;
        RunDetection();
        _txtProfileName.Text = project.Profile;
        ShowStep(2);
    }

    private void OnScanClicked(object? sender, EventArgs e)
    {
        var path = _txtPath.Text.Trim().Trim('"');
        if (!Directory.Exists(path))
        {
            MessageBox.Show(this, "Folder not found. Please select a valid project folder.",
                "Invalid Path", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _projectPath = Path.GetFullPath(path);
        RunDetection();
        ShowStep(2);
    }

    // ─── Step 2: Detection Results ──────────────────────────────────────

    private void BuildStepDetect()
    {
        _stepDetect = new Panel { Dock = DockStyle.Fill, Visible = false };

        var title = new Label
        {
            Text = "Configure Environment",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30),
            Location = new Point(30, 12),
            AutoSize = true
        };

        var lblLang = new Label { Text = "Languages (detected items are pre-checked):", Location = new Point(30, 48), AutoSize = true };

        _lstLanguages = new CheckedListBox
        {
            Location = new Point(30, 70),
            Size = new Size(290, 180),
            CheckOnClick = true,
            BorderStyle = BorderStyle.FixedSingle
        };

        var lblVer = new Label { Text = "Versions (edit to override):", Location = new Point(340, 48), AutoSize = true };

        _gridVersions = new DataGridView
        {
            Location = new Point(340, 70),
            Size = new Size(290, 180),
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            AllowUserToResizeRows = false,
            RowHeadersVisible = false,
            SelectionMode = DataGridViewSelectionMode.CellSelect,
            BorderStyle = BorderStyle.FixedSingle,
            BackgroundColor = Color.White,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        };
        _gridVersions.Columns.Add(new DataGridViewTextBoxColumn { Name = "Language", HeaderText = "Language", ReadOnly = true });
        _gridVersions.Columns.Add(new DataGridViewTextBoxColumn { Name = "Version", HeaderText = "Version" });

        _lblFrameworks = new Label
        {
            Text = "",
            ForeColor = Color.FromArgb(0, 120, 212),
            Location = new Point(30, 262),
            AutoSize = true
        };

        var lblPorts = new Label { Text = "Ports (comma-separated, edit to add/remove):", Location = new Point(30, 290), AutoSize = true };

        _txtPorts = new TextBox
        {
            Location = new Point(30, 312),
            Size = new Size(600, 28),
            Font = new Font("Segoe UI", 10f)
        };

        var lblProfile = new Label { Text = "Profile name:", Location = new Point(30, 360), AutoSize = true };

        _txtProfileName = new TextBox
        {
            Location = new Point(30, 382),
            Size = new Size(300, 28),
            Font = new Font("Segoe UI", 10f)
        };

        _btnBack = new Button
        {
            Text = "\u2190 Back",
            Location = new Point(30, 440),
            Size = new Size(100, 40),
        };
        StyleFlatButton(_btnBack, Color.FromArgb(80, 80, 80));
        _btnBack.Click += (_, _) => ShowStep(1);

        _btnLaunch = new Button
        {
            Text = "Generate && Launch Sandbox",
            Location = new Point(340, 440),
            Size = new Size(290, 40),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnLaunch, Color.FromArgb(0, 120, 212), Color.White);
        _btnLaunch.Click += OnLaunchClicked;

        _stepDetect.Controls.AddRange([title, lblLang, _lstLanguages, lblVer, _gridVersions,
            _lblFrameworks, lblPorts, _txtPorts, lblProfile, _txtProfileName, _btnBack, _btnLaunch]);
        Controls.Add(_stepDetect);
    }

    private void RunDetection()
    {
        var detected = LanguageDetector.Detect(_projectPath, _languages);

        _lstLanguages.Items.Clear();
        _gridVersions.Rows.Clear();

        foreach (var key in _sortedKeys)
        {
            var label = $"{_languages[key].Label}  ({key})";
            var isChecked = detected.Contains(key);
            _lstLanguages.Items.Add(label, isChecked);
        }

        _detectedVersions = VersionDetector.Detect(_projectPath, detected, _languages);

        foreach (var key in _sortedKeys)
        {
            var ver = _detectedVersions.GetValueOrDefault(key, "");
            _gridVersions.Rows.Add(key, ver);
        }

        var (ports, frameworks) = PortDetector.Detect(_projectPath, detected, _portConfigs);
        _detectedPorts = ports;
        _txtPorts.Text = string.Join(", ", ports);

        _lblFrameworks.Text = frameworks.Count > 0
            ? $"Frameworks detected: {string.Join(", ", frameworks)}"
            : "";

        var defaultName = string.Join("-", detected);
        _txtProfileName.Text = defaultName;
    }

    private void OnLaunchClicked(object? sender, EventArgs e)
    {
        var selectedLanguages = new List<string>();
        for (int i = 0; i < _lstLanguages.Items.Count; i++)
        {
            if (_lstLanguages.GetItemChecked(i))
                selectedLanguages.Add(_sortedKeys[i]);
        }

        if (selectedLanguages.Count == 0)
        {
            MessageBox.Show(this, "Please select at least one language.", "No Languages",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var profileName = _txtProfileName.Text.Trim();
        if (string.IsNullOrEmpty(profileName))
        {
            profileName = string.Join("-", selectedLanguages);
            _txtProfileName.Text = profileName;
        }

        var versions = new Dictionary<string, string>();
        foreach (DataGridViewRow row in _gridVersions.Rows)
        {
            var lang = row.Cells["Language"].Value?.ToString() ?? "";
            var ver = row.Cells["Version"].Value?.ToString()?.Trim() ?? "";
            if (!string.IsNullOrEmpty(ver) && selectedLanguages.Contains(lang))
                versions[lang] = ver;
        }

        var ports = new List<int>();
        foreach (var p in _txtPorts.Text.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            if (int.TryParse(p.Trim(), out var port))
                ports.Add(port);
        }
        ports = ports.Distinct().OrderBy(p => p).ToList();

        var spec = new ProfileSpec
        {
            Name = profileName,
            Languages = selectedLanguages,
            Ports = ports
        };

        _pendingSpec = spec;
        ShowStep(3);
    }

    // ─── Step 3: Environment Variables ───────────────────────────────────────

    private void BuildStepEnvVars()
    {
        _stepEnvVars = new Panel { Dock = DockStyle.Fill, Visible = false };

        var title = new Label
        {
            Text = "Environment Variables",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30),
            Location = new Point(30, 12),
            AutoSize = true
        };

        var desc = new Label
        {
            Text = "Configure API keys for the CLI agents (optional - can also be set in host environment):",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(80, 80, 80),
            Location = new Point(30, 45),
            AutoSize = true
        };

        // Anthropic API Key (for Claude Code)
        var lblAnthropic = new Label { Text = "ANTHROPIC_API_KEY (Claude Code):", Location = new Point(30, 80), AutoSize = true };
        _txtAnthropicKey = new TextBox { Location = new Point(30, 102), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        var lblOpenAI = new Label { Text = "OPENAI_API_KEY (OpenAI):", Location = new Point(30, 140), AutoSize = true };
        _txtOpenAIKey = new TextBox { Location = new Point(30, 162), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        var lblCursor = new Label { Text = "CURSOR_API_KEY (Cursor CLI):", Location = new Point(30, 200), AutoSize = true };
        _txtCursorKey = new TextBox { Location = new Point(30, 222), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        var lblCopilot = new Label { Text = "GITHUB_COPILOT_API_KEY (GitHub Copilot):", Location = new Point(30, 260), AutoSize = true };
        _txtGitHubCopilotKey = new TextBox { Location = new Point(30, 282), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        var lblOpenRouter = new Label { Text = "OPENROUTER_API_KEY:", Location = new Point(30, 320), AutoSize = true };
        _txtOpenRouterKey = new TextBox { Location = new Point(30, 342), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        var lblOpenCode = new Label { Text = "OPENCODE_API_KEY:", Location = new Point(30, 380), AutoSize = true };
        _txtOpenCodeKey = new TextBox { Location = new Point(30, 402), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        var lblGemini = new Label { Text = "GEMINI_API_KEY:", Location = new Point(30, 440), AutoSize = true };
        _txtGeminiKey = new TextBox { Location = new Point(30, 462), Size = new Size(600, 28), UseSystemPasswordChar = true, Font = new Font("Segoe UI", 10f) };

        // Load existing env vars from project if available
        LoadEnvVarsFromProject();

        // Back button
        _btnBackEnv = new Button
        {
            Text = "\u2190 Back",
            Location = new Point(30, 520),
            Size = new Size(100, 40),
        };
        StyleFlatButton(_btnBackEnv, Color.FromArgb(80, 80, 80));
        _btnBackEnv.Click += (_, _) => ShowStep(2);

        _btnContinueEnv = new Button
        {
            Text = "Continue to Launch \u2192",
            Location = new Point(340, 520),
            Size = new Size(290, 40),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnContinueEnv, Color.FromArgb(0, 120, 212), Color.White);
        _btnContinueEnv.Click += OnEnvVarsContinue;

        _stepEnvVars.Controls.AddRange([
            title, desc,
            lblAnthropic, _txtAnthropicKey,
            lblOpenAI, _txtOpenAIKey,
            lblCursor, _txtCursorKey,
            lblCopilot, _txtGitHubCopilotKey,
            lblOpenRouter, _txtOpenRouterKey,
            lblOpenCode, _txtOpenCodeKey,
            lblGemini, _txtGeminiKey,
            _btnBackEnv, _btnContinueEnv
        ]);
        Controls.Add(_stepEnvVars);
    }

    private void LoadEnvVarsFromProject()
    {
        try
        {
            // First load saved defaults from Settings
            var saved = EnvVarSettings.Load();
            if (saved.TryGetValue("ANTHROPIC_API_KEY", out var v)) _txtAnthropicKey.Text = v;
            if (saved.TryGetValue("OPENAI_API_KEY", out v)) _txtOpenAIKey.Text = v;
            if (saved.TryGetValue("CURSOR_API_KEY", out v)) _txtCursorKey.Text = v;
            if (saved.TryGetValue("GITHUB_COPILOT_API_KEY", out v)) _txtGitHubCopilotKey.Text = v;
            if (saved.TryGetValue("OPENROUTER_API_KEY", out v)) _txtOpenRouterKey.Text = v;
            if (saved.TryGetValue("OPENCODE_API_KEY", out v)) _txtOpenCodeKey.Text = v;
            if (saved.TryGetValue("GEMINI_API_KEY", out v)) _txtGeminiKey.Text = v;

            // Then override with most recent project's env vars if available
            var projectsDir = Path.Combine(ResourceManager.AppDataRoot, "projects");
            if (!Directory.Exists(projectsDir))
                return;

            var projectDirs = Directory.GetDirectories(projectsDir)
                .OrderByDescending(d => File.GetLastWriteTime(d))
                .ToList();

            foreach (var projDir in projectDirs)
            {
                var envVars = ProjectScaffolder.ReadRuntimeEnvForUI(Path.GetFileName(projDir));
                if (envVars.Count > 0)
                {
                    if (envVars.TryGetValue("ANTHROPIC_API_KEY", out v)) _txtAnthropicKey.Text = v;
                    if (envVars.TryGetValue("OPENAI_API_KEY", out v)) _txtOpenAIKey.Text = v;
                    if (envVars.TryGetValue("CURSOR_API_KEY", out v)) _txtCursorKey.Text = v;
                    if (envVars.TryGetValue("GITHUB_COPILOT_API_KEY", out v)) _txtGitHubCopilotKey.Text = v;
                    if (envVars.TryGetValue("OPENROUTER_API_KEY", out v)) _txtOpenRouterKey.Text = v;
                    if (envVars.TryGetValue("OPENCODE_API_KEY", out v)) _txtOpenCodeKey.Text = v;
                    if (envVars.TryGetValue("GEMINI_API_KEY", out v)) _txtGeminiKey.Text = v;
                    break;
                }
            }
        }
        catch { /* ignore */ }
    }

    private void OnEnvVarsContinue(object? sender, EventArgs e)
    {
        var spec = _pendingSpec;
        _pendingSpec = null;

        ShowStep(4);

        if (spec != null)
        {
            _ = Task.Run(() =>
            {
                try
                {
                    Log($"[sandbox] Profile:   {spec.Name}");
                    Log($"[sandbox] Languages: {string.Join(", ", spec.Languages)}");
                    Log($"[sandbox] Ports:     {string.Join(", ", spec.Ports)}");
                    Log($"[sandbox] Workspace: {_projectPath}");
                    Log("");

                    Log("[sandbox] Checking Docker...");
                    if (!DockerRunner.IsDockerAvailable())
                    {
                        Log("ERROR: Docker is not available. Is Docker Desktop running?");
                        ShowDoneButton("Docker not available");
                        return;
                    }
                    Log("[sandbox] Docker is ready.");

                    Log($"[sandbox] Generating profile '{spec.Name}'...");
                    ProfileGenerator.Generate(spec, _languages);
                    Log("[sandbox] Profile generated.");

                    RunCoreLaunch(spec.Name);
                }
                catch (Exception ex)
                {
                    Log($"ERROR: {ex.Message}");
                    ShowDoneButton("Error occurred");
                }
            });
        }
    }

    // Dictionary to store env vars for current launch
    private Dictionary<string, string> _currentEnvVars = new();

    public Dictionary<string, string> GetCurrentEnvVars()
    {
        _currentEnvVars.Clear();

        if (!string.IsNullOrWhiteSpace(_txtAnthropicKey.Text))
            _currentEnvVars["ANTHROPIC_API_KEY"] = _txtAnthropicKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtOpenAIKey.Text))
            _currentEnvVars["OPENAI_API_KEY"] = _txtOpenAIKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtCursorKey.Text))
            _currentEnvVars["CURSOR_API_KEY"] = _txtCursorKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtGitHubCopilotKey.Text))
            _currentEnvVars["GITHUB_COPILOT_API_KEY"] = _txtGitHubCopilotKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtOpenRouterKey.Text))
            _currentEnvVars["OPENROUTER_API_KEY"] = _txtOpenRouterKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtOpenCodeKey.Text))
            _currentEnvVars["OPENCODE_API_KEY"] = _txtOpenCodeKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtGeminiKey.Text))
            _currentEnvVars["GEMINI_API_KEY"] = _txtGeminiKey.Text;

        return _currentEnvVars;
    }

    // ─── Step 4: Launching ────────────────────────────────────────────────

    private void BuildStepLaunch()
    {
        _stepLaunch = new Panel { Dock = DockStyle.Fill, Visible = false };

        var title = new Label
        {
            Text = "Launching Sandbox...",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 30, 30),
            Location = new Point(30, 12),
            AutoSize = true
        };

        _txtLog = new TextBox
        {
            Location = new Point(30, 50),
            Size = new Size(600, 560),
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(30, 30, 30),
            ForeColor = Color.FromArgb(200, 220, 200),
            Font = new Font("Cascadia Mono", 9f, FontStyle.Regular),
            BorderStyle = BorderStyle.None
        };

        _stepLaunch.Controls.AddRange([title, _txtLog]);
        Controls.Add(_stepLaunch);
    }

    private void Log(string message)
    {
        if (InvokeRequired)
        {
            Invoke(() => Log(message));
            return;
        }
        _txtLog.AppendText(message + Environment.NewLine);
    }

    /// <summary>
    /// Core launch logic shared by fresh wizard flow and quick-continue.
    /// Assumes profile already exists in PreparedDir. Must run on a background thread.
    /// </summary>
    private void RunCoreLaunch(string profileName)
    {
        try
        {
            var profileDir = Path.Combine(ResourceManager.PreparedDir, profileName);
            var projectName = ProjectScaffolder.ResolveProjectName(_projectPath);
            var containerName = $"sandbox-{projectName}";
            var baseImage = $"agent-sandbox-{profileName}:latest";
            var projectDir = ProjectScaffolder.GetProjectDir(projectName);

            Log("[sandbox] Checking Docker...");
            if (!DockerRunner.IsDockerAvailable())
            {
                Log("ERROR: Docker is not available. Is Docker Desktop running?");
                ShowDoneButton("Docker not available");
                return;
            }
            Log("[sandbox] Docker is ready.");

            if (DockerRunner.IsContainerRunning(containerName))
            {
                Log($"[sandbox] Container '{containerName}' is already running.");
                var result = MessageBox.Show(
                    $"Container '{containerName}' is already running.\n\nReattach to the existing container?",
                    "Container Running",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question);

                if (result == DialogResult.Yes)
                {
                    Log("[sandbox] Reattaching...");
                    var reattachCmd = ProjectScaffolder.GetAgentCommand(projectName);
                    DockerRunner.ExecInteractive(containerName, reattachCmd, newWindow: true);
                    Log("[sandbox] Session ended.");
                    PostSessionCheck(projectName, containerName, projectDir);
                    ShowDoneButton("Session complete");
                    return;
                }

                Log("[sandbox] Stopping existing container...");
                var cf = Path.Combine(projectDir, "docker-compose.yml");
                if (File.Exists(cf))
                    DockerRunner.ComposeDown(cf, projectDir);
                else
                    DockerRunner.StopContainer(containerName);
            }

            var noCache = _forceNoCache;
            _forceNoCache = false;
            Log($"[sandbox] Building base image {baseImage}{(noCache ? " (no cache)" : "")}...");
            var buildResult = DockerRunner.Build(
                Path.Combine(profileDir, "Dockerfile.base"), baseImage, profileDir, Log, noCache);
            if (buildResult != 0)
            {
                Log("ERROR: Docker build failed. See output above.");
                ShowDoneButton("Build failed");
                return;
            }
            Log("[sandbox] Image built.");

            if (!ProjectScaffolder.Exists(projectName))
            {
                Log("[sandbox] New project. Scaffolding...");
                ProjectScaffolder.Scaffold(projectName, _projectPath, profileName, profileDir);
                Log("[sandbox] Project scaffolded.");
            }
            else
            {
                Log("[sandbox] Existing project found. Refreshing config from profile...");
                ProjectScaffolder.RefreshFromProfile(projectName, _projectPath, profileDir);
            }

            ProjectScaffolder.UpdateLastStarted(projectName);
            ProjectScaffolder.UpdateWorkspacePath(projectName, _projectPath);
            ProjectScaffolder.SyncHostAuth(projectName, Log);
            ProjectScaffolder.WriteRuntimeEnv(projectName, GetCurrentEnvVars());
            ProjectScaffolder.RemapPorts(projectName, Log);

            if (ProjectScaffolder.HasDockerfileExtension(projectName))
            {
                var bake = MessageBox.Show(
                    "A Dockerfile.extension was found (the agent requested system changes).\n\nBake into project Dockerfile?",
                    "Dockerfile.extension", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (bake == DialogResult.Yes)
                {
                    ProjectScaffolder.BakeDockerfileExtension(projectName);
                    Log("[sandbox] Dockerfile.extension baked into project Dockerfile.");
                }
            }

            var composePath = Path.Combine(projectDir, "docker-compose.yml");
            Log($"[sandbox] Starting container {containerName}...");
            var upResult = DockerRunner.ComposeUp(composePath, projectDir, Log);
            for (var retry = 0; retry < 10 && upResult != 0; retry++)
            {
                var (_, captureOutput) = DockerRunner.ComposeUpCapture(composePath, projectDir);
                if (!DockerRunner.TryParsePortFromComposeError(captureOutput, out var failedPort) ||
                    !ProjectScaffolder.RemapPort(projectName, failedPort, Log))
                    break;
                Log($"[sandbox] Retrying after remapping port {failedPort}...");
                upResult = DockerRunner.ComposeUp(composePath, projectDir, Log);
            }
            if (upResult != 0)
            {
                Log("ERROR: docker compose up failed. See output above.");
                ShowDoneButton("Container start failed");
                return;
            }

            var runningContainer = DockerRunner.GetComposeContainerId(composePath, projectDir) ?? containerName;
            DockerRunner.WaitForReady(runningContainer, 120, Log);

            var agentCmd = ProjectScaffolder.GetAgentCommand(projectName);
            Log($"[sandbox] Attaching to {containerName}...");
            Log($"[sandbox] Starting agent: {agentCmd} (new terminal window)");
            DockerRunner.ExecInteractive(runningContainer, agentCmd, newWindow: true);

            Log("");
            Log("[sandbox] Session ended.");

            PostSessionCheck(projectName, containerName, projectDir);
            ShowDoneButton("Session complete");
        }
        catch (Exception ex)
        {
            Log($"ERROR: {ex.Message}");
            ShowDoneButton("Error occurred");
        }
    }

    private void PostSessionCheck(string projectName, string containerName, string projectDir)
    {
        if (!ProjectScaffolder.HasDockerfileExtension(projectName))
            return;

        var bake = MessageBox.Show(
            "The agent created a Dockerfile.extension during this session.\n\nBake into project Dockerfile and stop container for rebuild?",
            "Dockerfile.extension", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (bake == DialogResult.Yes)
        {
            ProjectScaffolder.BakeDockerfileExtension(projectName);
            var composePath = Path.Combine(projectDir, "docker-compose.yml");
            if (File.Exists(composePath))
                DockerRunner.ComposeDown(composePath, projectDir);
            else
                DockerRunner.StopContainer(containerName);
            Log("[sandbox] Changes baked. Container stopped for rebuild on next run.");
        }
    }

    private void ShowDoneButton(string status)
    {
        if (InvokeRequired)
        {
            Invoke(() => ShowDoneButton(status));
            return;
        }

        foreach (var c in _stepLaunch.Controls.OfType<Button>().ToList())
            _stepLaunch.Controls.Remove(c);

        var btnBack = new Button
        {
            Text = "Back to overview",
            Location = new Point(30, 618),
            Size = new Size(180, 40),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(btnBack, Color.FromArgb(0, 120, 212), Color.White);
        btnBack.Click += (_, _) =>
        {
            PopulateRecentProjects();
            ShowStep(1);
        };

        var btnClose = new Button
        {
            Text = $"Close  ({status})",
            Location = new Point(230, 618),
            Size = new Size(180, 40),
        };
        StyleFilledButton(btnClose, Color.FromArgb(60, 60, 60), Color.White);
        btnClose.Click += (_, _) => Close();

        _stepLaunch.Controls.Add(btnBack);
        _stepLaunch.Controls.Add(btnClose);
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private static void StyleFlatButton(Button btn, Color fg, Color? hoverBg = null)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.ForeColor = fg;
        btn.FlatAppearance.BorderColor = fg;
        btn.FlatAppearance.MouseOverBackColor = hoverBg ?? Color.FromArgb(30, fg);
        btn.FlatAppearance.MouseDownBackColor = Color.FromArgb(50, fg);
    }

    private static void StyleFilledButton(Button btn, Color bg, Color fg, Color? hoverBg = null)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.BackColor = bg;
        btn.ForeColor = fg;
        btn.FlatAppearance.BorderColor = bg;
        btn.FlatAppearance.MouseOverBackColor = hoverBg ?? ControlPaint.Light(bg, 0.15f);
        btn.FlatAppearance.MouseDownBackColor = ControlPaint.Dark(bg, 0.1f);
    }

    private void ShowStep(int step)
    {
        _stepSetup.Visible = step == 0;
        _stepFolder.Visible = step == 1;
        _stepDetect.Visible = step == 2;
        _stepEnvVars.Visible = step == 3;
        _stepLaunch.Visible = step == 4;
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
}
