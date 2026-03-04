import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your security analyzer preferences</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Basic configuration for the application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Organization Name</label>
              <Input placeholder="My Organization" defaultValue="Security Analyzer" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">API Endpoint</label>
              <Input placeholder="https://api.example.com" defaultValue="http://localhost:8000" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure how you receive alerts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive alerts via email</p>
              </div>
              <Badge>Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Slack Integration</p>
                <p className="text-sm text-muted-foreground">Send alerts to Slack channel</p>
              </div>
              <Badge variant="outline">Disabled</Badge>
            </div>
            <Button variant="outline">Configure Notifications</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan Defaults</CardTitle>
            <CardDescription>Default settings for new scans</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Default Scan Types</label>
              <div className="flex gap-2 flex-wrap">
                <Badge>API Security</Badge>
                <Badge>Dependency Audit</Badge>
                <Badge>Secret Detection</Badge>
                <Badge variant="outline">+ Add</Badge>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Auto-scan Schedule</label>
              <Input placeholder="0 0 * * *" defaultValue="0 0 * * 0" />
              <p className="text-xs text-muted-foreground">Cron expression (default: weekly)</p>
            </div>
            <Button>Save Defaults</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your account settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email</p>
                <p className="text-sm text-muted-foreground">admin@example.com</p>
              </div>
              <Button variant="outline" size="sm">Change</Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">Last changed 30 days ago</p>
              </div>
              <Button variant="outline" size="sm">Update</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
