import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BonLivraisonDetail from '../BonLivraisonDetail';

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
  bonLivraisonService: { getById: vi.fn(), updateStatut: vi.fn(), convertToFacture: vi.fn(), downloadPdf: vi.fn() },
  companySettingsService: { get: vi.fn() },
}));

import { bonLivraisonService } from '@/services/api';

const bon = (overrides: Record<string, unknown> = {}) => ({
  id: 6,
  numero_bl: 'BL-2026-00006',
  statut: 'valide',
  tiers_id: 15,
  client_nom: 'BAMBA',
  client_prenom: 'Souleymane',
  date_bl: '2026-10-23',
  date_livraison_prevue: '2026-10-25',
  location_nom: 'Hitek Plateau',
  total: '28000',
  notes: null,
  lignes: [
    {
      id: 1,
      produit_id: 3,
      produit_nom: 'Sac à dos laptop 15,6″',
      produit_reference: 'INF-SAC-001',
      quantite: 1,
      quantite_livree: 0,
      prix_unitaire: '28000',
      total_ligne: '28000',
    },
  ],
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/bons-livraison/6']}>
      <Routes>
        <Route path="/bons-livraison/:id" element={<BonLivraisonDetail />} />
      </Routes>
    </MemoryRouter>
  );

/** Texte d'un nœud, espaces insécables normalisés. */
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ').trim();

describe('BonLivraisonDetail — ligne d’en-tête (T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 2, role: 'manager' };
    vi.mocked(bonLivraisonService.getById).mockResolvedValue(bon());
  });

  it('puts the planned delivery and the location on the header line and drops the « Informations » card', async () => {
    renderPage();

    const prevue = await screen.findByText('livraison prévue le 25 oct. 2026');
    const line = prevue.closest('p');
    expect(textOf(line)).toBe(
      'BAMBA Souleymane · 23 oct. 2026 · livraison prévue le 25 oct. 2026 · Emplacement : Hitek Plateau'
    );
    expect(within(line as HTMLElement).getByRole('link', { name: 'BAMBA Souleymane' })).toHaveAttribute(
      'href',
      '/tiers/15'
    );
    expect(screen.queryByRole('heading', { name: 'Informations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Date du bon')).not.toBeInTheDocument();
  });

  it('keeps client and date only when no delivery date or location is set', async () => {
    vi.mocked(bonLivraisonService.getById).mockResolvedValue(bon({ date_livraison_prevue: null, location_nom: null }));
    renderPage();
    const client = await screen.findByRole('link', { name: 'BAMBA Souleymane' });
    expect(textOf(client.closest('p'))).toBe('BAMBA Souleymane · 23 oct. 2026');
  });
});
