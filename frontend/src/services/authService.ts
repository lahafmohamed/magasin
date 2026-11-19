import axios, { AxiosError } from 'axios';
import type { User, LoginInput, AuthResponse, ApiResponse } from '../types/auth';
import { isCredentialError } from '../utils/errors';

const api = axios.create({
  baseURL: '/api',
  // Auth carried by the httpOnly auth_token cookie.
  withCredentials: true,
});

function forgetCachedUser() {
  try {
    localStorage.removeItem('auth_user');
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Déconnexion forcée sur une vraie perte de session (401) — mais pas sur un
 * identifiant ou un mot de passe mal saisi : `/auth/login` et le « mot de
 * passe actuel incorrect » de `/auth/change-password` répondent aussi 401.
 * Avant, une faute de frappe rechargeait la page de connexion (formulaire
 * vidé, sans explication) et déconnectait le nouvel employé en plein
 * changement de mot de passe obligatoire.
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !isCredentialError(error)) {
      forgetCachedUser();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
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
      try {
        localStorage.setItem('auth_user', JSON.stringify(data.data.user));
      } catch {
        /* stockage indisponible : la session reste portée par le cookie */
      }
    }
    return data;
  },

  logout: async () => {
    // Revoke the session + clear the cookie server-side, then drop the cached user.
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    forgetCachedUser();
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
