const API_BASE_URL = import.meta.env.VITE_DRM_BACKEND_URL || 'http://localhost:3000';

export interface Settings {
  [key: string]: unknown;
}

// ============================================================================
// Types
// ============================================================================
export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: string;
  message?: string;
}

export interface Session {
  id: string;
  token: string;
  expiresAt: string;
  lastActiveAt: string;
  createdAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ValidateSessionResponse {
  user: User;
  session: Session;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  }

  // ============================================================================
  // Health Check
  // ============================================================================
  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  // ============================================================================
  // DRM & Broadcast Endpoints
  // ============================================================================
  async pingBroadcastSession(streamId: string) {
    return this.request(`/api/broadcast/sessions/${streamId}/ping`, {
      method: 'POST',
    });
  }

  async updateBroadcastSessionState(streamId: string, data: {
    connectionState?: string;
    localSdp?: string;
    remoteSdp?: string;
    iceCandidates?: unknown;
  }) {
    return this.request(`/api/broadcast/sessions/${streamId}/state`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createBroadcastSession(data: {
    streamId: string;
    endpoint?: string;
    merchant?: string;
    userIdForDrm?: string;
    encrypted?: boolean;
    iceServers?: unknown;
  }) {
    return this.request('/api/broadcast/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getBroadcastSession(streamId: string) {
    return this.request(`/api/broadcast/sessions/${streamId}`);
  }

  async deleteBroadcastSession(streamId: string) {
    return this.request(`/api/broadcast/sessions/${streamId}`, {
      method: 'DELETE',
    });
  }

  async getActiveBroadcastSessions() {
    return this.request('/api/broadcast/active');
  }

  // ============================================================================
  // Token Authorization (DRMtoday fallback)
  // ============================================================================
  async generateAuthToken(data: {
    assetId?: string;
    userId?: string;
    contentId?: string;
  }) {
    return this.request('/api/token/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================================================
  // Global Encryption Setting
  // ============================================================================
  async getEncryptionSetting(): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>('/api/settings/encryption/enabled');
  }

  async updateEncryptionSetting(enabled: boolean): Promise<{ success: boolean; enabled: boolean }> {
    return this.request<{ success: boolean; enabled: boolean }>('/api/settings/encryption/enabled', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  // ============================================================================
  // Settings Endpoints
  // ============================================================================
  async getSettings(params?: {
    category?: string;
    keys?: string[];
  }): Promise<{ settings: Settings }> {
    const queryParams = new URLSearchParams();
    if (params) {
      if (params.category) queryParams.append('category', params.category);
      if (params.keys) params.keys.forEach(key => queryParams.append('keys', key));
    }

    const queryString = queryParams.toString();
    return this.request<{ settings: Settings }>(
      `/api/settings${queryString ? `?${queryString}` : ''}`
    );
  }

  async getSetting(key: string): Promise<{ key: string; value: unknown }> {
    return this.request<{ key: string; value: unknown }>(`/api/settings/${key}`);
  }

  async getSettingsByCategory(category: string): Promise<{ category: string; settings: Settings }> {
    return this.request<{ category: string; settings: Settings }>(`/api/settings/category/${category}`);
  }

  async getPublicSettings(): Promise<{ settings: Settings }> {
    return this.request<{ settings: Settings }>('/api/settings/public');
  }

  async updateSetting(key: string, value: unknown, options?: {
    valueType?: string;
    category?: string;
    description?: string;
    isPublic?: boolean;
  }) {
    return this.request(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value, ...options }),
    });
  }

  async updateSettings(settings: Settings) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    });
  }

  async deleteSetting(key: string) {
    return this.request(`/api/settings/${key}`, {
      method: 'DELETE',
    });
  }

  async resetSetting(key: string) {
    return this.request(`/api/settings/${key}/reset`, {
      method: 'POST',
    });
  }

  // ============================================================================
  // DRMtoday Callback (internal use only)
  // ============================================================================
  async handleCallback(data: unknown) {
    return this.request('/api/callback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================================================
  // Authentication
  // ============================================================================
  async register(data: {
    email: string;
    name: string;
    password: string;
  }): Promise<{ user: User; message: string }> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout(): Promise<{ message: string }> {
    const token = this.getToken();
    return this.request('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    return this.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  // Session-based authentication - validate session against database
  async validateSession(): Promise<ValidateSessionResponse> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No session token');
    }
    return this.request('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getProfile(): Promise<{ user: User }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token');
    }
    return this.request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getSessions(): Promise<{ sessions: Session[] }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token');
    }
    return this.request('/api/auth/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async logoutAll(): Promise<{ message: string; count: number }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token');
    }
    return this.request('/api/auth/sessions', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async updateProfile(data: {
    name?: string;
  }): Promise<{ user: User; message: string }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token');
    }
    return this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token');
    }
    return this.request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // ============================================================================
  // Token storage methods
  // ============================================================================
  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  async setTokens(token: string, refreshToken: string): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('refresh_token', refreshToken);
    }
  }

  async clearTokens(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
    }
  }

  async getStoredToken(): Promise<string | null> {
    return this.getToken();
  }

  async getStoredRefreshToken(): Promise<string | null> {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('refresh_token');
    }
    return null;
  }
}

// Create singleton instance
const apiClient = new ApiClient(API_BASE_URL);

export default apiClient;
