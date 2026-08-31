import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';
import { Badge } from './badge';
import { Card, CardContent } from './card';
import { Table, TableBody, TableCell, TableRow } from './table';

/**
 * Garde-fous sur les primitives partagées : chacune de ces classes corrige un
 * défaut constaté à l'audit du 2026-08-27 et se propage à toute l'application,
 * donc une régression silencieuse ici est coûteuse.
 */
describe('primitives — règles d\'interface', () => {
  it('Button : retour tactile à l\'appui, transition sur des propriétés nommées', () => {
    render(<Button>Enregistrer</Button>);
    const cls = screen.getByRole('button').className;

    expect(cls).toContain('active:scale-[0.97]');
    // `transform`, pas `scale` : en Tailwind 3 les utilitaires scale-* écrivent
    // dans `transform`, transitionner `scale` n'animerait rien.
    expect(cls).toContain('transition-[color,background-color,border-color,opacity,transform]');
    expect(cls).not.toContain('transition-all');
  });

  it('Badge : les libellés de statut ne passent pas à la ligne', () => {
    render(<Badge>Partiellement livrée</Badge>);
    expect(screen.getByText('Partiellement livrée').className).toContain('whitespace-nowrap');
  });

  it('Card : rembourrage responsive, surchargeable par la page', () => {
    const { container, rerender } = render(<CardContent>contenu</CardContent>);
    expect(container.firstElementChild?.className).toContain('p-4');
    expect(container.firstElementChild?.className).toContain('sm:p-6');

    // twMerge doit laisser la page gagner sans conserver le p-4 de base.
    rerender(<CardContent className="p-0">contenu</CardContent>);
    expect(container.firstElementChild?.className).toContain('p-0');
    expect(container.firstElementChild?.className).not.toMatch(/\bp-4\b/);
  });

  it('Card : le conteneur garde son rayon', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild?.className).toContain('rounded-lg');
  });

  it('Table : chiffres tabulaires par défaut, survol de ligne non animé', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>1 250 000</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('cell').className).toContain('tabular-nums');
    expect(screen.getByRole('row').className).not.toContain('transition-colors');
    expect(screen.getByRole('row').className).toContain('hover:bg-muted/50');
  });
});
