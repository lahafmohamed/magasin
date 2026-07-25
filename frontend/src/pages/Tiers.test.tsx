import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TiersPage from './Tiers';
import { tiersService } from '../services/api';

vi.mock('../services/api', () => ({
  tiersService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useExportExcel', () => ({
  useExportExcel: () => ({ exportToExcel: vi.fn() }),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Contact form validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tiersService.getAll).mockResolvedValue({
      data: [],
      pagination: { total: 0, totalPages: 0 },
    } as any);
  });

  it('shows a French inline error and focuses the first empty required field', async () => {
    render(<TiersPage />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau contact/i }));

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Renseignez les informations, les rôles et les coordonnées du nouveau contact.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    const error = await screen.findByText('Saisissez la raison sociale ou le nom du contact.');
    const nameInput = screen.getByLabelText('Raison sociale *');

    expect(error).toHaveAttribute('role', 'alert');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(nameInput).toHaveFocus());
    expect(tiersService.create).not.toHaveBeenCalled();
  });

  it('validates email and role without native browser messages', async () => {
    render(<TiersPage />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau contact/i }));

    fireEvent.change(screen.getByLabelText('Raison sociale *'), {
      target: { value: 'Client Démonstration' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'email-invalide' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Client' }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    expect(await screen.findByText('Saisissez une adresse email valide.')).toBeInTheDocument();
    expect(screen.getByText('Sélectionnez au moins un rôle.')).toBeInTheDocument();
    expect(tiersService.create).not.toHaveBeenCalled();
  });
});
