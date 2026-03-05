import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, FileJson } from 'lucide-react';
import { getScans, getScanResults } from '@/lib/api';
import { jsPDF } from 'jspdf';
import type { Scan, ScanResult } from '@security-analyzer/types';

export default function ReportsPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [resultsMap, setResultsMap] = useState<Map<string, ScanResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getScans({ limit: 100 });
        const completedScans = response.data.filter((s) => s.status === 'completed');
        setScans(completedScans);

        const resultsPromises = completedScans.map(async (scan) => {
          try {
            const results = await getScanResults(scan.id);
            return { scanId: scan.id, results };
          } catch {
            return null;
          }
        });
        const results = await Promise.all(resultsPromises);
        const newResultsMap = new Map<string, ScanResult>();
        results.forEach((r) => {
          if (r) newResultsMap.set(r.scanId, r.results);
        });
        setResultsMap(newResultsMap);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch reports:', err);
        setError('Failed to load reports');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const downloadJsonReport = (scan: Scan, results: ScanResult) => {
    const reportData = {
      scan: {
        id: scan.id,
        name: scan.name,
        target: scan.target,
        createdAt: scan.createdAt,
        completedAt: scan.completedAt,
      },
      results,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-report-${scan.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdfReport = (scan: Scan, results: ScanResult) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    doc.setFontSize(20);
    doc.text('Security Scan Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(14);
    doc.text('Scan Details', 20, yPos);
    yPos += 8;

    doc.setFontSize(11);
    doc.text(`Name: ${scan.name}`, 20, yPos);
    yPos += 6;
    doc.text(`Target: ${scan.target}`, 20, yPos);
    yPos += 6;
    doc.text(`Created: ${new Date(scan.createdAt).toLocaleString()}`, 20, yPos);
    yPos += 6;
    if (scan.completedAt) {
      doc.text(`Completed: ${new Date(scan.completedAt).toLocaleString()}`, 20, yPos);
      yPos += 6;
    }
    yPos += 10;

    doc.setFontSize(14);
    doc.text('Vulnerability Summary', 20, yPos);
    yPos += 8;

    doc.setFontSize(11);
    const summary = results.summary;
    doc.text(`Total: ${summary.total}`, 20, yPos);
    yPos += 6;
    doc.setTextColor(220, 53, 69);
    doc.text(`Critical: ${summary.critical}`, 20, yPos);
    yPos += 6;
    doc.setTextColor(255, 165, 0);
    doc.text(`High: ${summary.high}`, 20, yPos);
    yPos += 6;
    doc.setTextColor(255, 193, 7);
    doc.text(`Medium: ${summary.medium}`, 20, yPos);
    yPos += 6;
    doc.setTextColor(23, 201, 100);
    doc.text(`Low: ${summary.low}`, 20, yPos);
    yPos += 6;
    doc.setTextColor(108, 117, 125);
    doc.text(`Info: ${summary.info}`, 20, yPos);
    yPos += 15;
    doc.setTextColor(0, 0, 0);

    if (results.vulnerabilities.length > 0) {
      doc.setFontSize(14);
      doc.text('Vulnerabilities', 20, yPos);
      yPos += 8;

      doc.setFontSize(10);
      results.vulnerabilities.slice(0, 30).forEach((vuln) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }

        const severityColors: Record<string, [number, number, number]> = {
          critical: [220, 53, 69],
          high: [255, 165, 0],
          medium: [255, 193, 7],
          low: [23, 201, 100],
          info: [108, 117, 125],
        };
        const color = severityColors[vuln.severity] || [108, 117, 125];
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(`[${vuln.severity.toUpperCase()}] ${vuln.name}`, 20, yPos);
        yPos += 5;

        doc.setTextColor(108, 117, 125);
        const desc = vuln.description.substring(0, 80);
        doc.text(desc, 25, yPos);
        yPos += 5;

        if (vuln.cve) {
          doc.text(`CVE: ${vuln.cve}`, 25, yPos);
          yPos += 5;
        }
        yPos += 3;
      });
    }

    doc.setFontSize(8);
    doc.setTextColor(108, 117, 125);
    doc.text(
      `Generated by Security Analyzer on ${new Date().toLocaleString()}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );

    doc.save(`scan-report-${scan.id}.pdf`);
  };

  const getReportSize = (results: ScanResult): string => {
    const size = JSON.stringify(results).length;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading reports...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalReports = scans.length;
  const completedReports = scans.filter((s) => resultsMap.has(s.id)).length;

  const storageUsed =
    resultsMap.size > 0
      ? `${(JSON.stringify(Array.from(resultsMap.values())).length / (1024 * 1024)).toFixed(1)} MB`
      : '0 MB';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">View and download security scan reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <FileText className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReports}</div>
            <p className="text-xs text-muted-foreground">Completed scans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedReports}</div>
            <p className="text-xs text-muted-foreground">Ready to download</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{storageUsed}</div>
            <p className="text-xs text-muted-foreground">Across all reports</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan Reports</CardTitle>
          <CardDescription>Download detailed security scan results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {scans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No completed scans yet. Run a scan to generate reports.
              </div>
            ) : (
              scans.map((scan) => {
                const results = resultsMap.get(scan.id);
                const size = results ? getReportSize(results) : 'N/A';
                return (
                  <div
                    key={scan.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{scan.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{new Date(scan.createdAt).toLocaleDateString()}</span>
                          <Badge variant="outline">{scan.scanMode || 'url'}</Badge>
                          {results && (
                            <span className="text-xs">{results.summary.total} vulnerabilities</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Size: {size}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!results}
                        onClick={() => results && downloadPdfReport(scan, results)}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!results}
                        onClick={() => results && downloadJsonReport(scan, results)}
                      >
                        <FileJson className="h-4 w-4 mr-2" />
                        JSON
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
