import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: 'Encryption',
    description: 'AES-128 DRM protection for media streams'
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Streaming',
    description: 'Ultra-low latency WebRTC broadcasting'
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Authentication',
    description: 'Role-based access with token refresh'
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Analytics',
    description: 'Monitoring for active broadcasts'
  }
];

export function AuthPage() {
  const navigate = useNavigate();
  const { login, isLoading, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

    try {
      await login(email, password);
      navigate('/viewer');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e]">
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left Section - Introduction and Features */}
        <div className="lg:w-1/2 p-5 sm:p-6 lg:p-10 flex flex-col justify-center items-center bg-gradient-to-br from-[#1e1e1e] to-[#252525]">
          <div className="w-full max-w-2xl">
            {/* Logo/Brand - Compact for mobile */}
            <div className="mb-4 lg:mb-10 text-center lg:text-left">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight">DRM Media Platform</h1>
              <p className="text-xs sm:text-sm text-[#a0a0a0] mt-1">Secure Streaming Solution</p>
            </div>

            {/* Description - Hidden on mobile, visible on lg */}
            <p className="hidden lg:block text-[#a0a0a0] text-base leading-relaxed mb-10">
              Enterprise-grade secure streaming with comprehensive DRM protection for your media content.
            </p>

            {/* Features Grid - Visible on all screens, compact on mobile */}
            <div className="grid gap-2 sm:gap-3 lg:gap-4 grid-cols-2 mb-6 lg:mb-10 w-full">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 sm:gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4 sm:p-5 bg-[#252525]/80 border border-[#333333] rounded-lg hover:bg-[#252525] hover:border-[#404040] transition-all duration-200 cursor-default"
                >
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-white rounded flex items-center justify-center">
                    <div className="text-black scale-75 sm:scale-90 lg:scale-100">
                      {feature.icon}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-xs sm:text-sm lg:text-base">{feature.title}</h3>
                    <p className="text-[#888] text-[10px] sm:text-xs lg:text-sm mt-0.5 lg:mt-1">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats/Trust Indicators - Simplified for mobile */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 lg:gap-8 pt-4 lg:pt-5 border-t border-[#333333]">
              {[
                { value: '99.9%', label: 'Uptime' },
                { value: 'AES-128', label: 'Encryption' },
                { value: '<1s', label: 'Latency' }
              ].map((stat, index) => (
                <div key={index} className="text-center lg:text-left">
                  <p className="text-lg lg:text-xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs lg:text-sm text-[#888] mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section - Login Form */}
        <div className="lg:w-1/2 p-5 sm:p-8 lg:p-8 flex items-start lg:items-center justify-center bg-[#1e1e1e] border-l border-[#333333]">
          <div className="w-full max-w-full sm:max-w-md lg:max-w-sm">
            {/* Form header */}
            <div className="mt-4 sm:mt-6 lg:mt-0 mb-6 lg:mb-8">
              <h2 className="text-2xl sm:text-3xl lg:text-2xl font-semibold text-white mb-2">Sign in</h2>
              <p className="text-base sm:text-lg lg:text-base text-[#a0a0a0]">Enter your credentials to continue</p>
            </div>

            {/* Login form container - Full width on mobile/tablet, card on desktop */}
            <div className="lg:bg-[#1e1e1e] lg:border lg:border-[#333333] lg:rounded-lg lg:p-5 lg:sm:p-7">
              {(localError || authError) && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{localError || authError}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email input */}
                <div className="space-y-3">
                  <label htmlFor="email" className="block text-sm font-medium text-[#a0a0a0]">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-4 py-3 bg-[#252525] border border-[#404040] rounded-md text-white placeholder-[#666] focus:border-white focus:ring-2 focus:ring-white/20 focus:outline-none transition-all text-sm"
                    required
                    autoComplete="email"
                  />
                </div>

                {/* Password input */}
                <div className="space-y-3">
                  <label htmlFor="password" className="block text-sm font-medium text-[#a0a0a0]">
                    Password
                  </label>
                  <div className="relative group">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 pr-12 bg-[#252525] border border-[#404040] rounded-md text-white placeholder-[#666] focus:border-white focus:ring-2 focus:ring-white/20 focus:outline-none transition-all text-sm"
                      required
                      autoComplete="current-password"
                    />
                    {password && (
                      <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-white transition-colors p-1 focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-white hover:bg-[#e5e5e5] text-black font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 text-base focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-[#1e1e1e] active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>Sign in</span>
                  )}
                </button>
              </form>
            </div>

            {/* Footer */}
            <div className="mt-8 lg:mt-6 pt-5 border-t border-[#333333] text-center">
              <p className="text-sm text-[#666666]">
                © 2026 DRM Media Platform
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
