import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NouveauDevis from './NouveauDevis';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

vi.mock('../services/api', () => ({
  devisService: { create: vi.fn(), update: vi.fn(), getById: vi.fn() },
  ventesService: { getLocations: vi.fn(), searchFuzzy: vi.fn() },
  stockLocationService: { getStockLevels: vi.fn() },
  tiersService: { getById: vi.fn(), search: vi.fn(), createClient: vi.fn(), getComptoir: vi.fn() },
}));

vi.mock('../lib/AuthContext', () => ({
  useOptionalAuth: () => ({ user: { id: 3, role: 'magasin_staff' }, hasRole: (...r: string[]) => r.includes('magasin_staff') }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { devisService, stockLocationService, tiersService, ventesService } from '../services/api';
import { toast } from 'sonner';

const mocked = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const client = {
  id: 5,
  code: 'CLI-0005',
  raison_sociale: 'BAMBA',
  prenom: 'Souleymane',
  telephone: null,
  email: null,
  est_client: true,
  est_fournisseur: false,
};

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/devis/nouveau" element={<NouveauDevis />} />
        <Route path="/devis/:id/edit" element={<NouveauDevis />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NouveauDevis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked(ventesService.getLocations).mockResolvedValue([{ id: 1, code: 'MAG-PLT', nom: 'Hitek Plateau', est_principal: true }]);
    mocked(stockLocationService.getStockLevels).mockResolvedValue([{ produit_id: 1, quantite_disponible: 13 }]);
    mocked(tiersService.getById).mockResolvedValue(client);
    mocked(devisService.getById).mockResolvedValue({
      id: 7,
      numero_devis: 'DEV-2026-00007',
      tiers_id: 5,
      location_id: 1,
      date_validite: '2026-11-21T00:00:00.000Z',
      notes: 'Livraison au siège',
      lignes: [{ produit_id: 1, produit_nom: 'HP ProBook 450 G10', produit_reference: 'INF-LAP-001', quantite: 3, prix_unitaire: '580000.00' }],
    });
    mocked(devisService.update).mockResolvedValue({});
  });

  it('modification : charge le devis, envoie la date de validité sous le nom lu par le serveur', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/devis/7/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Modifier le devis DEV-2026-00007' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Quantité — HP ProBook 450 G10' })).toHaveValue('3');
    expect(screen.getByText('INF-LAP-001')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Enregistrer le devis' })[0]);
    await waitFor(() => expect(devisService.update).toHaveBeenCalledTimes(1));
    expect(devisService.update).toHaveBeenCalledWith(7, {
      tiers_id: 5,
      location_id: 1,
      lignes: [{ produit_id: 1, quantite: 3, prix_unitaire: 580000 }],
      date_validite: '2026-11-21',
      notes: 'Livraison au siège',
    });
    expect(toast.success).toHaveBeenCalledWith('Devis DEV-2026-00007 enregistré');
    expect(navigateMock).toHaveBeenCalledWith('/devis/7', { replace: true });
  });

  it('modification : un chargement en échec affiche l’erreur et « Réessayer », jamais un devis vide', async () => {
    mocked(devisService.getById).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erreur serveur' } } });
    renderAt('/devis/7/edit');
    expect(await screen.findByText('Impossible de charger le devis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer le devis' })).not.toBeInTheDocument();
  });

  it('création : un devis sans client ni produit n’est pas envoyé', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/devis/nouveau');
    // Un seul magasin : rien à choisir, le récapitulatif le nomme une fois chargé.
    await screen.findByText('Hitek Plateau');
    await user.click(screen.getAllByRole('button', { name: 'Créer le devis' })[0]);
    expect(await screen.findByText('Choisissez le client.')).toBeInTheDocument();
    expect(screen.getByText('Ajoutez au moins un produit.')).toBeInTheDocument();
    expect(devisService.create).not.toHaveBeenCalled();
  });
});
