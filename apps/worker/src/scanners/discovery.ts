import * as fs from 'fs';
import * as path from 'path';
import { Scanner, ScannerFactory, ScannerMetadata, ScannerType } from './base';
import { ScannerRegistry } from './registry';

export interface PluginDiscoveryOptions {
  /**
   * Directory to scan for plugins
   */
  pluginsDir: string;

  /**
   * File pattern to match for scanner plugins
   */
  pattern?: string;

  /**
   * Whether to recursively search subdirectories
   */
  recursive?: boolean;

  /**
   * Scanner types to load (empty = load all)
   */
  types?: ScannerType[];
}

/**
 * Plugin loader interface
 */
export interface ScannerPlugin {
  /**
   * Unique name of the scanner
   */
  name: string;

  /**
   * Type of scanner
   */
  type: ScannerType;

  /**
   * Metadata about the scanner
   */
  metadata: Omit<ScannerMetadata, 'name' | 'type'>;

  /**
   * Factory function to create scanner instance
   */
  factory: ScannerFactory;
}

/**
 * Discover and load scanner plugins from a directory
 */
export class PluginDiscovery {
  private registry: ScannerRegistry;
  private discoveredPlugins: Map<string, ScannerPlugin> = new Map();

  constructor(registry: ScannerRegistry) {
    this.registry = registry;
  }

  /**
   * Scan a directory for scanner plugins
   */
  async discover(options: PluginDiscoveryOptions): Promise<void> {
    const { pluginsDir, pattern = '*.scanner.ts', recursive = true, types = [] } = options;

    console.log(`[PluginDiscovery] Discovering scanners in: ${pluginsDir}`);

    if (!fs.existsSync(pluginsDir)) {
      console.warn(`[PluginDiscovery] Plugins directory does not exist: ${pluginsDir}`);
      return;
    }

    const files = this.findScannerFiles(pluginsDir, pattern, recursive);
    console.log(`[PluginDiscovery] Found ${files.length} potential scanner files`);

    for (const file of files) {
      await this.loadPluginFile(file, types);
    }

    console.log(`[PluginDiscovery] Loaded ${this.discoveredPlugins.size} scanner plugins`);
  }

  /**
   * Find scanner files in a directory
   */
  private findScannerFiles(dir: string, pattern: string, recursive: boolean): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        results.push(...this.findScannerFiles(fullPath, pattern, recursive));
      } else if (entry.isFile() && this.matchesPattern(entry.name, pattern)) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * Check if a filename matches the pattern
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`).test(filename);
  }

  /**
   * Load a plugin from a file
   */
  private async loadPluginFile(filePath: string, types: ScannerType[]): Promise<void> {
    try {
      delete require.cache[require.resolve(filePath)];

      const module = require(filePath);
      const exports = module.exports || module;

      // Collect potential plugin objects from exports
      const candidates: unknown[] = [];
      if (Array.isArray(exports)) {
        candidates.push(...exports);
      } else {
        candidates.push(exports);
        // Also check all property values in case the plugin is nested
        for (const value of Object.values(exports)) {
          candidates.push(value);
        }
      }

      for (const candidate of candidates) {
        if (this.isValidScannerExport(candidate)) {
          // Filter by type if specified
          if (types.length > 0 && !types.includes(candidate.type)) {
            console.log(`[PluginDiscovery] Skipping "${candidate.name}" (type not in filter)`);
            continue;
          }
          this.registerPlugin(candidate);
        }
      }
    } catch (error) {
      console.error(`[PluginDiscovery] Failed to load plugin from ${filePath}:`, error);
    }
  }

  /**
   * Check if an export is a valid scanner plugin
   */
  private isValidScannerExport(obj: unknown): obj is ScannerPlugin {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const plugin = obj as Record<string, unknown>;

    return (
      typeof plugin.name === 'string' &&
      typeof plugin.type === 'string' &&
      typeof plugin.factory === 'function' &&
      typeof plugin.metadata === 'object'
    );
  }

  /**
   * Register a discovered plugin with the registry
   */
  private registerPlugin(plugin: ScannerPlugin): void {
    if (this.discoveredPlugins.has(plugin.name)) {
      console.warn(
        `[PluginDiscovery] Scanner "${plugin.name}" already discovered, skipping duplicate`
      );
      return;
    }

    this.discoveredPlugins.set(plugin.name, plugin);

    // Register with the registry using the factory
    this.registry.registerFactory(plugin.name, plugin.type, plugin.factory, plugin.metadata);

    console.log(`[PluginDiscovery] Registered plugin: ${plugin.name}`);
  }

  /**
   * Get all discovered plugins
   */
  getDiscoveredPlugins(): ScannerPlugin[] {
    return Array.from(this.discoveredPlugins.values());
  }

  /**
   * Get a specific discovered plugin
   */
  getPlugin(name: string): ScannerPlugin | undefined {
    return this.discoveredPlugins.get(name);
  }

  /**
   * Clear discovered plugins cache
   */
  clear(): void {
    this.discoveredPlugins.clear();
  }
}

/**
 * Decorator factory for registering scanner plugins
 * Use this to auto-register scanners in the global registry
 */
export function registerScanner(
  name: string,
  type: ScannerType,
  metadata: Omit<ScannerMetadata, 'name' | 'type'>
): (target: new (...args: unknown[]) => Scanner) => new (...args: unknown[]) => Scanner {
  return function (
    constructor: new (...args: unknown[]) => Scanner
  ): new (...args: unknown[]) => Scanner {
    // Add metadata to the constructor
    const typedConstructor = constructor as unknown as Record<string, unknown>;
    typedConstructor.scannerMetadata = {
      name,
      type,
      ...metadata,
    };

    return constructor;
  };
}

/**
 * Create a scanner plugin from a class
 */
export function createScannerPlugin(
  name: string,
  type: ScannerType,
  metadata: Omit<ScannerMetadata, 'name' | 'type'>,
  factory: ScannerFactory
): ScannerPlugin {
  return {
    name,
    type,
    metadata,
    factory,
  };
}

/**
 * Auto-discover and load built-in scanners
 * Scans the 'scanners' directory for .scanner.ts files
 */
export async function autoDiscoverScanners(registry: ScannerRegistry): Promise<void> {
  const discovery = new PluginDiscovery(registry);

  // Get the scanners directory (this directory)
  const pluginsDir = __dirname;

  // Choose file pattern based on whether we're running from dist (compiled) or src (dev)
  const isCompiled = __dirname.includes('dist');
  const pattern = isCompiled ? '*.scanner.js' : '*.scanner.ts';

  await discovery.discover({
    pluginsDir,
    pattern,
    recursive: false,
  });
}
