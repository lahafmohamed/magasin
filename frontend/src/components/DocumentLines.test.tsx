import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { DocumentLines, type DocumentLineColumn } from './DocumentLines';

/**
 * jsdom ne fait aucune mise en page : on simule la largeur du conteneur et la
 * largeur naturelle du tableau, et un ResizeObserver déclenché à la main.
 */
let containerWidth = 0;
let tableWidth = 0;
const observers: Array<() => void> = [];

const isWrapper = (el: Element) => el.hasAttribute('data-layout');
const isTableRegion = (el: Element) => !!el.parentElement?.hasAttribute('data-layout') && !!el.querySelector('table');

function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isWrapper(this) || isTableRegion(this) ? containerWidth : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isWrapper(this) || isTableRegion(this) ? containerWidth : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (isTableRegion(this)) return Math.max(containerWidth, tableWidth);
      return isWrapper(this) ? containerWidth : 0;
    },
  });
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observers.push(() => callback([], this as unknown as ResizeObserver));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
}

function resize(width: number) {
  containerWidth = width;
  act(() => {
    for (const notify of observers.splice(0)) notify();
  });
}

const COLUMNS: DocumentLineColumn[] = [
  { id: 'produit', header: 'Produit', mobile: 'title' },
  { id: 'quantite', header: 'Quantité', numeric: true, mobile: 'field' },
  { id: 'total', header: 'Total', numeric: true, mobile: 'field' },
  { id: 'retirer', header: 'Retirer', srOnlyHeader: true, mobile: 'action' },
];

function Lines({ minTableWidth }: { minTableWidth?: number }) {
  return (
    <DocumentLines
      label="Lignes de la facture"
      columns={COLUMNS}
      minTableWidth={minTableWidth}
      rows={[
        {
          key: 'l1',
          cells: {
            produit: <p>Logitech B100</p>,
            quantite: <input id="qte-0" aria-label="Quantité — Logitech B100" defaultValue="12" />,
            total: <span>400 000 FCFA</span>,
            retirer: <button type="button" aria-label="Retirer — Logitech B100">×</button>,
          },
        },
      ]}
    />
  );
}

describe('DocumentLines — tableau ou cartes selon la largeur du conteneur (GV-04)', () => {
  beforeEach(() => {
    observers.length = 0;
    containerWidth = 900;
    tableWidth = 640;
    stubLayout();
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    vi.unstubAllGlobals();
  });

  it('tableau quand le conteneur a la place, cartes quand il rétrécit, puis retour au tableau', () => {
    render(<Lines />);
    expect(screen.getByRole('table', { name: 'Lignes de la facture' })).toBeInTheDocument();

    resize(560);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('list', { name: 'Lignes de la facture' })).toBeInTheDocument();

    resize(900);
    expect(screen.getByRole('table', { name: 'Lignes de la facture' })).toBeInTheDocument();
  });

  it('passe en cartes quand le tableau déborde de son conteneur, même au-dessus du minimum', () => {
    // Colonne gauche du formulaire à 1 366 px : 690 px pour un tableau de 746 px.
    containerWidth = 690;
    tableWidth = 746;
    render(<Lines />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('list', { name: 'Lignes de la facture' })).toBeInTheDocument();
  });

  it('respecte `minTableWidth` fourni par le formulaire', () => {
    containerWidth = 700;
    render(<Lines minTableWidth={720} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('le champ en cours de saisie garde le focus et sa sélection au changement de rendu', () => {
    render(<Lines />);
    const input = screen.getByLabelText('Quantité — Logitech B100') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 2);

    resize(560);

    const moved = screen.getByLabelText('Quantité — Logitech B100') as HTMLInputElement;
    expect(screen.queryByRole('table')).toBeNull();
    expect(moved).toHaveFocus();
    expect([moved.selectionStart, moved.selectionEnd]).toEqual([1, 2]);
  });

  it('un bouton sans identifiant est retrouvé par son nom accessible', () => {
    render(<Lines />);
    screen.getByRole('button', { name: 'Retirer — Logitech B100' }).focus();

    resize(560);

    expect(screen.getByRole('button', { name: 'Retirer — Logitech B100' })).toHaveFocus();
  });

  it('expose le rendu courant aux cellules (`data-layout`)', () => {
    const { container } = render(<Lines />);
    expect(container.querySelector('[data-layout="table"]')).not.toBeNull();
    resize(560);
    expect(container.querySelector('[data-layout="cards"]')).not.toBeNull();
  });
});
