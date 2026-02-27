namespace AgentSandbox.Services;

/// <summary>
/// Load/save default environment variables to %APPDATA%/AgentSandbox/saved_env.env.
/// Values are encrypted at rest (same scheme as runtime.env) so we don't leak API keys.
/// </summary>
public static class EnvVarSettings
{
    private static readonly string SavedEnvPath =
        Path.Combine(ResourceManager.AppDataRoot, "saved_env.env");

    public static Dictionary<string, string> Load()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(SavedEnvPath))
            return result;

        foreach (var line in File.ReadAllLines(SavedEnvPath))
        {
            if (string.IsNullOrWhiteSpace(line) || !line.Contains('='))
                continue;
            var idx = line.IndexOf('=');
            var key = line[..idx].Trim();
            var value = line[(idx + 1)..];
            if (string.IsNullOrEmpty(key)) continue;
            var decrypted = SecureStorage.Decrypt(value);
            result[key] = decrypted;
        }
        return result;
    }

    public static void Save(Dictionary<string, string> vars)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SavedEnvPath)!);
        var lines = vars
            .Where(kvp => !string.IsNullOrEmpty(kvp.Key))
            .OrderBy(kvp => kvp.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kvp => $"{kvp.Key}={SecureStorage.Encrypt(kvp.Value)}");
        ResourceManager.WriteLf(SavedEnvPath, string.Join(Environment.NewLine, lines));
    }
}
