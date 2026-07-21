import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import LobbyPage from './components/LobbyPage';
import GamePage from './components/GamePage';

function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem('token'));
}

function RequireAuth({ children }: { children: React.ReactNode }): React.ReactElement {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <LobbyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/game/:id"
          element={
            <RequireAuth>
              <GamePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
