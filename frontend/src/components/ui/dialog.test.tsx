import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './dialog';
import { ConfirmProvider, useConfirm } from './confirm-dialog';
import { PageHeader } from './page-header';
import { Button } from './button';

/**
 * Toutes les fenêtres de l'application s'ouvrent depuis un état (`open={…}`),
 * sans `DialogTrigger` : Radix n'avait alors rien à quoi rendre le focus, qui
 * tombait sur `<body>` à la fermeture (A11Y-G01).
 */
function StateDialog({
  autoFocusField = false,
  onCloseAutoFocus,
  removeOpenerOnClose = false,
}: {
  autoFocusField?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  removeOpenerOnClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openerGone, setOpenerGone] = useState(false);
  return (
    <main id="contenu-principal">
      <h1 tabIndex={-1}>Facture FAC-2026-00110</h1>
      {!openerGone && (
        <Button type="button" onClick={() => setOpen(true)}>
          Enregistrer un paiement
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && removeOpenerOnClose) setOpenerGone(true);
        }}
      >
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>Reste dû : 64 080 FCFA</DialogDescription>
          <label htmlFor="montant">Montant reçu</label>
          <input id="montant" autoFocus={autoFocusField} />
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

describe('Dialog — retour du focus (A11Y-G01)', () => {
  it('rend le focus au bouton qui a ouvert la fenêtre, après Échap', async () => {
    const user = userEvent.setup();
    render(<StateDialog />);
    const opener = screen.getByRole('button', { name: 'Enregistrer un paiement' });

    await user.click(opener);
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('retrouve l’élément d’origine même quand un champ `autoFocus` prend le focus à l’ouverture', async () => {
    const user = userEvent.setup();
    render(<StateDialog autoFocusField />);
    const opener = screen.getByRole('button', { name: 'Enregistrer un paiement' });

    await user.click(opener);
    await waitFor(() => expect(screen.getByLabelText('Montant reçu')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('laisse la main à l’appelant qui empêche le retour (navigation vers une autre page)', async () => {
    const user = userEvent.setup();
    let called = 0;
    render(
      <StateDialog
        onCloseAutoFocus={(event) => {
          called += 1;
          event.preventDefault();
        }}
      />
    );
    const opener = screen.getByRole('button', { name: 'Enregistrer un paiement' });

    await user.click(opener);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(called).toBe(1));
    expect(opener).not.toHaveFocus();
  });

  it('se replie sur le titre de la page quand l’élément d’origine a disparu', async () => {
    const user = userEvent.setup();
    render(<StateDialog removeOpenerOnClose />);

    await user.click(screen.getByRole('button', { name: 'Enregistrer un paiement' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
  });

  it('fenêtre ouverte depuis « Plus d’actions » : le focus revient au bouton du menu', async () => {
    const user = userEvent.setup();
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <PageHeader
            title="Devis DEV-2026-00010"
            moreActions={[{ label: 'Supprimer le devis', destructive: true, onSelect: () => setOpen(true) }]}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Supprimer le devis DEV-2026-00010 ?</DialogTitle>
              <Button type="button" onClick={() => setOpen(false)}>
                Annuler
              </Button>
            </DialogContent>
          </Dialog>
        </MemoryRouter>
      );
    }
    render(<Page />);
    const trigger = screen.getByRole('button', { name: 'Plus d’actions' });

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer le devis' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('confirmation (`useConfirm`) : « Annuler » rend le focus au bouton d’origine', async () => {
    const user = userEvent.setup();
    function DeleteButton() {
      const confirm = useConfirm();
      return (
        <Button
          type="button"
          onClick={() =>
            void confirm({ title: 'Supprimer la dépense ?', confirmLabel: 'Supprimer la dépense', destructive: true })
          }
        >
          Supprimer
        </Button>
      );
    }
    render(
      <ConfirmProvider>
        <DeleteButton />
      </ConfirmProvider>
    );
    const opener = screen.getByRole('button', { name: 'Supprimer' });

    await user.click(opener);
    // Action destructive : le focus initial est sur « Annuler ».
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus());
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('Dialog — mise en page', () => {
  it('piste unique `minmax(0,1fr)` : un tableau large défile au lieu d’élargir la fenêtre (GV-06)', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Clôturer la caisse</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('grid-cols-[minmax(0,1fr)]');
    // Un champ atteint au clavier ne s'arrête pas sous un pied collant (A11Y-G02).
    expect(cls).toContain('scroll-pb-36');
  });

  it('un code de document du titre n’est jamais coupé à ses tirets', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Décider de la demande DEM-2026-00002</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Décider de la demande DEM-2026-00002');
    expect(screen.getByText('DEM-2026-00002')).toHaveClass('whitespace-nowrap');
  });

  it('pied collant en option', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Clôturer la caisse</DialogTitle>
          <DialogFooter sticky data-testid="footer">
            <Button type="button">Clôturer la caisse</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    // M-A : la limite se mesure depuis la boîte de contenu de la fenêtre. Le
    // décalage négatif égal au padding (`-bottom-4 sm:-bottom-6`) laisse le
    // pied à sa place quand rien ne défile ; `bottom-0` le faisait remonter de
    // 24 px sur le dernier champ (« Notes », « Commentaire »).
    const footer = screen.getByTestId('footer');
    expect(footer).toHaveClass('sticky', '-bottom-4', 'sm:-bottom-6', '-mb-4', 'sm:-mb-6', 'bg-popover');
    expect(footer).not.toHaveClass('bottom-0');
  });
});
