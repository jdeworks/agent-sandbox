using System.Diagnostics;

namespace AgentSandbox.Services;

public static class DockerRunner
{
    public static bool IsDockerAvailable()
    {
        try
        {
            var (exit, _) = RunCapture("docker", "info");
            return exit == 0;
        }
        catch { return false; }
    }

    public static bool IsContainerRunning(string containerName)
    {
        var (exit, output) = RunCapture("docker",
            $"ps --format \"{{{{.Names}}}}\" --filter name=^{containerName}$");
        return exit == 0 && output.Trim().Split('\n')
            .Any(l => l.Trim() == containerName);
    }

    public static int Build(string dockerfilePath, string tag, string context)
    {
        return RunInteractive("docker", $"build -f \"{dockerfilePath}\" -t \"{tag}\" \"{context}\"");
    }

    public static int ComposeUp(string composeFile, string projectDir)
    {
        return RunInteractive("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" up -d --build");
    }

    public static int ComposeDown(string composeFile, string projectDir)
    {
        return RunInteractive("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" down");
    }

    public static int ComposeDownVolumes(string composeFile, string projectDir)
    {
        return RunInteractive("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" down -v");
    }

    public static int ExecInteractive(string containerName, string command)
    {
        return RunInteractive("docker", $"exec -it \"{containerName}\" {command}");
    }

    public static int StopContainer(string containerName)
    {
        return RunInteractive("docker", $"stop \"{containerName}\"");
    }

    private static int RunInteractive(string exe, string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            UseShellExecute = false
        };
        using var proc = Process.Start(psi);
        proc?.WaitForExit();
        return proc?.ExitCode ?? 1;
    }

    private static (int exitCode, string output) RunCapture(string exe, string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        using var proc = Process.Start(psi)!;
        var output = proc.StandardOutput.ReadToEnd();
        proc.WaitForExit();
        return (proc.ExitCode, output);
    }
}
