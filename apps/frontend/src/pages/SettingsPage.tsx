import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, RotateCcw, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { getScannerConfigs, updateScannerConfigs, updateSettings, getSettings } from '@/lib/api';
import type { ScannerSetting } from '@security-analyzer/types';

export default function SettingsPage() {
  const [scannerConfigs, setScannerConfigs] = useState<ScannerSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('SAST');

  // General settings state
  const [orgName, setOrgName] = useState('Security Analyzer');
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:3000');
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [scanTimeout, setScanTimeout] = useState(300);

  // UI state
  const [activeTab, setActiveTab] = useState<'general' | 'scanners'>('scanners');

  // Fetch both general settings and scanner configs
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        setApiEndpoint(settings.apiUrl);
        setMaxConcurrent(settings.maxConcurrentScans);
        setScanTimeout(settings.scanTimeout / 1000); // convert ms to seconds
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };

    const fetchScannerConfigs = async () => {
      try {
        const configs = await getScannerConfigs();
        setScannerConfigs(configs);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch scanner configs:', err);
        setError('Failed to load scanner configurations');
      } finally {
        setLoading(false);
      }
    };

    Promise.all([fetchSettings(), fetchScannerConfigs()]);
  }, []);

  const handleToggleScanner = (name: string) => {
    setScannerConfigs((prev) =>
      prev.map((scanner) =>
        scanner.name === name ? { ...scanner, enabled: !scanner.enabled } : scanner
      )
    );
    setSaved(false);
  };

  const handleUpdateTimeout = (name: string, timeout: string) => {
    const timeoutMs = parseInt(timeout) * 1000;
    setScannerConfigs((prev) =>
      prev.map((scanner) =>
        scanner.name === name
          ? { ...scanner, timeout: isNaN(timeoutMs) ? 300000 : timeoutMs }
          : scanner
      )
    );
    setSaved(false);
  };

  const handleUpdateArgs = (name: string, args: string) => {
    setScannerConfigs((prev) =>
      prev.map((scanner) => (scanner.name === name ? { ...scanner, args } : scanner))
    );
    setSaved(false);
  };

  const handleSaveScanners = async () => {
    setSaving(true);
    try {
      await updateScannerConfigs(scannerConfigs);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save scanner configs:', err);
      setError('Failed to save scanner configurations');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await updateSettings({
        apiUrl: apiEndpoint,
        maxConcurrentScans: maxConcurrent,
        scanTimeout: scanTimeout * 1000,
      });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save general settings:', err);
      setError('Failed to save general settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetScanners = () => {
    const defaults: ScannerSetting[] = [
      { name: 'bandit', enabled: true, timeout: 300000, args: '', category: 'SAST' },
      { name: 'semgrep', enabled: true, timeout: 300000, args: '', category: 'SAST' },
      { name: 'opengrep', enabled: true, timeout: 300000, args: '', category: 'SAST' },
      { name: 'nuclei', enabled: true, timeout: 300000, args: '', category: 'DAST' },
      { name: 'zap', enabled: false, timeout: 600000, args: '', category: 'DAST' },
      { name: 'sqlmap', enabled: false, timeout: 600000, args: '', category: 'DAST' },
      { name: 'nmap', enabled: false, timeout: 300000, args: '', category: 'Network' },
      { name: 'ssl', enabled: false, timeout: 120000, args: '', category: 'Network' },
      { name: 'gitleaks', enabled: true, timeout: 300000, args: '', category: 'Secrets' },
      { name: 'trufflehog', enabled: true, timeout: 300000, args: '', category: 'Secrets' },
      { name: 'trivy', enabled: true, timeout: 300000, args: '', category: 'Container' },
      { name: 'grype', enabled: true, timeout: 300000, args: '', category: 'Dependency' },
      { name: 'checkov', enabled: true, timeout: 300000, args: '', category: 'IaC' },
      { name: 'mobsf', enabled: false, timeout: 600000, args: '', category: 'Mobile' },
      { name: 'test-scanner', enabled: false, timeout: 60000, args: '', category: 'Test' },
    ];
    setScannerConfigs(defaults);
    setSaved(false);
  };

  // Group scanners by category
  const groupedScanners = scannerConfigs.reduce(
    (acc, scanner) => {
      const category = scanner.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(scanner);
      return acc;
    },
    {} as Record<string, ScannerSetting[]>
  );

  const categories = Object.keys(groupedScanners).sort();

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your security analyzer preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b">
        <button
          className={`pb-2 px-1 ${activeTab === 'general' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          className={`pb-2 px-1 ${activeTab === 'scanners' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
          onClick={() => setActiveTab('scanners')}
        >
          Scanners
        </button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'general' && (
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Basic configuration for the application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="orgName">
                Organization Name
              </label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="My Organization"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="apiUrl">
                API Endpoint
              </label>
              <Input
                id="apiUrl"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://api.example.com"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="maxConcurrent">
                Max Concurrent Scans
              </label>
              <Input
                id="maxConcurrent"
                type="number"
                min={1}
                max={10}
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="scanTimeout">
                Default Scan Timeout (seconds)
              </label>
              <Input
                id="scanTimeout"
                type="number"
                min={60}
                value={scanTimeout}
                onChange={(e) => setScanTimeout(parseInt(e.target.value) || 300)}
              />
            </div>
            <Button onClick={handleSaveGeneral} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'scanners' && (
        <Card>
          <CardHeader>
            <CardTitle>Scanner Configuration</CardTitle>
            <CardDescription>
              Configure which scanners to enable and their settings. Click a category to expand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories.map((category) => (
              <div key={category} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
                >
                  <span className="font-semibold">{category}</span>
                  {expandedCategory === category ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {expandedCategory === category && (
                  <div className="p-3 space-y-2">
                    {groupedScanners[category].map((scanner) => (
                      <div
                        key={scanner.name}
                        className="flex items-center gap-4 p-3 border rounded-lg bg-card"
                      >
                        <Checkbox
                          checked={scanner.enabled}
                          onCheckedChange={() => handleToggleScanner(scanner.name)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{scanner.name}</span>
                            <Badge variant={scanner.enabled ? 'default' : 'outline'}>
                              {scanner.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`timeout-${scanner.name}`}
                            className="text-xs text-muted-foreground"
                          >
                            Timeout (s)
                          </label>
                          <Input
                            id={`timeout-${scanner.name}`}
                            type="number"
                            min={30}
                            className="w-20 h-8"
                            value={Math.round(scanner.timeout / 1000)}
                            onChange={(e) => handleUpdateTimeout(scanner.name, e.target.value)}
                            disabled={!scanner.enabled}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`args-${scanner.name}`}
                            className="text-xs text-muted-foreground"
                          >
                            Args
                          </label>
                          <Input
                            id={`args-${scanner.name}`}
                            placeholder="--verbose --debug"
                            value={scanner.args || ''}
                            onChange={(e) => handleUpdateArgs(scanner.name, e.target.value)}
                            disabled={!scanner.enabled}
                            className="w-48 h-8"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleResetScanners}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSaveScanners} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : saved ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Scanner Configurations
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
