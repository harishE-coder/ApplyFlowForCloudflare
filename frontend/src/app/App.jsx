import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { BrandedLoader } from '@/components/ui/BrandedLoader';

// Dynamic Route Code-Splitting (Lazy-loaded Pages)
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ResumesPage = lazy(() => import('@/features/resumes/ResumesPage').then((m) => ({ default: m.ResumesPage })));
const UploadPage = lazy(() => import('@/features/resumes/UploadPage').then((m) => ({ default: m.UploadPage })));
const AIResponseInboxPage = lazy(() => import('@/features/applications/AIResponseInboxPage').then((m) => ({ default: m.AIResponseInboxPage })));
const RequirementsPage = lazy(() => import('@/features/requirements/RequirementsPage').then((m) => ({ default: m.RequirementsPage })));
const ClientsPage = lazy(() => import('@/features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const RecruitersPage = lazy(() => import('@/features/dashboard/RecruitersPage').then((m) => ({ default: m.RecruitersPage })));
const SubAdminsPage = lazy(() => import('@/features/subadmins/SubAdminsPage').then((m) => ({ default: m.SubAdminsPage })));
const TargetsPage = lazy(() => import('@/features/dashboard/TargetsPage').then((m) => ({ default: m.TargetsPage })));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ChatPage = lazy(() => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const PerformanceDashboardPage = lazy(() => import('@/features/admin/PerformanceDashboardPage').then((m) => ({ default: m.PerformanceDashboardPage })));

function PageSuspenseFallback() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <BrandedLoader />
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F6F8FB]">
        <div className="w-12 h-12 rounded-2xl bg-[#081226] flex items-center justify-center shadow-xl animate-pulse">
          <div className="w-6 h-6 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="mt-4 text-small font-semibold text-[#081226]">Loading ApplyFlow ATS...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedRoles) && typeof user?.role === 'string' && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<PageSuspenseFallback />}>
              <Routes>
                {/* Public Login Route */}
                <Route
                  path="/login"
                  element={
                    <PublicRoute>
                      <LoginPage />
                    </PublicRoute>
                  }
                />

                {/* Protected ATS Workspace Routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route
                    path="upload"
                    element={
                      <ProtectedRoute allowedRoles={['employee']}>
                        <UploadPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="candidates" element={<ResumesPage />} />
                  <Route path="applications" element={<AIResponseInboxPage />} />
                  <Route path="ai-inbox" element={<AIResponseInboxPage />} />
                  <Route path="chats" element={<ChatPage />} />
                  <Route path="chats/:roomId" element={<ChatPage />} />
                  <Route path="chat/:roomId" element={<ChatPage />} />
                  <Route path="chat" element={<Navigate to="/chats" replace />} />
                  <Route path="requirements" element={<RequirementsPage />} />
                  <Route path="clients" element={<ClientsPage />} />
                  <Route
                    path="sub-admins"
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <SubAdminsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="recruiters"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'sub_admin']}>
                        <RecruitersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="targets" element={<TargetsPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route
                    path="admin/performance"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'sub_admin']}>
                        <PerformanceDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="interview-intelligence" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
