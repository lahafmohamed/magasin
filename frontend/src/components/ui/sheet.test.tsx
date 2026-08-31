import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from './sheet';
import { Button } from './button';

/**
 * Ces garanties sont exactement ce qui manquait aux tiroirs faits main
 * (`fixed inset-0` + onClick) remplacés dans Commandes / CommandeDetail.
 */
function Harness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" showClose={false}>
        <div>
          <SheetTitle>Catalogue Produits</SheetTitle>
          <SheetDescription>Sélectionnez les articles à ajouter</SheetDescription>
        </div>
        <SheetClose asChild>
          <Button aria-label="Fermer le catalogue">×</Button>
        </SheetClose>
        <Button>Ajouter</Button>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('expose un dialogue nommé par son titre et sa description', () => {
    render(<Harness onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Catalogue Produits');
    expect(dialog).toHaveAccessibleDescription('Sélectionnez les articles à ajouter');
  });

  it('se ferme avec la touche Échap', async () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('se ferme via SheetClose', async () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fermer le catalogue' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('déplace le focus dans le tiroir et masque le reste de la page', async () => {
    render(
      <>
        <button type="button">Bouton hors tiroir</button>
        <Harness onOpenChange={vi.fn()} />
      </>
    );

    await waitFor(() =>
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    );
    // Le contenu sous-jacent est retiré de l'arbre d'accessibilité par Radix.
    expect(screen.queryByRole('button', { name: 'Bouton hors tiroir' })).toBeNull();
  });
});
