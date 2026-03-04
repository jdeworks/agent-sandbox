import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import DashboardPage from '@/pages/DashboardPage';
import ScansPage from '@/pages/ScansPage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/scans" element={<ScansPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
