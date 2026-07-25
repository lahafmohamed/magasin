import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../pages/Login';
import { useAuth } from '../lib/AuthContext';

// Mock the auth context
vi.mock('../lib/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/AuthContext')>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Mock react-router-dom
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ state: {} }),
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
  });

  it('renders login form', () => {
    renderLogin();
    expect(screen.getByLabelText('Identifiant')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
    expect(screen.queryByText(/comptes de démonstration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/manager123/i)).not.toBeInTheDocument();
  });

  it('shows validation error for empty form submission', async () => {
    renderLogin();
    const submitBtn = screen.getByRole('button', { name: /se connecter/i });
    fireEvent.click(submitBtn);

    // Zod validation should prevent submission when fields are empty
    await waitFor(() => expect(mockLogin).not.toHaveBeenCalled());
  });

  it('calls login with valid credentials', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLogin();

    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'admin123' } });

    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('admin', 'admin123'));
  });
});
