/**
 * Unit tests for Scanner Registry and Plugin System
 */

import { ScannerRegistry, resetGlobalRegistry, getGlobalRegistry } from '../registry';
import { ScannerConfig, ScannerType } from '../base';
import { ScannerMetadata } from '../base';

// Mock scanner for testing
class MockScanner {
  readonly name = 'mock-scanner';
  readonly type: ScannerType = 'static';

  private initialized = false;
  private config: ScannerConfig | null = null;

  async init(config: ScannerConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
  }

  async scan(target: string): Promise<any> {
    return { id: 'test', vulnerabilities: [] };
  }

  getResults(): any {
    return null;
  }

  async cleanup(): Promise<void> {
    this.initialized = false;
  }

  canHandle(target: string): boolean {
    return target.startsWith('/');
  }

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Mock scanner for testing',
      version: '1.0.0',
    };
  }
}

describe('ScannerRegistry', () => {
  let registry: ScannerRegistry;

  beforeEach(() => {
    resetGlobalRegistry();
    registry = getGlobalRegistry();
  });

  describe('register', () => {
    it('should register a scanner instance', () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      const retrieved = registry.get('mock-scanner');
      expect(retrieved).toBe(scanner);
    });

    it('should overwrite existing scanner with same name', () => {
      const scanner1 = new MockScanner();
      const scanner2 = new MockScanner();

      registry.register(scanner1);
      registry.register(scanner2);

      const retrieved = registry.get('mock-scanner');
      expect(retrieved).toBe(scanner2);
    });
  });

  describe('registerFactory', () => {
    it('should register a scanner factory', () => {
      const factory = () => new MockScanner();

      registry.registerFactory('factory-scanner', 'static', factory, {
        description: 'Factory scanner',
        version: '1.0.0',
      });

      const scanner = registry.get('factory-scanner');
      expect(scanner).toBeDefined();
      expect(scanner?.name).toBe('mock-scanner');
    });

    it('should create new instance on each get when using factory', () => {
      const factory = () => new MockScanner();

      registry.registerFactory('factory-scanner', 'static', factory, {
        description: 'Factory scanner',
        version: '1.0.0',
      });

      const scanner1 = registry.get('factory-scanner');
      const scanner2 = registry.get('factory-scanner');

      // Should return the same cached instance
      expect(scanner1).toBe(scanner2);
    });
  });

  describe('unregister', () => {
    it('should unregister a scanner', () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      const removed = registry.unregister('mock-scanner');

      expect(removed).toBe(true);
      expect(registry.get('mock-scanner')).toBeNull();
    });

    it('should return false for non-existent scanner', () => {
      const removed = registry.unregister('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('get', () => {
    it('should return null for non-existent scanner', () => {
      const scanner = registry.get('non-existent');
      expect(scanner).toBeNull();
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for registered scanner', () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      const metadata = registry.getMetadata('mock-scanner');

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('mock-scanner');
      expect(metadata?.type).toBe('static');
    });

    it('should return null for non-existent scanner', () => {
      const metadata = registry.getMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('getAllNames', () => {
    it('should return all registered scanner names', () => {
      registry.register(new MockScanner());

      const mock2 = new MockScanner();
      (mock2 as any).name = 'mock-scanner-2';
      registry.register(mock2);

      const names = registry.getAllNames();

      expect(names).toContain('mock-scanner');
      expect(names).toContain('mock-scanner-2');
    });
  });

  describe('getByType', () => {
    it('should return scanners of specified type', () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      const scanners = registry.getByType('static');

      expect(scanners.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent type', () => {
      const scanners = registry.getByType('dynamic');
      expect(scanners).toEqual([]);
    });
  });

  describe('findScannersForTarget', () => {
    it('should find scanners that can handle target', () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      const scanners = registry.findScannersForTarget('/some/path');

      expect(scanners.length).toBeGreaterThan(0);
    });

    it('should return empty array when no scanner can handle target', () => {
      const scanners = registry.findScannersForTarget('http://example.com');
      expect(scanners).toEqual([]);
    });
  });

  describe('initializeAll', () => {
    it('should initialize all enabled scanners', async () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      await registry.initializeAll({
        'mock-scanner': { enabled: true },
      });

      expect(registry.isInitialized('mock-scanner')).toBe(true);
    });

    it('should skip disabled scanners', async () => {
      const scanner = new MockScanner();
      registry.register(scanner);

      await registry.initializeAll({
        'mock-scanner': { enabled: false },
      });

      expect(registry.isInitialized('mock-scanner')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return correct count', () => {
      registry.register(new MockScanner());

      const mock2 = new MockScanner();
      (mock2 as any).name = 'mock2';
      registry.register(mock2);

      expect(registry.count()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all scanners', () => {
      registry.register(new MockScanner());
      registry.clear();

      expect(registry.count()).toBe(0);
    });
  });

  describe('dependencies', () => {
    it('should set and get dependencies', () => {
      registry.setDependencies({ db: {} });

      const db = registry.getDependency('db');
      expect(db).toBeDefined();
    });
  });
});

describe('getGlobalRegistry', () => {
  beforeEach(() => {
    resetGlobalRegistry();
  });

  it('should return singleton instance', () => {
    const registry1 = getGlobalRegistry();
    const registry2 = getGlobalRegistry();

    expect(registry1).toBe(registry2);
  });
});

describe('resetGlobalRegistry', () => {
  it('should allow creating new registry after reset', () => {
    const registry1 = getGlobalRegistry();
    resetGlobalRegistry();
    const registry2 = getGlobalRegistry();

    expect(registry1).not.toBe(registry2);
  });
});
