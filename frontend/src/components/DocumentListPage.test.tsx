import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { DocumentListPage, useDocumentList, type DocumentColumn } from './DocumentListPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface Row {
  id: number;
  numero: string;
  statut: string;
}

const fetchList = vi.fn();

const COLUMNS: DocumentColumn<Row>[] = [
  { header: 'Numéro', primary: true, sortKey: 'numero', render: (r) => r.numero },
  { header: 'Statut', render: (r) => r.statut },
];

function Harness({ selectable }: { selectable?: boolean }) {
  const list = useDocumentList<Row>({
    defaultSortKey: 'date',
    extraFilters: { type: 'tous' },
    fetchList,
    loadErrorMessage: 'Impossible de charger les factures.',
  });
  return (
    <DocumentListPage<Row>
      list={list}
      title="Factures"
      createButton={null}
      statTiles={() => []}
      searchPlaceholder="Numéro ou client… ( / )"
      searchLabel="Rechercher une facture"
      statusChips={[
        { value: 'all', label: 'Toutes' },
        { value: 'payee', label: 'Payée' },
      ]}
      extraFilters={
        <>
          <button type="button" onClick={() => list.setExtra('type', 'retour')}>
            Type retour
          </button>
          <button type="button" onClick={() => list.setLimit(50)}>
            50 par page
          </button>
        </>
      }
      shortcuts={{ newRoute: '/factures/nouvelle', newDescription: 'Nouvelle facture' }}
      csv={{ filenamePrefix: 'factures', headers: [], row: () => [], fetchAll: async () => [] }}
      bulkActions={<button type="button">Action groupée</button>}
      selectable={selectable}
      columns={COLUMNS}
      detailPath={(r) => `/factures/${r.id}`}
      rowAriaLabel={(r) => `Sélectionner la facture ${r.numero}`}
      emptyState={{
        icon: FileText,
        title: 'Aucune facture pour le moment',
        filteredTitle: 'Aucune facture ne correspond à ces filtres',
        createAction: null,
      }}
    />
  );
}

/** Affiche la query-string courante du routeur — ce que l'utilisateur voit dans la barre d'adresse. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}

function renderAt(url: string, selectable?: boolean) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Harness selectable={selectable} />
      <LocationProbe />
    </MemoryRouter>
  );
}

const urlParams = () => new URLSearchParams(screen.getByTestId('url').textContent ?? '');

describe('DocumentListPage — filtres portés par l’adresse', () => {
  beforeEach(() => {
    fetchList.mockReset();
    fetchList.mockResolvedValue({
      data: [{ id: 1, numero: 'FAC-2026-00001', statut: 'payee' }],
      pagination: { total: 1, totalPages: 1 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applique le statut choisi et revient à la première page', async () => {
    renderAt('/factures?page=3');
    await waitFor(() => expect(fetchList).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Payée' }));

    await waitFor(() => expect(urlParams().get('statut')).toBe('payee'));
    expect(urlParams().has('page')).toBe(false);
    await waitFor(() =>
      expect(fetchList).toHaveBeenLastCalledWith('', 'payee', 1, 20, 'date', 'desc', { type: 'tous' })
    );
  });

  it('valide la recherche après la pause de frappe sans perdre le statut', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt('/factures?statut=payee&page=2');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une facture' }), {
      target: { value: 'kouassi' },
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => expect(urlParams().get('q')).toBe('kouassi'));
    expect(urlParams().get('statut')).toBe('payee');
    expect(urlParams().has('page')).toBe(false);
  });

  it('garde la recherche tapée quand un statut est choisi avant la fin de la pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt('/factures');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une facture' }), {
      target: { value: 'kouassi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Payée' }));
    await waitFor(() => expect(urlParams().get('statut')).toBe('payee'));
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => expect(urlParams().get('q')).toBe('kouassi'));
    expect(urlParams().get('statut')).toBe('payee');
  });

  it('efface d’un coup recherche, statut, filtre de page et pagination', async () => {
    renderAt('/factures?statut=payee&q=kouassi&type=retour&page=2');
    await waitFor(() => expect(fetchList).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: /Effacer les filtres/ })[0]);

    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe(''));
    expect(screen.getByRole('searchbox', { name: 'Rechercher une facture' })).toHaveValue('');
  });

  it('revient à la première page quand un filtre propre à la page change', async () => {
    renderAt('/factures?page=4');
    fireEvent.click(screen.getByRole('button', { name: 'Type retour' }));
    await waitFor(() => expect(urlParams().get('type')).toBe('retour'));
    expect(urlParams().has('page')).toBe(false);
  });

  it('trie toute la liste depuis la première page', async () => {
    renderAt('/factures?page=3');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Numéro' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Numéro' }));
    await waitFor(() => expect(urlParams().get('sort')).toBe('numero'));
    expect(urlParams().get('order')).toBe('asc');
    expect(urlParams().has('page')).toBe(false);
  });

  it('change la taille de page depuis la première page', async () => {
    renderAt('/factures?page=3');
    fireEvent.click(screen.getByRole('button', { name: '50 par page' }));
    await waitFor(() => expect(urlParams().get('limit')).toBe('50'));
    expect(urlParams().has('page')).toBe(false);
  });

  it('reprend la recherche de l’adresse dans le champ quand l’adresse change', async () => {
    renderAt('/factures?q=traore');
    expect(screen.getByRole('searchbox', { name: 'Rechercher une facture' })).toHaveValue('traore');
  });

  it('retire la colonne de sélection d’une liste sans action groupée', async () => {
    renderAt('/factures', false);
    await waitFor(() => expect(screen.getAllByText('FAC-2026-00001').length).toBeGreaterThan(0));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Action groupée')).toBeNull();
  });
});
