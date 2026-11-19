import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Factures from '../Factures';
import { factureService } from '../../services/api';

vi.mock('../../services/api', () => ({
  factureService: {
    getAll: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 0 } }),
    exportAll: vi.fn().mockResolvedValue({ data: [] }),
    getStats: vi.fn().mockResolvedValue({
      total_factures: { count: 0, montant: 0 },
      factures_mois: { count: 0, montant: 0 },
      alertes_stock: 0,
    }),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Texte d'un nœud, espaces insécables normalisés. */
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ').trim();

const row = (overrides: Record<string, unknown>) => ({
  client_prenom: null,
  date_facture: '2026-10-21',
  ...overrides,
});

describe('Factures', () => {
  beforeEach(() => {
    vi.mocked(factureService.getAll).mockResolvedValue({ data: [], pagination: { total: 0, totalPages: 0 } });
  });

  it('should render the Exporter en CSV button', async () => {
    render(<Factures />);
    const csvButton = screen.getByText('Exporter en CSV');
    expect(csvButton).toBeDefined();
  });

  it('builds the status filters from the badge words (U-29)', () => {
    render(<Factures />);
    const filters = screen.getByRole('group', { name: 'Filtrer par statut' });
    // Un mot par état, le même que la pastille : plus de « En attente » / « Partielle ».
    expect(filters).toHaveTextContent('Non payée');
    expect(filters).toHaveTextContent('Partiellement payée');
    expect(filters).not.toHaveTextContent('Partielle ');
    expect(screen.queryByText('En attente')).not.toBeInTheDocument();
  });

  it('offers the create action as a real link, not a button inside a link', () => {
    render(<Factures />);
    const create = screen.getAllByRole('link', { name: /Nouvelle facture/ })[0];
    expect(create).toHaveAttribute('href', '/factures/nouvelle');
    expect(create.querySelector('button')).toBeNull();
  });

  it('gives « Reste dû » its own column after « Payé », one line per row (T2)', async () => {
    vi.mocked(factureService.getAll).mockResolvedValue({
      data: [
        row({
          id: 110,
          numero_facture: 'FAC-2026-00110',
          client_nom: 'CompuServices SARL',
          total: '178000',
          montant_paye: '113920',
          remaining_due: '64080',
          statut: 'partielle',
        }),
        row({
          id: 111,
          numero_facture: 'FAC-2026-00111',
          client_nom: 'TRAORÉ',
          client_prenom: 'Mariama',
          total: '503000',
          montant_paye: '503000',
          remaining_due: '0',
          statut: 'payee',
        }),
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    render(<Factures />);

    const table = await screen.findByRole('table', { name: 'Factures' });
    await within(table).findByText('FAC-2026-00110');
    const headers = within(table).getAllByRole('columnheader').map((h) => textOf(h));
    const resteIndex = headers.indexOf('Reste dû');
    expect(resteIndex).toBe(headers.indexOf('Payé') + 1);
    // Le serveur ne trie pas sur le reste dû : en-tête sans bouton de tri.
    expect(within(within(table).getByRole('columnheader', { name: 'Reste dû' })).queryByRole('button')).toBeNull();

    const cellsOf = (numero: string) => within(table).getByText(numero).closest('tr')!.children;
    const partielle = cellsOf('FAC-2026-00110');
    expect(textOf(partielle[resteIndex - 1])).toBe('113 920 FCFA');
    expect(textOf(partielle[resteIndex])).toBe('64 080 FCFA');
    // Plus de deuxième ligne « Reste : … » sous le montant payé.
    expect(within(table).queryByText(/Reste :/)).not.toBeInTheDocument();

    // Facture soldée : un zéro estompé, pas un tiret (le montant est connu).
    const payee = cellsOf('FAC-2026-00111');
    expect(textOf(payee[resteIndex])).toBe('0 FCFA');
    expect(payee[resteIndex].querySelector('span')).toHaveClass('text-muted-foreground');
  });
});
