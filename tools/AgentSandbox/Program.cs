using System.Runtime.InteropServices;
using AgentSandbox.Services;
using AgentSandbox.UI;

namespace AgentSandbox;

internal static class Program
{
    private static readonly string[] CliCommands = ["prepare", "sandbox", "list", "stats", "cleanup", "help", "--help", "-h"];

    [STAThread]
    static int Main(string[] args)
    {
        ResourceManager.EnsureExtracted();

        // CLI subcommand -> attach console and run text mode
        if (args.Length > 0 && CliCommands.Contains(args[0].ToLowerInvariant()))
        {
            AttachConsole();
            return args[0].ToLowerInvariant() switch
            {
                "prepare" => Cli.RunPrepare(args.Skip(1).ToArray()),
                "sandbox" => Cli.RunSandbox(args.Skip(1).ToArray()),
                "list" => Cli.RunList(),
                "stats" => Cli.RunStats(),
                "cleanup" => Cli.RunCleanup(args.Skip(1).ToArray()),
                _ => Cli.ShowHelp()
            };
        }

        // No args or a path argument -> GUI wizard
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var form = new WizardForm();

        // If a path was passed, pre-fill it
        if (args.Length > 0 && Directory.Exists(args[0]))
            form.SetInitialPath(Path.GetFullPath(args[0]));

        Application.Run(form);
        return 0;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    private static void AttachConsole()
    {
        if (!AttachConsole(-1)) // ATTACH_PARENT_PROCESS
            AllocConsole();
    }
}
