/**
 * Protected Route Component
 *
 * A wrapper component that redirects unauthenticated users to the login page.
 * Optionally shows a loading state while authentication is being checked.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowRedirect?: boolean;  // If false, don't redirect authenticated users away from this route
}

export function ProtectedRoute({
  children,
  requireAuth = true,
  allowRedirect = true,  // Default to allowing redirect for backwards compatibility
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Check if URL has fullscreen=true parameter (for iframe embedding)
  const searchParams = new URLSearchParams(location.search);
  const isFullscreenParam = searchParams.get('fullscreen') === 'true';

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141414]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4"></div>
          <p className="text-[#a0a0a0]">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Bypass auth check if fullscreen=true parameter is present (for iframe embedding)
  if (isFullscreenParam) {
    return <>{children}</>;
  }

  // Redirect to login if authentication is required but not present
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Redirect to viewer if auth is not required but user is authenticated (e.g., login page)
  // Only do this if allowRedirect is true (default behavior for login page)
  if (!requireAuth && isAuthenticated && allowRedirect) {
    return <Navigate to="/viewer" replace />;
  }

  return <>{children}</>;
}

// ============================================================================
// Auth Guard Hook
// ============================================================================

/**
 * Hook for checking if user has required role
 */
export function useHasRole(...roles: string[]) {
  const { user } = useAuth();

  if (!user) {
    return false;
  }

  return roles.includes(user.role);
}

/**
 * Hook for getting current user
 */
export function useCurrentUser() {
  const { user, isAuthenticated } = useAuth();
  return { user, isAuthenticated };
}