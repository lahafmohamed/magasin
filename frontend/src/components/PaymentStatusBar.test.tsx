import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentStatusBar } from './PaymentStatusBar';

const NBSP = ' ';

describe('PaymentStatusBar (GV-02)', () => {
  it('sur téléphone, une rangée libellé / montant par valeur ; trois colonnes dès 640 px', () => {
    const { container } = render(<PaymentStatusBar montantPaye={0} remainingDue={1788000} total={1788000} />);
    const dl = container.querySelector('dl')!;
    const cls = dl.className.split(/\s+/);
    // Plus de `grid-cols-3` sans condition : à 390 px trois montants de sept
    // chiffres se collaient (« 1 788 000 FCFA1 788 000 FCFA0 FCFA »).
    expect(cls).not.toContain('grid-cols-3');
    expect(cls).toContain('sm:grid-cols-3');

    const items = Array.from(dl.children);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.className).toContain('justify-between');
      expect(item.className).toContain('sm:block');
    }
    // textContent brut : les insécables restent des insécables.
    expect(items[0].textContent).toBe(`Total1${NBSP}788${NBSP}000${NBSP}FCFA`);
    expect(screen.getByRole('progressbar', { name: 'Avancement du paiement' })).toHaveAttribute('aria-valuenow', '0');
  });
});
