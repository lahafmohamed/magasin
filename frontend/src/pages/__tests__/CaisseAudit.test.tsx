import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CaisseAudit from '../CaisseAudit';

vi.mock('@/services/api', () => ({
  caisseService: { getAudit: vi.fn() },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin' } }),
  useOptionalAuth: () => ({ user: { id: 1, role: 'admin' } }),
}));

import { caisseService } from '@/services/api';

const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ');

const renderPage = (url = '/caisse/audit') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <CaisseAudit />
    </MemoryRouter>
  );

describe('CaisseAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows « Indisponible », never a reassuring 0, when the audit fails to load', async () => {
    (caisseService.getAudit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('réseau'));
    renderPage();

    expect(await screen.findByText('Impossible de charger l’audit de caisse')).toBeInTheDocument();
    const tile = screen.getByText('Paiements en espèces hors caisse').closest('.rounded-lg');
    expect(textOf(tile)).toContain('Indisponible');
    expect(textOf(tile)).not.toMatch(/\b0\b/);
    expect(screen.queryByText('Tous les paiements en espèces sont rapprochés')).not.toBeInTheDocument();
  });

  it('says in words that everything is reconciled when there is no orphan', async () => {
    (caisseService.getAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          source_kind: 'paiement',
          source_id: 98,
          source_date: '2026-10-23',
          tiers_id: 9,
          methode_paiement: 'espece',
          montant: '131500.00',
          session_caisse_id: 3,
          mouvement_caisse_id: 8,
          is_orphan: false,
        },
      ],
      summary: [{ source_kind: 'paiement', total: '1', total_montant: '131500.00', orphans: '0' }],
      orphans_total: 0,
    });
    renderPage();

    expect(await screen.findByText('Tous les paiements en espèces sont rapprochés')).toBeInTheDocument();
    expect(screen.getAllByText('Rapproché').length).toBeGreaterThan(0);
    // Le client est un lien vers sa fiche, pas un identifiant brut.
    expect(screen.getAllByRole('link', { name: 'Contact n° 9' })[0]).toHaveAttribute('href', '/tiers/9');
  });

  it('flags cash payments that never reached the till', async () => {
    (caisseService.getAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          source_kind: 'acompte_client',
          source_id: 17,
          source_date: '2026-10-23',
          tiers_id: null,
          methode_paiement: 'espece',
          montant: '500000.00',
          session_caisse_id: null,
          mouvement_caisse_id: null,
          is_orphan: true,
        },
      ],
      summary: [{ source_kind: 'acompte_client', total: '1', total_montant: '500000.00', orphans: '1' }],
      orphans_total: 1,
    });
    renderPage();

    expect((await screen.findAllByText('Hors caisse')).length).toBeGreaterThan(0);
    const tile = screen.getByText('Paiements en espèces hors caisse').closest('.rounded-lg');
    expect(textOf(tile)).toContain('1');
    expect(textOf(tile)).toContain('Sans mouvement de caisse : signalez-les à votre administrateur');
  });

  it('says « Hors espèces » in plain text, keeping pills for the exceptions', async () => {
    (caisseService.getAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          source_kind: 'paiement',
          source_id: 101,
          source_date: '2026-10-23',
          tiers_id: 9,
          tiers_nom: 'Pharmacie de l’Indénié',
          methode_paiement: 'virement',
          montant: '630630.00',
          session_caisse_id: null,
          mouvement_caisse_id: null,
          is_orphan: false,
        },
      ],
      summary: [{ source_kind: 'paiement', total: '1', total_montant: '630630.00', orphans: '0' }],
      orphans_total: 0,
    });
    renderPage();

    const plain = (await screen.findAllByText('Hors espèces'))[0];
    expect(plain.className).toContain('text-muted-foreground');
    expect(plain.className).not.toContain('rounded-full');
    // Le contact est un lien neutre (souligné au survol), pas un lien bleu.
    const contact = screen.getAllByRole('link', { name: 'Pharmacie de l’Indénié' })[0];
    expect(contact.className).not.toContain('text-primary');
  });

  it('opens filtered on the cash payments outside the till from the dashboard link', async () => {
    (caisseService.getAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], summary: [], orphans_total: 0 });
    renderPage('/caisse/audit?orphans_only=true&date_from=2026-10-01&date_to=pas-une-date');

    await waitFor(() =>
      expect(caisseService.getAudit).toHaveBeenCalledWith(
        expect.objectContaining({ orphans_only: true, date_from: '2026-10-01', date_to: undefined })
      )
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
