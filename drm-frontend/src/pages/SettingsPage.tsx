import { useState, useCallback, useEffect } from 'react';
import apiClient from '../lib/api';
import { useEncryption } from '../App';
import { useAuth } from '../context/AuthContext';

type TabType = 'drm' | 'account';

export function SettingsPage() {
  const { user } = useAuth();
  console.log('User data:', user);
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPER_ADMIN';
  console.log('Is admin:', isAdmin, 'Role:', user?.role);
  const [activeTab, setActiveTab] = useState<TabType>(isAdmin ? 'drm' : 'account');
  
  // Ensure non-admins are always on account tab
  useEffect(() => {
    if (!isAdmin && activeTab === 'drm') {
      setActiveTab('account');
    }
  }, [isAdmin, activeTab]);
  
  const { enabled: currentEnabled, loading: encryptionLoading, error: encryptionError, refetch } = useEncryption();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleChangePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);

    try {
      await apiClient.changePassword({ currentPassword, newPassword });
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleToggleEncryption = async () => {
    // Don't allow toggle if already in processing state
    if (isUpdating || encryptionLoading) return;

    const newValue = !currentEnabled;
    
    try {
      setIsUpdating(true);
      setUpdateError(null);
      setSuccessMessage(null);

      // Call backend API to update the setting
      const response = await apiClient.updateEncryptionSetting(newValue);
      
      if (response.success) {
        setSuccessMessage(`Encryption ${newValue ? 'enabled' : 'disabled'} successfully`);
        // Refetch to ensure consistency
        refetch();
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        throw new Error('Failed to update encryption setting');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUpdateError(errorMessage);
      console.error('Failed to update encryption setting:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const isDisabled = isUpdating || encryptionLoading;

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-2 p-3 sm:p-4 md:p-6 bg-[#1e1e1e] rounded-lg border border-[#333333]">
          <h2 className="font-bold mb-3 sm:mb-4 md:mb-6 text-lg sm:text-xl md:text-2xl text-white border-b border-[#333333] pb-2 sm:pb-3">
            Settings
          </h2>

          {/* Tab Navigation */}
          <div className="flex gap-1 mb-4 sm:mb-6 border-b border-[#333333]">
            {isAdmin && (
              <button
                onClick={() => setActiveTab('drm')}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
                  activeTab === 'drm'
                    ? 'bg-[#252525] text-white border-t border-l border-r border-[#333333]'
                    : 'text-[#a0a0a0] hover:text-white hover:bg-[#252525]/50'
                }`}
              >
                DRM Settings
              </button>
            )}
            <button
              onClick={() => setActiveTab('account')}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
                activeTab === 'account'
                  ? 'bg-[#252525] text-white border-t border-l border-r border-[#333333]'
                  : 'text-[#a0a0a0] hover:text-white hover:bg-[#252525]/50'
              }`}
            >
              Account Settings
            </button>
          </div>

          {/* DRM Settings Tab Content */}
          {activeTab === 'drm' && (
            <div className="space-y-4 sm:space-y-5 md:space-y-6">
              {/* Section Header */}
              <div>
                <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-2">DRM Encryption</h3>
                <p className="text-xs sm:text-sm text-[#a0a0a0]">
                  Control global encryption settings for all streams and broadcasts
                </p>
              </div>

            {/* Encryption Setting */}
            <div className="bg-[#252525]/50 border border-[#404040] rounded-lg p-3 sm:p-4 md:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1 w-full sm:w-auto">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <h4 className="text-sm sm:text-base font-medium text-white">Enable DRM Encryption</h4>
                    {encryptionLoading && (
                      <svg className="w-4 h-4 text-[#a0a0a0] animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-[#a0a0a0] mt-1">
                    When enabled, all video streams will be encrypted using DRM
                  </p>
                  {encryptionError && (
                    <div className="mt-2">
                      <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="break-words">{encryptionError}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={handleToggleEncryption}
                  disabled={isDisabled}
                  aria-label="Toggle encryption"
                  aria-pressed={currentEnabled}
                  className={`relative inline-flex items-center transition-colors transition-transform duration-200 ease-in-out rounded-full touch-manipulation focus:outline-none toggle-switch ${
                    isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-95'
                  } ${
                    currentEnabled 
                      ? 'bg-white hover:bg-[#e5e5e5]' 
                      : 'bg-[#404040] hover:bg-[#555555]'
                  } w-11 h-6 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1e1e] focus-visible:ring-white`}
                >
                  <span
                    className={`absolute inline-block bg-[#1e1e1e] rounded-full shadow transition-transform duration-200 ${
                      currentEnabled ? 'translate-x-5' : 'translate-x-1'
                    } w-5 h-5`}
                  />
                </button>
              </div>

              {/* Current State Display */}
              <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-[#1e1e1e]/50 rounded-md">
                <div className="text-[10px] sm:text-xs text-[#a0a0a0] uppercase tracking-wide">Current State</div>
                <div className="mt-1 font-medium text-xs sm:text-sm">
                  {encryptionLoading ? (
                    <div className="flex items-center gap-2 text-[#a0a0a0]">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading...
                    </div>
                  ) : currentEnabled ? (
                    <div className="flex items-center gap-2 text-green-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>ENABLED</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[#888888]">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle cx="12" cy="12" r="10" strokeWidth={2} />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
                      </svg>
                      <span>DISABLED</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Messages */}
              {successMessage && (
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium text-sm sm:text-base break-words">{successMessage}</span>
                  </div>
                </div>
              )}

              {updateError && (
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <div>
                      <div className="font-medium text-sm sm:text-base">Failed to update setting</div>
                      <div className="text-xs sm:text-sm opacity-75 break-words">{updateError}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Information Box */}
            <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <h4 className="text-sm sm:text-base font-medium text-white mb-2">Important Notes</h4>
              <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-[#a0a0a0]">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                  <span className="break-words">Changes take effect immediately for new broadcasts and sessions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                  <span className="break-words">Existing active sessions will continue with their current encryption state</span>
                </li>
              </ul>
            </div>
          </div>
          )}

          {/* Account Settings Tab Content */}
          {activeTab === 'account' && (
            <div className="space-y-4 sm:space-y-5 md:space-y-6">
              {/* Section Header */}
              <div>
                <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white mb-2">Account Security</h3>
                <p className="text-xs sm:text-sm text-[#a0a0a0]">
                  Manage your account password and security settings
                </p>
              </div>

              {/* Change Password Form */}
              <div className="bg-[#252525]/50 border border-[#404040] rounded-lg p-3 sm:p-4 md:p-6">
                <h4 className="text-sm sm:text-base font-medium text-white mb-4">Change Password</h4>
                
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-white mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      id="currentPassword"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full bg-[#1e1e1e] border border-[#404040] rounded-md px-3 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-[#555555] focus:ring-1 focus:ring-[#555555]"
                      placeholder="Enter current password"
                    />
                  </div>

                  {/* New Password */}
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-white mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full bg-[#1e1e1e] border border-[#404040] rounded-md px-3 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-[#555555] focus:ring-1 focus:ring-[#555555]"
                      placeholder="Enter new password (min 8 characters)"
                    />
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-white mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full bg-[#1e1e1e] border border-[#404040] rounded-md px-3 py-2 text-sm text-white placeholder-[#666666] focus:outline-none focus:border-[#555555] focus:ring-1 focus:ring-[#555555]"
                      placeholder="Confirm new password"
                    />
                  </div>

                  {/* Password Success Message */}
                  {passwordSuccess && (
                    <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-medium text-sm break-words">{passwordSuccess}</span>
                      </div>
                    </div>
                  )}

                  {/* Password Error Message */}
                  {passwordError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="font-medium text-sm break-words">{passwordError}</span>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div>
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className={`px-4 py-2 bg-[#333333] hover:bg-[#404040] text-white text-sm font-medium rounded-md transition-colors ${
                        isChangingPassword ? 'cursor-not-allowed opacity-50' : ''
                      }`}
                    >
                      {isChangingPassword ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Security Notes */}
              <div className="p-3 sm:p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <h4 className="text-sm sm:text-base font-medium text-white mb-2">Security Tips</h4>
                <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-[#a0a0a0]">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                    <span className="break-words">Use a strong password with at least 8 characters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                    <span className="break-words">Include numbers, uppercase, and lowercase letters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                    <span className="break-words">You will need to log in again after changing your password</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* System Info Panel */}
        <div className="p-3 sm:p-4 md:p-6 bg-[#1e1e1e] rounded-lg border border-[#333333]">
          <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 text-white border-b border-[#333333] pb-2">
            System Information
          </h3>
          
          <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#a0a0a0]">
            {activeTab === 'drm' ? (
              <div className="grid grid-cols-1 gap-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Setting Key:</span>
                  <span className="font-mono text-[10px] sm:text-xs bg-[#252525]/50 px-2 py-1 rounded break-all sm:break-normal">drm.encryption.enabled</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Type:</span>
                  <span>Boolean</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Default:</span>
                  <span>true</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Category:</span>
                  <span>DRM</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Setting Key:</span>
                  <span className="font-mono text-[10px] sm:text-xs bg-[#252525]/50 px-2 py-1 rounded break-all sm:break-normal">account.password</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Type:</span>
                  <span>Credential</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Authentication:</span>
                  <span>Session Token (JWT)</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Security:</span>
                  <span>Encrypted</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                  <span className="text-white">Category:</span>
                  <span>Account</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-[#333333]">
            <div className="text-[10px] sm:text-xs text-[#777777]">
              Last updated: <span className="font-mono text-[10px] sm:text-xs">{new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}