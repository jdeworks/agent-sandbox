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
    private ListView _lstRecent = null!;
    private ComboBox _cboProfile = null!;
    private Button _btnLaunch = null!;
    private Button _btnBackToProfiles = null!;
    private Button _btnEditUserEnv = null!;
    private TextBox _txtLog = null!;
    private Button _btnBackOverview = null!;
    private Button _btnClose = null!;

    public WizardForm()
    {
        _languages = ConfigLoader.LoadLanguages();
        _portConfigs = ConfigLoader.LoadPorts();

        Text = "Agent Sandbox";
        Size = new Size(720, 680);
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
            Size = new Size(640, 376),
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
            Location = new Point(32, 540),
            Size = new Size(104, 44)
        };
        StyleFlatButton(_btnDeleteProfile, DangerRed);
        _btnDeleteProfile.Click += OnDeleteProfileClicked;

        _btnContinueToProject = new Button
        {
            Text = "Continue to Project Selection \u2192",
            Location = new Point(408, 540),
            Size = new Size(264, 44),
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
            _lblNoProfiles, _btnDeleteProfile, _btnContinueToProject]);
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
            Size = new Size(720, 80),
            BackColor = SurfaceLight
        };
        var title = new Label
        {
            Text = "Launch Sandbox",
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 16),
            AutoSize = true
        };
        var subtitleLaunch = new Label
        {
            Text = "Select a project folder and profile to launch",
            Font = new Font("Segoe UI", 10f),
            ForeColor = TextMuted,
            Location = new Point(32, 50),
            AutoSize = true
        };
        headerPanel.Controls.AddRange([title, subtitleLaunch]);

        var lblPath = new Label
        {
            Text = "Project folder",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 96),
            AutoSize = true
        };

        _txtPath = new TextBox
        {
            Location = new Point(32, 120),
            Size = new Size(528, 28),
            Font = new Font("Segoe UI", 10f)
        };

        _btnBrowse = new Button
        {
            Text = "Browse\u2026",
            Location = new Point(568, 118),
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

        var lblRecent = new Label
        {
            Text = "Recent projects",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 160),
            AutoSize = true
        };

        _lstRecent = new ListView
        {
            Location = new Point(32, 184),
            Size = new Size(640, 152),
            View = View.Details,
            FullRowSelect = true,
            GridLines = false,
            MultiSelect = false,
            BorderStyle = BorderStyle.FixedSingle
        };
        _lstRecent.Columns.Add("Project", 160);
        _lstRecent.Columns.Add("Profile", 130);
        _lstRecent.Columns.Add("Last Used", 110);
        _lstRecent.Columns.Add("Workspace Path", 220);
        _lstRecent.SelectedIndexChanged += OnRecentProjectSelected;

        var lblProfile = new Label
        {
            Text = "Profile",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(32, 352),
            AutoSize = true
        };

        _cboProfile = new ComboBox
        {
            Location = new Point(32, 376),
            Size = new Size(264, 28),
            DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 10f)
        };

        _btnLaunch = new Button
        {
            Text = "Launch",
            Location = new Point(504, 372),
            Size = new Size(168, 44),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnLaunch, AccentBlue, Color.White);
        _btnLaunch.Click += OnLaunchClicked;

        _btnBackToProfiles = new Button
        {
            Text = "\u2190 Back to Profiles",
            Location = new Point(32, 424),
            Size = new Size(176, 40)
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
            Location = new Point(224, 424),
            Size = new Size(136, 40)
        };
        StyleFlatButton(_btnEditUserEnv, AccentBlue);
        _btnEditUserEnv.ForeColor = AccentBlue;
        _btnEditUserEnv.Click += OnEditUserEnvClicked;

        var btnSettings = new Button
        {
            Text = "Settings\u2026",
            Location = new Point(376, 424),
            Size = new Size(104, 40)
        };
        StyleFlatButton(btnSettings, TextMuted);
        btnSettings.Click += (_, _) => new SettingsForm().ShowDialog(this);

        _txtLog = new TextBox
        {
            Location = new Point(32, 480),
            Size = new Size(640, 152),
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
            Location = new Point(32, 640),
            Size = new Size(168, 44),
            Visible = false
        };
        StyleFlatButton(_btnBackOverview, TextPrimary);
        _btnBackOverview.Click += OnBackToOverviewClicked;

        _btnClose = new Button
        {
            Text = "Close",
            Location = new Point(216, 640),
            Size = new Size(104, 44),
            Visible = false
        };
        StyleFilledButton(_btnClose, Color.FromArgb(63, 63, 70), Color.White);
        _btnClose.Click += (_, _) => Close();

        _stepLaunch.Controls.AddRange([headerPanel, lblPath, _txtPath, _btnBrowse,
            lblRecent, _lstRecent, lblProfile, _cboProfile,
            _btnLaunch, _btnBackToProfiles, _btnEditUserEnv, btnSettings,
            _txtLog, _btnBackOverview, _btnClose]);
        Controls.Add(_stepLaunch);

        RefreshProfileDropdown();
        RefreshRecentProjects();
    }

    private void OnRecentProjectSelected(object? sender, EventArgs e)
    {
        if (_lstRecent.SelectedItems.Count == 0) return;

        var item = _lstRecent.SelectedItems[0];
        var workspacePath = item.SubItems[3].Text;
        var profile = item.SubItems[1].Text;

        _txtPath.Text = workspacePath;

        // Auto-select profile in dropdown
        for (int i = 0; i < _cboProfile.Items.Count; i++)
        {
            if (_cboProfile.Items[i] as string == profile)
            {
                _cboProfile.SelectedIndex = i;
                break;
            }
        }
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
        _cboProfile.Items.Clear();

        if (!Directory.Exists(ResourceManager.PreparedDir)) return;

        foreach (var dir in Directory.GetDirectories(ResourceManager.PreparedDir))
        {
            _cboProfile.Items.Add(Path.GetFileName(dir)!);
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

        if (_cboProfile.SelectedItem is not string profileName || string.IsNullOrEmpty(profileName))
        {
            MessageBox.Show("Please select a profile.", "Launch",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (!DockerRunner.IsDockerAvailable())
        {
            MessageBox.Show("Docker is not available. Please start Docker Desktop and try again.",
                "Docker Not Found", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        // Switch to launch mode
        _btnLaunch.Enabled = false;
        _btnBackToProfiles.Enabled = false;
        _btnEditUserEnv.Enabled = false;
        _btnBrowse.Enabled = false;
        _txtPath.ReadOnly = true;
        _cboProfile.Enabled = false;
        _lstRecent.Enabled = false;
        _txtLog.Visible = true;
        _txtLog.Clear();
        _btnBackOverview.Visible = false;
        _btnClose.Visible = false;

        await RunCoreLaunch(path, profileName);
    }

    private async Task RunCoreLaunch(string workspacePath, string profileName)
    {
        void Log(string msg)
        {
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
            var tag = $"agent-sandbox-{profileName}:latest";

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

                // Write runtime env and sync auth
                Log("[sandbox] Writing runtime environment...");
                ProjectScaffolder.WriteRuntimeEnv(projectName);
                ProjectScaffolder.SyncHostAuth(projectName, Log);

                // Remap ports if needed
                ProjectScaffolder.RemapPorts(projectName, Log);

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

                // Launch agent in new window (returns immediately — agent runs in separate cmd.exe)
                var containerTarget = containerId ?? $"{projectName}-agent-1";
                var agentCmd = ProjectScaffolder.GetAgentCommand(projectName);
                Log($"[sandbox] Launching agent: {agentCmd}");
                DockerRunner.ExecInteractive(containerTarget, agentCmd, newWindow: true);

                // Note: Dockerfile.extension check cannot run here because the agent is
                // still running in a new window. It will be checked on next launch instead
                // (RefreshFromProfile path in the existing project branch above).

                Log("[sandbox] Agent launched in new window.");
            });

            // Show completion buttons
            Invoke(() =>
            {
                _btnBackOverview.Visible = true;
                _btnClose.Visible = true;
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
        // Reset launch UI state
        _btnLaunch.Enabled = true;
        _btnBackToProfiles.Enabled = true;
        _btnEditUserEnv.Enabled = true;
        _btnBrowse.Enabled = true;
        _txtPath.ReadOnly = false;
        _cboProfile.Enabled = true;
        _lstRecent.Enabled = true;
        _txtLog.Visible = false;
        _btnBackOverview.Visible = false;
        _btnClose.Visible = false;

        RefreshProfileDropdown();
        RefreshRecentProjects();
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
}
