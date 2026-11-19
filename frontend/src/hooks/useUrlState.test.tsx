import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useSearchParamsPatch, useUrlNumber, useUrlState } from './useUrlState';

function LocationProbe() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function TwoSetters() {
  const [statut, setStatut] = useUrlState('statut', 'all');
  const [, setPage] = useUrlNumber('page', 1);
  const patchParams = useSearchParamsPatch();
  return (
    <>
      <p>Statut : {statut}</p>
      {/* L'ancien motif des listes : deux écritures dans le même gestionnaire. */}
      <button
        type="button"
        onClick={() => {
          setStatut('payee');
          setPage(1);
        }}
      >
        Payées
      </button>
      <button
        type="button"
        onClick={() => {
          patchParams({ transfert: 12 });
          patchParams((p) => p.delete('nouveau'));
        }}
      >
        Ouvrir le transfert
      </button>
    </>
  );
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <TwoSetters />
      <LocationProbe />
    </MemoryRouter>
  );

describe('useUrlState / useSearchParamsPatch', () => {
  it('cumule deux écritures faites dans le même gestionnaire', async () => {
    renderAt('/factures?page=3');
    fireEvent.click(screen.getByRole('button', { name: 'Payées' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('?statut=payee'));
    expect(screen.getByText('Statut : payee')).toBeInTheDocument();
  });

  it('applique une édition libre après une écriture par valeurs', async () => {
    renderAt('/stock-transfers?nouveau=1&statut=livre');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le transfert' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('?statut=livre&transfert=12'));
  });
});
