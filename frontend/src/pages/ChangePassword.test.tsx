import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePassword from '../pages/ChangePassword';
import { WRONG_CURRENT_PASSWORD_MESSAGE } from '../utils/errors';

const logout = vi.hoisted(() => vi.fn());
vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ logout }),
}));

const changePassword = vi.hoisted(() => vi.fn());
vi.mock('../services/authService', () => ({
  authService: { changePassword },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
}

describe('ChangePassword', () => {
  beforeEach(() => {
    logout.mockReset();
    changePassword.mockReset();
    sessionStorage.clear();
  });

  it('is a titled main page that states the password rules', async () => {
    render(<ChangePassword />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Changement de mot de passe requis' })).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe doit contenir :')).toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('aria-describedby', 'new-rules');
    await waitFor(() => expect(document.title).toBe('Changer le mot de passe · nolyxERP'));
  });

  it('puts a mismatch under the confirmation field, without calling the server', () => {
    render(<ChangePassword />);
    fill('provisoire1', 'Nouveau2026', 'Nouveau2025');
    const confirm = screen.getByLabelText('Confirmer le nouveau mot de passe');
    expect(screen.getByText('Les deux mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveFocus();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('keeps the session and explains a wrong current password under its field', async () => {
    changePassword.mockRejectedValue({
      response: { status: 401, data: { success: false, error: 'Mot de passe actuel incorrect' } },
      config: { url: '/auth/change-password' },
    });
    render(<ChangePassword />);
    fill('mauvais1', 'Nouveau2026', 'Nouveau2026');

    expect(await screen.findByText(WRONG_CURRENT_PASSWORD_MESSAGE, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('aria-invalid', 'true');
    expect(logout).not.toHaveBeenCalled();
  });

  it('leaves a notice for the login page, then signs out', async () => {
    changePassword.mockResolvedValue({ success: true });
    render(<ChangePassword />);
    fill('provisoire1', 'Nouveau2026', 'Nouveau2026');

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(changePassword).toHaveBeenCalledWith('provisoire1', 'Nouveau2026');
    expect(sessionStorage.getItem('login-notice')).toBe('mot-de-passe-modifie');
  });
});
