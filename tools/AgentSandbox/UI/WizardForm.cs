using System.Diagnostics;
using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox.UI;

public sealed class WizardForm : Form
{
    private readonly Dictionary<string, LanguageConfig> _languages;
    private readonly Dictionary<string, PortConfig> _portConfigs;

    // Step panels
    private Panel _stepFolder = null!;
    private Panel _stepDetect = null!;
    private Panel _stepLaunch = null!;

    // Step 1: folder + recent projects
    private TextBox _txtPath = null!;
    private Button _btnBrowse = null!;
    private Button _btnScan = null!;
    private ListView _lstRecent = null!;
    private Button _btnContinue = null!;

    // Step 2: detection results
    private CheckedListBox _lstLanguages = null!;
    private DataGridView _gridVersions = null!;
    private TextBox _txtPorts = null!;
    private Label _lblFrameworks = null!;
    private TextBox _txtProfileName = null!;
    private Button _btnBack = null!;
    private Button _btnLaunch = null!;

    // Step 3: launching
    private TextBox _txtLog = null!;

    // State
    private string _projectPath = "";
    private List<string> _sortedKeys = new();
    private Dictionary<string, string> _detectedVersions = new();
    private List<int> _detectedPorts = new();

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

        BuildStepFolder();
        BuildStepDetect();
        BuildStepLaunch();

        ShowStep(1);
    }

    public void SetInitialPath(string path)
    {
        _txtPath.Text = path;
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
            PlaceholderText = @"C:\Users\you\projects\my-app"
        };

        _btnBrowse = new Button
        {
            Text = "Browse...",
            Location = new Point(520, 120),
            Size = new Size(100, 30),
            FlatStyle = FlatStyle.Flat
        };
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
            Location = new Point(30, 170),
            Size = new Size(200, 40),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(0, 120, 212),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        _btnScan.Click += OnScanClicked;

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
            _btnContinue.Enabled = _lstRecent.SelectedItems.Count > 0;
        };
        _lstRecent.DoubleClick += OnContinueClicked;

        _btnContinue = new Button
        {
            Text = "Continue with Selected \u2192",
            Location = new Point(410, 572),
            Size = new Size(220, 40),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(46, 139, 87),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            Enabled = false
        };
        _btnContinue.Click += OnContinueClicked;

        PopulateRecentProjects();

        _stepFolder.Controls.AddRange([title, subtitle, lblPath, _txtPath, _btnBrowse,
            _btnScan, lblRecent, _lstRecent, _btnContinue]);
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
        ShowStep(3);
        _ = Task.Run(() => RunCoreLaunch(project.Profile));
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
            Size = new Size(600, 28)
        };

        var lblProfile = new Label { Text = "Profile name:", Location = new Point(30, 360), AutoSize = true };

        _txtProfileName = new TextBox
        {
            Location = new Point(30, 382),
            Size = new Size(300, 28)
        };

        _btnBack = new Button
        {
            Text = "\u2190 Back",
            Location = new Point(30, 440),
            Size = new Size(100, 40),
            FlatStyle = FlatStyle.Flat
        };
        _btnBack.Click += (_, _) => ShowStep(1);

        _btnLaunch = new Button
        {
            Text = "Generate && Launch Sandbox",
            Location = new Point(340, 440),
            Size = new Size(290, 40),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(0, 120, 212),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
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
            Versions = versions,
            Ports = ports
        };

        ShowStep(3);
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

    // ─── Step 3: Launching ──────────────────────────────────────────────

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
            var projectName = Path.GetFileName(_projectPath)!;
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
                    DockerRunner.ExecInteractive(containerName, "opencode");
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

            Log($"[sandbox] Building base image {baseImage}...");
            var buildResult = DockerRunner.Build(
                Path.Combine(profileDir, "Dockerfile.base"), baseImage, profileDir, Log);
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
            if (upResult != 0)
            {
                Log("ERROR: docker compose up failed. See output above.");
                ShowDoneButton("Container start failed");
                return;
            }

            Log($"[sandbox] Attaching to {containerName}...");
            Log("[sandbox] OpenCode will open in a new terminal window.");
            DockerRunner.ExecInteractive(containerName, "opencode");

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

        var btn = new Button
        {
            Text = $"Close  ({status})",
            Location = new Point(30, 620),
            Size = new Size(600, 36),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(60, 60, 60),
            ForeColor = Color.White
        };
        btn.Click += (_, _) => Close();
        _stepLaunch.Controls.Add(btn);
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private void ShowStep(int step)
    {
        _stepFolder.Visible = step == 1;
        _stepDetect.Visible = step == 2;
        _stepLaunch.Visible = step == 3;
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
