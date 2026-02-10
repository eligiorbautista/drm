/**
 * Protected Route Component
 *
 * A wrapper component that redirects unauthenticated users to the login page.
 * Optionally shows a loading state while authentication is being checked.
 */
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function ProtectedRoute({
  children,
  requireAuth = true,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

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

  // Redirect to login if authentication is required but not present
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Redirect to viewer if auth is not required but user is authenticated (e.g., login page)
  if (!requireAuth && isAuthenticated) {
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