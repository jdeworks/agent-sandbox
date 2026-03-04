/**
 * Scanner Selector Component
 *
 * Allows users to select which scanners to run for a scan.
 * Based on best practices from Snyk, GitHub Security, and Veracode.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Shield,
  Globe,
  Lock,
  Container,
  Code,
  Smartphone,
  Server,
  Check,
  Package,
  Layers,
} from 'lucide-react';
import type { ScannerMetadata, ScannerConfig } from '@security-analyzer/types';

// Scanner type to icon mapping
const typeIcons: Record<string, React.ElementType> = {
  static: Code,
  dynamic: Globe,
  dependency: Package,
  secret: Lock,
  composition: Layers,
  iac: Server,
  mobile: Smartphone,
  container: Container,
};

// Scanner type to color mapping
const typeColors: Record<string, string> = {
  static: 'bg-blue-500',
  dynamic: 'bg-green-500',
  dependency: 'bg-purple-500',
  secret: 'bg-red-500',
  composition: 'bg-orange-500',
  iac: 'bg-teal-500',
  mobile: 'bg-pink-500',
  container: 'bg-indigo-500',
};

// Default scanners available in the system
const AVAILABLE_SCANNERS: ScannerMetadata[] = [
  // SAST
  {
    name: 'semgrep',
    type: 'static',
    description: 'Fast static analysis for multiple languages',
    tags: ['sast'],
    supportedTargets: ['code'],
  },
  {
    name: 'opengrep',
    type: 'static',
    description: 'Open source semantic code analysis',
    tags: ['sast'],
    supportedTargets: ['code'],
  },
  {
    name: 'bandit',
    type: 'static',
    description: 'Python security issues finder',
    tags: ['python'],
    supportedTargets: ['python'],
  },

  // DAST
  {
    name: 'nuclei',
    type: 'dynamic',
    description: 'Template-based vulnerability scanner',
    tags: ['web', 'cve'],
    supportedTargets: ['url', 'domain'],
  },
  {
    name: 'zap',
    type: 'dynamic',
    description: 'OWASP Zed Attack Proxy',
    tags: ['web', 'owasp'],
    supportedTargets: ['url'],
  },

  // Secrets
  {
    name: 'gitleaks',
    type: 'secret',
    description: 'Secrets detection in git repositories',
    tags: ['secrets'],
    supportedTargets: ['git', 'files'],
  },
  {
    name: 'trufflehog',
    type: 'secret',
    description: 'Advanced secrets scanner with verification',
    tags: ['secrets'],
    supportedTargets: ['git', 'files'],
  },

  // Dependency / SCA
  {
    name: 'trivy',
    type: 'dependency',
    description: 'Vulnerability scanner for containers and dependencies',
    tags: ['sca', 'container'],
    supportedTargets: ['container', 'lockfile'],
  },
  {
    name: 'grype',
    type: 'dependency',
    description: 'Vulnerability scanner for containers',
    tags: ['container'],
    supportedTargets: ['container'],
  },

  // IaC
  {
    name: 'checkov',
    type: 'iac',
    description: 'Infrastructure as Code security scanner',
    tags: ['terraform', 'k8s'],
    supportedTargets: ['terraform', 'yaml'],
  },

  // Mobile
  {
    name: 'mobsf',
    type: 'mobile',
    description: 'Mobile application security analysis',
    tags: ['android', 'ios'],
    supportedTargets: ['apk', 'ipa'],
  },

  // Network
  {
    name: 'nmap',
    type: 'dynamic',
    description: 'Network discovery and security scanning',
    tags: ['network'],
    supportedTargets: ['host', 'network'],
  },
];

// Import missing icon

interface ScannerSelectorProps {
  selectedScanners?: ScannerConfig[];
  onChange?: (scanners: ScannerConfig[]) => void;
  disabled?: boolean;
}

export function ScannerSelector({
  selectedScanners = [],
  onChange,
  disabled = false,
}: ScannerSelectorProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('static');

  // Group scanners by type
  const scannersByType = AVAILABLE_SCANNERS.reduce(
    (acc, scanner) => {
      if (!acc[scanner.type]) {
        acc[scanner.type] = [];
      }
      acc[scanner.type].push(scanner);
      return acc;
    },
    {} as Record<string, ScannerMetadata[]>
  );

  const isScannerSelected = (name: string) =>
    selectedScanners.some((s) => s.name === name && s.enabled);

  const toggleScanner = (scanner: ScannerMetadata) => {
    const currentEnabled = isScannerSelected(scanner.name);
    let newScanners: ScannerConfig[];

    if (currentEnabled) {
      newScanners = selectedScanners.map((s) =>
        s.name === scanner.name ? { ...s, enabled: false } : s
      );
    } else {
      const existing = selectedScanners.find((s) => s.name === scanner.name);
      if (existing) {
        newScanners = selectedScanners.map((s) =>
          s.name === scanner.name ? { ...s, enabled: true } : s
        );
      } else {
        newScanners = [...selectedScanners, { name: scanner.name, enabled: true }];
      }
    }

    onChange?.(newScanners);
  };

  const selectAllInCategory = (type: string) => {
    const categoryScanners = scannersByType[type] || [];
    const allSelected = categoryScanners.every((s) => isScannerSelected(s.name));

    let newScanners: ScannerConfig[];

    if (allSelected) {
      // Disable all in category
      newScanners = selectedScanners.map((s) => {
        if (categoryScanners.some((cs) => cs.name === s.name)) {
          return { ...s, enabled: false };
        }
        return s;
      });
    } else {
      // Enable all in category
      const newConfigs = categoryScanners.map((s) => ({ name: s.name, enabled: true }));
      const otherScanners = selectedScanners.filter(
        (s) => !categoryScanners.some((cs) => cs.name === s.name)
      );
      newScanners = [...otherScanners, ...newConfigs];
    }

    onChange?.(newScanners);
  };

  const getSelectedCount = () => selectedScanners.filter((s) => s.enabled).length;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Scanners
            </CardTitle>
            <CardDescription>
              Select scanners to run ({getSelectedCount()} selected)
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(Object.keys(scannersByType) as string[]).map((type) => (
              <TooltipProvider key={type}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllInCategory(type)}
                      disabled={disabled}
                    >
                      {type.charAt(0).toUpperCase()}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Select all {type}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(scannersByType).map(([type, scanners]) => {
          const Icon = typeIcons[type] || Shield;
          const colorClass = typeColors[type] || 'bg-gray-500';
          const selectedCount = scanners.filter((s) => isScannerSelected(s.name)).length;
          const isExpanded = expandedCategory === type;

          return (
            <div key={type} className="border rounded-lg overflow-hidden">
              <Button
                variant="ghost"
                className="w-full justify-between px-4 py-3 hover:bg-muted/50"
                onClick={() => setExpandedCategory(isExpanded ? null : type)}
                disabled={disabled}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${colorClass}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-medium capitalize">{type}</span>
                  <Badge variant="secondary" className="ml-2">
                    {selectedCount}/{scanners.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCount > 0 && <Check className="h-4 w-4 text-green-500" />}
                </div>
              </Button>

              {isExpanded && (
                <div className="border-t bg-muted/20 p-2 space-y-1">
                  {scanners.map((scanner) => (
                    <div
                      key={scanner.name}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-pointer transition-colors ${
                        disabled ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      onClick={() => !disabled && toggleScanner(scanner)}
                    >
                      <Checkbox
                        checked={isScannerSelected(scanner.name)}
                        onCheckedChange={() => !disabled && toggleScanner(scanner)}
                        disabled={disabled}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{scanner.name}</div>
                        <div className="text-sm text-muted-foreground">{scanner.description}</div>
                      </div>
                      {scanner.tags?.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Quick selection presets */}
        <div className="pt-4 border-t">
          <div className="text-sm text-muted-foreground mb-2">Quick presets</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const all: ScannerConfig[] = AVAILABLE_SCANNERS.map((s) => ({
                  name: s.name,
                  enabled: true,
                }));
                onChange?.(all);
              }}
              disabled={disabled}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const sast = AVAILABLE_SCANNERS.filter((s) => s.type === 'static').map((s) => ({
                  name: s.name,
                  enabled: true,
                }));
                onChange?.(sast);
              }}
              disabled={disabled}
            >
              SAST Only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const secrets = AVAILABLE_SCANNERS.filter((s) => s.type === 'secret').map((s) => ({
                  name: s.name,
                  enabled: true,
                }));
                onChange?.(secrets);
              }}
              disabled={disabled}
            >
              Secrets Only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const sca = AVAILABLE_SCANNERS.filter(
                  (s) => s.type === 'dependency' || s.type === 'container'
                ).map((s) => ({ name: s.name, enabled: true }));
                onChange?.(sca);
              }}
              disabled={disabled}
            >
              SCA Only
            </Button>
            <Button variant="outline" size="sm" onClick={() => onChange?.([])} disabled={disabled}>
              Clear All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScannerSelector;
