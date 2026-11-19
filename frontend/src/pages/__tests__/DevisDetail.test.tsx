import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DevisDetail from '../DevisDetail';

const auth = vi.hoisted(() => ({ user: { id: 2, role: 'manager' } as { id: number; role: string } }));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: auth.user }),
  useOptionalAuth: () => ({ user: auth.user }),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/services/api', () => ({
  devisService: { getById: vi.fn(), updateStatut: vi.fn(), delete: vi.fn(), downloadPdf: vi.fn() },
  companySettingsService: { get: vi.fn() },
}));

import { devisService } from '@/services/api';

const devis = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  numero_devis: 'DEV-2026-00007',
  statut: 'envoye',
  tiers_id: 12,
  client_nom: 'GBAGBO',
  client_prenom: 'Christelle',
  date_devis: '2026-10-18',
  date_validite: '2026-11-17',
  location_nom: 'Hitek Plateau',
  total: '56000',
  notes: null,
  lignes: [
    {
      id: 1,
      produit_id: 3,
      produit_nom: 'Sac à dos laptop 15,6″',
      produit_reference: 'INF-SAC-001',
      quantite: 2,
      prix_unitaire: '28000',
      total_ligne: '56000',
    },
  ],
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/devis/7']}>
      <Routes>
        <Route path="/devis/:id" element={<DevisDetail />} />
      </Routes>
    </MemoryRouter>
  );

/** Texte d'un nœud, espaces insécables normalisés. */
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ').trim();

describe('DevisDetail — ligne d’en-tête (T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 2, role: 'manager' };
    vi.mocked(devisService.getById).mockResolvedValue(devis());
  });

  it('puts the validity and the location on the header line, the client as a link, and drops the « Informations » card', async () => {
    renderPage();

    const validite = await screen.findByText('valable jusqu’au 17 nov. 2026');
    const line = validite.closest('p');
    // L'emplacement s'affiche sans libellé ; les lecteurs d'écran l'entendent nommé.
    expect(textOf(line)).toBe(
      'GBAGBO Christelle · 18 oct. 2026 · valable jusqu’au 17 nov. 2026 · Emplacement : Hitek Plateau'
    );
    expect(within(line as HTMLElement).getByRole('link', { name: 'GBAGBO Christelle' })).toHaveAttribute(
      'href',
      '/tiers/12'
    );
    // La carte répétait le client et la date de l'en-tête : chaque fait n'est plus dit qu'une fois.
    expect(screen.queryByRole('heading', { name: 'Informations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Date du devis')).not.toBeInTheDocument();
  });

  it('leaves out the validity and the location when the quote has none', async () => {
    vi.mocked(devisService.getById).mockResolvedValue(devis({ date_validite: null, location_nom: null }));
    renderPage();
    const client = await screen.findByRole('link', { name: 'GBAGBO Christelle' });
    expect(textOf(client.closest('p'))).toBe('GBAGBO Christelle · 18 oct. 2026');
  });

  it('names the client without a link for a role that cannot open the contact page', async () => {
    auth.user = { id: 5, role: 'caissier' };
    renderPage();
    const validite = await screen.findByText('valable jusqu’au 17 nov. 2026');
    expect(textOf(validite.closest('p'))).toMatch(/^GBAGBO Christelle · 18 oct\. 2026/);
    expect(screen.queryByRole('link', { name: 'GBAGBO Christelle' })).not.toBeInTheDocument();
  });
});
