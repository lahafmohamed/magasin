import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CaisseHistorique from '../CaisseHistorique';
import { caisseService } from '@/services/api';

vi.mock('@/services/api', () => ({
  caisseService: { getHistorique: vi.fn(), getMagasins: vi.fn() },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'manager' } }),
  useOptionalAuth: () => ({ user: { id: 1, role: 'manager' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <CaisseHistorique />
    </MemoryRouter>
  );

describe('Historique des caisses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(caisseService.getMagasins).mockResolvedValue([{ id: 2, code: 'PLT', nom: 'Hitek Plateau' }]);
    vi.mocked(caisseService.getHistorique).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('applique les filtres portés par l’adresse (lien du tableau de bord)', async () => {
    renderAt('/caisse/historique?from=2026-10-17&magasin_id=2');
    await waitFor(() =>
      expect(caisseService.getHistorique).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-10-17', magasin_id: 2, to: undefined, page: 1 })
      )
    );
    // Filtre actif : l'état vide le dit et propose de l'effacer.
    expect(await screen.findByText('Aucune session ne correspond à ce magasin et à ces dates')).toBeInTheDocument();
  });

  it('ignore une date mal formée plutôt que de l’envoyer au serveur', async () => {
    renderAt('/caisse/historique?from=hier');
    await waitFor(() =>
      expect(caisseService.getHistorique).toHaveBeenCalledWith(expect.objectContaining({ from: undefined }))
    );
  });

  describe('avec une session clôturée', () => {
    // Heures locales (sans fuseau) : l'affichage ne dépend pas de la machine de test.
    const session = {
      id: 7,
      magasin_id: 2,
      magasin_nom: 'Hitek Plateau',
      magasin_code: 'PLT',
      statut: 'cloturee',
      date_ouverture: '2026-10-23T13:08:00',
      date_cloture: '2026-10-23T18:42:00',
      fond_initial: '50000.00',
      fond_final_compte: '665560.00',
      expected_cash: '666000.00',
      ecart: '-440.00',
      ouvert_par_username: 'a.yao',
      cloture_par_username: 'm.kone',
    };

    beforeEach(() => {
      vi.mocked(caisseService.getHistorique).mockResolvedValue({
        data: [session],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('tient en six colonnes au plus, avec la période et l’écart (GV-03)', async () => {
      renderAt('/caisse/historique');
      const table = await screen.findByRole('table', { name: 'Sessions de caisse clôturées' });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent?.trim());

      expect(headers.length).toBeLessThanOrEqual(6);
      expect(headers).toEqual(expect.arrayContaining(['Période', 'Écart']));
      expect(headers).not.toContain('Fonds initial');
      expect(headers).not.toContain('Clôturée par');
      expect(headers).not.toContain('Ouverture');

      // Ouverture et clôture dans une seule cellule ; la date n'est pas répétée le même jour.
      const row = within(table).getAllByRole('row')[1];
      expect(row.textContent?.replace(/\s+/g, ' ')).toMatch(/23 oct\. 2026, 13:08 → jusqu’à 18:42/);
      // L'écart entier, signe compris.
      expect(row.textContent?.replace(/\s+/g, ' ')).toMatch(/−440 FCFA/);
    });

    it('garde le fonds initial et l’auteur de la clôture dans le détail de la session', async () => {
      renderAt('/caisse/historique');
      const table = await screen.findByRole('table', { name: 'Sessions de caisse clôturées' });
      fireEvent.click(within(table).getByRole('button', { name: /n° 7/ }));

      const dialog = await screen.findByRole('dialog');
      const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
      expect(within(dialog).getByText('Fonds initial')).toBeInTheDocument();
      expect(text).toContain('50 000 FCFA');
      expect(within(dialog).getByText('Clôturée par')).toBeInTheDocument();
      expect(text).toContain('m.kone');
    });
  });
});
