using System.Security.Cryptography;
using System.Text;

namespace AgentSandbox.Services;

/// <summary>
/// Encrypts/decrypts sensitive values (API keys, env vars) for storage.
/// Uses the same key file as ProjectScaffolder (runtime.env) so values can be
/// read back by the same user on the same machine. Aligns with secure storage
/// so we don't leak data on disk.
/// </summary>
public static class SecureStorage
{
    private static readonly string EncryptedKeyPath =
        Path.Combine(ResourceManager.AppDataRoot, ".envkey");

    /// <summary>Encrypt a value for storage (e.g. saved_env.env or runtime.env).</summary>
    public static string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return string.Empty;

        var key = GetOrCreateEncryptionKey();
        using var aes = Aes.Create();
        aes.Key = key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var encryptedBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        var result = new byte[aes.IV.Length + encryptedBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(encryptedBytes, 0, result, aes.IV.Length, encryptedBytes.Length);

        return Convert.ToBase64String(result);
    }

    /// <summary>Decrypt a value from storage. Returns plain text on failure (e.g. legacy unencrypted).</summary>
    public static string Decrypt(string encryptedText)
    {
        if (string.IsNullOrEmpty(encryptedText)) return string.Empty;

        try
        {
            var key = GetOrCreateEncryptionKey();
            var combined = Convert.FromBase64String(encryptedText);

            using var aes = Aes.Create();
            aes.Key = key;

            var iv = new byte[16];
            Buffer.BlockCopy(combined, 0, iv, 0, 16);
            aes.IV = iv;

            var encryptedBytes = new byte[combined.Length - 16];
            Buffer.BlockCopy(combined, 16, encryptedBytes, 0, encryptedBytes.Length);

            using var decryptor = aes.CreateDecryptor();
            var decryptedBytes = decryptor.TransformFinalBlock(encryptedBytes, 0, encryptedBytes.Length);
            return Encoding.UTF8.GetString(decryptedBytes);
        }
        catch
        {
            return encryptedText;
        }
    }

    private static byte[] GetOrCreateEncryptionKey()
    {
        if (File.Exists(EncryptedKeyPath))
        {
            try
            {
                var encryptedKey = File.ReadAllBytes(EncryptedKeyPath);
                return ProtectedData.Unprotect(encryptedKey, null, DataProtectionScope.CurrentUser);
            }
            catch { /* fall through to generate new */ }
        }

        var key = RandomNumberGenerator.GetBytes(32);
        var protectedKey = ProtectedData.Protect(key, null, DataProtectionScope.CurrentUser);

        var dir = Path.GetDirectoryName(EncryptedKeyPath);
        if (!Directory.Exists(dir))
            Directory.CreateDirectory(dir!);
        File.WriteAllBytes(EncryptedKeyPath, protectedKey);

        return key;
    }
}
