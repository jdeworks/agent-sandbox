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

    public static int Build(string dockerfilePath, string tag, string context, Action<string>? onOutput = null)
    {
        return Run("docker", $"build -f \"{dockerfilePath}\" -t \"{tag}\" \"{context}\"", onOutput);
    }

    public static int ComposeUp(string composeFile, string projectDir, Action<string>? onOutput = null)
    {
        return Run("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" up -d --build", onOutput);
    }

    public static int ComposeDown(string composeFile, string projectDir)
    {
        return Run("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" down", null);
    }

    public static int ComposeDownVolumes(string composeFile, string projectDir)
    {
        return Run("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" down -v", null);
    }

    public static int ExecInteractive(string containerName, string command)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "docker",
            Arguments = $"exec -it \"{containerName}\" {command}",
            UseShellExecute = false
        };
        using var proc = Process.Start(psi);
        proc?.WaitForExit();
        return proc?.ExitCode ?? 1;
    }

    public static int StopContainer(string containerName)
    {
        return Run("docker", $"stop \"{containerName}\"", null);
    }

    /// <summary>
    /// Run a docker command. When <paramref name="onOutput"/> is provided,
    /// stdout+stderr are captured and streamed line-by-line to the callback
    /// (used by the GUI log panel). When null, the process inherits stdio
    /// (used by the CLI).
    /// </summary>
    private static int Run(string exe, string args, Action<string>? onOutput)
    {
        var redirect = onOutput != null;
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            UseShellExecute = false,
            RedirectStandardOutput = redirect,
            RedirectStandardError = redirect,
            CreateNoWindow = redirect
        };

        using var proc = Process.Start(psi)!;

        if (onOutput != null)
        {
            proc.OutputDataReceived += (_, e) => { if (e.Data != null) onOutput(e.Data); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) onOutput(e.Data); };
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
        }

        proc.WaitForExit();
        return proc.ExitCode;
    }

    public static bool WaitForReady(string containerName, int timeoutSeconds = 120, Action<string>? onOutput = null)
    {
        var elapsed = 0;
        while (elapsed < timeoutSeconds)
        {
            var (exit, _) = RunCapture("docker", $"exec \"{containerName}\" test -f /tmp/.sandbox-ready");
            if (exit == 0)
                return true;

            if (!IsContainerRunning(containerName))
            {
                onOutput?.Invoke("[sandbox] Container stopped unexpectedly.");
                return false;
            }

            Thread.Sleep(2000);
            elapsed += 2;
        }

        onOutput?.Invoke($"[sandbox] Warning: container not ready within {timeoutSeconds}s. Proceeding anyway.");
        return true;
    }

    public static bool IsPortInUse(int port)
    {
        try
        {
            using var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, port);
            listener.Start();
            listener.Stop();
            return false;
        }
        catch (System.Net.Sockets.SocketException)
        {
            return true;
        }
    }

    public static int FindFreePort(int startPort)
    {
        var port = startPort;
        while (IsPortInUse(port) && port < startPort + 100)
            port++;
        return port;
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
