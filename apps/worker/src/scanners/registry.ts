import { Scanner, ScannerMetadata, ScannerRegistration, ScannerConfig, ScannerType } from './base';

/**
 * Scanner Registry - manages all registered scanners
 * Provides plugin discovery, lifecycle management, and dependency injection
 */
export class ScannerRegistry {
  private scanners: Map<string, ScannerRegistration> = new Map();
  private initializedScanners: Set<string> = new Set();
  private dependencies: Record<string, unknown> = {};

  /**
   * Set dependencies for scanner instantiation
   */
  setDependencies(dependencies: Record<string, unknown>): void {
    this.dependencies = { ...this.dependencies, ...dependencies };
  }

  /**
   * Get a specific dependency
   */
  getDependency<T>(key: string): T | undefined {
    return this.dependencies[key] as T | undefined;
  }

  /**
   * Register a scanner instance
   */
  register(scanner: Scanner): void {
    if (this.scanners.has(scanner.name)) {
      console.warn(`Scanner "${scanner.name}" is already registered. Overwriting...`);
    }

    const metadata = scanner.getMetadata();
    this.scanners.set(scanner.name, {
      scanner,
      metadata,
    });

    console.log(`[ScannerRegistry] Registered scanner: ${scanner.name} (${metadata.type})`);
  }

  /**
   * Register a scanner factory for lazy instantiation
   */
  registerFactory(
    name: string,
    type: ScannerType,
    factory: (deps: Record<string, unknown>) => Scanner,
    metadata: Omit<ScannerMetadata, 'name' | 'type'>
  ): void {
    if (this.scanners.has(name)) {
      console.warn(`Scanner "${name}" is already registered. Overwriting...`);
    }

    const fullMetadata: ScannerMetadata = {
      name,
      type,
      ...metadata,
    };

    this.scanners.set(name, {
      factory,
      metadata: fullMetadata,
    });

    console.log(`[ScannerRegistry] Registered factory for scanner: ${name} (${type})`);
  }

  /**
   * Unregister a scanner
   */
  unregister(name: string): boolean {
    const removed = this.scanners.delete(name);
    this.initializedScanners.delete(name);
    if (removed) {
      console.log(`[ScannerRegistry] Unregistered scanner: ${name}`);
    }
    return removed;
  }

  /**
   * Get a scanner by name
   */
  get(name: string): Scanner | null {
    const registration = this.scanners.get(name);
    if (!registration) {
      return null;
    }

    // If we have a factory but no instance, create one
    if (registration.factory && !registration.scanner) {
      const scanner = registration.factory(this.dependencies);
      registration.scanner = scanner;
    }

    return registration?.scanner ?? null;
  }

  /**
   * Get scanner metadata by name
   */
  getMetadata(name: string): ScannerMetadata | null {
    return this.scanners.get(name)?.metadata ?? null;
  }

  /**
   * Get all registered scanner names
   */
  getAllNames(): string[] {
    return Array.from(this.scanners.keys());
  }

  /**
   * Get all registered scanners
   */
  getAllScanners(): Scanner[] {
    const result: Scanner[] = [];
    for (const [name, registration] of this.scanners) {
      const scanner = this.get(name);
      if (scanner) {
        result.push(scanner);
      }
    }
    return result;
  }

  /**
   * Get all scanner metadata
   */
  getAllMetadata(): ScannerMetadata[] {
    return Array.from(this.scanners.values()).map((r) => r.metadata);
  }

  /**
   * Get scanners by type
   */
  getByType(type: ScannerType): Scanner[] {
    const result: Scanner[] = [];
    for (const [name] of this.scanners) {
      const metadata = this.getMetadata(name);
      if (metadata?.type === type) {
        const scanner = this.get(name);
        if (scanner) {
          result.push(scanner);
        }
      }
    }
    return result;
  }

  /**
   * Find scanners that can handle a given target
   */
  findScannersForTarget(target: string): Scanner[] {
    const result: Scanner[] = [];
    for (const [name] of this.scanners) {
      const scanner = this.get(name);
      if (scanner?.canHandle(target)) {
        result.push(scanner);
      }
    }
    return result;
  }

  /**
   * Initialize all registered scanners with their configuration
   */
  async initializeAll(configs: Record<string, ScannerConfig>): Promise<void> {
    console.log(`[ScannerRegistry] Initializing ${this.scanners.size} scanners...`);

    const initPromises = Array.from(this.scanners.entries()).map(async ([name, registration]) => {
      const config = configs[name] ?? { enabled: true };

      if (!config.enabled) {
        console.log(`[ScannerRegistry] Scanner "${name}" is disabled, skipping initialization.`);
        return;
      }

      let scanner = registration.scanner;

      // Create instance from factory if needed
      if (!scanner && registration.factory) {
        scanner = registration.factory(this.dependencies);
        registration.scanner = scanner;
      }

      if (scanner) {
        await scanner.init(config);
        this.initializedScanners.add(name);
        console.log(`[ScannerRegistry] Initialized scanner: ${name}`);
      }
    });

    await Promise.all(initPromises);
    console.log(`[ScannerRegistry] All scanners initialized.`);
  }

  /**
   * Initialize a specific scanner
   */
  async initialize(name: string, config: ScannerConfig): Promise<void> {
    const scanner = this.get(name);

    if (!scanner) {
      throw new Error(`Scanner "${name}" not found in registry`);
    }

    await scanner.init(config);
    this.initializedScanners.add(name);
  }

  /**
   * Clean up all initialized scanners
   */
  async cleanupAll(): Promise<void> {
    console.log(`[ScannerRegistry] Cleaning up ${this.initializedScanners.size} scanners...`);

    const cleanupPromises = Array.from(this.initializedScanners).map(async (name) => {
      const scanner = this.get(name);
      if (scanner) {
        await scanner.cleanup();
        console.log(`[ScannerRegistry] Cleaned up scanner: ${name}`);
      }
    });

    await Promise.all(cleanupPromises);
    this.initializedScanners.clear();
    console.log(`[ScannerRegistry] All scanners cleaned up.`);
  }

  /**
   * Clean up a specific scanner
   */
  async cleanup(name: string): Promise<void> {
    const scanner = this.get(name);
    if (scanner) {
      await scanner.cleanup();
      this.initializedScanners.delete(name);
    }
  }

  /**
   * Check if a scanner is initialized
   */
  isInitialized(name: string): boolean {
    return this.initializedScanners.has(name);
  }

  /**
   * Get count of registered scanners
   */
  count(): number {
    return this.scanners.size;
  }

  /**
   * Clear all registered scanners
   */
  clear(): void {
    this.scanners.clear();
    this.initializedScanners.clear();
  }
}

// Singleton instance for global access
let globalRegistry: ScannerRegistry | null = null;

/**
 * Get the global scanner registry instance
 */
export function getGlobalRegistry(): ScannerRegistry {
  if (!globalRegistry) {
    globalRegistry = new ScannerRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetGlobalRegistry(): void {
  globalRegistry = null;
}
