using System.Diagnostics;
using System.Net.NetworkInformation;

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

    /// <summary>Returns true if the container (name or ID) is running. Works for compose-started containers by ID.</summary>
    public static bool IsContainerRunningByIdOrName(string containerIdOrName)
    {
        var (exit, output) = RunCapture("docker", $"inspect --format \"{{{{.State.Running}}}}\" \"{containerIdOrName}\"");
        return exit == 0 && output.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Get the container ID that compose started for the given service. Use this so wait/exec target the actual container.</summary>
    public static string? GetComposeContainerId(string composeFile, string projectDir, string service = "agent")
    {
        var (exit, output) = RunCapture("docker",
            $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" ps -q {service}");
        var id = output?.Trim();
        return exit == 0 && !string.IsNullOrEmpty(id) ? id : null;
    }

    public static int Build(string dockerfilePath, string tag, string context, Action<string>? onOutput = null, bool noCache = false)
    {
        var cacheFlag = noCache ? " --no-cache" : "";
        return Run("docker", $"build{cacheFlag} -f \"{dockerfilePath}\" -t \"{tag}\" \"{context}\"", onOutput);
    }

    public static int ComposeUp(string composeFile, string projectDir, Action<string>? onOutput = null)
    {
        return Run("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" up -d --build", onOutput);
    }

    /// <summary>Run compose up and capture stdout+stderr. Used to parse port errors for retry.</summary>
    public static (int exitCode, string output) ComposeUpCapture(string composeFile, string projectDir)
    {
        var (exit, stdout, stderr) = RunCaptureBoth("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" up -d --build");
        return (exit, (stdout + "\n" + stderr).Trim());
    }

    /// <summary>If Docker failed with "port is already allocated", extract the port number (e.g. 3000 from "Bind for 0.0.0.0:3000 failed").</summary>
    public static bool TryParsePortFromComposeError(string output, out int port)
    {
        port = 0;
        if (string.IsNullOrEmpty(output) || !output.Contains("port is already allocated", StringComparison.OrdinalIgnoreCase))
            return false;
        var match = System.Text.RegularExpressions.Regex.Match(output, @"Bind for [^:]+:(\d+) failed");
        if (match.Success && int.TryParse(match.Groups[1].Value, out var p))
        {
            port = p;
            return true;
        }
        return false;
    }

    public static int ComposeDown(string composeFile, string projectDir)
    {
        return Run("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" down", null);
    }

    public static int ComposeDownVolumes(string composeFile, string projectDir)
    {
        return Run("docker", $"compose -f \"{composeFile}\" --project-directory \"{projectDir}\" down -v", null);
    }

    /// <summary>
    /// Run an interactive command in the container.
    /// When <paramref name="newWindow"/> is true (GUI), opens a new terminal window so the session is interactive.
    /// When false (CLI), runs in the current console and waits for exit.
    /// </summary>
    public static int ExecInteractive(string containerName, string command, bool newWindow = false)
    {
        if (newWindow)
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c docker exec -it \"{containerName}\" {command}",
                UseShellExecute = true,
                CreateNoWindow = false
            };
            using var proc = Process.Start(psi);
            return proc != null ? 0 : 1;
        }

        var execPsi = new ProcessStartInfo
        {
            FileName = "docker",
            Arguments = $"exec -it \"{containerName}\" {command}",
            UseShellExecute = false
        };
        using var execProc = Process.Start(execPsi);
        execProc?.WaitForExit();
        return execProc?.ExitCode ?? 1;
    }

    public static int StopContainer(string containerName)
    {
        return Run("docker", $"stop \"{containerName}\"", null);
    }

    /// <summary>Remove a Docker image so the next build rebuilds from Dockerfile. Returns exit code (0 = success).</summary>
    public static int RemoveImage(string imageTag)
    {
        return Run("docker", $"rmi --force \"{imageTag}\"", null);
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

    /// <summary>Consider ready if logs show "[sandbox] Ready." or file /tmp/.sandbox-ready exists (with retries). Log-based check avoids flaky docker exec (e.g. WSL2).</summary>
    private static bool ContainerReady(string containerIdOrName)
    {
        var (exitLog, logOutput) = RunCapture("docker", $"logs --tail 50 \"{containerIdOrName}\"");
        if (exitLog == 0 && logOutput != null && logOutput.Contains("[sandbox] Ready.", StringComparison.Ordinal))
            return true;

        for (var retry = 0; retry < 3; retry++)
        {
            var (exit, _) = RunCapture("docker", $"exec \"{containerIdOrName}\" test -f /tmp/.sandbox-ready");
            if (exit == 0) return true;
            if (retry < 2) Thread.Sleep(1000);
        }
        return false;
    }

    public static bool WaitForReady(string containerIdOrName, int timeoutSeconds = 120, Action<string>? onOutput = null)
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SANDBOX_SKIP_READY")))
        {
            onOutput?.Invoke("[sandbox] Skipping ready wait (SANDBOX_SKIP_READY is set).");
            return true;
        }

        onOutput?.Invoke("[sandbox] Waiting for container to be ready");
        Thread.Sleep(3000);
        var elapsed = 3;
        var lastReported = 0;

        while (elapsed < timeoutSeconds)
        {
            if (ContainerReady(containerIdOrName))
            {
                onOutput?.Invoke(" done.");
                return true;
            }
            if (!IsContainerRunningByIdOrName(containerIdOrName))
            {
                onOutput?.Invoke(" failed.");
                onOutput?.Invoke("[sandbox] Container stopped unexpectedly. Check logs with: docker logs <container>");
                return false;
            }
            onOutput?.Invoke(".");
            Thread.Sleep(2000);
            elapsed += 2;
            if (elapsed >= lastReported + 20)
            {
                onOutput?.Invoke($" ({elapsed}s)");
                lastReported = elapsed;
            }
        }

        onOutput?.Invoke(" timeout.");
        onOutput?.Invoke($"[sandbox] Container did not become ready within {timeoutSeconds}s. Proceeding anyway. To debug: docker logs {containerIdOrName}");
        return true;
    }

    /// <summary>Check if the port is in use by querying active TCP listeners (reliable on Windows and avoids bind permission issues).</summary>
    public static bool IsPortInUse(int port)
    {
        try
        {
            var listeners = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners();
            return listeners.Any(ep => ep.Port == port);
        }
        catch
        {
            try
            {
                using var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Any, port);
                listener.Start();
                listener.Stop();
                return false;
            }
            catch (System.Net.Sockets.SocketException)
            {
                return true;
            }
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
        var (exit, stdout, _) = RunCaptureBoth(exe, args);
        return (exit, stdout);
    }

    private static (int exitCode, string stdout, string stderr) RunCaptureBoth(string exe, string args)
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
        var stdout = proc.StandardOutput.ReadToEnd();
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();
        return (proc.ExitCode, stdout, stderr);
    }
}
