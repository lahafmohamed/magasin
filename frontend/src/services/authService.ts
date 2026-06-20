import axios, { AxiosError } from 'axios';
import type { User, LoginInput, AuthResponse, ApiResponse } from '../types/auth';

const api = axios.create({
  baseURL: '/api',
  // Auth carried by the httpOnly auth_token cookie.
  withCredentials: true,
});

// Response interceptor: only force logout on a real auth failure (401).
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (input: LoginInput): Promise<AuthResponse> => {
    // Backend sets the httpOnly auth_token cookie; we only cache the (non-sensitive)
    // user object for UX rehydration on reload.
    const { data } = await api.post('/auth/login', input);
    if (data.success && data.data?.user) {
      localStorage.setItem('auth_user', JSON.stringify(data.data.user));
    }
    return data;
  },

  logout: async () => {
    // Revoke the session + clear the cookie server-side, then drop the cached user.
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('auth_user');
  },

  getCurrentUser: async (): Promise<User> => {
    const { data } = await api.get<ApiResponse<User>>('/auth/me');
    return data.data!;
  },

  register: async (input: { username: string; email?: string; password: string; nom_complet?: string; role?: string }): Promise<ApiResponse<User>> => {
    const { data } = await api.post<ApiResponse<User>>('/auth/register', input);
    return data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<ApiResponse> => {
    const { data } = await api.put<ApiResponse>('/auth/change-password', { currentPassword, newPassword });
    return data;
  },

  getUsers: async (page = 1, limit = 20): Promise<ApiResponse<User[]>> => {
    const { data } = await api.get<ApiResponse<User[]>>(`/auth/users?page=${page}&limit=${limit}`);
    return data;
  },

  updateUser: async (id: number, input: { email?: string; nom_complet?: string; role?: string; actif?: boolean }): Promise<ApiResponse<User>> => {
    const { data } = await api.put<ApiResponse<User>>(`/auth/users/${id}`, input);
    return data;
  },
};

// Export the configured api instance for use in other services
export { api };
