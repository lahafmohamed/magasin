import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChoiceGroup, ToggleChip } from './choice-chips';
import { Button } from './button';
import { Badge } from './badge';
import { Card, CardContent, CardTitle } from './card';
import { ScrollRegion, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { DataCard, DataCardRow } from './responsive-table';
import { Money } from './money';
import { StatGrid, StatTile } from './stat-tile';
import { StatsBar } from './stats-bar';
import { Tag } from './tag';
import { DocumentTotals } from './document-totals';
import { DocumentLifecycle } from './document-lifecycle';
import { Tabs, TabsList, TabsTrigger } from './tabs';
import { DatePicker } from './date-picker';
import { Input } from './input';
import { QueryState } from './query-state';
import { TableSkeleton } from './skeleton';
import { PageHeader } from './page-header';
import { cn } from '@/lib/utils';
import StatusBadge, { getStatusLabel, getStatusOptions, humanizeStatus } from '@/components/StatusBadge';
import { TiersRoleBadge } from '@/components/TiersRoleBadge';

const NBSP = '\u00A0';

/**
 * Garde-fous sur les primitives partagées : chacune de ces classes corrige un
 * défaut constaté aux audits (2026-08-27, 2026-10-23) et se propage à toute
 * l'application, donc une régression silencieuse ici est coûteuse.
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

  it('Button : succès / alerte lisibles dans les deux thèmes, tailles tactiles', () => {
    render(
      <>
        <Button variant="success">Encaisser</Button>
        <Button variant="warning">Clôturer la caisse</Button>
        <Button size="touch">Valider la réception</Button>
        <Button size="icon-touch" aria-label="Fermer" />
      </>
    );
    // Texte du palier 50 de la même rampe (qui s'inverse en sombre), jamais text-white.
    expect(screen.getByText('Encaisser').className).toContain('text-success-50');
    expect(screen.getByText('Clôturer la caisse').className).toContain('text-warning-50');
    expect(screen.getByText('Clôturer la caisse').className).not.toContain('text-white');
    expect(screen.getByText('Valider la réception').className).toMatch(/\bh-11\b.*\bsm:h-9\b/);
    expect(screen.getByRole('button', { name: 'Fermer' }).className).toContain('w-11');
  });

  it('Badge : pastille teintée non interactive, rendue en <span>', () => {
    render(<Badge variant="success">Partiellement livrée</Badge>);
    const el = screen.getByText('Partiellement livrée');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('whitespace-nowrap');
    expect(el.className).toContain('bg-success-50');
    expect(el.className).toContain('text-success-700');
    expect(el.className).not.toMatch(/hover:|focus-visible:|text-white/);
  });

  it('Card : rembourrage par classe de composant, que la page remplace à toutes les largeurs', () => {
    const { container, rerender } = render(<CardContent>contenu</CardContent>);
    expect(container.firstElementChild?.className).toBe('card-content');

    // Plus aucun utilitaire responsive à laisser traîner (`sm:pt-0` collait le contenu).
    rerender(<CardContent className="p-0">contenu</CardContent>);
    expect(container.firstElementChild?.className).not.toMatch(/sm:/);

    rerender(<CardContent inset="standalone">contenu</CardContent>);
    expect(container.firstElementChild?.className).toBe('card-content-standalone');

    rerender(<CardContent inset="flush">contenu</CardContent>);
    expect(container.firstElementChild?.className).toBe('p-0');
  });

  it('Card : le conteneur garde son rayon', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild?.className).toContain('rounded-lg');
  });

  it('CardTitle : titre de section h2 en 16 px, niveau réglable', () => {
    const { rerender } = render(<CardTitle>Articles</CardTitle>);
    const h = screen.getByRole('heading', { name: 'Articles' });
    expect(h.tagName).toBe('H2');
    expect(h.className).toContain('text-base');
    expect(h.className).not.toContain('text-2xl');
    rerender(<CardTitle as="h3">Articles</CardTitle>);
    expect(screen.getByRole('heading', { name: 'Articles' }).tagName).toBe('H3');
  });

  it('Table : chiffres tabulaires seulement sur les colonnes numériques, survol non animé', () => {
    render(
      <Table aria-label="Lignes">
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead numeric>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>COULIBALY Jean-Pierre</TableCell>
            <TableCell numeric>1 250 000</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    // tabular-nums sur une cellule de nom élargissait le trait d'union (« Jean - Pierre »).
    expect(screen.getByText('COULIBALY Jean-Pierre').className).not.toContain('tabular-nums');
    const amount = screen.getByText('1 250 000').className;
    expect(amount).toContain('tabular-nums');
    expect(amount).toContain('text-right');
    expect(amount).toContain('whitespace-nowrap');

    const heads = screen.getAllByRole('columnheader');
    expect(heads[0].className).toContain('whitespace-nowrap');
    expect(heads[1].className).toContain('text-right');

    const rows = screen.getAllByRole('row');
    expect(rows[1].className).not.toContain('transition-colors');
    expect(rows[1].className).toContain('hover:bg-muted/50');
  });

  describe('Table : région défilable seulement quand elle déborde', () => {
    afterEach(() => vi.restoreAllMocks());

    it('pas d\'arrêt de tabulation quand le tableau tient', () => {
      render(
        <Table aria-label="Lignes de la facture">
          <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
        </Table>
      );
      expect(screen.queryByRole('region')).toBeNull();
    });

    it('région focusable et nommée quand le contenu dépasse', () => {
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(358);
      render(
        <Table aria-label="Lignes de la facture">
          <TableBody><TableRow><TableCell>x</TableCell></TableRow></TableBody>
        </Table>
      );
      const region = screen.getByRole('region', { name: /Lignes de la facture/ });
      expect(region).toHaveAttribute('tabindex', '0');
    });
  });

  it('DataCard : article dont le titre est le lien, actions hors de la liste de valeurs', () => {
    render(
      <MemoryRouter>
        <DataCard
          href="/factures/1"
          title="FAC-2026-00001"
          badge={<StatusBadge type="facture" statut="payee" />}
          actions={<Button size="sm">Imprimer</Button>}
        >
          <DataCardRow label="Client" value="BAMBA" />
          <DataCardRow label="Total" value="12 000 FCFA" numeric />
          {/* Ancien usage : boutons passés en enfants — sortis du <dl> automatiquement. */}
          <div><Button size="sm">Supprimer</Button></div>
        </DataCard>
      </MemoryRouter>
    );
    const card = screen.getByRole('article');
    expect(within(card).getByRole('link', { name: 'FAC-2026-00001' })).toHaveAttribute('href', '/factures/1');
    expect(card.querySelector('[role="button"]')).toBeNull();

    const dl = card.querySelector('dl')!;
    // <dl> = uniquement des <div> porteurs de <dt>/<dd> (axe definition-list).
    for (const child of Array.from(dl.children)) {
      expect(child.tagName).toBe('DIV');
      expect(child.querySelector('dt')).not.toBeNull();
    }
    expect(dl.contains(screen.getByRole('button', { name: 'Supprimer' }))).toBe(false);
    expect(dl.contains(screen.getByRole('button', { name: 'Imprimer' }))).toBe(false);
    expect(screen.getByText('12 000 FCFA').className).toContain('tabular-nums');
  });

  it('DataCard : lignes dans un fragment ou conditionnelles, sans clé en double', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const showHidden = Number('0') > 0;
    const { container } = render(
      <DataCard title="DEP-1">
        <DataCardRow label="Date" value="1" />
        <>
          <DataCardRow label="Montant" value="2" />
          {showHidden && <DataCardRow label="Masqué" value="3" />}
        </>
      </DataCard>
    );
    expect(container.querySelectorAll('dl > div')).toHaveLength(2);
    const keyWarnings = spy.mock.calls.filter((args) => String(args[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    spy.mockRestore();
  });

  it('DataCard : bouton principal quand la ligne s\'ouvre dans la page', () => {
    const onClick = vi.fn();
    render(<DataCard onClick={onClick} title="Cycle 2026-09"><DataCardRow label="Net" value="1" /></DataCard>);
    screen.getByRole('button', { name: 'Cycle 2026-09' }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('DataCard : titre h2 par défaut (les cartes suivent le h1), h3 sur demande (M1)', () => {
    const { rerender } = render(<DataCard title="FAC-2026-00001"><DataCardRow label="Total" value="1" /></DataCard>);
    expect(screen.getByRole('heading', { level: 2, name: 'FAC-2026-00001' })).toHaveClass('truncate');
    rerender(<DataCard title="FAC-2026-00001" titleAs="h3"><DataCardRow label="Total" value="1" /></DataCard>);
    expect(screen.getByRole('heading', { level: 3, name: 'FAC-2026-00001' })).toBeInTheDocument();
  });

  it('DataCard `wrapTitle` : un texte libre passe à la ligne au lieu d’être tronqué (GV-08)', () => {
    const libelle = 'Correction de prix WD Green 480 Go (2 unités facturées au mauvais tarif)';
    render(<DataCard title={libelle} wrapTitle><DataCardRow label="Montant" value="5 000 FCFA" numeric /></DataCard>);
    const heading = screen.getByRole('heading', { name: libelle });
    expect(heading).not.toHaveClass('truncate');
    expect(heading).toHaveClass('break-words');
    // Plus d'infobulle : le texte entier est visible.
    expect(heading).not.toHaveAttribute('title');
  });

  it('ScrollRegion : le bord encore coupé s’estompe pendant le débordement (GV-03)', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 480 });
    try {
      render(
        <ScrollRegion label="Historique des caisses" data-testid="region">
          <div>Écart −440 FCFA</div>
        </ScrollRegion>
      );
      const region = screen.getByTestId('region');
      expect(region).toHaveClass('scroll-fade-end');
      expect(region).toHaveAttribute('tabindex', '0');
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    }
    render(<ScrollRegion data-testid="fits"><div>Court</div></ScrollRegion>);
    expect(screen.getByTestId('fits').className).not.toMatch(/scroll-fade/);
  });
});

describe('Money', () => {
  it('chiffres tabulaires insécables, « − » pour un négatif', () => {
    render(<Money value={-43126500} data-testid="m" />);
    const el = screen.getByTestId('m');
    // textContent brut (getByText normaliserait les insécables en espaces).
    expect(el.textContent).toBe(`−43${NBSP}126${NBSP}500${NBSP}FCFA`);
    expect(el.className).toContain('tabular-nums');
    expect(el.className).toContain('whitespace-nowrap');
  });

  it('valeur absente → « — » annoncé, jamais 0', () => {
    render(<Money value={null} />);
    expect(screen.getByText('Montant indisponible')).toBeInTheDocument();
    expect(screen.queryByText(/0\sFCFA/)).toBeNull();
  });

  it('un zéro n\'est jamais coloré', () => {
    render(
      <>
        <Money value={0} tone="danger" data-testid="zero" />
        <Money value={1500} tone="danger" data-testid="due" />
        <Money value={2500} tone="delta" data-testid="delta" />
      </>
    );
    expect(screen.getByTestId('zero').className).not.toContain('text-danger-700');
    expect(screen.getByTestId('due').className).toContain('text-danger-700');
    expect(screen.getByTestId('delta').textContent).toBe(`+2${NBSP}500${NBSP}FCFA`);
    expect(screen.getByTestId('delta').className).toContain('text-success-700');
  });
});

describe('StatTile / StatsBar', () => {
  it('échec de chargement → « Indisponible », pas de valeur ni d\'indication', () => {
    render(<StatTile label="Chiffre d’affaires" value={0} format="money" hint="113 factures" unavailable />);
    expect(screen.getByText('Indisponible')).toBeInTheDocument();
    expect(screen.queryByText('113 factures')).toBeNull();
    expect(screen.queryByText(/FCFA/)).toBeNull();
  });

  it('pas de chiffres tabulaires sur l’indication (trait d’union élargi par Inter)', () => {
    render(<StatTile label="Meilleur client" value={3} hint="Jean-Pierre Kouassi" />);
    expect(screen.getByText('Jean-Pierre Kouassi').className).not.toContain('tabular-nums');
  });

  it('le ton ne colore pas un zéro', () => {
    const { container } = render(<StatTile label="En retard" value={0} tone="danger" />);
    expect(container.innerHTML).not.toContain('text-danger-700');
  });

  it('StatsBar (valeurs déjà formatées) : « 0 FCFA » et « — » ne sont pas colorés', () => {
    const { container } = render(
      <StatsBar
        tiles={[
          { label: 'Utilisés', value: '0 FCFA', tone: 'text-success-700' },
          { label: 'Brouillons', value: '—', tone: 'text-warning-700' },
          { label: 'En attente', value: '3', tone: 'text-warning-700' },
        ]}
      />
    );
    expect(container.querySelectorAll('.text-success-700')).toHaveLength(0);
    expect(container.querySelectorAll('.text-warning-700')).toHaveLength(1);
  });

  it('grille dimensionnée sur le nombre de tuiles', () => {
    const { container } = render(
      <StatGrid>
        <StatTile label="A" value={1} />
        <StatTile label="B" value={2} />
        <StatTile label="C" value={3} />
      </StatGrid>
    );
    const grid = container.firstElementChild!;
    expect(grid.className).toContain('sm:grid-cols-3');
    expect(grid.className).not.toContain('grid-cols-4');
  });

  it('une colonne sous 360 px ; la tuile orpheline ne s’étale qu’à partir de deux colonnes (A11Y-G03)', () => {
    const { container } = render(
      <StatGrid>
        <StatTile label="A" value={1} />
        <StatTile label="B" value={2} />
        <StatTile label="C" value={3} />
      </StatGrid>
    );
    const cls = container.firstElementChild!.className.split(/\s+/);
    expect(cls).toContain('grid-cols-1');
    expect(cls).toContain('min-[360px]:grid-cols-2');
    // Un `col-span-2` dans une grille d'une colonne créerait une piste implicite.
    expect(cls).not.toContain('[&>:last-child]:col-span-2');
    expect(cls).toContain('min-[360px]:[&>:last-child]:col-span-2');
  });

  it('colonnes fournies par la page : la grille automatique s’efface', () => {
    const { container } = render(
      <StatGrid className="grid-cols-1 sm:grid-cols-2">
        <StatTile label="A" value={1} />
        <StatTile label="B" value={2} />
      </StatGrid>
    );
    expect(container.firstElementChild!.className).not.toContain('min-[360px]');
  });

  it('montant : chiffres insécables, l’unité seule peut passer à la ligne (KPI jamais hors de la tuile)', () => {
    render(<StatTile label="Valeur du stock" value={68507792} format="money" />);
    const digits = screen.getByText((_, el) => el?.textContent === `68${NBSP}507${NBSP}792` && el.tagName === 'SPAN');
    expect(digits).toHaveClass('whitespace-nowrap');
    const value = digits.parentElement!;
    expect(value.className).not.toContain('whitespace-nowrap');
    // Une espace sécable sépare les chiffres de « FCFA ».
    expect(value.textContent).toBe(`68${NBSP}507${NBSP}792 FCFA`);
  });

  it('StatsBar : aucune icône dans les tuiles', () => {
    render(
      <StatsBar
        tiles={[
          { label: 'Total', value: '12' as never },
          { label: 'Ce mois', value: '3' },
        ]}
      />
    );
    expect(screen.queryByTestId('icon')).toBeNull();
  });
});

describe('Classes fusionnées (tailwind-merge, ligne Tailwind 3)', () => {
  it('garde `outline` à côté de `outline-2` et laisse un anneau intact (GV-01)', () => {
    // tailwind-merge 3 suit Tailwind 4 et retirait `outline` : en Tailwind 3,
    // `outline-2` sans `outline` ne dessine rien.
    expect(cn('outline outline-2 -outline-offset-2 outline-ring').split(' ')).toContain('outline');
    expect(cn('bg-accent', 'ring-2 ring-inset ring-ring')).toBe('bg-accent ring-2 ring-inset ring-ring');
  });

  it('Button : l’icône garde sa taille quand le libellé passe à la ligne', () => {
    render(<Button>Télécharger le bon de commande</Button>);
    expect(screen.getByRole('button').className).toContain('[&_svg]:shrink-0');
  });

  it('PageHeader : sous 640 px, un libellé d’action long passe à la ligne (A11Y-G03, 320 px)', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Commande CMD-2026-00006" actions={<Button>Télécharger le bon de commande</Button>} />
      </MemoryRouter>
    );
    const row = screen.getByRole('button', { name: 'Télécharger le bon de commande' }).parentElement!;
    expect(row.className).toContain('max-sm:[&>button]:whitespace-normal');
    expect(row.className).toContain('max-sm:[&>button]:min-h-11');
  });

  it('squelette : région `status` sans `aria-busy`, qui la rendrait muette (M3)', () => {
    render(<TableSkeleton rows={1} columns={2} />);
    const status = screen.getByRole('status', { name: 'Chargement…' });
    expect(status).not.toHaveAttribute('aria-busy');
  });
});

describe('Tag et rôles de contact', () => {
  it('texte neutre + pastille de couleur (catégorie, pas statut)', () => {
    render(<Tag hue={6}>Fournisseur</Tag>);
    const tag = screen.getByText('Fournisseur');
    expect(tag.className).toContain('text-foreground');
    expect(tag.querySelector('.bg-chart-6')).not.toBeNull();
  });

  it('un contact client et fournisseur affiche les deux libellés, jamais « Mixte »', () => {
    render(<TiersRoleBadge role="mixte" />);
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Fournisseur')).toBeInTheDocument();
    expect(screen.queryByText(/Mixte|Fourn\./)).toBeNull();
  });
});

describe('StatusBadge — source unique des mots de statut', () => {
  it('un mot par état ; l’icône seulement sur la pastille d’en-tête', () => {
    const { container, rerender } = render(<StatusBadge type="facture" statut="en_attente" />);
    expect(screen.getByText('Non payée')).toBeInTheDocument();
    // Dans une liste, l'icône répétait le mot sur chaque ligne.
    expect(container.querySelector('svg')).toBeNull();
    rerender(<StatusBadge type="facture" statut="en_attente" size="md" />);
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(getStatusLabel('devis', 'accepte')).toBe('Confirmé');
    expect(getStatusLabel('bl', 'valide')).toBe('À livrer');
    expect(getStatusLabel('transfert', 'en_cours')).toBe('En cours de livraison');
  });

  it('code inconnu → libellé lisible, jamais le code brut', () => {
    render(<StatusBadge type="transfert" statut="en_attente_validation" />);
    expect(screen.getByText('En attente validation')).toBeInTheDocument();
    expect(humanizeStatus(null)).toBe('Statut inconnu');
  });

  it('options de filtre dans l\'ordre du cycle, mêmes libellés que la pastille', () => {
    expect(getStatusOptions('facture')).toEqual([
      { value: 'en_attente', label: 'Non payée' },
      { value: 'partielle', label: 'Partiellement payée' },
      { value: 'payee', label: 'Payée' },
      { value: 'annulee', label: 'Annulée' },
    ]);
    expect(getStatusOptions('devis', { exclude: ['annule'] }).map((o) => o.value)).not.toContain('annule');
  });
});

describe('Documents', () => {
  it('DocumentTotals : liste de définitions valide, total mis en avant', () => {
    const { container } = render(
      <DocumentTotals
        rows={[{ label: 'Sous-total', value: 1000 }]}
        total={{ label: 'Total', value: 1000 }}
        after={[{ label: 'Reste dû', value: 0, tone: 'danger', emphasis: true }]}
      />
    );
    const dl = container.querySelector('dl')!;
    for (const child of Array.from(dl.children)) {
      expect(child.tagName).toBe('DIV');
      expect(child.querySelector(':scope > dt')).not.toBeNull();
      expect(child.querySelector(':scope > dd')).not.toBeNull();
    }
    expect(screen.getByText('Total').parentElement!.className).toContain('text-lg');
  });

  it('DocumentTotals : un total seul ne trace qu’un filet', () => {
    const { container } = render(<DocumentTotals total={{ label: 'Total', value: 1000 }} />);
    expect(container.querySelectorAll('.border-t')).toHaveLength(1);
    expect(screen.getByText('Total').parentElement!.className).not.toContain('border-t');

    const withRows = render(
      <DocumentTotals rows={[{ label: 'Sous-total', value: 1200 }]} total={{ label: 'Total du devis', value: 1000 }} />
    );
    // Avec des lignes avant lui, le total reprend son propre filet.
    expect(withRows.container.querySelectorAll('.border-t')).toHaveLength(2);
    expect(screen.getByText('Total du devis').parentElement!.className).toContain('border-t');
  });

  it('DocumentLifecycle : liste ordonnée, étape courante annoncée, libellés non estompés', () => {
    const { container } = render(
      <MemoryRouter>
        <DocumentLifecycle
          steps={[
            { label: 'Devis', numero: 'DEV-1', to: '/devis/1' },
            { label: 'Facture', numero: 'FAC-1', current: true },
            { label: 'Avoir' },
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('list', { name: 'Cycle du document' }).tagName).toBe('OL');
    // « Avoir » n'existe pas : pas de case vide en pointillé pour le dire.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Avoir')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('FAC-1');
    expect(screen.getByRole('link', { name: /DEV-1/ })).toHaveAttribute('href', '/devis/1');
    expect(container.innerHTML).not.toContain('opacity-70');
  });

  it('DocumentLifecycle : grille sur téléphone, chevrons seulement en ligne (GV-27)', () => {
    const { container } = render(
      <MemoryRouter>
        <DocumentLifecycle
          steps={[
            { label: 'Devis', numero: 'DEV-1', to: '/devis/1' },
            { label: 'Bon de livraison' },
            { label: 'Facture', numero: 'FAC-1', current: true },
            { label: 'Avoir' },
          ]}
        />
      </MemoryRouter>
    );
    const list = screen.getByRole('list', { name: 'Cycle du document' });
    expect(list).toHaveClass('grid', 'min-[360px]:grid-cols-2', 'sm:flex');
    // Un « › » en tête de la deuxième rangée ne veut rien dire : masqués sous 640 px.
    const chevrons = container.querySelectorAll('svg');
    expect(chevrons).toHaveLength(1);
    chevrons.forEach((svg) => expect(svg.getAttribute('class')!.split(' ')).toEqual(expect.arrayContaining(['hidden', 'sm:block'])));
  });

  it('DocumentLifecycle : une pièce sans amont ni aval n’affiche pas de chaîne', () => {
    const { container } = render(
      <MemoryRouter>
        <DocumentLifecycle
          steps={[
            { label: 'Devis' },
            { label: 'Bon de livraison' },
            { label: 'Facture', numero: 'FAC-1', current: true },
            { label: 'Avoir' },
          ]}
        />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('TabsList : le bord où des onglets restent cachés s’estompe', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 420 });
    try {
      render(
        <Tabs value="ecritures" onValueChange={() => {}}>
          <TabsList aria-label="Vues de la comptabilité">
            <TabsTrigger value="ecritures">Écritures</TabsTrigger>
            <TabsTrigger value="plan">Plan comptable</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      expect(screen.getByRole('tablist')).toHaveClass('scroll-fade-end');
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    }
  });

  it('DatePicker : pas d\'aria-required sur le bouton, date « 22 oct. 2026 »', () => {
    render(<DatePicker id="echeance" value="2026-10-22" onChange={() => {}} required />);
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-required');
    expect(screen.getByText('22 oct. 2026')).toBeInTheDocument();
    // Avec un <Label htmlFor>, la date est annoncée par la description.
    expect(button.getAttribute('aria-describedby')).toContain('echeance-valeur');
  });

  it('Input : état invalide lu sur aria-invalid, 16 px sur téléphone', () => {
    render(<Input aria-label="Montant" aria-invalid />);
    const cls = screen.getByRole('textbox').className;
    expect(cls).toContain('aria-[invalid=true]:border-danger-600');
    expect(cls).toContain('field-text');
    expect(cls).toContain('border-input');
  });
});

describe('Choix et puces — état sélectionné', () => {
  it('ToggleChip : état exposé par aria-pressed et une coche, pas par la couleur seule', () => {
    render(<ToggleChip pressed onPressedChange={() => {}}>Payée</ToggleChip>);
    const chip = screen.getByRole('button', { name: 'Payée' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(chip.className).toContain('bg-primary-50');
    expect(chip.className).not.toContain('bg-primary ');
  });

  it('ChoiceGroup : groupe radio nommé, flèches pour changer de choix', () => {
    function Harness() {
      const [mode, setMode] = useState<'espece' | 'wave' | 'cheque'>('espece');
      return (
        <ChoiceGroup
          label="Mode de paiement"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'espece', label: 'Espèces' },
            { value: 'wave', label: 'Wave' },
            { value: 'cheque', label: 'Chèque' },
          ]}
        />
      );
    }
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Mode de paiement' });
    const radios = within(group).getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('tabindex', '0');
    expect(radios[1]).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Wave' })).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Wave' }));

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Wave' }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Espèces' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Chèque' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('QueryState', () => {
  it('transmet `compact` à l’état vide et à l’état d’erreur', () => {
    const empty = render(
      <QueryState loading={false} isEmpty emptyTitle="Aucun paiement" compact skeleton={null}>
        <p>contenu</p>
      </QueryState>
    );
    expect(screen.getByText('Aucun paiement').closest('.py-6')).not.toBeNull();
    empty.unmount();

    render(
      <QueryState loading={false} error={new Error('x')} errorTitle="Impossible de charger" compact skeleton={null}>
        <p>contenu</p>
      </QueryState>
    );
    expect(screen.getByText('Impossible de charger').closest('.py-6')).not.toBeNull();
  });
});
