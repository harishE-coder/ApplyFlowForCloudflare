import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/services/api';
import { initPushNotifications } from '@/services/pushNotifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [bootstrapData, setBootstrapData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoggingOutRef = useRef(false);

  const checkAuth = useCallback(async () => {
    // If the user has explicitly logged out, skip bootstrapping until a manual login occurs
    if (sessionStorage.getItem('applyflow_logged_out') === 'true') {
      setUser(null);
      setBootstrapData(null);
      setIsLoading(false);
      return null;
    }

    if (isLoggingOutRef.current) {
      setIsLoading(false);
      return null;
    }

    try {
      const response = await api.get('/auth/bootstrap', { cache: false });
      if (response.data && response.data.user) {
        setUser(response.data.user || null);
        setBootstrapData({
          dashboard: response.data.dashboard || null,
          notifications: response.data.notifications || null,
          chat_unread: response.data.chat_unread || null,
        });
        sessionStorage.removeItem('applyflow_logged_out');
        initPushNotifications();
        return response.data.user;
      }
      setUser(null);
      setBootstrapData(null);
      return null;
    } catch (err) {
      setUser(null);
      setBootstrapData(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email, password) => {
    sessionStorage.removeItem('applyflow_logged_out');
    const credentials = { email, password };
    const loginRes = await api.post('/auth/login', credentials);
    const loginUser = loginRes?.data?.user;

    if (loginRes?.data?.access_token) {
      localStorage.setItem('applyflow_access_token', loginRes.data.access_token);
    }
    if (loginRes?.data?.refresh_token) {
      localStorage.setItem('applyflow_refresh_token', loginRes.data.refresh_token);
    }

    // Immediately fetch the authenticated bootstrap payload after login.
    let bootData = null;
    try {
      const bootRes = await api.get('/auth/bootstrap', { cache: false });
      bootData = bootRes?.data;
    } catch (e) {
      console.warn('Bootstrap fetch after login encountered error, falling back to login user payload:', e);
    }

    const currentUser = bootData?.user || loginUser;
    if (currentUser) {
      setUser(currentUser);
      setBootstrapData({
        dashboard: bootData?.dashboard || null,
        notifications: bootData?.notifications || null,
        chat_unread: bootData?.chat_unread || null,
      });

      initPushNotifications();

      return currentUser;
    }

    throw new Error('Authentication succeeded but user payload is missing');
  }, []);

  const logout = useCallback(async () => {
    isLoggingOutRef.current = true;
    sessionStorage.setItem('applyflow_logged_out', 'true');
    localStorage.removeItem('applyflow_access_token');
    localStorage.removeItem('applyflow_refresh_token');

    // Immediately reset user state so UI updates without waiting
    setUser(null);
    setBootstrapData(null);
    api.invalidateCache();

    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout API response:', err?.response?.status || err?.message);
    }

    // Clear any accessible cookies across standard SameSite variants
    document.cookie = 'access_token=; Max-Age=0; path=/; SameSite=Lax';
    document.cookie = 'refresh_token=; Max-Age=0; path=/; SameSite=Lax';
    document.cookie = 'access_token=; Max-Age=0; path=/; SameSite=None; Secure';
    document.cookie = 'refresh_token=; Max-Age=0; path=/; SameSite=None; Secure';

    api.invalidateCache();
    window.location.replace('/login');
  }, []);

  const consumeBootstrapDashboard = useCallback(() => {
    if (!bootstrapData?.dashboard) return null;
    const dash = bootstrapData.dashboard;
    setBootstrapData((prev) => (prev ? { ...prev, dashboard: null } : null));
    return dash;
  }, [bootstrapData]);

  const value = useMemo(
    () => ({
      user,
      bootstrapData,
      consumeBootstrapDashboard,
      isLoading,
      login,
      logout,
      checkAuth,
      isAdmin: user?.role === 'admin',
      isSubAdmin: user?.role === 'sub_admin',
      isAnyAdmin: user?.role === 'admin' || user?.role === 'sub_admin',
      isEmployee: user?.role === 'employee',
      isClient: user?.role === 'client',
    }),
    [user, bootstrapData, consumeBootstrapDashboard, isLoading, login, logout, checkAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
