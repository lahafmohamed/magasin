import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../pages/Login';
import { useAuth } from '../lib/AuthContext';
import { BAD_CREDENTIALS_MESSAGE } from '../utils/errors';

// Mock the auth context
vi.mock('../lib/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/AuthContext')>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Mock react-router-dom
const navigate = vi.hoisted(() => vi.fn());
const routerState = vi.hoisted(() => ({ current: {} as { from?: { pathname: string } } }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ state: routerState.current }),
  };
});

const mockLogin = vi.fn();

function renderLogin() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    logout: vi.fn(),
    hasRole: vi.fn(),
  });

  return render(<Login />);
}

describe('Login', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    navigate.mockReset();
    sessionStorage.clear();
    routerState.current = {};
  });

  it('renders the login form under the product name, in a main landmark', async () => {
    renderLogin();
    expect(screen.getByRole('main')).toBeInTheDocument();
    // La marque au-dessus, le titre de l'écran en h1 (même en-tête que le changement de mot de passe).
    expect(screen.getByText('nolyxERP')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument();
    expect(screen.queryByText(/Magasin Programme/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Identifiant')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
    expect(screen.getByText(/Mot de passe oublié/)).toBeInTheDocument();
    expect(screen.queryByText(/comptes de démonstration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/manager123/i)).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Connexion · nolyxERP'));
  });

  it('explains empty fields as instructions linked to each field', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText('Saisissez votre identifiant.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Saisissez votre mot de passe.')).toBeInTheDocument();
    const username = screen.getByLabelText('Identifiant');
    expect(username).toHaveAttribute('aria-invalid', 'true');
    expect(username).toHaveAttribute('aria-describedby', 'username-error');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login with valid credentials', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLogin();

    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'admin123' } });

    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('admin', 'admin123'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('says what went wrong after a wrong password — never « Session expirée »', async () => {
    mockLogin.mockRejectedValue({
      response: { status: 401, data: { success: false, error: 'Identifiants invalides' } },
      config: { url: '/auth/login' },
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'mauvais' } });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(BAD_CREDENTIALS_MESSAGE);
    expect(screen.queryByText(/Session expirée/)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    // L'identifiant saisi reste en place.
    expect(screen.getByLabelText('Identifiant')).toHaveValue('admin');
  });

  it('shows the notice left by a password change, and keeps it across the logout reload', () => {
    sessionStorage.setItem('login-notice', 'mot-de-passe-modifie');
    const premier = renderLogin();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.'
    );
    // La déconnexion affiche cette page par redirection, PUIS recharge l'onglet :
    // le message doit encore être là au second affichage. Retiré dès le premier,
    // il disparaissait deux fois sur trois au rendu réel (2026-11-27).
    premier.unmount();
    renderLogin();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.'
    );
  });

  async function signIn() {
    mockLogin.mockResolvedValue(undefined);
    renderLogin();
    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234' } });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  }

  it('returns to the page the user came from', async () => {
    routerState.current = { from: { pathname: '/factures/12' } };
    await signIn();
    expect(navigate).toHaveBeenCalledWith('/factures/12', { replace: true });
  });

  it('never returns to the forced password change screen after signing back in', async () => {
    // Après le changement forcé, la déconnexion laisse /change-password comme
    // page d'origine : y revenir affichait « Changement de mot de passe requis »
    // à quelqu'un qui venait de le faire (vu au rendu réel, 2026-11-27).
    routerState.current = { from: { pathname: '/change-password' } };
    await signIn();
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('drops the notice once the user signs in', async () => {
    sessionStorage.setItem('login-notice', 'mot-de-passe-modifie');
    mockLogin.mockResolvedValue(undefined);
    renderLogin();

    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234' } });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('admin', 'Secret1234'));
    expect(sessionStorage.getItem('login-notice')).toBeNull();
  });
});
