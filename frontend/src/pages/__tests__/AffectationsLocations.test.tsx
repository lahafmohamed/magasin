import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AffectationsLocations from '../AffectationsLocations';

vi.mock('../../services/api', () => ({
  userLocationAssignmentService: {
    getUsers: vi.fn(),
    getLocations: vi.fn(),
    getByUserId: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { userLocationAssignmentService } from '../../services/api';

const USERS = [
  { id: 1, username: 'a.yao', nom_complet: 'Adjoua Yao', role: 'caissier', actif: true, locations: [{ location_id: 2, est_defaut: true }] },
  { id: 2, username: 'k.ble', nom_complet: 'Koffi Blé', role: 'depot_staff', actif: true, locations: [{ location_id: 1, est_defaut: true }] },
];
const LOCATIONS = [
  { id: 1, code: 'DEP-VRD', nom: 'Dépôt Vridi', est_principal: true },
  { id: 2, code: 'MAG-PLT', nom: 'Hitek Plateau', est_principal: false },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <AffectationsLocations />
    </MemoryRouter>
  );

describe('AffectationsLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userLocationAssignmentService.getUsers).mockResolvedValue(USERS);
    vi.mocked(userLocationAssignmentService.getLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(userLocationAssignmentService.update).mockResolvedValue({});
  });

  it('selects a user with the keyboard and shows their locations', async () => {
    const user = userEvent.setup();
    renderPage();

    const koffi = await screen.findByRole('button', { name: 'k.ble' });
    expect(screen.getByRole('button', { name: 'a.yao' })).toHaveAttribute('aria-pressed', 'true');
    // Le titre nomme la personne, avec l'élision devant une voyelle.
    expect(screen.getByRole('heading', { name: 'Emplacements d’Adjoua Yao' })).toBeInTheDocument();
    expect(koffi).toHaveAttribute('aria-pressed', 'false');

    koffi.focus();
    await user.keyboard('{Enter}');

    expect(koffi).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Emplacements de Koffi Blé' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Dépôt Vridi/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Hitek Plateau/ })).not.toBeChecked();
  });

  it('refuses to save without any location, then saves the chosen ones', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: /Hitek Plateau/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les affectations' }));
    expect(await screen.findByText('Choisissez au moins un emplacement.')).toBeInTheDocument();
    expect(userLocationAssignmentService.update).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /Dépôt Vridi/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer les affectations' }));
    await waitFor(() =>
      expect(userLocationAssignmentService.update).toHaveBeenCalledWith(1, {
        location_ids: [1],
        default_location_id: 1,
      })
    );
  });

  it('shows an error state with a retry when loading fails', async () => {
    vi.mocked(userLocationAssignmentService.getUsers).mockRejectedValue(new Error('réseau'));
    renderPage();
    expect(await screen.findByText('Impossible de charger les affectations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
