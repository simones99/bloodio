import { useCallback } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { Disclaimer } from './app/Disclaimer';
import { Layout } from './app/Layout';
import { useServices } from './app/services';
import { useQuery } from './app/use-query';
import { ImportSessionProvider } from './import/import-session';
import { AnalyteRoute } from './pages/AnalytePage';
import { ComparePage } from './pages/ComparePage';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ValuesPage } from './pages/ValuesPage';
import { VerifyPage } from './pages/VerifyPage';

export function App() {
  const { settings, storage } = useServices();
  const accepted = useQuery(
    useCallback(() => settings.get('disclaimerAcceptedAt'), [settings]),
    settings.subscribe,
  );

  if (accepted.status !== 'ready') return null;
  if (accepted.data === null) {
    return (
      <Disclaimer
        onAccept={() => {
          // Inside the tap: browsers that show a prompt (Firefox) need the user gesture.
          void storage.requestPersist();
          void settings.set('disclaimerAcceptedAt', new Date().toISOString());
        }}
      />
    );
  }

  return (
    <HashRouter>
      <ImportSessionProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:id" element={<ReportDetailPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="analytes" element={<ValuesPage />} />
            <Route path="analytes/:ref" element={<AnalyteRoute />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="import/verify" element={<VerifyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ImportSessionProvider>
    </HashRouter>
  );
}
