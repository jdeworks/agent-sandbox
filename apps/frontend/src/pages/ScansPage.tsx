import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Search, Eye, Trash2, RefreshCw, FolderOpen, HelpCircle, Sparkles } from 'lucide-react';
import { getScans, createScan, deleteScan, getScanResults, uploadFolder, getScanners } from '@/lib/api';
import type { Scan, ScanResult, CreateScanInput, ScannerMetadata } from '@security-analyzer/types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';


// Map scanner name -> category for grouping (align with Settings page)
const SCANNER_CATEGORY: Record<string, string> = {
  bandit: 'SAST',
  semgrep: 'SAST',
  opengrep: 'SAST',
  nuclei: 'DAST',
  zap: 'DAST',
  sqlmap: 'DAST',
  nmap: 'Network',
  ssl: 'Network',
  gitleaks: 'Secrets',
  trufflehog: 'Secrets',
  trivy: 'Container',
  grype: 'Dependency',
  checkov: 'IaC',
  mobsf: 'Mobile',
  'test-scanner': 'Test',
};

const statusVariant = (status: string) => {
  switch (status) {
    case 'completed':
      return 'default';
    case 'running':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
};

function suggestScannersFromTargetInput(target: string): { name: string; reason: string }[] {
  const t = target.trim().toLowerCase();
  if (!t) return [];
  const out: { name: string; reason: string }[] = [];
  const isUrl = t.startsWith('http://') || t.startsWith('https://');
  const isIp = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(t);
  const isRepoUrl =
    isUrl &&
    ((t.includes('github.com/') || t.includes('gitlab.com/') || t.includes('bitbucket.org/')) ||
      t.endsWith('.git'));

  if (isRepoUrl) {
    out.push({ name: 'semgrep', reason: 'Repository URL - static code analysis' });
    out.push({ name: 'opengrep', reason: 'Repository URL - semantic analysis' });
    out.push({ name: 'gitleaks', reason: 'Repository URL - secret detection' });
    out.push({ name: 'trufflehog', reason: 'Repository URL - secret verification' });
    return out;
  }

  if (isUrl) {
    out.push({ name: 'nuclei', reason: 'URL target for web DAST scanning' });
    out.push({ name: 'zap', reason: 'URL target for active web testing' });
    out.push({ name: 'sqlmap', reason: 'URL target for SQL injection checks' });
    out.push({ name: 'ssl', reason: 'URL target for TLS/SSL checks' });
    return out;
  }

  if (isIp || t.includes(':')) {
    out.push({ name: 'nmap', reason: 'Host/IP target for network scanning' });
    out.push({ name: 'ssl', reason: 'Host target for TLS/SSL checks' });
    out.push({ name: 'nuclei', reason: 'Host target for template-based checks' });
  }

  if (t.includes('docker.io/') || t.startsWith('sha256:')) {
    out.push({ name: 'trivy', reason: 'Container image style target' });
    out.push({ name: 'grype', reason: 'Container image style target' });
  }

  if (t.endsWith('.apk') || t.endsWith('.ipa') || t.endsWith('.aab')) {
    out.push({ name: 'mobsf', reason: 'Mobile artifact target' });
  }

  if (t.endsWith('.tf') || t.endsWith('.tf.json') || t.includes('terraform') || t.includes('kubernetes')) {
    out.push({ name: 'checkov', reason: 'IaC-style target naming' });
  }

  return out.filter((item, idx, arr) => arr.findIndex((x) => x.name === item.name) === idx);
}

export default function ScansPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewScanOpen, setIsNewScanOpen] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newScanName, setNewScanName] = useState('');
  const [newScanTarget, setNewScanTarget] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
const [availableScanners, setAvailableScanners] = useState<ScannerMetadata[]>([]);
const [selectedScanners, setSelectedScanners] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<'url' | 'upload' | 'volume'>('url');
  const [volumeList, setVolumeList] = useState<{ name: string; mountPath: string }[]>([]);
  const [selectedVolumeRoot, setSelectedVolumeRoot] = useState(''); // mountPath of volume (for dropdown)
  const [selectedVolumePath, setSelectedVolumePath] = useState(''); // full path used as scan target
  const [browseEntries, setBrowseEntries] = useState<{ name: string; path: string; isDirectory: boolean }[]>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [volumeHelpOpen, setVolumeHelpOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedScanners, setSuggestedScanners] = useState<{ name: string; reason: string }[]>([]);

  const fetchScans = useCallback(async () => {
    try {
      const response = await getScans({ limit: 100 });
      setScans(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch scans:', err);
      setError('Failed to load scans. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  // Single fetch on mount only; use Refresh button to update (no polling to avoid spamming /scans)
  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('webkitdirectory', '');
      fileInputRef.current.setAttribute('directory', '');
    }
  }, []);
  useEffect(() => {
    const fetchScannersList = async () => {
      try {
        const scanners = await getScanners();
        setAvailableScanners(scanners);
        setSelectedScanners(scanners.map((s) => s.name));
      } catch (err) {
        console.error('Failed to fetch scanners:', err);
      }
    };
    fetchScannersList();
  }, []);

  const fetchVolumes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/volumes`);
      if (res.ok) {
        const data = await res.json();
        setVolumeList(data.volumes || []);
      } else setVolumeList([]);
    } catch {
      setVolumeList([]);
    }
  }, []);

  const browsePathForVolume = useCallback(
    async (pathToBrowse: string) => {
      try {
        const res = await fetch(
          `${API_BASE}/volumes/browse?path=${encodeURIComponent(pathToBrowse)}`
        );
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Browse failed');
        const data = await res.json();
        setBrowsePath(data.path);
        setBrowseEntries(data.entries || []);
      } catch (err) {
        console.error(err);
        setBrowseEntries([]);
      }
    },
    []
  );

  const handleSuggestScanners = useCallback(async () => {
    const target = targetType === 'volume' ? selectedVolumePath : newScanTarget;
    if (!target.trim()) return;
    setSuggesting(true);
    try {
      let suggestions: { name: string; reason: string }[] = [];
      const res = await fetch(
        `${API_BASE}/volumes/suggest-scanners?target=${encodeURIComponent(target)}`
      );
      if (res.ok) {
        const data = await res.json();
        suggestions = data.suggestions || [];
      } else {
        // Fallback if backend doesn't have enhanced suggestion endpoint yet.
        suggestions = suggestScannersFromTargetInput(target);
      }
      if (!suggestions.length) {
        suggestions = suggestScannersFromTargetInput(target);
      }
      const names = suggestions.map((s) => s.name);
      setSelectedScanners(names); // preset selection
      setSuggestedScanners(suggestions);
    } catch (err) {
      console.error(err);
      const fallback = suggestScannersFromTargetInput(target);
      setSelectedScanners(fallback.map((s) => s.name));
      setSuggestedScanners(fallback);
    } finally {
      setSuggesting(false);
    }
  }, [targetType, selectedVolumePath, newScanTarget]);

  useEffect(() => {
    if (isNewScanOpen && targetType === 'volume') fetchVolumes();
  }, [isNewScanOpen, targetType, fetchVolumes]);

  useEffect(() => {
    if (targetType === 'volume' && selectedVolumePath) browsePathForVolume(selectedVolumePath);
  }, [targetType, selectedVolumePath, browsePathForVolume]);

  useEffect(() => {
    setSuggestedScanners([]);
  }, [targetType, newScanTarget, selectedVolumePath]);

  const currentVolumeRoot = volumeList.find((v) => v.mountPath === selectedVolumeRoot)?.mountPath ?? '';

  const filteredScans = scans.filter(
    (scan) =>
      scan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scan.target.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const effectiveTarget =
    targetType === 'volume' ? selectedVolumePath : newScanTarget;

  const handleCreateScan = async () => {
    if (!newScanName.trim() || !effectiveTarget.trim()) return;

    setCreating(true);
    try {
      const scanData: CreateScanInput = {
        name: newScanName,
        target: effectiveTarget,
        scanners: selectedScanners.map((name) => ({ name, enabled: true })),
        scanMode: effectiveTarget.startsWith('http') ? 'url' : 'local',
      };
      await createScan(scanData);
      setNewScanName('');
      setNewScanTarget('');
      setSelectedVolumeRoot('');
      setSelectedVolumePath('');
      setBrowsePath('');
      setBrowseEntries([]);
      setIsNewScanOpen(false);
      fetchScans();
    } catch (err) {
      console.error('Failed to create scan:', err);
      setError('Failed to create scan');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteScan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteScan(id);
      fetchScans();
    } catch (err) {
      console.error('Failed to delete scan:', err);
      setError('Failed to delete scan');
    }
  };

  const handleViewDetails = async (scan: Scan) => {
    setSelectedScan(scan);
    setDetailsOpen(true);

    if (scan.status === 'completed') {
      setResultsLoading(true);
      try {
        const results = await getScanResults(scan.id);
        setScanResults(results);
      } catch (err) {
        console.error('Failed to fetch results:', err);
      } finally {
        setResultsLoading(false);
      }
    }
  };

  const handleUploadFolder = async () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file, file.webkitRelativePath || file.name);
      });
      const result = await uploadFolder(formData);
      setNewScanTarget(result.target);
    } catch (err) {
      console.error('Failed to upload folder', err);
      setError('Failed to upload folder');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scans</h1>
          <p className="text-muted-foreground">Manage and monitor your security scans</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchScans} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={isNewScanOpen} onOpenChange={setIsNewScanOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Scan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Scan</DialogTitle>
                <DialogDescription>Configure a new security scan for your target</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Input
                    placeholder="Scan Name"
                    value={newScanName}
                    onChange={(e) => setNewScanName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Target</label>
                  <div className="flex gap-2 border rounded-md p-2">
                    {(['url', 'upload', 'volume'] as const).map((t) => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="targetType"
                          checked={targetType === t}
                          onChange={() => setTargetType(t)}
                        />
                        <span className="text-sm capitalize">{t === 'url' ? 'URL' : t === 'upload' ? 'Upload folder' : 'Volume folder'}</span>
                      </label>
                    ))}
                  </div>
                  {targetType === 'url' && (
                    <>
                      <Input
                        placeholder="URL (e.g. https://example.com)"
                        value={newScanTarget}
                        onChange={(e) => setNewScanTarget(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Enter a URL for DAST/network scans.</p>
                    </>
                  )}
                  {targetType === 'upload' && (
                    <>
                      <Input
                        placeholder="Path set after upload"
                        value={newScanTarget}
                        readOnly
                        className="bg-muted"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleUploadFolder}
                        disabled={uploading}
                      >
                        {uploading ? 'Uploading...' : 'Upload Folder'}
                      </Button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={onFileChange}
                        multiple
                      />
                      <p className="text-xs text-muted-foreground">Upload is slower for large trees; prefer connecting a volume.</p>
                    </>
                  )}
                  {targetType === 'volume' && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Connected volumes</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="How to connect a local folder"
                          onClick={() => setVolumeHelpOpen(true)}
                        >
                          <HelpCircle className="h-4 w-4" />
                        </Button>
                      </div>
                      {volumeList.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No volumes connected. Run from repo root: <code className="bg-muted px-1 rounded">./add-volume &lt;name&gt; [path]</code> then restart containers.
                        </p>
                      ) : (
                        <>
                          <select
                            className="w-full border rounded-md px-3 py-2 text-sm"
                            value={currentVolumeRoot}
                            onChange={(e) => {
                              const p = e.target.value;
                              setSelectedVolumeRoot(p);
                              setSelectedVolumePath(p);
                              if (p) browsePathForVolume(p);
                            }}
                          >
                            <option value="">Select a volume root…</option>
                            {volumeList.map((v) => (
                              <option key={v.name} value={v.mountPath}>{v.name} ({v.mountPath})</option>
                            ))}
                          </select>
                          {browsePath && (
                            <div className="border rounded-md p-2 max-h-32 overflow-y-auto">
                              <div className="flex items-center gap-2 mb-1">
                                <FolderOpen className="h-4 w-4" />
                                <span className="text-xs font-medium">{browsePath}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {browsePath !== selectedVolumeRoot && (
                                  <button
                                    type="button"
                                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                    onClick={() => {
                                      const parent = browsePath.split('/').slice(0, -1).join('/');
                                      if (parent) setSelectedVolumePath(parent);
                                    }}
                                  >
                                    .. parent
                                  </button>
                                )}
                                {browseEntries
                                  .filter((e) => e.isDirectory)
                                  .map((e) => (
                                    <button
                                      key={e.path}
                                      type="button"
                                      className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                      onClick={() => setSelectedVolumePath(e.path)}
                                    >
                                      {e.name}/
                                    </button>
                                  ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">Selected path: {selectedVolumePath || browsePath}</p>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
              </div>
              {effectiveTarget.trim() && (
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSuggestScanners}
                    disabled={suggesting}
                    className="justify-start"
                  >
                    {suggesting ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Preset scanners for this target
                  </Button>
                  {suggestedScanners.length > 0 && (
                    <div className="border rounded-md p-2 space-y-1">
                      {suggestedScanners.map((s) => (
                        <p key={s.name} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{s.name}</span>: {s.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Select Scanners</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedScanners(availableScanners.map((s) => s.name))}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedScanners([])}
                  >
                    Deselect all
                  </Button>
                </div>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {Object.entries(
                    availableScanners.reduce(
                      (acc, s) => {
                        const cat = SCANNER_CATEGORY[s.name] ?? 'Other';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(s);
                        return acc;
                      },
                      {} as Record<string, ScannerMetadata[]>
                    )
                  )
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, list]) => (
                      <div key={category} className="border rounded-lg p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{category}</span>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                setSelectedScanners((prev) =>
                                  Array.from(new Set([...prev, ...list.map((s) => s.name)]))
                                )
                              }
                            >
                              All
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                setSelectedScanners((prev) =>
                                  prev.filter((n) => !list.some((s) => s.name === n))
                                )
                              }
                            >
                              None
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {list.map((scanner) => (
                            <label key={scanner.name} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={selectedScanners.includes(scanner.name)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedScanners([...selectedScanners, scanner.name]);
                                  } else {
                                    setSelectedScanners(
                                      selectedScanners.filter((name) => name !== scanner.name)
                                    );
                                  }
                                }}
                              />
                              <span className="text-sm">{scanner.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewScanOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateScan}
                  disabled={creating || !newScanName.trim() || !effectiveTarget.trim()}
                >
                  {creating ? 'Creating...' : 'Start Scan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={volumeHelpOpen} onOpenChange={setVolumeHelpOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect a local folder as a volume</DialogTitle>
                <DialogDescription>
                  So the scanner can read your repo without uploading. Requires restarting backend and worker.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>From the project root run:</p>
                <pre className="bg-muted p-3 rounded overflow-x-auto">
                  ./add-volume &lt;name&gt; [path]
                </pre>
                <p className="text-muted-foreground">
                  <strong>name</strong>: e.g. <code>myrepo</code> (mounts at /mnt/scan-volumes/myrepo).<br />
                  <strong>path</strong>: host directory (default: current directory <code>.</code>).
                </p>
                <p>Example:</p>
                <pre className="bg-muted p-3 rounded overflow-x-auto">
                  ./add-volume myrepo /home/you/projects/my-app
                </pre>
                <p>Containers will restart. Then in the UI choose &quot;Volume folder&quot; and select the volume.</p>
                <p>
                  List volumes: <code className="bg-muted px-1 rounded">./list-volumes</code><br />
                  Remove: <code className="bg-muted px-1 rounded">./remove-volume &lt;name&gt;</code>
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Scans</CardTitle>
          <CardDescription>View and manage all your security scans</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search scans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredScans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No scans match your search' : 'No scans yet. Create your first scan!'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium">{scan.name}</TableCell>
                    <TableCell className="text-muted-foreground">{scan.target}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(scan.status)}>{scan.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(scan.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(scan)}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeleteScan(scan.id, e)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Scan Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedScan?.name}</DialogTitle>
            <DialogDescription>Target: {selectedScan?.target}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="font-medium">Status:</span>
              <Badge variant={statusVariant(selectedScan?.status || '')}>
                {selectedScan?.status}
              </Badge>
            </div>

            {selectedScan?.startedAt && (
              <div>
                <span className="font-medium">Started:</span> {formatDate(selectedScan.startedAt)}
              </div>
            )}

            {selectedScan?.completedAt && (
              <div>
                <span className="font-medium">Completed:</span>{' '}
                {formatDate(selectedScan.completedAt)}
              </div>
            )}

            {resultsLoading ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : scanResults ? (
              <div className="space-y-4">
                <h3 className="font-medium">Results Summary</h3>
                <div className="grid grid-cols-6 gap-2">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold">{scanResults.summary.total}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </CardContent>
                  </Card>
                  <Card className="border-destructive">
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-destructive">
                        {scanResults.summary.critical}
                      </div>
                      <div className="text-xs text-muted-foreground">Critical</div>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-500">
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-orange-500">
                        {scanResults.summary.high}
                      </div>
                      <div className="text-xs text-muted-foreground">High</div>
                    </CardContent>
                  </Card>
                  <Card className="border-yellow-500">
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-yellow-500">
                        {scanResults.summary.medium}
                      </div>
                      <div className="text-xs text-muted-foreground">Medium</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold">{scanResults.summary.low}</div>
                      <div className="text-xs text-muted-foreground">Low</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold">{scanResults.summary.info}</div>
                      <div className="text-xs text-muted-foreground">Info</div>
                    </CardContent>
                  </Card>
                </div>

                {scanResults.vulnerabilities.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Vulnerabilities</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {scanResults.vulnerabilities.map((vuln) => (
                        <Card key={vuln.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{vuln.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {vuln.description}
                              </div>
                            </div>
                            <Badge variant={statusVariant(vuln.severity)}>{vuln.severity}</Badge>
                          </div>
                          {vuln.cve && (
                            <div className="text-sm mt-1">
                              <span className="font-medium">CVE:</span> {vuln.cve}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : selectedScan?.status === 'running' ? (
              <div className="text-center py-4 text-muted-foreground">Scan is still running...</div>
            ) : selectedScan?.status === 'completed' && !scanResults ? (
              <div className="text-center py-4 text-muted-foreground">No vulnerabilities found</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
