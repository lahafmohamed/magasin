import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PaymentHistory } from './PaymentHistory';
import type { Paiement } from '../types';

vi.mock('../services/api', () => ({
  paiementService: { downloadRecu: vi.fn() },
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, role: 'caissier' } }),
  useOptionalAuth: () => ({ user: { id: 3, role: 'caissier' } }),
}));

/** Les montants portent des espaces insécables : on compare le texte lu. */
const lu = (el: Element | null) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();

/** Le 23 octobre de l'année en cours : la phrase dit « du 23 oct. » sans l'année. */
const LE_23_OCTOBRE = new Date(new Date().getFullYear(), 9, 23, 13, 8).toISOString();

const paiement = (over: Partial<Paiement>): Paiement => ({
  id: 1,
  facture_id: 113,
  montant: 0,
  methode_paiement: 'espece',
  date_paiement: LE_23_OCTOBRE,
  reference: null,
  notes: null,
  source: 'direct',
  ...over,
});

function renderHistory(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/**
 * E1-R1 : après la ré-imputation E1, FAC-2026-00113 (payée 267 000 FCFA)
 * listait 316 400 FCFA de paiements et FAC-2026-00079 affichait « Payé
 * 76 000 FCFA » au-dessus d'un seul paiement de 26 600 FCFA. Chaque page dit
 * maintenant où est allé l'excédent et d'où vient ce qui a été reçu.
 */
describe('PaymentHistory — paiements reportés entre factures (E1-R1)', () => {
  it('la facture payée au-delà de son total dit où est allé l’excédent, avec un lien', () => {
    renderHistory(
      <PaymentHistory
        paiements={[
          paiement({ id: 92, montant: 267000, methode_paiement: 'cheque' }),
          paiement({ id: 99, montant: 49400, notes: 'Solde du compte client, payé en espèces' }),
        ]}
        reports={{
          excedent_reporte: [
            {
              facture_id: 79,
              numero_facture: 'FAC-2026-00079',
              montant: 49400,
              paiement_id: 99,
              methode_paiement: 'espece',
              date_paiement: LE_23_OCTOBRE,
            },
          ],
          recu_par_report: [],
          excedent_non_affecte: 0,
        }}
      />
    );

    const liste = screen.getByRole('list', { name: 'Paiements reportés entre factures' });
    const items = within(liste).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(lu(items[0])).toBe('Dont 49 400 FCFA reportés sur FAC-2026-00079 : cette facture était déjà soldée.');
    expect(within(items[0]).getByRole('link', { name: 'FAC-2026-00079' })).toHaveAttribute('href', '/factures/79');
  });

  it('la facture plus ancienne qui a reçu l’excédent dit d’où il vient (paiement, mode, date)', () => {
    renderHistory(
      <PaymentHistory
        paiements={[paiement({ id: 65, facture_id: 79, montant: 26600, methode_paiement: 'orange_money' })]}
        reports={{
          excedent_reporte: [],
          recu_par_report: [
            {
              facture_id: 113,
              numero_facture: 'FAC-2026-00113',
              montant: '49400.00',
              paiement_id: 99,
              methode_paiement: 'espece',
              date_paiement: LE_23_OCTOBRE,
            },
          ],
          excedent_non_affecte: 0,
        }}
      />
    );

    const items = within(screen.getByRole('list', { name: 'Paiements reportés entre factures' })).getAllByRole('listitem');
    expect(lu(items[0])).toBe('Dont 49 400 FCFA reportés depuis FAC-2026-00113 (paiement en espèces du 23 oct.).');
    expect(within(items[0]).getByRole('link', { name: 'FAC-2026-00113' })).toHaveAttribute('href', '/factures/113');
  });

  it('une facture annulée dit que ses paiements sont reportés parce qu’elle est annulée', () => {
    renderHistory(
      <PaymentHistory
        factureAnnulee
        paiements={[paiement({ id: 7, facture_id: 12, montant: 5000, methode_paiement: 'virement' })]}
        reports={{
          excedent_reporte: [
            {
              facture_id: 9,
              numero_facture: 'FAC-2026-00009',
              montant: 5000,
              paiement_id: 7,
              methode_paiement: 'virement',
              date_paiement: LE_23_OCTOBRE,
            },
          ],
          recu_par_report: [],
          excedent_non_affecte: '2000.00',
        }}
      />
    );

    const items = within(screen.getByRole('list', { name: 'Paiements reportés entre factures' })).getAllByRole('listitem');
    expect(items.map(lu)).toEqual([
      'Dont 5 000 FCFA reportés sur FAC-2026-00009 : cette facture est annulée.',
      'Dont 2 000 FCFA payés en trop : aucune autre facture de ce client n’était ouverte à la date du paiement.',
    ]);
  });

  it('une facture réglée seulement par un report l’explique au lieu d’annoncer des paiements à venir', () => {
    renderHistory(
      <PaymentHistory
        paiements={[]}
        reports={{
          excedent_reporte: [],
          recu_par_report: [
            {
              facture_id: 113,
              numero_facture: 'FAC-2026-00113',
              montant: 49400,
              paiement_id: 99,
              methode_paiement: 'cheque',
              date_paiement: '2025-03-02T10:00:00.000Z',
            },
          ],
          excedent_non_affecte: 0,
        }}
      />
    );

    expect(screen.queryByText('Aucun paiement enregistré')).not.toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Paiements reportés entre factures' })).getAllByRole('listitem');
    expect(lu(items[0])).toBe('49 400 FCFA reportés depuis FAC-2026-00113 (paiement par chèque du 2 mars 2025) règlent cette facture.');
  });

  it('sans report, rien de plus que la liste des paiements', () => {
    renderHistory(
      <PaymentHistory
        paiements={[paiement({ id: 3, montant: 10000 })]}
        reports={{ excedent_reporte: [], recu_par_report: [], excedent_non_affecte: 0 }}
      />
    );
    expect(screen.queryByRole('list', { name: 'Paiements reportés entre factures' })).not.toBeInTheDocument();
  });
});
