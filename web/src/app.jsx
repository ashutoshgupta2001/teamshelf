import { Navigate, Route, Routes } from "react-router";
import {
  ForgotPage,
  InvitePage,
  LoginPage,
  ResetPage,
} from "./features/auth-pages.jsx";
import {
  BrowserPage,
  MembersPage,
  ProtectedRoute,
  SettingsPage,
  TrashPage,
  WorkspaceLayout,
  WorkspacesPage,
} from "./features/workspace-pages.jsx";
import { PublicSharePage } from "./features/public-page.jsx";
import { AdminPage } from "./features/admin-page.jsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/forgot-password" element={<ForgotPage />} />
      <Route path="/reset-password" element={<ResetPage />} />
      <Route path="/s/:token" element={<PublicSharePage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<BrowserPage />} />
          <Route path="folders/:itemId" element={<BrowserPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/workspaces" replace />} />
    </Routes>
  );
}
