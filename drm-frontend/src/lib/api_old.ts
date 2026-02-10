const API_BASE_URL = import.meta.env.VITE_DRM_BACKEND_URL || 'http://localhost:3000';

interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  emailVerified: boolean;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  success: boolean;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: Pick<User, 'id' | 'email' | 'name' | 'role'>;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface AuditStats {
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  totals: {
    totalLogs: number;
    successfulActions: number;
    failedActions: number;
    successRate: string;
  };
  authentication: {
    loginSuccess: number;
    loginFailed: number;
  };
  drm: {
    licenseRequests: number;
    callbacks: number;
  };
  topActions: Array<{ action: string; count: number }>;
}

interface Settings {
  [key: string]: unknown;
}

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

/**
 * Dual-mode API Client
 * 
 * Supports both cookie-based authentication (production) and Authorization header fallback
 * (for local development when cookies won't work due to secure/none restrictions).
 * 
 * Production: Tokens stored in HttpOnly cookies (most secure)
 * Development: Tokens stored in localStorage when cookies can't be used
 */
class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private useTokenFallback: boolean = false;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;
  private csrfToken: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Check if we're in a development environment where cookies might not work
    this.useTokenFallback = this.detectNeedsTokenFallback();
    // Try to load token from localStorage if fallback mode
    if (this.useTokenFallback) {
      this.token = localStorage.getItem(ACCESS_TOKEN_KEY);
    }
  }

  /**
   * Detect if we need to use token fallback for development
   * 
   * Fallback mode is ONLY needed when:
   * - Production backend (HTTPS) accessed from local frontend (HTTP)
   * - This is for LOCAL DEVELOPMENT ONLY
   * 
   * For production deployments (Vercel + Render, etc.), cookies with SameSite=None
   * will work for cross-domain authentication. Do NOT use fallback in production.
   * 
   * IMPORTANT: Fallback mode stores tokens in localStorage which is NOT secure.
   * Always use HttpOnly cookies for production deployments.
   */
  private detectNeedsTokenFallback(): boolean {
    const backendOrigin = new URL(this.baseURL).origin;
    const frontendOrigin = window.location.origin;
    
    // Local development frontend check
    const isLocalFrontend = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
    
    // Protocol mismatch check (backend HTTPS, frontend HTTP)
    const backendProtocol = new URL(this.baseURL).protocol;
    const frontendProtocol = window.location.protocol;
    const isProtocolMismatch = backendProtocol !== frontendProtocol;
    
    // ONLY use fallback for: localhost frontend + HTTPS backend (protocol mismatch)
    // This happens when developing locally against a deployed backend
    const shouldUseFallback = isLocalFrontend && isProtocolMismatch;
    
    if (shouldUseFallback) {
      console.log('[api] 🔧 Using TOKEN FALLBACK mode (LOCAL DEV ONLY)', {
        backendOrigin,
        frontendOrigin,
        isLocalFrontend,
        isProtocolMismatch,
        backendProtocol,
        frontendProtocol,
        reason: 'Local HTTP frontend accessing HTTPS backend - secure cookies rejected by browser'
      });
      console.log('[api] ⚠️ WARNING: Tokens stored in localStorage - NOT secure, development only!');
    } else {
      console.log('[api] ✅ Using COOKIE mode', {
        backendOrigin,
        frontendOrigin,
        reason: isLocalFrontend 
          ? 'Local development with matching protocols' 
          : 'Production deployment - cross-domain cookies with SameSite=None'
      });
    }
    
    return shouldUseFallback;
  }

  /**
   * Set token
   * Only in fallback mode stores in localStorage for development
   * In production, relies entirely on HttpOnly cookies (secure)
   */
  setToken(token: string | null) {
    this.token = token;
    
    // Only use localStorage in fallback mode (dev with production backend)
    // NEVER use localStorage in production for security
    if (this.useTokenFallback) {
      if (token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
    }
  }

  /**
   * Get refresh token
   * In fallback mode, retrieves from localStorage
   * In production, refresh token is stored in HttpOnly cookie (secure)
   */
  getRefreshToken(): string | null {
    if (this.useTokenFallback) {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    // Refresh token is stored in HttpOnly cookie in production
    return null;
  }

  /**
   * Set refresh token
   * Only in fallback mode stores in localStorage for development
   * In production, relies entirely on HttpOnly cookies (secure)
   */
  setRefreshToken(token: string | null) {
    // Only use localStorage in fallback mode (local dev + production backend)
    // NEVER use localStorage in production cross-domain deployments
    if (this.useTokenFallback) {
      if (token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  }

  /**
   * Set CSRF token
   * CSRF tokens are stored in memory (not localStorage for security)
   */
  setCSRFToken(token: string | null) {
    this.csrfToken = token;
  }

  /**
   * Get the current CSRF token from memory
   */
  getCSRFToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Get the current token from memory or localStorage
   */
  getToken(): string | null {
    return this.token;
  }

  private getHeaders(includeAuth = true, method = 'GET'): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Only use Authorization header in fallback mode (development)
    // In production, rely on HttpOnly cookies which are sent automatically
    if (includeAuth && this.useTokenFallback && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    // In production, cookies are sent automatically by browser

    // Add CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (stateChangingMethods.includes(method) && this.csrfToken) {
      headers['x-csrf-token'] = this.csrfToken;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { includeAuth?: boolean } = {}
  ): Promise<T> {
    const { includeAuth = true, method = 'GET', ...fetchOptions } = options;
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        method,
        credentials: 'include', // Include cookies for authentication
        headers: {
          ...this.getHeaders(includeAuth, method),
          ...fetchOptions.headers,
        },
      });

      // Handle 401 Unauthorized - token expired
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({ error: 'Unauthorized' }));
        
        // Don't attempt refresh for auth endpoints or if refresh token is missing
        const isAuthEndpoint = endpoint.startsWith('/api/auth/');
        const hasRefreshToken = this.useTokenFallback 
          ? !!this.getRefreshToken() 
          : true; // In cookie mode, the refresh token should exist as a cookie

        // Don't attempt refresh for /refresh or /logout endpoints
        if (endpoint.includes('/refresh') || endpoint.includes('/logout')) {
          throw new Error(errorData.error || 'Unauthorized');
        }

        // Only attempt auto-refresh if we have a refresh token
        if (!isAuthEndpoint && hasRefreshToken) {
          console.log('[api] Received 401, attempting token refresh...');
          
          try {
            await this.refreshAccessToken();
            
            // Retry the original request with new token
            console.log('[api] Retrying original request after token refresh');
            
            const retryResponse = await fetch(url, {
              ...fetchOptions,
              credentials: 'include',
              headers: {
                ...this.getHeaders(includeAuth),
                ...fetchOptions.headers,
              },
            });

            if (!retryResponse.ok) {
              const retryErrorData = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
              throw new Error(retryErrorData.error || `HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
            }

            return await retryResponse.json();
          } catch (refreshError) {
            // Refresh failed - user needs to login again
            console.error('[api] Token refresh failed, user needs to re-login', refreshError);
            throw new Error('Session expired. Please login again.');
          }
        }

        // No refresh token or auth endpoint - propagate the error
        throw new Error(errorData.error || 'Unauthorized');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract CSRF token from response if present
      if (data && typeof data === 'object' && 'csrfToken' in data && data.csrfToken) {
        this.setCSRFToken(data.csrfToken);
        // Remove csrfToken from the returned data to keep it clean
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { csrfToken: _, ...rest } = data as any;
        return rest as T;
      }
      
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }

  // ============================================================================
  // Authentication Endpoints
  // ============================================================================

  async login(email: string, password: string): Promise<LoginResponse> {
    console.log('[api] Attempting login to:', `${this.baseURL}/api/auth/login`);
    console.log('[api] Mode:', this.useTokenFallback ? 'TOKEN FALLBACK (dev)' : 'COOKIES (production)');
    
    const response = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      includeAuth: false,
    });
    
    console.log('[api] Login response received. User:', response.user?.email);
    console.log('[api] Response includes accessToken:', !!response.accessToken);
    console.log('[api] Response includes refreshToken:', !!response.refreshToken);

    // Store tokens in localStorage ONLY if backend explicitly returned them (fallback mode)
    // In production, tokens should be stored in HttpOnly cookies (secure, XSS-protected)
    // LocalStorage is ONLY for development when cookies can't work
    if (response.accessToken) {
      this.setToken(response.accessToken);
      console.log('[api] Access token stored (fallback mode only)');
    }
    if (response.refreshToken) {
      this.setRefreshToken(response.refreshToken);
      console.log('[api] Refresh token stored (fallback mode only)');
    }

    if (this.useTokenFallback) {
      console.log('[api] [WARNING]  Using TOKEN FALLBACK mode (development) - tokens in localStorage');
      console.log('[api]    This is NOT secure for production use!');
    } else {
      console.log('[api] ✅ Using COOKIE mode (production) - tokens in HttpOnly cookies');
      console.log('[api]    Secure: cookies are HttpOnly and not accessible by JavaScript');
    }

    return response;
  }

  async register(email: string, password: string, name?: string): Promise<{ message: string; user: User }> {
    const response = await this.request<{ message: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      includeAuth: false,
    });

    return response;
  }

  async logout(): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    });

    // Clear tokens in both modes
    this.setToken(null);
    this.setRefreshToken(null);

    return response;
  }

  async logoutAll(): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>('/api/auth/logout-all', {
      method: 'POST',
    });

    // Clear tokens in both modes
    this.setToken(null);
    this.setRefreshToken(null);
    this.setCSRFToken(null);

    return response;
  }

  /**
   * Invalidate all tokens for the current user (forced logout from all devices)
   */
  async invalidateAllTokens(): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>('/api/auth/invalidate-tokens', {
      method: 'POST',
    });

    // Clear all local authentication data
    this.setToken(null);
    this.setRefreshToken(null);
    this.setCSRFToken(null);

    return response;
  }

  /**
   * Get a fresh CSRF token from the backend
   */
  async fetchCSRFToken(): Promise<{ csrfToken: string }> {
    return this.request<{ csrfToken: string }>('/api/auth/csrf-token');
  }

  async getCurrentUser(): Promise<{ user: User }> {
    console.log('[api] Fetching current user from:', `${this.baseURL}/api/auth/me`);
    console.log('[api] Credentials include will be set to send cookies automatically');
    return this.request<{ user: User }>('/api/auth/me');
  }

  /**
   * Refresh access token automatically using the refresh token cookie
   * This method handles race conditions when multiple requests fail simultaneously
   */
  private async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string }> {
    // If a refresh is already in progress, return the existing promise
    if (this.isRefreshing && this.refreshPromise) {
      console.log('[api] Token refresh already in progress, waiting...');
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    const startTime = Date.now();
    
    this.refreshPromise = (async () => {
      try {
        console.log('[api] Refreshing access token...');
        
        // Only pass refresh token in body for fallback mode
        const bodyData = this.useTokenFallback 
          ? { refreshToken: this.getRefreshToken() || '' }
          : {};

        const response = await this.request<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify(bodyData),
          includeAuth: false,
        });

        // Update stored tokens
        if (response.accessToken) {
          this.setToken(response.accessToken);
          console.log('[api] Access token refreshed successfully');
        }
        if (response.refreshToken) {
          this.setRefreshToken(response.refreshToken);
        }

        const duration = Date.now() - startTime;
        console.log(`[api] Token refresh completed in ${duration}ms`);
        
        return response;
      } catch (error) {
        console.error('[api] Token refresh failed:', error);
        // Clear tokens on refresh failure - user needs to re-login
        this.setToken(null);
        this.setRefreshToken(null);
        throw error;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await this.request<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      includeAuth: false,
    });

    if (response.accessToken) {
      this.setToken(response.accessToken);
    }
    if (response.refreshToken) {
      this.setRefreshToken(response.refreshToken);
    }

    return response;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  }

  // ============================================================================
  // Audit Log Endpoints
  // ============================================================================

  async getAuditLogs(params?: {
    page?: number;
    limit?: number;
    action?: string;
    userId?: string;
    entityType?: string;
    entityId?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
  }): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });
    }

    const queryString = queryParams.toString();
    return this.request<AuditLogsResponse>(`/api/audit/logs${queryString ? `?${queryString}` : ''}`);
  }

  async getAuditLog(id: string): Promise<{ log: AuditLog }> {
    return this.request<{ log: AuditLog }>(`/api/audit/logs/${id}`);
  }

  async getAuditActions(): Promise<{ actions: string[] }> {
    return this.request<{ actions: string[] }>('/api/audit/actions');
  }

  async getAuditStats(days: number = 30): Promise<AuditStats> {
    return this.request<AuditStats>(`/api/audit/stats?days=${days}`);
  }

  async getUserAuditLogs(userId: string, page?: number, limit?: number): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams();
    if (page !== undefined) queryParams.append('page', String(page));
    if (limit !== undefined) queryParams.append('limit', String(limit));

    return this.request<AuditLogsResponse>(
      `/api/audit/user/${userId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    );
  }

  async getEntityAuditLogs(type: string, id: string, page?: number, limit?: number): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams();
    if (page !== undefined) queryParams.append('page', String(page));
    if (limit !== undefined) queryParams.append('limit', String(limit));

    return this.request<AuditLogsResponse>(
      `/api/audit/entity/${type}/${id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    );
  }

  // ============================================================================
  // Settings Endpoints
  // ============================================================================

  async getSettings(category?: string, keys?: string[]): Promise<{ settings: Settings }> {
    const queryParams = new URLSearchParams();
    if (category) queryParams.append('category', category);
    if (keys) queryParams.append('keys', keys.join(','));

    return this.request<{ settings: Settings }>(
      `/api/settings${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    );
  }

  async getPublicSettings(): Promise<{ settings: Settings }> {
    return this.request<{ settings: Settings }>('/api/settings/public', {
      includeAuth: false,
    });
  }

  async getSetting(key: string): Promise<{ key: string; value: unknown }> {
    return this.request<{ key: string; value: unknown }>(`/api/settings/${key}`);
  }

  async getSettingsByCategory(category: string): Promise<{ category: string; settings: Settings }> {
    return this.request<{ category: string; settings: Settings }>(`/api/settings/category/${category}`);
  }

  async updateSetting(key: string, value: unknown, options?: {
    valueType?: string;
    category?: string;
    description?: string;
    isPublic?: boolean;
  }): Promise<{ success: boolean; setting: unknown }> {
    return this.request<{ success: boolean; setting: unknown }>(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value, ...options }),
    });
  }

  async updateSettings(settings: Record<string, Partial<Settings[0]> & { value: unknown }>): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    });
  }

  async deleteSetting(key: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/settings/${key}`, {
      method: 'DELETE',
    });
  }

  async resetSetting(key: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/settings/${key}/reset`, {
      method: 'POST',
    });
  }

  async getAllSettings(): Promise<{ settings: Array<Settings[0] & { id: string }> }> {
    return this.request<{ settings: Array<Settings[0] & { id: string }> }>('/api/settings/admin/all');
  }

  async getAllCategories(): Promise<{ categories: string[] }> {
    return this.request<{ categories: string[] }>('/api/settings/admin/categories');
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request<{ status: string; timestamp: string }>('/health', {
      includeAuth: false,
    });
  }

  async logAction(action: string, details: Record<string, unknown>, entityType: string = 'Stream', entityId?: string) {
        return this.request<{ success: boolean }>('/api/audit/log', {
            method: 'POST',
            body: JSON.stringify({ action, details, entityType, entityId }),
        });
    }
}

// Create singleton instance
const apiClient = new ApiClient(API_BASE_URL);

export default apiClient;
export type { User, AuditLog, AuditLogsResponse, AuditStats, Settings, LoginResponse };
