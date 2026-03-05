import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { getScans, getScanResults } from '@/lib/api';
import type { Scan } from '@security-analyzer/types';

export default function DashboardPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [criticalCount, setCriticalCount] = useState<number | null>(null);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getScans({ limit: 100 });
        setScans(response.data);
            // Compute critical count from completed scans
            const completedScans = response.data.filter((s) => s.status === 'completed');
            if (completedScans.length > 0) {
              try {
                const resultsPromises = completedScans.map(scan => getScanResults(scan.id));
                const results = await Promise.all(resultsPromises);
                const totalCritical = results.reduce((sum, r) => sum + (r.summary?.critical || 0), 0);
                setCriticalCount(totalCritical);
              } catch (e) {
                console.error('Failed to fetch critical counts', e);
                setCriticalCount(0);
              }
            } else {
              setCriticalCount(0);
            }
            setError(null);
      } catch (err) {
        console.error('Failed to fetch scans:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalScans = scans.length;
  const pendingScans = scans.filter((s) => s.status === 'pending' || s.status === 'running');
  const completedScans = scans.filter((s) => s.status === 'completed');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading dashboard...</p>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your security scans and findings</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Scans</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalScans}</div>
            <p className="text-xs text-muted-foreground">Total scans created</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingScans.length}</div>
            <p className="text-xs text-muted-foreground">In progress or queued</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedScans.length}</div>
            <p className="text-xs text-muted-foreground">Finished scans</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{criticalCount !== null ? criticalCount : '--'}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
            <CardDescription>Your latest security scans</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {scans.slice(0, 5).map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{scan.name}</p>
                    <p className="text-sm text-muted-foreground">{scan.target}</p>
                  </div>
                  <Badge
                    variant={
                      scan.status === 'completed'
                        ? 'default'
                        : scan.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {scan.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Score</CardTitle>
            <CardDescription>Overall security posture</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="relative h-32 w-32">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold">--</span>
                </div>
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset="251.2"
                    strokeLinecap="round"
                    className="text-green-500"
                  />
                </svg>
              </div>
            </div>
            <p className="text-center mt-4 text-muted-foreground">
              Score available after scans complete
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
