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
import { Plus, Search, Eye, Trash2, RefreshCw } from 'lucide-react';
import { getScans, createScan, deleteScan, getScanResults, uploadFolder, getScanners } from '@/lib/api';
import type { Scan, ScanResult, CreateScanInput, ScannerMetadata } from '@security-analyzer/types';

// Polling interval for scan progress (in ms)
const POLL_INTERVAL = 3000;

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

  // Initial fetch and polling for running scans
  useEffect(() => {
    fetchScans();

    // Poll for updates when there are running scans
    const hasRunningScans = scans.some((s) => s.status === 'pending' || s.status === 'running');
    if (!hasRunningScans) return;

    const interval = setInterval(() => {
      fetchScans();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
    }, [fetchScans, scans]);

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
        // By default select all scanners
        setSelectedScanners(scanners.map(s => s.name));
      } catch (err) {
        console.error('Failed to fetch scanners:', err);
      }
    };
    fetchScannersList();
  }, []);

  const filteredScans = scans.filter(
    (scan) =>
      scan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scan.target.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateScan = async () => {
    if (!newScanName.trim() || !newScanTarget.trim()) return;

    setCreating(true);
    try {
      const scanData: CreateScanInput = {
        name: newScanName,
        target: newScanTarget,
        scanners: selectedScanners.map(name => ({ name, enabled: true })),
        scanMode: newScanTarget.startsWith('http') ? 'url' : 'local',
      };
      await createScan(scanData);
      setNewScanName('');
      setNewScanTarget('');
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
                  <Input
                    placeholder="Target (URL, repo, container, or local path)"
                    value={newScanTarget}
                    onChange={(e) => setNewScanTarget(e.target.value)}
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
                  <p className="text-xs text-muted-foreground">
                    Enter a URL (e.g., https://example.com) or upload a local folder.
                  </p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Select Scanners</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableScanners.map((scanner) => (
                    <label key={scanner.name} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedScanners.includes(scanner.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedScanners([...selectedScanners, scanner.name]);
                          } else {
                            setSelectedScanners(selectedScanners.filter((name) => name !== scanner.name));
                          }
                        }}
                      />
                      <span className="text-sm">{scanner.name}</span>
                    </label>
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
                  disabled={creating || !newScanName.trim() || !newScanTarget.trim()}
                >
                  {creating ? 'Creating...' : 'Start Scan'}
                </Button>
              </DialogFooter>
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
