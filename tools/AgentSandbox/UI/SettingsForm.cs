using AgentSandbox.Services;

namespace AgentSandbox.UI;

public sealed class SettingsForm : Form
{
    private ComboBox _cboDefaultAgent = null!;
    private TextBox _txtAnthropicKey = null!;
    private TextBox _txtOpenAIKey = null!;
    private TextBox _txtCursorKey = null!;
    private TextBox _txtGitHubCopilotKey = null!;
    private TextBox _txtOpenRouterKey = null!;
    private TextBox _txtOpenCodeKey = null!;
    private TextBox _txtGeminiKey = null!;

    private static readonly (string Display, string Value)[] AgentOptions =
    [
        ("OpenCode (default)", "opencode"),
        ("Claude Code", "claude"),
        ("Cursor CLI", "cursor"),
        ("GitHub Copilot", "copilot")
    ];

    private static readonly Color HeaderBg = Color.FromArgb(248, 250, 252);
    private static readonly Color SectionBorder = Color.FromArgb(220, 224, 230);
    private static readonly Color AccentBlue = Color.FromArgb(0, 120, 212);
    private static readonly Color TextMuted = Color.FromArgb(100, 100, 100);
    private static readonly Color TextDark = Color.FromArgb(40, 40, 40);

    public SettingsForm()
    {
        Text = "Settings";
        Size = new Size(580, 730);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 9.5f);
        BackColor = Color.White;
        Padding = new Padding(0);

        const int pad = 28;
        int y = pad;

        // Header strip
        var header = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(580, 72),
            BackColor = HeaderBg,
            BorderStyle = BorderStyle.None
        };
        var title = new Label
        {
            Text = "Settings",
            Font = new Font("Segoe UI", 18f, FontStyle.Bold),
            ForeColor = TextDark,
            Location = new Point(pad, 20),
            AutoSize = true
        };
        var subtitle = new Label
        {
            Text = "Default agent and saved environment variables",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = TextMuted,
            Location = new Point(pad, 48),
            AutoSize = true
        };
        header.Controls.AddRange([title, subtitle]);
        Controls.Add(header);
        y = 72 + 20;

        // ─── Default agent section ───
        var lblAgentSection = new Label
        {
            Text = "Default CLI agent",
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = TextDark,
            Location = new Point(pad, y),
            AutoSize = true
        };
        y += 24;
        var lblAgentHint = new Label
        {
            Text = "Used for new sandboxes. You can change the agent per project later.",
            ForeColor = TextMuted,
            Location = new Point(pad, y),
            Size = new Size(500, 18),
            AutoEllipsis = true
        };
        y += 26;
        _cboDefaultAgent = new ComboBox
        {
            Location = new Point(pad, y),
            Size = new Size(320, 30),
            DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 10f)
        };
        foreach (var (display, value) in AgentOptions)
            _cboDefaultAgent.Items.Add(new AgentItem(display, value));
        _cboDefaultAgent.DisplayMember = "Display";
        _cboDefaultAgent.ValueMember = "Value";
        var savedAgent = SavedSettings.GetDefaultAgent();
        for (int i = 0; i < AgentOptions.Length; i++)
        {
            if (string.Equals(AgentOptions[i].Value, savedAgent, StringComparison.OrdinalIgnoreCase))
            {
                _cboDefaultAgent.SelectedIndex = i;
                break;
            }
        }
        if (_cboDefaultAgent.SelectedIndex < 0)
            _cboDefaultAgent.SelectedIndex = 0;
        y += 44;

        // ─── Environment variables section (bordered panel) ───
        var envSectionLabel = new Label
        {
            Text = "API keys & environment variables",
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = TextDark,
            Location = new Point(pad, y),
            AutoSize = true
        };
        y += 24;
        var envSectionHint = new Label
        {
            Text = "Stored encrypted. Used as defaults when launching sandboxes.",
            ForeColor = TextMuted,
            Location = new Point(pad, y),
            Size = new Size(500, 18),
            AutoEllipsis = true
        };
        y += 28;

        var envPanel = new Panel
        {
            Location = new Point(pad, y),
            Size = new Size(520, 380),
            BackColor = Color.FromArgb(250, 251, 252),
            BorderStyle = BorderStyle.FixedSingle
        };
        int py = 12;
        (string label, string key)[] fields =
        [
            ("ANTHROPIC_API_KEY (Claude Code)", "ANTHROPIC_API_KEY"),
            ("OPENAI_API_KEY (OpenAI)", "OPENAI_API_KEY"),
            ("CURSOR_API_KEY (Cursor CLI)", "CURSOR_API_KEY"),
            ("GITHUB_COPILOT_API_KEY (GitHub Copilot)", "GITHUB_COPILOT_API_KEY"),
            ("OPENROUTER_API_KEY", "OPENROUTER_API_KEY"),
            ("OPENCODE_API_KEY", "OPENCODE_API_KEY"),
            ("GEMINI_API_KEY", "GEMINI_API_KEY")
        ];
        var saved = EnvVarSettings.Load();
        var textBoxes = new List<TextBox>();
        foreach (var (labelText, key) in fields)
        {
            var lbl = new Label
            {
                Text = labelText,
                Location = new Point(12, py),
                AutoSize = true,
                ForeColor = Color.FromArgb(70, 70, 70),
                Font = new Font("Segoe UI", 9f)
            };
            var txt = new TextBox
            {
                Location = new Point(12, py + 19),
                Size = new Size(490, 26),
                UseSystemPasswordChar = true,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 10f)
            };
            if (saved.TryGetValue(key, out var val))
                txt.Text = val;
            textBoxes.Add(txt);
            envPanel.Controls.Add(lbl);
            envPanel.Controls.Add(txt);
            py += 52;
        }
        _txtAnthropicKey = textBoxes[0];
        _txtOpenAIKey = textBoxes[1];
        _txtCursorKey = textBoxes[2];
        _txtGitHubCopilotKey = textBoxes[3];
        _txtOpenRouterKey = textBoxes[4];
        _txtOpenCodeKey = textBoxes[5];
        _txtGeminiKey = textBoxes[6];
        y += 380 + 24;

        // Buttons
        var btnCancel = new Button
        {
            Text = "Cancel",
            Location = new Point(pad, y),
            Size = new Size(100, 38),
            FlatStyle = FlatStyle.Flat,
            ForeColor = TextMuted,
            BackColor = Color.White
        };
        btnCancel.FlatAppearance.BorderColor = SectionBorder;
        btnCancel.FlatAppearance.MouseOverBackColor = Color.FromArgb(240, 240, 240);
        btnCancel.FlatAppearance.MouseDownBackColor = Color.FromArgb(225, 225, 225);
        btnCancel.Click += (_, _) => Close();

        var btnSave = new Button
        {
            Text = "Save",
            Location = new Point(448, y),
            Size = new Size(100, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = AccentBlue,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };
        btnSave.FlatAppearance.BorderColor = AccentBlue;
        btnSave.FlatAppearance.MouseOverBackColor = ControlPaint.Light(AccentBlue, 0.15f);
        btnSave.FlatAppearance.MouseDownBackColor = ControlPaint.Dark(AccentBlue, 0.1f);
        btnSave.Click += OnSaveClicked;

        Controls.AddRange([
            lblAgentSection, lblAgentHint, _cboDefaultAgent,
            envSectionLabel, envSectionHint, envPanel,
            btnCancel, btnSave
        ]);
    }

    private sealed class AgentItem
    {
        public string Display { get; }
        public string Value { get; }
        public AgentItem(string display, string value) { Display = display; Value = value; }
    }

    private void OnSaveClicked(object? sender, EventArgs e)
    {
        var idx = _cboDefaultAgent.SelectedIndex;
        if (idx >= 0 && idx < AgentOptions.Length)
            SavedSettings.SetDefaultAgent(AgentOptions[idx].Value);

        var vars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(_txtAnthropicKey.Text)) vars["ANTHROPIC_API_KEY"] = _txtAnthropicKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtOpenAIKey.Text)) vars["OPENAI_API_KEY"] = _txtOpenAIKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtCursorKey.Text)) vars["CURSOR_API_KEY"] = _txtCursorKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtGitHubCopilotKey.Text)) vars["GITHUB_COPILOT_API_KEY"] = _txtGitHubCopilotKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtOpenRouterKey.Text)) vars["OPENROUTER_API_KEY"] = _txtOpenRouterKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtOpenCodeKey.Text)) vars["OPENCODE_API_KEY"] = _txtOpenCodeKey.Text;
        if (!string.IsNullOrWhiteSpace(_txtGeminiKey.Text)) vars["GEMINI_API_KEY"] = _txtGeminiKey.Text;

        EnvVarSettings.Save(vars);
        MessageBox.Show(this, "Settings saved. They will be used as defaults for new sandbox launches.",
            "Saved", MessageBoxButtons.OK, MessageBoxIcon.Information);
        Close();
    }
}
