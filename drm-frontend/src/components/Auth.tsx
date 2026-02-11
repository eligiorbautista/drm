import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const navigate = useNavigate();
  const { login, register, isLoading, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [localError, setLocalError] = useState('');

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    // Basic validation
    if (!email || !password) {
      setLocalError('Please fill in all fields');
      return;
    }

    if (isRegistering && !name) {
      setLocalError('Name is required');
      return;
    }

    try {
      if (isRegistering) {
        await register({ email, name, password });
      } else {
        await login(email, password);
      }
      navigate('/viewer');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
  <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#141414]">
    <div className="w-full max-w-md sm:max-w-sm lg:max-w-lg">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">DRM Media Platform</h1>
        <p className="text-sm sm:text-base text-[#a0a0a0]">Secure DRM-Protected Streaming</p>
      </div>

      <div className="bg-[#1e1e1e] rounded-xl sm:rounded-2xl p-5 sm:p-6 lg:p-8 border border-[#333333]">
        {(localError || authError) && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-400">{localError || authError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#a0a0a0] mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 sm:py-3.5 bg-[#1e1e1e] border border-[#404040] rounded-lg text-white placeholder-[#666666] focus:ring-2 focus:ring-white focus:border-transparent outline-none transition-all text-sm sm:text-base"
              required
              autoComplete="email"
            />
          </div>

          {isRegistering && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#a0a0a0] mb-2">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3 sm:py-3.5 bg-[#1e1e1e] border border-[#404040] rounded-lg text-white placeholder-[#666666] focus:ring-2 focus:ring-white focus:border-transparent outline-none transition-all text-sm sm:text-base"
                required
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#a0a0a0] mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegistering ? 'Min. 8 characters' : '••••••••'}
                className="w-full px-4 py-3 sm:py-3.5 pr-12 bg-[#1e1e1e] border border-[#404040] rounded-lg text-white placeholder-[#666666] focus:ring-2 focus:ring-white focus:border-transparent outline-none transition-all text-sm sm:text-base"
                required
                minLength={8}
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
              />
              {password && (
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666] hover:text-white cursor-pointer p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 sm:py-3.5 bg-white text-[#141414] font-semibold rounded-lg hover:bg-[#d0d0d0] transition-colors shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] touch-manipulation"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="hidden xs:inline">
                  {isRegistering ? 'Creating account...' : 'Signing in...'}
                </span>
                <span className="xs:hidden">Loading...</span>
              </span>
            ) : (
              isRegistering ? 'Create Account' : 'Sign In'
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setLocalError('');
                clearError();
              }}
              className="text-sm text-[#a0a0a0] hover:text-white transition-colors cursor-pointer"
            >
              {isRegistering ? (
                <>
                  Already have an account?{' '}
                  <span className="text-white font-medium">Sign in</span>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <span className="text-white font-medium">Create one</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <footer className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-white">
        <p>© 2026 DRM Media Platform. All rights reserved.</p>
      </footer>
    </div>
  </div>
);
}
