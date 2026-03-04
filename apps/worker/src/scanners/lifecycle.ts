import { Scanner, ScanResult, ScannerConfig, ScannerMetadata } from './base';
import { ScannerRegistry } from './registry';
import { ScannerPlugin } from './discovery';

export interface ScannerLifecycleOptions {
  registry: ScannerRegistry;
  autoInitialize?: boolean;
  autoCleanup?: boolean;
}

/**
 * Scanner lifecycle state
 */
export enum ScannerLifecycleState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  CLEANING_UP = 'cleaning_up',
  ERROR = 'error',
  DISPOSED = 'disposed',
}

/**
 * Scanner lifecycle event
 */
export interface ScannerLifecycleEvent {
  scanner: string;
  state: ScannerLifecycleState;
  timestamp: string;
  error?: Error;
}

/**
 * Lifecycle event listener type
 */
export type LifecycleEventListener = (event: ScannerLifecycleEvent) => void;

/**
 * Manages the lifecycle of scanners
 * Handles initialization, execution, cleanup, and error recovery
 */
export class ScannerLifecycleManager {
  private registry: ScannerRegistry;
  private states: Map<string, ScannerLifecycleState> = new Map();
  private listeners: Set<LifecycleEventListener> = new Set();
  private autoInitialize: boolean;
  private autoCleanup: boolean;

  constructor(options: ScannerLifecycleOptions) {
    this.registry = options.registry;
    this.autoInitialize = options.autoInitialize ?? true;
    this.autoCleanup = options.autoCleanup ?? true;
  }

  /**
   * Subscribe to lifecycle events
   */
  subscribe(listener: LifecycleEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit a lifecycle event
   */
  private emit(scanner: string, state: ScannerLifecycleState, error?: Error): void {
    const event: ScannerLifecycleEvent = {
      scanner,
      state,
      timestamp: new Date().toISOString(),
      error,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ScannerLifecycle] Listener error:', err);
      }
    }
  }

  /**
   * Get current state of a scanner
   */
  getState(name: string): ScannerLifecycleState {
    return this.states.get(name) ?? ScannerLifecycleState.IDLE;
  }

  /**
   * Get all scanner states
   */
  getAllStates(): Map<string, ScannerLifecycleState> {
    return new Map(this.states);
  }

  /**
   * Initialize a scanner
   */
  async initialize(name: string, config: ScannerConfig): Promise<void> {
    const currentState = this.getState(name);

    if (currentState === ScannerLifecycleState.READY) {
      console.log(`[ScannerLifecycle] Scanner "${name}" already initialized`);
      return;
    }

    if (currentState === ScannerLifecycleState.RUNNING) {
      throw new Error(`Cannot initialize scanner "${name}" while it is running`);
    }

    this.setState(name, ScannerLifecycleState.INITIALIZING);
    this.emit(name, ScannerLifecycleState.INITIALIZING);

    try {
      const scanner = this.registry.get(name);
      if (!scanner) {
        throw new Error(`Scanner "${name}" not found in registry`);
      }

      await scanner.init(config);
      this.setState(name, ScannerLifecycleState.READY);
      this.emit(name, ScannerLifecycleState.READY);
    } catch (error) {
      this.setState(name, ScannerLifecycleState.ERROR);
      this.emit(name, ScannerLifecycleState.ERROR, error as Error);
      throw error;
    }
  }

  /**
   * Run a scan with a scanner
   */
  async run(name: string, target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const currentState = this.getState(name);

    if (currentState === ScannerLifecycleState.IDLE && this.autoInitialize) {
      // Auto-initialize with default config
      await this.initialize(name, { enabled: true });
    }

    if (currentState !== ScannerLifecycleState.READY) {
      throw new Error(`Scanner "${name}" is not ready. Current state: ${currentState}`);
    }

    this.setState(name, ScannerLifecycleState.RUNNING);
    this.emit(name, ScannerLifecycleState.RUNNING);

    try {
      const scanner = this.registry.get(name);
      if (!scanner) {
        throw new Error(`Scanner "${name}" not found`);
      }

      const result = await scanner.scan(target, options);

      this.setState(name, ScannerLifecycleState.READY);
      this.emit(name, ScannerLifecycleState.READY);

      return result;
    } catch (error) {
      this.setState(name, ScannerLifecycleState.ERROR);
      this.emit(name, ScannerLifecycleState.ERROR, error as Error);
      throw error;
    }
  }

  /**
   * Run multiple scanners in parallel
   */
  async runAll(
    targets: string[],
    options?: Record<string, unknown>
  ): Promise<Map<string, ScanResult>> {
    const results = new Map<string, ScanResult>();
    const scannerNames = this.registry.getAllNames();

    const scanPromises = scannerNames.map(async (name) => {
      const scanner = this.registry.get(name);
      if (!scanner?.canHandle(targets[0])) {
        return;
      }

      try {
        const result = await this.run(name, targets[0], options);
        results.set(name, result);
      } catch (error) {
        console.error(`[ScannerLifecycle] Error running scanner "${name}":`, error);
      }
    });

    await Promise.all(scanPromises);
    return results;
  }

  /**
   * Clean up a scanner
   */
  async cleanup(name: string): Promise<void> {
    const currentState = this.getState(name);

    if (
      currentState === ScannerLifecycleState.IDLE ||
      currentState === ScannerLifecycleState.DISPOSED
    ) {
      return;
    }

    if (currentState === ScannerLifecycleState.RUNNING) {
      throw new Error(`Cannot clean up scanner "${name}" while it is running`);
    }

    this.setState(name, ScannerLifecycleState.CLEANING_UP);
    this.emit(name, ScannerLifecycleState.CLEANING_UP);

    try {
      const scanner = this.registry.get(name);
      if (scanner) {
        await scanner.cleanup();
      }

      this.setState(name, ScannerLifecycleState.IDLE);
      this.emit(name, ScannerLifecycleState.IDLE);
    } catch (error) {
      this.setState(name, ScannerLifecycleState.ERROR);
      this.emit(name, ScannerLifecycleState.ERROR, error as Error);
      throw error;
    }
  }

  /**
   * Clean up all scanners
   */
  async cleanupAll(): Promise<void> {
    const scannerNames = this.registry.getAllNames();

    const cleanupPromises = scannerNames.map(async (name) => {
      try {
        await this.cleanup(name);
      } catch (error) {
        console.error(`[ScannerLifecycle] Error cleaning up scanner "${name}":`, error);
      }
    });

    await Promise.all(cleanupPromises);
  }

  /**
   * Dispose the lifecycle manager
   */
  async dispose(): Promise<void> {
    if (this.autoCleanup) {
      await this.cleanupAll();
    }

    this.states.clear();
    this.listeners.clear();

    // Emit disposed event for all scanners
    for (const name of this.registry.getAllNames()) {
      this.setState(name, ScannerLifecycleState.DISPOSED);
      this.emit(name, ScannerLifecycleState.DISPOSED);
    }
  }

  /**
   * Set the state of a scanner
   */
  private setState(name: string, state: ScannerLifecycleState): void {
    this.states.set(name, state);
  }

  /**
   * Check if a scanner is in a specific state
   */
  isInState(name: string, state: ScannerLifecycleState): boolean {
    return this.getState(name) === state;
  }

  /**
   * Check if a scanner is ready
   */
  isReady(name: string): boolean {
    return this.getState(name) === ScannerLifecycleState.READY;
  }

  /**
   * Check if any scanner is running
   */
  isAnyRunning(): boolean {
    for (const state of this.states.values()) {
      if (state === ScannerLifecycleState.RUNNING) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Create a lifecycle manager with default settings
 */
export function createLifecycleManager(registry: ScannerRegistry): ScannerLifecycleManager {
  return new ScannerLifecycleManager({
    registry,
    autoInitialize: true,
    autoCleanup: true,
  });
}
