import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GeneralLedger from '../GeneralLedger';
import { generalLedgerService } from '@/services/api';

vi.mock('@/services/api', () => ({
  generalLedgerService: {
    getAll: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
    getChartOfAccounts: vi.fn().mockResolvedValue([]),
    getTrialBalance: vi.fn().mockResolvedValue([]),
    exportAll: vi.fn(),
    exportPdf: vi.fn(),
    exportBalanceSheetPdf: vi.fn(),
    exportIncomeStatementPdf: vi.fn(),
  },
  comptabiliteService: {
    enregistrerPiece: vi.fn(),
    getGrandLivre: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <GeneralLedger />
    </MemoryRouter>
  );

const EMPTY_PAGE = { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };

/** Ligne d'écriture telle que la renvoie `GET /general-ledger`. */
const ligne = (over: Record<string, unknown>) => ({
  id: 1,
  numero_piece: 'FAC-2026-00116',
  date_ecriture: '2026-10-23T10:00:00.000Z',
  journal: 'VENTES',
  piece_id: null,
  piece_type: null,
  ligne_numero: 1,
  compte_id: 1,
  compte_numero: '411',
  compte_intitule: 'Clients',
  debit: '398000.00',
  credit: '0.00',
  description: 'Vente client - FAC-2026-00116',
  source_id: 116,
  source_type: 'facture',
  ...over,
});

/** Deux pièces de deux lignes : une vente (liée à sa facture), un apport en caisse. */
const ECRITURES = [
  ligne({ id: 1 }),
  ligne({
    id: 2,
    ligne_numero: 2,
    compte_numero: '701',
    compte_intitule: 'Ventes de marchandises',
    debit: '0.00',
    credit: '398000.00',
    description: 'Chiffre d’affaires - FAC-2026-00116',
  }),
  ligne({
    id: 3,
    numero_piece: 'PC-2026-00001',
    journal: 'TRESORERIE',
    compte_numero: '53',
    compte_intitule: 'Caisse (espèces)',
    debit: '25000.00',
    description: 'Apport de monnaie',
    source_id: null,
    source_type: null,
  }),
  ligne({
    id: 4,
    numero_piece: 'PC-2026-00001',
    journal: 'TRESORERIE',
    ligne_numero: 2,
    compte_numero: '75',
    compte_intitule: 'Autres produits',
    debit: '0.00',
    credit: '25000.00',
    description: 'Apport de monnaie',
    source_id: null,
    source_type: null,
  }),
];

describe('GeneralLedger', () => {
  beforeEach(() => {
    vi.mocked(generalLedgerService.getAll).mockResolvedValue(EMPTY_PAGE);
  });

  it('groups the exports in one menu next to the primary action', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Nouvelle écriture/ })).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Exporter/ });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(await screen.findByRole('menuitem', { name: /Exporter en CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Exporter en PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Télécharger le bilan/ })).toBeInTheDocument();
  });

  it('orients an empty journal towards the next action', async () => {
    renderPage();
    expect(await screen.findByText('Aucune écriture sur la période')).toBeInTheDocument();
    expect(screen.getByText(/créent leurs écritures automatiquement/)).toBeInTheDocument();
  });

  it('writes a pièce’s number, date and journal once, its lines forming one débit/crédit block', async () => {
    vi.mocked(generalLedgerService.getAll).mockResolvedValue({
      data: ECRITURES,
      pagination: { page: 1, limit: 50, total: 4, totalPages: 1 },
    });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Écritures comptables' });

    // Une fois par pièce, plus à chaque ligne.
    expect(within(table).getAllByRole('link', { name: 'Ouvrir la pièce FAC-2026-00116' })).toHaveLength(1);
    expect(within(table).getAllByText('PC-2026-00001')).toHaveLength(1);
    expect(within(table).getAllByText('Ventes')).toHaveLength(1);
    expect(within(table).getAllByText('Trésorerie')).toHaveLength(1);
    expect(within(table).getAllByText(/23 oct\. 2026/)).toHaveLength(2);

    // Un groupe de lignes par pièce (le premier groupe est l'en-tête du tableau).
    const [, vente, apport] = within(table).getAllByRole('rowgroup');
    expect(within(table).getAllByRole('rowgroup')).toHaveLength(3);
    const rows = within(vente).getAllByRole('row');
    expect(rows).toHaveLength(2);
    // Numéro, date et journal couvrent les deux lignes ; la seconde ne porte que compte, libellé et montants.
    within(rows[0])
      .getAllByRole('cell')
      .slice(0, 3)
      .forEach((cell) => expect(cell).toHaveAttribute('rowspan', '2'));
    expect(within(rows[1]).getAllByRole('cell')).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('701 Ventes de marchandises');
    expect(rows[1]).toHaveTextContent('398 000');
    // Aucun trait entre les lignes d'une pièce : il sépare les pièces.
    rows.forEach((row) => expect(row.className).toContain('border-b-0'));
    expect(vente.className).toMatch(/(^|\s)border-b(\s|$)/);
    expect(within(apport).getAllByRole('row')).toHaveLength(2);
  });

  it('shows one phone card per pièce, listing its lines with their side', async () => {
    vi.mocked(generalLedgerService.getAll).mockResolvedValue({
      data: ECRITURES,
      pagination: { page: 1, limit: 50, total: 4, totalPages: 1 },
    });
    const { container } = renderPage();
    await screen.findByRole('table', { name: 'Écritures comptables' });

    const cards = container.querySelectorAll('article');
    expect(cards).toHaveLength(2);
    const vente = cards[0] as HTMLElement;
    expect(within(vente).getByRole('link', { name: 'Ouvrir la pièce FAC-2026-00116' })).toHaveAttribute('href', '/factures/116');
    const lignes = within(vente).getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toHaveTextContent('411 Clients');
    expect(lignes[0]).toHaveTextContent('Débit');
    expect(lignes[1]).toHaveTextContent('Crédit');
  });

  it('repeats a pièce’s header at the top of a page when the pièce began on the previous one', async () => {
    // Page 2 : la ligne crédit de la vente ouvre la page, son débit est resté en page 1.
    vi.mocked(generalLedgerService.getAll).mockResolvedValue({
      data: ECRITURES.slice(1),
      pagination: { page: 2, limit: 3, total: 4, totalPages: 2 },
    });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Écritures comptables' });

    const firstLine = within(table).getAllByRole('row')[1];
    expect(within(firstLine).getByRole('link', { name: 'Ouvrir la pièce FAC-2026-00116' })).toBeInTheDocument();
    expect(within(firstLine).getByText('Ventes')).toBeInTheDocument();
    expect(firstLine).toHaveTextContent('23 oct. 2026');
  });
});
