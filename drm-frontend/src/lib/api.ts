const API_BASE_URL = import.meta.env.VITE_DRM_BACKEND_URL || 'http://localhost:3000';

interface Settings {
  [key: string]: unknown;
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
}

// Create singleton instance
const apiClient = new ApiClient(API_BASE_URL);

export default apiClient;
export type { Settings };
