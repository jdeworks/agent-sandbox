import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Shield,
  Settings,
  Menu,
  X,
  Scan,
  FileText,
  Sun,
  Moon,
  User,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Scans', href: '/scans', icon: Scan },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore();
  const location = useLocation();

  // Apply theme class to document
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r bg-card transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'max-md:-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center border-b px-6">
          <Shield className="h-6 w-6 text-primary mr-2" />
          <span className="text-lg font-semibold">Security Analyzer</span>
        </div>
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Header */}
      <header
        className={cn(
          'fixed top-0 right-0 z-40 h-16 border-b bg-card/95 backdrop-blur transition-all duration-200',
          sidebarOpen ? 'md:left-64' : 'left-0'
        )}
      >
        <div className="flex h-full items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="hidden md:flex">
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="shrink-0">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            {/* User Info Placeholder */}
            <div className="flex items-center gap-2 border-l pl-2 md:pl-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium">Admin User</span>
                <span className="text-xs text-muted-foreground">admin@example.com</span>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={cn('pt-16 transition-all duration-200', sidebarOpen ? 'md:pl-64' : 'pl-0')}>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
