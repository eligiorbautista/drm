import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { AuthPage } from './components/Auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ViewerPage } from './pages/ViewerPage'
import { BroadcasterPage } from './pages/BroadcasterPage'
import { SettingsPage } from './pages/SettingsPage'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import './App.css'

// User Menu Component
function UserMenu({
  isOpen,
  onToggle,
  onClose,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    onClose();
    navigate('/', { replace: true });
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg text-[#a0a0a0] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer min-h-[44px]"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 bg-[#252525] rounded-full flex items-center justify-center border border-[#404040]">
          {user ? (
            <span className="text-sm font-medium text-white">
              {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </span>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
        <span className="hidden lg:block text-sm">
          {user?.name || 'User'}
        </span>
        <svg className={`hidden lg:block w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* User dropdown menu */}
      {isOpen && (
        <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-[#1e1e1e] border border-[#333333] rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          {user && (
            <div className="px-4 py-3 border-b border-[#333333]">
              <p className="text-sm font-medium text-white truncate">
                {user.name || 'User'}
              </p>
              <p className="text-xs text-[#666666] truncate">
                {user.email}
              </p>
            </div>
          )}
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-sm text-[#a0a0a0] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#a0a0a0] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </>
  );
}

// Import hooks for mobile menu and global settings
import { useState, useEffect, useCallback, useRef } from 'react';
import { createContext, useContext } from 'react';
import apiClient from './lib/api';

// Global encryption context
interface EncryptionContextType {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const EncryptionContext = createContext<EncryptionContextType | undefined>(undefined);

export function useEncryption() {
  const context = useContext(EncryptionContext);
  if (!context) {
    throw new Error('useEncryption must be used within an EncryptionProvider');
  }
  return context;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const navItems: NavItem[] = [
  {
    path: '/viewer',
    label: 'Viewer',
    description: 'Watch DRM-protected streams',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    path: '/broadcaster',
    label: 'Broadcaster',
    description: 'Start your live broadcast',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )
  }
];

function AppNavigation() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleUserMenu = useCallback(() => {
    setIsUserMenuOpen(prev => !prev);
  }, []);

  const closeUserMenu = useCallback(() => {
    setIsUserMenuOpen(false);
  }, []);

  // Handle click outside to close user menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        closeUserMenu();
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen, closeUserMenu]);

  return (
    <header className="sticky top-0 z-50 bg-[#1e1e1e]/95 backdrop-blur-sm border-b border-[#333333]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Left side: Mobile menu toggle + Logo & Brand */}
          <div className="flex items-center gap-2">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMenuOpen(prev => !prev)}
              className="md:hidden p-2 rounded-lg text-[#a0a0a0] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Toggle navigation"
              aria-expanded={isMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Logo & Brand */}
            <Link to="/viewer" className="flex items-center gap-3 group">
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-white group-hover:text-white transition-colors">DRM Media Platform</h1>
                <p className="text-xs text-[#888888]">Security beyond delivery</p>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Bar */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'text-white'
                      : 'text-[#a0a0a0] hover:text-white'
                  }`}
                >
                  <span className={`transition-transform duration-200 ${isActive ? 'scale-105' : ''}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {/* Active indicator - underline effect */}
                  {isActive && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-white rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-0.5 sm:gap-3">
            {/* User menu trigger */}
            <div className="relative" ref={userMenuRef}>
              <UserMenu
                isOpen={isUserMenuOpen}
                onToggle={toggleUserMenu}
                onClose={closeUserMenu}
              />
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 pb-2 border-t border-[#333333] pt-4 animate-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'text-white bg-[#252525]/50'
                        : 'text-[#a0a0a0] hover:text-white'
                    }`}
                  >
                    <span className={`transition-transform duration-200 ${isActive ? 'scale-105' : ''}`}>
                      {item.icon}
                    </span>
                    <div className="flex flex-col items-start flex-1">
                      <span>{item.label}</span>
                      <span className="text-xs text-[#666666]">{item.description}</span>
                    </div>
                    {/* Active indicator - line */}
                    {isActive && (
                      <div className="w-0.5 h-6 bg-white" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEncryptionSetting = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[EncryptionProvider] Fetching encryption setting from API...');
      const response = await apiClient.getEncryptionSetting();
      console.log('[EncryptionProvider] API response:', response);
      setEnabled(response.enabled);
      console.log('[EncryptionProvider] Encryption enabled set to:', response.enabled);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch encryption setting';
      setError(errorMessage);
      console.error('[EncryptionProvider] Error fetching encryption setting:', errorMessage);
      // Default to false (disabled) on error to prevent unwanted DRM attempts
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[EncryptionProvider] Component mounted, fetching initial setting...');
    fetchEncryptionSetting();
  }, [fetchEncryptionSetting]);

  const contextValue: EncryptionContextType = {
    enabled,
    loading,
    error,
    refetch: fetchEncryptionSetting,
  };

  return (
    <EncryptionContext.Provider value={contextValue}>
      {children}
    </EncryptionContext.Provider>
  );
}

export default function App() {
  const location = useLocation();

  // Check if URL has fullscreen=true parameter (for iframe embedding)
  const searchParams = new URLSearchParams(location.search);
  const isFullscreenParam = searchParams.get('fullscreen') === 'true';
  const isEmbedRoute = location.pathname === '/embed';

  // Check if we're on the auth/login page
  const isAuthPage = location.pathname === '/';

  // Embed mode shows fullscreen viewer without auth, with proper overlays
  if (isEmbedRoute || isFullscreenParam) {
    return (
      <AuthProvider>
        <EncryptionProvider>
          <div className="min-h-screen bg-black m-0 p-0">
            <ViewerPage isEmbedMode={true} />
          </div>
        </EncryptionProvider>
      </AuthProvider>
    );
  }

  return isAuthPage ? (
    <AuthProvider>
      <AuthPage />
    </AuthProvider>
  ) : (
    <AuthProvider>
      <EncryptionProvider>
        <div className="min-h-screen flex flex-col bg-[#141414]">
          <AppNavigation />

          {/* Main Content */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            <div className="max-w-6xl lg:max-w-7xl mx-auto">
              <Routes>
                <Route
                  path="/"
                  element={
                    <ProtectedRoute requireAuth={false}>
                      <ViewerPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/embed"
                  element={
                    <ProtectedRoute requireAuth={false}>
                      <ViewerPage isEmbedMode={true} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/viewer"
                  element={
                    <ProtectedRoute>
                      <ViewerPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/broadcaster"
                  element={
                    <ProtectedRoute>
                      <BroadcasterPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </div>
          </main>

          {/* Footer */}
          <footer className="bg-[#1e1e1e] border-t border-[#333333] px-4 sm:px-6 py-4 sm:py-6">
            <div className="max-w-7xl mx-auto">
              {/* Mobile: Stacked, Desktop: Row */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-center sm:text-left">
                  <p className="text-xs sm:text-sm text-[#666666]">
                    DRM Media Platform v1.0
                  </p>
                  <p className="text-sm text-[#888888] hidden sm:block">
                    •
                  </p>
                  <p className="text-xs sm:text-sm text-[#888888]">
                    Secure DRM-Protected Streaming
                  </p>
                </div>
                <p className="text-xs text-[#555555]">
                  © 2026 DRM Media Platform. All rights reserved.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </EncryptionProvider>
    </AuthProvider>
  );
}
