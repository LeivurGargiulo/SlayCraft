import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { RequireAuth } from './auth/RequireAuth.js';
import { SocketProvider } from './lib/SocketContext.js';
import { AppLayout } from './components/AppLayout.js';
import { AlertToasts } from './components/AlertToasts.js';
import { LoginPage } from './pages/LoginPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { FarmPage } from './pages/FarmPage.js';
import { AlertsPage } from './pages/AlertsPage.js';
import { WorkersPage } from './pages/WorkersPage.js';
import { ManagerPage } from './pages/ManagerPage.js';

export function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AlertToasts />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="farm/:id" element={<FarmPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="workers" element={<WorkersPage />} />
              <Route path="manager" element={<ManagerPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
