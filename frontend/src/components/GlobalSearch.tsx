import { useEffect, useState, useRef, useCallback, useMemo, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { CornerDownLeft, Search } from 'lucide-react';
import {
  produitService,
  tiersService,
  factureService,
  devisService,
  bonLivraisonService,
  commandeService,
  creditNoteService,
} from '../services/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { focusPageHeading } from '@/components/ui/focus-return';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { formatCurrency, fuzzyScore, normalizeSearch } from '../utils/format';
import { iconForPath, routeLabel } from '../config/routeAccess';
import { useRouteAccess } from '../hooks/useRouteAccess';
import { DASHBOARD_ITEM, useNavCategories } from './navConfig';

type SourceType = 'produit' | 'tiers' | 'facture' | 'devis' | 'bl' | 'commande' | 'avoir';
type ResultType = 'page' | SourceType;

interface SearchResult {
  type: ResultType;
  key: string;
  title: string;
  subtitle?: string;
  url: string;
  icon: LucideIcon;
}

/** Délai de frappe avant d'interroger l'API (une requête par source et non par touche). */
export const SEARCH_DEBOUNCE_MS = 250;
/** En dessous, seules les pages sont proposées : un caractère ne désigne aucun document. */
const MIN_REMOTE_QUERY = 2;

/** Résultats dont le titre est un numéro de pièce : affiché en mono (DocumentCode). */
const CODE_TYPES = new Set<ResultType>(['facture', 'devis', 'bl', 'commande', 'avoir']);

const GROUP_LABELS: Record<ResultType, string> = {
  page: 'Aller à',
  produit: 'Produits',
  tiers: 'Contacts',
  facture: 'Factures',
  devis: 'Devis',
  bl: 'Bons de livraison',
  commande: 'Commandes fournisseur',
  avoir: 'Avoirs',
};

const GROUP_ORDER: ResultType[] = ['page', 'facture', 'produit', 'tiers', 'devis', 'bl', 'commande', 'avoir'];

/** Page de destination de chaque source : la source n'est interrogée que si le rôle peut l'ouvrir. */
const SOURCE_TARGET: Record<SourceType, string> = {
  produit: '/inventaire',
  tiers: '/tiers/0',
  facture: '/factures/0',
  devis: '/devis/0',
  bl: '/bons-livraison/0',
  commande: '/commandes/0',
  avoir: '/avoirs/0',
};

/** Créations proposées dans « Aller à » quand la liste correspondante est au menu. */
const CREATE_PAGES: ReadonlyArray<{ path: string; parent: string }> = [
  { path: '/factures/nouvelle', parent: '/factures' },
  { path: '/devis/nouveau', parent: '/devis' },
  { path: '/bons-livraison/nouveau', parent: '/bons-livraison' },
  { path: '/avoirs/nouveau', parent: '/avoirs' },
  { path: '/demandes/nouvelle', parent: '/demandes' },
];

/** Un endpoint paginé renvoie `{data}` ; un endpoint brut renvoie un tableau. */
function rows(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  const data = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? data : [];
}

const join = (...parts: Array<string | null | undefined | false>) =>
  parts.filter((p) => typeof p === 'string' && p.trim()).join(' · ');

const personName = (nom?: string | null, prenom?: string | null) =>
  [nom, prenom].filter(Boolean).join(' ').trim() || undefined;

export function GlobalSearch() {
  const navigate = useNavigate();
  const canOpen = useRouteAccess();
  const categories = useNavCategories();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestId = useRef(0);
  const navigated = useRef(false);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Ctrl+K / Cmd+K ouvre et ferme la palette.
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Pages du menu du rôle (+ créations), filtrées localement, sans requête.
  const pageEntries = useMemo(() => {
    const navItems = [DASHBOARD_ITEM, ...categories.flatMap((c) => c.items)];
    const navPaths = new Set(navItems.map((i) => i.path));
    const entries: Array<{ path: string; label: string; icon: LucideIcon }> = navItems.map((i) => ({
      path: i.path,
      label: i.label,
      icon: i.icon,
    }));
    for (const create of CREATE_PAGES) {
      if (navPaths.has(create.parent) && canOpen(create.path)) {
        entries.push({
          path: create.path,
          label: routeLabel(create.path) ?? create.path,
          icon: iconForPath(create.path) ?? Search,
        });
      }
    }
    entries.push({ path: '/profil', label: routeLabel('/profil') ?? 'Mon profil', icon: iconForPath('/profil') ?? Search });
    return entries;
  }, [categories, canOpen]);

  const pageResults = useMemo<SearchResult[]>(() => {
    const q = normalizeSearch(search);
    if (!q) return [];
    return pageEntries
      .map((entry) => ({ entry, score: fuzzyScore(q, entry.label) }))
      .filter(({ score }) => score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ entry }) => ({
        type: 'page' as const,
        key: `page-${entry.path}`,
        title: entry.label,
        url: entry.path,
        icon: entry.icon,
      }));
  }, [pageEntries, search]);

  // Sources ouvertes au rôle, sous forme de clé stable : l'effet de recherche
  // ne doit pas se relancer à chaque rendu.
  const allowedKey = (Object.keys(SOURCE_TARGET) as SourceType[])
    .filter((type) => canOpen(SOURCE_TARGET[type]))
    .join(',');

  // Recherche distante, débouncée ; seules les sources que le rôle peut ouvrir
  // sont interrogées (avant : 6 requêtes par recherche, dont des 403).
  useEffect(() => {
    const query = search.trim();
    const id = ++requestId.current;
    const allowed = new Set(allowedKey.split(',')) as Set<string>;
    const can = (type: SourceType) => allowed.has(type);
    if (query.length < MIN_REMOTE_QUERY) {
      setRemote((prev) => (prev.length ? [] : prev));
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const none = Promise.resolve(null);
      const [produits, tiers, factures, devis, bls, commandes, avoirs] = await Promise.all([
        can('produit') ? produitService.searchFuzzy(query, 5, 0.1).catch(() => null) : none,
        can('tiers') ? tiersService.search(query).catch(() => null) : none,
        can('facture') ? factureService.getAll(query, undefined, 1, 5).catch(() => null) : none,
        can('devis') ? devisService.getAll(query, undefined, 1, 4).catch(() => null) : none,
        can('bl') ? bonLivraisonService.getAll(query, undefined, 1, 4).catch(() => null) : none,
        can('commande') ? commandeService.getAll(query, undefined, 1, 4).catch(() => null) : none,
        can('avoir') ? creditNoteService.getAll(query, undefined, 1, 4).catch(() => null) : none,
      ]);
      // Une frappe plus récente a relancé la recherche : ce résultat est périmé.
      if (id !== requestId.current) return;

      const found: SearchResult[] = [
        ...rows(produits).map((p: any) => ({
          type: 'produit' as const,
          key: `produit-${p.id}`,
          title: p.nom,
          subtitle: join(p.reference, p.categorie || 'Sans catégorie'),
          // La liste s'ouvre déjà filtrée sur la référence trouvée.
          url: `/inventaire?search=${encodeURIComponent(p.reference || p.nom)}`,
          icon: iconForPath('/inventaire') ?? Search,
        })),
        ...rows(tiers).slice(0, 5).map((t: any) => ({
          type: 'tiers' as const,
          key: `tiers-${t.id}`,
          title: t.raison_sociale,
          subtitle:
            t.telephone ||
            t.email ||
            (t.est_client && t.est_fournisseur ? 'Client et fournisseur' : t.est_client ? 'Client' : 'Fournisseur'),
          url: `/tiers/${t.id}`,
          icon: iconForPath('/tiers') ?? Search,
        })),
        ...rows(factures).map((f: any) => ({
          type: 'facture' as const,
          key: `facture-${f.id}`,
          title: f.numero_facture,
          subtitle: join(personName(f.client_nom, f.client_prenom), formatCurrency(f.total)),
          url: `/factures/${f.id}`,
          icon: iconForPath('/factures') ?? Search,
        })),
        ...rows(devis).map((d: any) => ({
          type: 'devis' as const,
          key: `devis-${d.id}`,
          title: d.numero_devis,
          subtitle: join(personName(d.client_nom, d.client_prenom), formatCurrency(d.total)),
          url: `/devis/${d.id}`,
          icon: iconForPath('/devis') ?? Search,
        })),
        ...rows(bls).map((b: any) => ({
          type: 'bl' as const,
          key: `bl-${b.id}`,
          title: b.numero_bl,
          subtitle: join(personName(b.client_nom, b.client_prenom), formatCurrency(b.total)),
          url: `/bons-livraison/${b.id}`,
          icon: iconForPath('/bons-livraison') ?? Search,
        })),
        ...rows(commandes).map((c: any) => ({
          type: 'commande' as const,
          key: `commande-${c.id}`,
          title: c.numero_commande,
          subtitle: join(c.fournisseur_nom, formatCurrency(c.sous_total ?? c.total)),
          url: `/commandes/${c.id}`,
          icon: iconForPath('/commandes') ?? Search,
        })),
        ...rows(avoirs).map((a: any) => ({
          type: 'avoir' as const,
          key: `avoir-${a.id}`,
          title: a.numero_avoir,
          subtitle: join(personName(a.client_nom, a.client_prenom), formatCurrency(a.total)),
          url: `/avoirs/${a.id}`,
          icon: iconForPath('/avoirs') ?? Search,
        })),
      ].filter((r) => r.title);

      setRemote(found);
      setLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, allowedKey]);

  // Groupes dans un ordre stable ; l'index « actif » parcourt la liste aplatie.
  const groups = useMemo(() => {
    const all = [...pageResults, ...remote];
    return GROUP_ORDER.map((type) => ({ type, items: all.filter((r) => r.type === type) })).filter(
      (g) => g.items.length > 0
    );
  }, [pageResults, remote]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flat.length, search]);

  const close = () => {
    setOpen(false);
  };

  const handleSelect = (result: SearchResult) => {
    navigated.current = true;
    close();
    navigate(result.url);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === 'Home' && e.ctrlKey) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && e.ctrlKey) {
      e.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = flat[activeIndex];
      if (result) handleSelect(result);
    }
  };

  // L'option active reste visible quand on la parcourt au clavier.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, open]);

  const query = search.trim();
  const showEmpty = !loading && query.length > 0 && flat.length === 0;
  const status = loading
    ? ''
    : query.length === 0
      ? ''
      : flat.length === 0
        ? `Aucun résultat pour « ${query} ».`
        : `${flat.length} résultat${flat.length > 1 ? 's' : ''}.`;

  let index = -1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <DialogContent
        className="max-w-2xl gap-0 p-0"
        onCloseAutoFocus={(event) => {
          // Après un choix, le focus va au titre de la page ouverte — pas au
          // bouton de recherche. Le Layout renonce tant que le focus est dans la
          // fenêtre qui s'efface : on le place donc ici (sans effet s'il l'a déjà fait).
          if (navigated.current) {
            event.preventDefault();
            navigated.current = false;
            focusPageHeading();
          }
        }}
      >
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        <DialogDescription className="sr-only">
          Tapez le nom d’une page, d’un produit, d’un contact ou un numéro de document, puis utilisez les flèches et Entrée pour l’ouvrir
        </DialogDescription>
        <div className="border-b p-3 pr-12 sm:p-4 sm:pr-14">
          <div className="flex items-center gap-2 rounded-md px-2 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              aria-label="Rechercher dans toute l’application"
              placeholder="Page, produit, contact, numéro de document…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleInputKeyDown}
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={flat.length > 0 ? optionId(activeIndex) : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
              autoFocus
            />
            {loading && <Spinner className="shrink-0 text-muted-foreground" />}
          </div>
        </div>

        <p role="status" className="sr-only">
          {status}
        </p>

        <div
          id={listId}
          role="listbox"
          aria-label="Résultats de recherche"
          hidden={flat.length === 0}
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {groups.map((group) => (
            <div key={group.type} role="group" aria-label={GROUP_LABELS[group.type]} className="py-1">
              <div aria-hidden="true" className="px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {GROUP_LABELS[group.type]}
              </div>
              {group.items.map((result) => {
                index += 1;
                const i = index;
                const active = i === activeIndex;
                const Icon = result.icon;
                return (
                  <div
                    key={result.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(result)}
                    onMouseMove={() => setActiveIndex(i)}
                    className={cn(
                      'mx-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5',
                      active && 'bg-accent ring-2 ring-inset ring-ring'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', CODE_TYPES.has(result.type) ? 'font-mono' : 'font-medium')}>
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                      )}
                    </div>
                    {active && <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {showEmpty && (
          <div className="px-4 py-8 text-center text-muted-foreground">
            <Search className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Aucun résultat pour «&nbsp;{query}&nbsp;»</p>
            <p className="mt-1 text-sm">Cherchez par numéro de document, nom ou référence</p>
          </div>
        )}

        {!query && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground text-balance">
            Tapez un numéro de facture, un nom de client, une référence produit ou le nom d’une page
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
