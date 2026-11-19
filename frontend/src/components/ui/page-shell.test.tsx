import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PageShell } from './page-shell';
import { PageHeader } from './page-header';
import { BrandContext, buildBrand } from '@/lib/brand';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const renderInRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PageShell', () => {
  beforeEach(() => {
    document.title = 'nolyxERP';
  });

  it('rend un seul h1, focalisable par le cadre, et le titre d’onglet', () => {
    renderInRouter(
      <PageShell title="Factures">
        <p>contenu</p>
      </PageShell>
    );
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAttribute('tabindex', '-1');
    expect(headings[0]).toHaveTextContent('Factures');
    expect(document.title).toBe('Factures · nolyxERP');
  });

  it('nomme l’onglet avec le nom de l’entreprise et le titre de document', () => {
    render(
      <BrandContext.Provider value={buildBrand({ nom: 'Hitek Plateau', logo_url: null })}>
        <MemoryRouter>
          <PageShell title="FAC-2026-00110" documentTitle="Facture FAC-2026-00110" />
        </MemoryRouter>
      </BrandContext.Provider>
    );
    expect(document.title).toBe('Facture FAC-2026-00110 · Hitek Plateau');
  });

  it('garde le titre de page devant le titre de secours du cadre', () => {
    function Fallback() {
      useDocumentTitle('Facture', { priority: 0 });
      return null;
    }
    const { rerender } = renderInRouter(
      <>
        <PageShell title="Facture FAC-2026-00001" />
        <Fallback />
      </>
    );
    expect(document.title).toBe('Facture FAC-2026-00001 · nolyxERP');
    rerender(
      <MemoryRouter>
        <Fallback />
      </MemoryRouter>
    );
    expect(document.title).toBe('Facture · nolyxERP');
  });

  it('ne coupe pas un code de document à ses tirets', () => {
    renderInRouter(<PageShell title="Facture FAC-2026-00110" />);
    const code = screen.getByText('FAC-2026-00110');
    expect(code.tagName).toBe('SPAN');
    expect(code).toHaveClass('whitespace-nowrap');
  });
});

describe('PageShell — focus quand le cadre change de balise (A11Y-P08)', () => {
  // Même composant, deux branches : `<div>` pendant le chargement, `<form>` une
  // fois la commande chargée (Receptions, devis en édition). React remonte tout
  // le sous-arbre et l'ancien `h1` focalisé disparaît.
  function ReceptionView({ ready, focusOnMount = true }: { ready: boolean; focusOnMount?: boolean }) {
    return ready ? (
      <PageShell as="form" title="Réception de la commande CMD-2026-00006" focusOnMount={focusOnMount}>
        <input aria-label="Quantité reçue — Logitech B100" />
      </PageShell>
    ) : (
      <PageShell title="Réception de la commande CMD-2026-00006" focusOnMount={focusOnMount}>
        <p>Chargement…</p>
      </PageShell>
    );
  }

  it('focalise le nouveau h1 quand le chargement cède la place au formulaire', () => {
    const { rerender } = renderInRouter(<ReceptionView ready={false} />);
    const loadingHeading = screen.getByRole('heading', { level: 1 });
    expect(loadingHeading).toHaveFocus();

    rerender(
      <MemoryRouter>
        <ReceptionView ready />
      </MemoryRouter>
    );
    const formHeading = screen.getByRole('heading', { level: 1 });
    expect(formHeading).not.toBe(loadingHeading);
    expect(formHeading.closest('form')).not.toBeNull();
    expect(formHeading).toHaveFocus();
  });

  it('sans `focusOnMount` : rend le focus au nouveau h1 seulement s’il était dans le cadre', () => {
    const { rerender } = render(
      <MemoryRouter>
        <button type="button">Menu</button>
        <ReceptionView ready={false} focusOnMount={false} />
      </MemoryRouter>
    );
    // Le Layout focalise le titre après la navigation.
    screen.getByRole('heading', { level: 1 }).focus();
    rerender(
      <MemoryRouter>
        <button type="button">Menu</button>
        <ReceptionView ready focusOnMount={false} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();

    // Focus hors du cadre : un nouveau changement de balise ne le vole pas.
    const menu = screen.getByRole('button', { name: 'Menu' });
    menu.focus();
    rerender(
      <MemoryRouter>
        <button type="button">Menu</button>
        <ReceptionView ready={false} focusOnMount={false} />
      </MemoryRouter>
    );
    expect(menu).toHaveFocus();
  });
});

describe('PageHeader', () => {
  it('place le statut à côté du titre, hors du h1', () => {
    renderInRouter(<PageHeader title="Devis DEV-2026-00007" meta={<span>Envoyé</span>} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).not.toHaveTextContent('Envoyé');
    expect(screen.getByText('Envoyé')).toBeInTheDocument();
  });

  it('nomme le retour d’après la page de destination', () => {
    renderInRouter(<PageHeader title="Facture" backTo="/factures" />);
    const back = screen.getByRole('link', { name: /retour vers factures/i });
    expect(back).toHaveAttribute('href', '/factures');
  });

  it('range les actions rares dans « Plus d’actions »', async () => {
    const user = userEvent.setup();
    let deleted = false;
    renderInRouter(
      <PageHeader
        title="Devis"
        primaryAction={<button type="button">Confirmer le devis</button>}
        moreActions={[
          { label: 'Modifier le devis', to: '/devis/7/edit' },
          { label: 'Supprimer le devis', destructive: true, onSelect: () => { deleted = true; } },
          false,
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Confirmer le devis' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer le devis' }));
    expect(deleted).toBe(true);
  });
});
