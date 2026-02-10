/**
 * Auth Context
 *
 * React context for managing user authentication state across the application.
 * Provides:
 * - User authentication state
 * - Login/logout/register functions
 * - Token management
 * - Auto-refresh functionality
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';

// Define User type inline to avoid import issues
interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: string;
  message?: string;
}

interface AuthContextType {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  updateProfile: (data: {
    username?: string;
  }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token refresh interval (5 minutes before expiry)
const REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000;
// Check interval
const CHECK_INTERVAL = 30 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshTimeRef = useRef<number>(0);
  const userRef = useRef<User | null>(null);

  // Clear any stored error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check if token is expired
  const isTokenExpired = useCallback((expiresAt: string): boolean => {
    const expiry = new Date(expiresAt).getTime();
    return Date.now() >= expiry;
  }, []);

  // Schedule token refresh
  const scheduleRefresh = useCallback(async (expiresAt: string) => {
    // Don't schedule if userRef is null (logged out)
    if (!userRef.current) {
      console.log('[Auth] Skipping schedule - userRef is null');
      return;
    }

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    const expiry = new Date(expiresAt).getTime();
    const timeUntilExpiry = expiry - Date.now();

    // Prevent rapid refresh loops - if refresh happened less than 30 seconds ago, skip
    const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
    if (timeSinceLastRefresh < 30000) {
      console.log('[Auth] Skipping schedule - too soon since last refresh');
      return;
    }

    console.log('[Auth] Scheduling refresh - expires in', Math.round(timeUntilExpiry / 1000), 'seconds');

    // If token expires in more than 5 minutes, schedule refresh for 5 minutes before expiry
    if (timeUntilExpiry > REFRESH_BEFORE_EXPIRY) {
      refreshTimeoutRef.current = setTimeout(async () => {
        // Check userRef again before refreshing
        if (userRef.current) {
          await refreshSession();
        }
      }, timeUntilExpiry - REFRESH_BEFORE_EXPIRY);
    } else if (timeUntilExpiry > 60000) {
      // Token expires within 5 minutes but more than 1 minute away
      refreshTimeoutRef.current = setTimeout(async () => {
        if (userRef.current) {
          await refreshSession();
        }
      }, timeUntilExpiry - 60000);
    } else if (timeUntilExpiry > 0) {
      // Token expires in less than 1 minute - refresh now
      console.log('[Auth] Token expires very soon, refreshing now');
      if (userRef.current) {
        await refreshSession();
      }
    } else {
      // Token is expired, refresh immediately
      console.log('[Auth] Token expired, triggering immediate refresh');
      if (userRef.current) {
        await refreshSession();
      }
    }
  }, []);

  // Initialize auth state from storage - session-based auth
  const initializeAuth = useCallback(async () => {
    try {
      const token = await api.getStoredToken();
      const refreshToken = await api.getStoredRefreshToken();

      console.log('[Auth] Init - token exists:', !!token, 'refreshToken exists:', !!refreshToken);
      console.log('[Auth] Token (first 10 chars):', token?.substring(0, 10));

      if (!token || !refreshToken) {
        console.log('[Auth] No tokens found, staying logged out');
        setIsLoading(false);
        return;
      }

      // Validate session against database (session-based auth)
      try {
        console.log('[Auth] Validating session against database...');
        const sessionResponse = await api.validateSession();
        console.log('[Auth] Session valid, user:', sessionResponse.user.username);

        // Session is valid - set user and refresh token if needed
        userRef.current = sessionResponse.user;
        setUser(sessionResponse.user);

        // Check if session expires soon and refresh proactively
        const sessionExpiresAt = new Date(sessionResponse.session.expiresAt);
        const timeUntilExpiry = sessionExpiresAt.getTime() - Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (timeUntilExpiry < fiveMinutes) {
          // Session expires soon - refresh now
          console.log('[Auth] Session expires soon, refreshing...');
          const refreshResponse = await api.refreshToken(refreshToken);
          await api.setTokens(refreshResponse.token, refreshResponse.refreshToken);
          scheduleRefresh(refreshResponse.expiresAt);
        } else {
          // Schedule refresh for 5 minutes before expiry
          scheduleRefresh(sessionResponse.session.expiresAt);
        }
      } catch (sessionErr) {
        // Session is invalid or expired - need to login again
        console.log('[Auth] Session invalid/expired:', sessionErr);
        console.log('[Auth] Token in storage:', token);
        console.log('[Auth] Refresh token in storage:', !!refreshToken);
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }
        await api.clearTokens();
        userRef.current = null;
        setUser(null);
      }
    } catch (err) {
      console.error('[Auth] Failed to initialize auth:', err);
      await api.clearTokens();
      userRef.current = null;
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [scheduleRefresh]);

  // Refresh session token
  const refreshSession = useCallback(async () => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      console.log('[Auth] Refresh already in progress, skipping');
      return;
    }

    // Don't refresh if user is null
    if (!user) {
      console.log('[Auth] User is null, skipping refresh');
      return;
    }

    isRefreshingRef.current = true;
    lastRefreshTimeRef.current = Date.now();

    try {
      const refreshToken = await api.getStoredRefreshToken();
      if (!refreshToken) {
        console.log('[Auth] No refresh token in storage');
        throw new Error('No refresh token');
      }

      console.log('[Auth] Calling refresh API...');
      const response = await api.refreshToken(refreshToken);
      console.log('[Auth] Refresh response received, user:', response.user.username);
      await api.setTokens(response.token, response.refreshToken);
      userRef.current = response.user;
      setUser(response.user);
      scheduleRefresh(response.expiresAt);
    } catch (err) {
      console.error('[Auth] Failed to refresh session:', err);
      // Clear any scheduled refreshes to prevent loop
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      // Clear tokens and user - this will trigger the logout
      await api.clearTokens();
      userRef.current = null;
      setUser(null);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [user, scheduleRefresh]);

  // Periodic check for authentication state
  useEffect(() => {
    checkIntervalRef.current = setInterval(async () => {
      if (user) {
        const refreshToken = await api.getStoredRefreshToken();
        if (!refreshToken) {
          console.log('[Auth] Periodic check: no refresh token found, clearing auth');
          await api.clearTokens();
          userRef.current = null;
          setUser(null);
        }
      }
    }, CHECK_INTERVAL);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user]);

  // Initialize on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Login
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.login({ email, password });
      await api.setTokens(response.token, response.refreshToken);
      userRef.current = response.user;
      setUser(response.user);
      scheduleRefresh(response.expiresAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [scheduleRefresh]);

  // Register
  const register = useCallback(async (data: {
    email: string;
    username: string;
    password: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      await api.register(data);
      // Auto-login after registration
      await login(data.email, data.password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  // Logout
  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors on server
    } finally {
      await api.clearTokens();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      userRef.current = null;
      setUser(null);
      setError(null);
    }
  }, []);

  // Update profile
  const updateProfile = useCallback(async (data: {
    username?: string;
  }) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await api.updateProfile(data);
      userRef.current = response.user;
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      throw new Error(message);
    }
  }, [user]);

  // Change password
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    try {
      await api.changePassword({ currentPassword, newPassword });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password change failed';
      throw new Error(message);
    }
  }, [user]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    refreshSession,
    clearError,
    updateProfile,
    changePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;