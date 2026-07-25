import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '../types/auth';
import { authService } from '../services/authService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: ('admin' | 'manager' | 'caissier' | 'depot_staff' | 'magasin_staff' | 'viewer')[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('auth_user');

    if (storedUser) {
      setUser(JSON.parse(storedUser));
      // Validate the session via the httpOnly cookie (sent automatically).
      authService.getCurrentUser()
        .then((userData) => {
          setUser(userData);
          localStorage.setItem('auth_user', JSON.stringify(userData));
        })
        .catch((err: any) => {
          // Only end the session if the cookie is actually rejected (401).
          // Rate-limit (429), network, or server errors keep the cached session.
          if (err?.response?.status === 401) {
            localStorage.removeItem('auth_user');
            setUser(null);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;

      // A shared browser can restore an authenticated page from its back/forward
      // cache after logout. The absence of the cached user is an immediate local
      // signal; the server remains authoritative when a cached user exists.
      if (!localStorage.getItem('auth_user')) {
        setUser(null);
        setIsLoading(false);
        if (!window.location.pathname.startsWith('/login')) {
          window.location.replace('/login');
        }
        return;
      }

      setIsLoading(true);
      authService.getCurrentUser()
        .then((userData) => {
          setUser(userData);
          localStorage.setItem('auth_user', JSON.stringify(userData));
        })
        .catch(() => {
          localStorage.removeItem('auth_user');
          setUser(null);
          if (!window.location.pathname.startsWith('/login')) {
            window.location.replace('/login');
          }
        })
        .finally(() => setIsLoading(false));
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const login = async (username: string, password: string) => {
    const response = await authService.login({ username, password });
    if (response.success && response.data) {
      setUser(response.data.user);
    } else {
      throw new Error((response as any).error || 'Échec de connexion');
    }
  };

  const logout = async () => {
    setUser(null);
    await authService.logout();
    window.location.replace('/login');
  };

  const hasRole = (...roles: ('admin' | 'manager' | 'caissier' | 'depot_staff' | 'magasin_staff' | 'viewer')[]) => {
    return user !== null && roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
