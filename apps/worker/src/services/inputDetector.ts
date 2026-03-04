import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';
import os from 'os';

export enum InputType {
  GIT = 'git',
  LOCAL = 'local',
  URL = 'url',
  BINARY = 'binary',
}

export interface InputAnalysis {
  type: InputType;
  isValid: boolean;
  path?: string;
  url?: string;
  clonePath?: string;
  error?: string;
  metadata?: {
    name?: string;
    size?: number;
    mimeType?: string;
    gitRemote?: string;
    clonePath?: string;
  };
}

/**
 * Detects and validates input from various sources
 * Supports: Git URLs, Local paths, HTTP/HTTPS URLs, Binary files
 */
export class InputDetector {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || process.env.TEMP_DIR || path.join(os.tmpdir(), 'security-analyzer');
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Main entry point - analyzes input and determines type
   */
  async analyze(input: string): Promise<InputAnalysis> {
    const trimmed = input.trim();

    // Try Git URL detection first
    if (this.isGitUrl(trimmed)) {
      return this.analyzeGit(trimmed);
    }

    // Try URL detection
    if (this.isUrl(trimmed)) {
      return this.analyzeUrl(trimmed);
    }

    // Check if it looks like a local path (contains path separators)
    if (this.looksLikePath(trimmed)) {
      // Analyze it (will return valid/invalid based on existence)
      return this.analyzeLocalPath(trimmed);
    }

    // Try binary file detection (for inputs that don't match other types)
    return this.analyzeBinary(trimmed);
  }

  /**
   * Checks if input looks like a file/directory path
   */
  looksLikePath(input: string): boolean {
    // Check for path separators or drive letters
    return /[\\/]/.test(input) || /^[a-zA-Z]:/.test(input);
  }

  /**
   * Detects if input is a Git URL (GitHub, GitLab, Bitbucket, or bare git repo)
   */
  isGitUrl(input: string): boolean {
    const gitPatterns = [
      /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+\.git$/i,
      /^git@[^:]+:.+\.git$/i,
      /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+$/i,
      /^git:\/\/.+$/i,
    ];
    return gitPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Detects if input is a generic HTTP/HTTPS URL
   */
  isUrl(input: string): boolean {
    return /^https?:\/\/.+$/i.test(input);
  }

  /**
   * Detects if input is a local path (file or directory)
   */
  isLocalPath(input: string): boolean {
    try {
      // Check if absolute path or relative path exists
      const resolved = path.resolve(input);
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  }

  /**
   * Analyzes a Git repository URL
   */
  async analyzeGit(gitUrl: string): Promise<InputAnalysis> {
    try {
      const repoName = this.extractRepoName(gitUrl);
      const clonePath = path.join(this.tempDir, `git-${Date.now()}-${repoName}`);

      // Clone the repository
      console.log(`[InputDetector] Cloning git repository: ${gitUrl}`);
      execSync(`git clone --depth 1 "${gitUrl}" "${clonePath}"`, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 120000, // 2 minute timeout
      });

      // Verify clone was successful
      if (!fs.existsSync(clonePath)) {
        return {
          type: InputType.GIT,
          isValid: false,
          error: 'Git clone failed - directory not created',
        };
      }

      const stats = fs.statSync(clonePath);

      return {
        type: InputType.GIT,
        isValid: true,
        clonePath,
        metadata: {
          name: repoName,
          size: stats.size,
          gitRemote: gitUrl,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: InputType.GIT,
        isValid: false,
        error: `Git operation failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Extracts repository name from Git URL
   */
  private extractRepoName(gitUrl: string): string {
    // Handle various Git URL formats
    let name = path.basename(gitUrl, '.git');

    // Handle SSH format: git@github.com:owner/repo.git
    const sshMatch = gitUrl.match(/git@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      name = path.basename(sshMatch[1]);
    }

    return name || 'repository';
  }

  /**
   * Analyzes a local path (file or directory)
   */
  async analyzeLocalPath(localPath: string): Promise<InputAnalysis> {
    try {
      const resolvedPath = path.resolve(localPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          type: InputType.LOCAL,
          isValid: false,
          path: resolvedPath,
          error: 'Path does not exist',
        };
      }

      const stats = fs.statSync(resolvedPath);

      // Check if path is readable
      try {
        fs.accessSync(resolvedPath, fs.constants.R_OK);
      } catch {
        return {
          type: InputType.LOCAL,
          isValid: false,
          path: resolvedPath,
          error: 'Path is not readable',
        };
      }

      return {
        type: InputType.LOCAL,
        isValid: true,
        path: resolvedPath,
        metadata: {
          name: path.basename(resolvedPath),
          size: stats.size,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: InputType.LOCAL,
        isValid: false,
        path: localPath,
        error: `Local path analysis failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Analyzes a URL (HTTP/HTTPS endpoint)
   */
  async analyzeUrl(url: string): Promise<InputAnalysis> {
    return new Promise((resolve) => {
      const isHttps = url.startsWith('https://');
      const client = isHttps ? https : http;

      const req = client.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          const contentType = res.headers['content-type'] || '';

          resolve({
            type: InputType.URL,
            isValid: true,
            url,
            metadata: {
              name: new URL(url).pathname || 'resource',
              mimeType: contentType,
            },
          });
        } else {
          resolve({
            type: InputType.URL,
            isValid: false,
            url,
            error: `URL returned status code: ${res.statusCode}`,
          });
        }
      });

      req.on('error', (error) => {
        resolve({
          type: InputType.URL,
          isValid: false,
          url,
          error: `URL request failed: ${error.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          type: InputType.URL,
          isValid: false,
          url,
          error: 'URL request timed out',
        });
      });

      req.end();
    });
  }

  /**
   * Analyzes a binary file by detecting magic bytes
   */
  async analyzeBinary(filePath: string): Promise<InputAnalysis> {
    try {
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          type: InputType.BINARY,
          isValid: false,
          path: resolvedPath,
          error: 'File does not exist',
        };
      }

      const stats = fs.statSync(resolvedPath);
      const buffer = Buffer.alloc(16);

      // Read magic bytes
      const fd = fs.openSync(resolvedPath, 'r');
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      const magicBytes = buffer;
      const mimeType = this.detectMimeType(magicBytes);

      // Check if it's actually a binary file (not empty, has binary signature)
      if (stats.size === 0 || mimeType === 'application/octet-stream') {
        // Verify it's not a text file by checking for null bytes
        const isBinary = magicBytes.some((byte) => byte === 0);

        if (!isBinary) {
          // Might be text - treat as unknown
          return {
            type: InputType.BINARY,
            isValid: false,
            path: resolvedPath,
            error: 'File appears to be text, not binary',
          };
        }
      }

      return {
        type: InputType.BINARY,
        isValid: true,
        path: resolvedPath,
        metadata: {
          name: path.basename(resolvedPath),
          size: stats.size,
          mimeType,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: InputType.BINARY,
        isValid: false,
        path: filePath,
        error: `Binary file analysis failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Detects MIME type from magic bytes
   */
  private detectMimeType(buffer: Buffer): string {
    // Common magic byte signatures
    const signatures: Array<{ magic: number[]; mime: string }> = [
      // Executables
      { magic: [0x7f, 0x45, 0x4c, 0x46], mime: 'application/x-executable' }, // ELF
      { magic: [0x4d, 0x5a], mime: 'application/x-executable' }, // PE/EXE
      { magic: [0xfe, 0xed, 0xfa, 0xcf], mime: 'application/x-mach-binary' }, // Mach-O
      { magic: [0xce, 0xfa, 0xed, 0xfe], mime: 'application/x-mach-binary' }, // Mach-O (reverse)

      // Archives
      { magic: [0x1f, 0x8b], mime: 'application/gzip' }, // Gzip
      { magic: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' }, // ZIP
      { magic: [0x50, 0x4b, 0x05, 0x06], mime: 'application/zip' }, // ZIP (empty)
      { magic: [0x50, 0x4b, 0x07, 0x08], mime: 'application/zip' }, // ZIP (spanned)
      { magic: [0x52, 0x61, 0x72, 0x21], mime: 'application/x-rar' }, // RAR
      { magic: [0x42, 0x5a, 0x68], mime: 'application/x-bzip2' }, // BZ2
      { magic: [0x1d, 0x25, 0x15, 0x68], mime: 'application/x-lzma' }, // LZMA
      { magic: [0x28, 0xb5, 0x2f, 0xfd], mime: 'application/zstd' }, // Zstd

      // Images
      { magic: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
      { magic: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
      { magic: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
      { magic: [0x42, 0x4d], mime: 'image/bmp' },
      { magic: [0x49, 0x49, 0x2a, 0x00], mime: 'image/tiff' },
      { magic: [0x4d, 0x4d, 0x00, 0x2a], mime: 'image/tiff' },
      { magic: [0x00, 0x00, 0x01, 0x00], mime: 'image/x-icon' },

      // PDFs
      { magic: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },

      // Docker
      { magic: [0x00, 0x00, 0x00], mime: 'application/x-docker' },
    ];

    for (const sig of signatures) {
      if (sig.magic.every((byte, i) => buffer[i] === byte)) {
        return sig.mime;
      }
    }

    return 'application/octet-stream';
  }

  /**
   * Cleans up temporary files
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        const entries = fs.readdirSync(this.tempDir);
        for (const entry of entries) {
          const entryPath = path.join(this.tempDir, entry);
          // Only remove our created directories (prefixed with 'git-')
          if (entry.startsWith('git-')) {
            fs.rmSync(entryPath, { recursive: true, force: true });
          }
        }
      }
    } catch (error) {
      console.error('[InputDetector] Cleanup error:', error);
    }
  }
}

// Export singleton instance
export const inputDetector = new InputDetector();
