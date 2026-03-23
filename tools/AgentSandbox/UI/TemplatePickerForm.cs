using System.Text.Json;
using AgentSandbox.Models;
using AgentSandbox.Services;

namespace AgentSandbox.UI;

/// <summary>
/// Modal dialog that lists available templates and offers Quick Start or Customize actions.
/// </summary>
public sealed class TemplatePickerForm : Form
{
    private static readonly Color AccentBlue = Color.FromArgb(0, 120, 212);
    private static readonly Color TextPrimary = Color.FromArgb(24, 24, 27);
    private static readonly Color TextMuted = Color.FromArgb(113, 113, 122);
    private static readonly Color SurfaceLight = Color.FromArgb(250, 250, 250);

    private readonly List<TemplateInfo> _templates;
    private readonly Dictionary<string, LanguageConfig> _languages;
    private readonly Dictionary<string, PortConfig> _portConfigs;

    private ListBox _lstTemplates = null!;
    private Label _lblDescription = null!;
    private Button _btnQuickStart = null!;
    private Button _btnCustomize = null!;

    public TemplatePickerForm(
        List<TemplateInfo> templates,
        Dictionary<string, LanguageConfig> languages,
        Dictionary<string, PortConfig> portConfigs)
    {
        _templates = templates;
        _languages = languages;
        _portConfigs = portConfigs;

        Text = "Use Template";
        Size = new Size(560, 480);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 10f);
        BackColor = Color.White;

        BuildUI();
    }

    private void BuildUI()
    {
        var title = new Label
        {
            Text = "Choose a Template",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = TextPrimary,
            Location = new Point(24, 16),
            AutoSize = true
        };

        var hint = new Label
        {
            Text = "Templates provide pre-configured profiles for common workflows.",
            Font = new Font("Segoe UI", 9f),
            ForeColor = TextMuted,
            Location = new Point(24, 46),
            AutoSize = true
        };

        _lstTemplates = new ListBox
        {
            Location = new Point(24, 76),
            Size = new Size(496, 180),
            Font = new Font("Segoe UI", 10f),
            BorderStyle = BorderStyle.FixedSingle,
            DrawMode = DrawMode.OwnerDrawFixed,
            ItemHeight = 36
        };
        _lstTemplates.DrawItem += OnDrawTemplateItem;
        _lstTemplates.SelectedIndexChanged += OnTemplateSelected;

        foreach (var t in _templates)
            _lstTemplates.Items.Add(t);

        _lblDescription = new Label
        {
            Location = new Point(24, 268),
            Size = new Size(496, 100),
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = TextPrimary,
            BackColor = SurfaceLight,
            Padding = new Padding(8),
            TextAlign = ContentAlignment.TopLeft
        };

        _btnQuickStart = new Button
        {
            Text = "Quick Start",
            Location = new Point(24, 388),
            Size = new Size(160, 44),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFilledButton(_btnQuickStart, AccentBlue, Color.White);
        _btnQuickStart.Click += OnQuickStartClicked;

        _btnCustomize = new Button
        {
            Text = "Customize\u2026",
            Location = new Point(196, 388),
            Size = new Size(160, 44),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        StyleFlatButton(_btnCustomize, AccentBlue);
        _btnCustomize.Click += OnCustomizeClicked;

        var btnCancel = new Button
        {
            Text = "Cancel",
            Location = new Point(420, 388),
            Size = new Size(100, 44)
        };
        StyleFlatButton(btnCancel, TextMuted);
        btnCancel.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

        Controls.AddRange(new Control[] { title, hint, _lstTemplates, _lblDescription,
            _btnQuickStart, _btnCustomize, btnCancel });

        if (_lstTemplates.Items.Count > 0)
            _lstTemplates.SelectedIndex = 0;

        UpdateButtons();
    }

    private void OnDrawTemplateItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0) return;
        e.DrawBackground();

        var template = (TemplateInfo)_lstTemplates.Items[e.Index];
        var isSelected = (e.State & DrawItemState.Selected) != 0;
        var textColor = isSelected ? Color.White : TextPrimary;
        var mutedColor = isSelected ? Color.FromArgb(200, 200, 200) : TextMuted;

        using var boldFont = new Font("Segoe UI", 10f, FontStyle.Bold);
        using var smallFont = new Font("Segoe UI", 8.5f);
        using var textBrush = new SolidBrush(textColor);
        using var mutedBrush = new SolidBrush(mutedColor);

        var labelRect = new Rectangle(e.Bounds.X + 8, e.Bounds.Y + 2, e.Bounds.Width - 16, 18);
        var descRect = new Rectangle(e.Bounds.X + 8, e.Bounds.Y + 18, e.Bounds.Width - 16, 16);

        e.Graphics.DrawString(template.Label, boldFont, textBrush, labelRect);
        e.Graphics.DrawString(template.Description, smallFont, mutedBrush, descRect);

        e.DrawFocusRectangle();
    }

    private void OnTemplateSelected(object? sender, EventArgs e)
    {
        UpdateButtons();

        if (_lstTemplates.SelectedIndex < 0)
        {
            _lblDescription.Text = "";
            return;
        }

        var template = (TemplateInfo)_lstTemplates.SelectedItem!;
        var lines = new List<string>();
        if (!string.IsNullOrEmpty(template.Description))
            lines.Add(template.Description);
        if (!string.IsNullOrEmpty(template.UseCases))
        {
            lines.Add("");
            lines.Add(template.UseCases);
        }

        // Show what's included
        try
        {
            var spec = TemplateLoader.ToProfileSpec(template);
            var parts = new List<string>();
            if (spec.Agents.Count > 0) parts.Add($"Agents: {string.Join(", ", spec.Agents)}");
            if (spec.Languages.Count > 0) parts.Add($"Languages: {string.Join(", ", spec.Languages)}");
            if (spec.Additions.Count > 0) parts.Add($"Additions: {string.Join(", ", spec.Additions)}");
            if (parts.Count > 0)
            {
                lines.Add("");
                lines.AddRange(parts);
            }
        }
        catch { }

        _lblDescription.Text = string.Join(Environment.NewLine, lines);
    }

    private void UpdateButtons()
    {
        var hasSelection = _lstTemplates.SelectedIndex >= 0;
        _btnQuickStart.Enabled = hasSelection;
        _btnCustomize.Enabled = hasSelection;
    }

    private async void OnQuickStartClicked(object? sender, EventArgs e)
    {
        if (_lstTemplates.SelectedIndex < 0) return;

        var template = (TemplateInfo)_lstTemplates.SelectedItem!;
        var spec = TemplateLoader.ToProfileSpec(template);

        // Check if profile name already exists
        var profileDir = Path.Combine(ResourceManager.PreparedDir, spec.Name);
        if (Directory.Exists(profileDir))
        {
            var overwrite = MessageBox.Show(
                $"A profile named '{spec.Name}' already exists. Overwrite it?",
                "Profile Exists", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (overwrite != DialogResult.Yes) return;
        }

        if (!DockerRunner.IsDockerAvailable())
        {
            MessageBox.Show("Docker is not running.", "Docker Required",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        _btnQuickStart.Enabled = false;
        _btnCustomize.Enabled = false;
        _lstTemplates.Enabled = false;
        _btnQuickStart.Text = "Building\u2026";

        var success = false;
        try
        {
            await Task.Run(() =>
            {
                ProfileGenerator.RegenerateProfile(spec.Name, _languages, _portConfigs);

                // Write profile.json with template info
                var manifestObj = new Dictionary<string, object>
                {
                    ["name"] = spec.Name,
                    ["agents"] = spec.Agents,
                    ["plugins"] = spec.Plugins,
                    ["custom_plugins"] = spec.CustomPlugins,
                    ["skills"] = spec.Skills,
                    ["languages"] = spec.Languages,
                    ["versions"] = spec.Versions,
                    ["additions"] = spec.Additions,
                    ["vscode_extensions"] = spec.VscodeExtensions,
                    ["mcp_servers"] = spec.McpServers,
                    ["custom_dockerfile_lines"] = spec.CustomDockerfileLines,
                    ["custom_startup_before"] = spec.CustomStartupBefore,
                    ["custom_startup_after"] = spec.CustomStartupAfter,
                    ["template"] = spec.Template,
                    ["created"] = DateTime.Now.ToString("O")
                };
                var manifest = System.Text.Json.JsonSerializer.Serialize(manifestObj,
                    new JsonSerializerOptions { WriteIndented = true });
                var pDir = Path.Combine(ResourceManager.PreparedDir, spec.Name);
                ResourceManager.WriteLf(Path.Combine(pDir, "profile.json"), manifest);

                var tag = $"agent-sandbox-{spec.Name}:latest";
                var dfPath = Path.Combine(pDir, "Dockerfile.base");
                var exitCode = DockerRunner.Build(dfPath, tag, pDir);
                success = exitCode == 0;
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error: {ex.Message}", "Quick Start Failed",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        if (success)
        {
            DialogResult = DialogResult.OK;
            Close();
        }
        else
        {
            _btnQuickStart.Enabled = true;
            _btnCustomize.Enabled = true;
            _lstTemplates.Enabled = true;
            _btnQuickStart.Text = "Quick Start";
            MessageBox.Show("Docker image build failed. Try 'Customize...' to adjust settings.",
                "Build Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OnCustomizeClicked(object? sender, EventArgs e)
    {
        if (_lstTemplates.SelectedIndex < 0) return;

        var template = (TemplateInfo)_lstTemplates.SelectedItem!;
        var spec = TemplateLoader.ToProfileSpec(template);

        using var setupForm = new SetupForm(_languages, _portConfigs);
        setupForm.PreFillFromTemplate(spec);

        if (setupForm.ShowDialog(this) == DialogResult.OK)
        {
            DialogResult = DialogResult.OK;
            Close();
        }
    }

    private static void StyleFlatButton(Button btn, Color fg)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.ForeColor = fg;
        btn.FlatAppearance.BorderColor = Color.FromArgb(228, 228, 231);
        btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(244, 244, 245);
        btn.FlatAppearance.MouseDownBackColor = Color.FromArgb(228, 228, 231);
        btn.Cursor = Cursors.Hand;
    }

    private static void StyleFilledButton(Button btn, Color bg, Color fg)
    {
        btn.FlatStyle = FlatStyle.Flat;
        btn.BackColor = bg;
        btn.ForeColor = fg;
        btn.FlatAppearance.BorderColor = bg;
        btn.FlatAppearance.MouseOverBackColor = ControlPaint.Light(bg, 0.15f);
        btn.FlatAppearance.MouseDownBackColor = ControlPaint.Dark(bg, 0.1f);
        btn.Cursor = Cursors.Hand;
    }
}
