import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CirclePlus,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Lock,
  LockOpen,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  bonLivraisonService,
  caisseService,
  commandeService,
  demandeService,
  devisService,
  factureService,
  paiementService,
  produitService,
  receptionService,
  reportService,
  retourService,
  stockLocationService,
  stockTransferService,
  type CaisseCashBreakdown,
} from '../services/api';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { Tag } from '@/components/ui/tag';
import { DocumentCode } from '@/components/ui/document-code';
import { Button, buttonVariants } from '@/components/ui/button';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { KeyValue, KeyValueList } from '@/components/ui/key-value';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryErrorState } from '@/components/ui/query-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import StatusBadge from '../components/StatusBadge';
import { DashboardDemandeWidgets } from '../components/DashboardDemandeWidgets';
import { useAuth } from '../lib/AuthContext';
import { useVenteParDefaut } from '@/hooks/useVenteParDefaut';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { iconForPath, routeLabel } from '@/config/routeAccess';
import { cn } from '@/lib/utils';
import {
  CHART_GRID,
  CHART_PRIMARY,
  CHART_REST,
  CHART_SECONDARY,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_STYLE,
  chartMoneyTick,
  chartMoneyTooltip,
  maxIndex,
} from '@/lib/chartColors';
import {
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatMonthShort,
  formatNumber,
  formatPercent,
  formatPercentChange,
  formatTime,
  toNumber,
} from '../utils/format';
import { formatPaymentMethod, paymentMethodHue } from '../utils/paymentMethod';
import { previousDayTill } from '../utils/tillSession';
import {
  buildDailySeries,
  isSameLocalDay,
  localDateParam,
  sumCounts,
  sumTotals,
  toLocalDay,
  type DayPoint,
  type RevenueTrendRow,
} from '../utils/revenueSeries';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/*
 * Tableau de bord = la page d'accueil de chaque rôle (U-17). Un « hub » par
 * rôle, construit sur les API existantes :
 *   - caissier : « Ma caisse » + les ventes et les impayés du jour ;
 *   - magasin_staff : devis, bons de livraison et demandes à faire avancer,
 *     stock bas de SON magasin, sa caisse ;
 *   - depot_staff : réceptions, demandes, transferts, stock bas du dépôt —
 *     aucun montant ;
 *   - manager / admin : bandeau « À traiter », « Aujourd’hui », puis
 *     l'analyse commerciale.
 * Chaque requête vit dans sa carte : un échec y affiche « Indisponible » ou un
 * réessai, jamais un zéro, et ne vide pas le reste de la page.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Données : types des lignes, lecture défensive, requête par carte
// ─────────────────────────────────────────────────────────────────────────────

/** pg sérialise COUNT/SUM/NUMERIC en chaînes. */
type Num = string | number;

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Accord français : 0 et 1 au singulier. */
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Lignes d'une réponse paginée (`{ data, pagination }`) ou d'un tableau nu. */
function rowsOf<T>(page: unknown): T[] {
  if (Array.isArray(page)) return page as T[];
  const rows = (page as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Total serveur d'une page (`pagination.total`), sinon le nombre de lignes. */
function totalOf(page: unknown): number {
  const total = (page as { pagination?: { total?: unknown } } | null | undefined)?.pagination?.total;
  return typeof total === 'number' ? total : rowsOf(page).length;
}

const clientName = (row: { client_prenom?: string | null; client_nom?: string | null }) =>
  [row.client_prenom, row.client_nom].filter(Boolean).join(' ') || 'Client non renseigné';

interface Query<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Une requête, un état : chargement, erreur ou données. `key` change → nouvelle
 * requête ; pendant une actualisation, les données précédentes restent
 * affichées (pas de clignotement), une erreur les remplace (jamais de chiffre
 * périmé présenté comme à jour).
 */
function useQuery<T>(key: string, fetcher: () => Promise<T>, enabled = true): Query<T> {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ requestId?: string; data?: T; error?: unknown }>({});
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = `${key}#${nonce}`;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetcherRef.current().then(
      (data) => {
        if (active) setState({ requestId, data });
      },
      (error: unknown) => {
        if (active) setState({ requestId, error: error ?? new Error('Échec du chargement') });
      }
    );
    return () => {
      active = false;
    };
  }, [requestId, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = enabled && state.requestId !== requestId;
  return {
    data: enabled ? state.data : undefined,
    error: enabled && !loading ? state.error : undefined,
    loading,
    reload,
  };
}

/** Heure de la dernière fois où toutes les cartes ont fini de charger. */
function useLastUpdated(busy: boolean): Date | null {
  const [at, setAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!busy) setAt(new Date());
  }, [busy]);
  return at;
}

const anyLoading = (...queries: Array<{ loading: boolean }>) => queries.some((q) => q.loading);

const measureChartHeight = () => (window.innerWidth < 640 ? 200 : window.innerWidth < 1024 ? 260 : 300);

/** Hauteur des graphiques par palier de largeur (seul le palier est stocké). */
function useChartHeight() {
  const [height, setHeight] = useState(measureChartHeight);
  useEffect(() => {
    const onResize = () => setHeight(measureChartHeight());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return height;
}

// ─────────────────────────────────────────────────────────────────────────────
// Éléments partagés par les hubs
// ─────────────────────────────────────────────────────────────────────────────

/** Bouton « Actualiser » et heure des données, dans l'en-tête de page. */
function RefreshControls({ busy, lastUpdated, onRefresh }: {
  busy: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}) {
  return (
    <>
      <span role="status" className="text-xs text-muted-foreground tabular-nums">
        {busy ? (lastUpdated ? 'Actualisation…' : 'Chargement…') : lastUpdated ? `Mis à jour à ${formatTime(lastUpdated)}` : ''}
      </span>
      <Button variant="outline" onClick={onRefresh} disabled={busy} className="gap-2">
        {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        Actualiser
      </Button>
    </>
  );
}

/** Action principale de l'en-tête : un lien habillé en bouton plein, 44 px sur téléphone. */
function PrimaryLink({ to, icon: Icon, children }: { to: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link to={to} className={cn(buttonVariants({ size: 'touch' }), 'gap-2')}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

function SecondaryLink({ to, icon: Icon, children }: { to: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/**
 * Lien sous la valeur d'une tuile ; `undefined` quand le rôle ne peut pas
 * ouvrir la page. Un « aller à » se dessine en gris avec un chevron, partout
 * (tuiles, lignes de file) : le bleu reste aux actions, et la tuile ne pose
 * pas un second lien bleu à côté du bouton principal de la page.
 */
function useTileLink() {
  const canOpen = useRouteAccess();
  return (to: string, label: string): ReactNode => {
    if (!canOpen(to)) return undefined;
    // Sur une tuile étroite le libellé passe à la ligne : le chevron reste
    // collé au dernier mot au lieu de partir seul sur une ligne.
    const words = label.split(' ');
    const last = words.pop();
    return (
      <Link
        to={to}
        className="inline-block min-h-6 rounded-sm py-1 text-xs font-medium leading-4 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {words.length > 0 && `${words.join(' ')} `}
        <span className="whitespace-nowrap">
          {last}
          <ChevronRight className="ms-0.5 inline-block h-3.5 w-3.5 align-[-3px]" aria-hidden="true" />
        </span>
      </Link>
    );
  };
}

/** Lien d'en-tête de carte (« Tout voir », « Aller à la caisse ») : bouton discret et chevron. */
function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  const canOpen = useRouteAccess();
  if (!canOpen(to)) return null;
  return (
    <Link to={to} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 gap-1')}>
      {children}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function SeeAllLink({ to, context }: { to: string; context: string }) {
  return (
    <HeaderLink to={to}>
      Tout voir<span className="sr-only"> : {context}</span>
    </HeaderLink>
  );
}

/**
 * Compte d'une carte : un nombre (« Devis à confirmer 4 ») ou des parts
 * nommées (« 1 à livrer · 0 à facturer ») quand la carte réunit deux files.
 */
type HeaderCount = number | readonly { n: number; label: string }[];

/**
 * Compte en texte discret à la suite du titre de carte. Il remplace la tuile
 * qui répétait la carte : chaque compte n'est dit qu'une fois, au-dessus de
 * ses lignes.
 */
function TitleCount({ count }: { count: HeaderCount }) {
  const parts = typeof count === 'number' ? [{ n: count, label: '' }] : count;
  return (
    <span className="font-normal text-muted-foreground">
      {parts.map(({ n, label }, i) => (
        <Fragment key={label || i}>
          {i > 0 && ' · '}
          <span className="whitespace-nowrap">
            <span className="tabular-nums">{formatNumber(n)}</span>
            {label && ` ${label}`}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Titre suivi de son compte. Un nombre seul reste collé au dernier mot : sur
 * téléphone, « 1 » ne part pas seul à la ligne sous « Commandes à
 * réceptionner ». Des parts nommées vont à la ligne en bloc.
 */
function titleWithCount(title: ReactNode, count: HeaderCount | undefined): ReactNode {
  if (count === undefined) return title;
  if (typeof count === 'number' && typeof title === 'string') {
    const cut = title.lastIndexOf(' ') + 1;
    return (
      <>
        {title.slice(0, cut)}
        <span className="whitespace-nowrap">
          {title.slice(cut)} <TitleCount count={count} />
        </span>
      </>
    );
  }
  return (
    <>
      {title} <TitleCount count={count} />
    </>
  );
}

/** Carte de section : titre (`h2` par défaut) et son compte, sous-titre, action à droite. */
function SectionCard({
  title,
  count,
  description,
  toolbar,
  action,
  titleAs = 'h2',
  className,
  children,
}: {
  title: ReactNode;
  /** Absent tant que la donnée n'est pas là, et en erreur : jamais un faux 0. */
  count?: HeaderCount;
  description?: ReactNode;
  /**
   * Action secondaire sous le sous-titre (« Demander au dépôt ») : la droite
   * de l'en-tête reste à « Tout voir », comme sur les autres cartes, et rien
   * ne serre le titre sur téléphone.
   */
  toolbar?: ReactNode;
  action?: ReactNode;
  titleAs?: 'h2' | 'h3';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle as={titleAs}>{titleWithCount(title, count)}</CardTitle>
            {description && <CardDescription className="text-pretty">{description}</CardDescription>}
            {toolbar && <div className="pt-2">{toolbar}</div>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}

/** Titre de groupe de tuiles (« Aujourd’hui », « À faire »). */
function GroupHeading({ id, title, description, children }: {
  id: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-0.5">
        <h2 id={id} className="text-base font-medium leading-snug">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SectionError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return <QueryErrorState title={title} error={error} onRetry={onRetry} className="py-6" />;
}

/**
 * Squelette de liste. Pas de `role="status"` : une douzaine de cartes chargent
 * en même temps, l'en-tête annonce déjà « Chargement… » une seule fois.
 */
function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3" aria-hidden="true">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Ligne d'une file de travail : un document à faire avancer. */
interface WorkItem {
  key: string | number;
  /** Page du document ; la ligne n'est un lien que si le rôle peut l'ouvrir. */
  to?: string;
  title: ReactNode;
  /** Le titre est un numéro de pièce : chasse fixe, graisse normale (signature des pièces). */
  code?: boolean;
  /** Titre long (nom de produit) : tronqué, valeur complète en infobulle. */
  titleText?: string;
  badge?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
}

function WorkList({ items }: { items: WorkItem[] }) {
  const canOpen = useRouteAccess();
  return (
    <ul className="-mx-2 divide-y">
      {items.map((item) => {
        const body = (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {item.code ? (
                  <DocumentCode className="text-sm">{item.title}</DocumentCode>
                ) : (
                  <span
                    className={cn('text-sm font-medium', item.titleText ? 'min-w-0 truncate' : 'whitespace-nowrap')}
                    title={item.titleText}
                  >
                    {item.title}
                  </span>
                )}
                {item.badge}
              </div>
              {/* Repli plutôt que troncature : la date en fin de ligne compte. */}
              {item.meta && <p className="break-words text-xs text-muted-foreground">{item.meta}</p>}
            </div>
            {item.aside && <div className="shrink-0 text-right text-sm">{item.aside}</div>}
          </>
        );
        // Pas de transition sur le survol d'une ligne de liste (interaction fréquente).
        const rowClass = 'flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2';
        return (
          <li key={item.key}>
            {item.to && canOpen(item.to) ? (
              <Link
                to={item.to}
                className={cn(rowClass, 'group hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
              >
                {body}
              </Link>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Carte « file de travail » : chargement, erreur, vide ou lignes. */
function QueueCard({
  title,
  count,
  description,
  toolbar,
  action,
  query,
  items,
  errorTitle,
  emptyTitle,
  emptyDescription,
  className,
}: {
  title: string;
  count?: HeaderCount;
  description?: ReactNode;
  toolbar?: ReactNode;
  action?: ReactNode;
  query: { data: unknown; error: unknown; reload: () => void };
  items: WorkItem[];
  errorTitle: string;
  emptyTitle: string;
  emptyDescription: string;
  className?: string;
}) {
  let content: ReactNode;
  if (query.error) content = <SectionError title={errorTitle} error={query.error} onRetry={query.reload} />;
  else if (query.data === undefined) content = <ListSkeleton />;
  else if (items.length === 0)
    content = <EmptyState compact icon={CheckCircle2} title={emptyTitle} description={emptyDescription} />;
  else content = <WorkList items={items} />;

  return (
    <SectionCard
      title={title}
      count={count}
      description={description}
      toolbar={toolbar}
      action={action}
      className={className}
    >
      {content}
    </SectionCard>
  );
}

/** Produit en stock bas : quantité en stock face à son minimum. */
interface LowStockRow {
  id: number;
  nom: string;
  reference?: string | null;
  stock: Num;
  stock_min: Num;
}

/**
 * Lignes d'une carte déjà titrée « Stock bas » : pas de pastille « Bas » sur
 * chaque ligne, la quantité en couleur d'alerte suffit ; seule la rupture
 * garde sa pastille. « 1 · min. 2 » plutôt que « 1 / 2 », qui se lisait
 * comme une fraction. Pastille d'abord : les chiffres restent alignés à droite.
 */
function lowStockItems(page: unknown): WorkItem[] {
  return rowsOf<LowStockRow>(page).map((p) => {
    const stock = num(p.stock);
    const out = stock <= 0;
    return {
      key: p.id,
      to: `/inventaire?search=${encodeURIComponent(p.reference || p.nom)}`,
      title: p.nom,
      titleText: p.nom,
      meta: p.reference ? <DocumentCode>{p.reference}</DocumentCode> : undefined,
      aside: (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          {out && <Badge variant="destructive">Rupture</Badge>}
          <span>
            <span className={cn('tabular-nums', out ? 'text-danger-700' : 'text-warning-700')}>
              {formatNumber(stock)}
            </span>
            <span className="text-muted-foreground">
              {' · min.\u00A0'}
              <span className="tabular-nums">{formatNumber(num(p.stock_min))}</span>
            </span>
          </span>
        </span>
      ),
    };
  });
}

/** Liens d'accès rapide par rôle (filtrés par `useRouteAccess`). */
const QUICK_LINKS: Record<string, readonly string[]> = {
  caissier: ['/caisse', '/factures', '/depenses', '/inventaire'],
  magasin_staff: ['/devis', '/bons-livraison', '/factures', '/inventaire', '/demandes', '/caisse'],
  // E2 : plus de commandes fournisseur pour le dépôt (quantités seulement).
  depot_staff: ['/receptions', '/stock-transfers', '/demandes', '/inventaire', '/stock-locations'],
  manager: ['/factures', '/relances', '/caisse', '/inventaire', '/commandes', '/reporting'],
  admin: ['/factures', '/relances', '/caisse', '/inventaire', '/commandes', '/reporting'],
  viewer: ['/inventaire'],
};

/** Libellés courts du menu là où le nom de page est long. */
const SHORT_LABELS: Record<string, string> = {
  '/demandes': 'Demandes',
  '/stock-transfers': 'Transferts',
};

/**
 * `hideWithSidebar` : masqué dès que le menu latéral est affiché (`lg`), dont
 * ces liens ne seraient qu'une copie ; sur téléphone et tablette le menu est
 * derrière le bouton, les accès rapides y restent utiles.
 */
function QuickLinks({ role, hideWithSidebar = false }: { role: string; hideWithSidebar?: boolean }) {
  const canOpen = useRouteAccess();
  const headingId = useId();
  const links = (QUICK_LINKS[role] ?? []).filter((path) => canOpen(path));
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className={cn('space-y-3', hideWithSidebar && 'lg:hidden')}>
      <h2 id={headingId} className="text-base font-medium leading-snug">
        Accès rapides
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {links.map((path) => {
          const Icon = iconForPath(path) ?? LayoutDashboard;
          const label = SHORT_LABELS[path] ?? routeLabel(path) ?? path;
          return (
            <li key={path}>
              <Link
                to={path}
                className="flex h-full min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium leading-tight transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {/* Libellé entier sur deux lignes plutôt que « Commandes four… ». */}
                <span className="min-w-0 text-pretty">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Caisse : « Ma caisse » (caissier, magasin) et vue d'ensemble (gérant)
// ─────────────────────────────────────────────────────────────────────────────

interface Magasin {
  id: number;
  nom: string;
  location_id: number | null;
}

interface TillSession extends CaisseCashBreakdown {
  id: number;
  date_ouverture?: string | null;
  fond_initial?: Num;
  ouvert_par_username?: string | null;
  /** Nom complet de la personne (CPG2-05). */
  ouvert_par_nom?: string | null;
  session_age_hours?: Num | null;
  requires_manager_action?: boolean;
}

interface Till {
  magasin: Magasin;
  /** `null` : caisse fermée ; absent : la vérification a échoué (`error`). */
  session?: TillSession | null;
  error?: unknown;
}

/** Au-delà, les caisses ne sont pas vérifiées une à une (une requête chacune). */
const MAX_TILLS = 8;

/** Une session ouverte depuis 24 h bloque les encaissements (STALE_CASH_SESSION). */
const isStale = (s: TillSession) => s.requires_manager_action === true || num(s.session_age_hours) >= 24;

function useTills(refreshKey: number, enabled = true) {
  const magasins = useQuery<Magasin[]>(
    `caisse-magasins#${refreshKey}`,
    async () => rowsOf<Magasin>(await caisseService.getMagasins()),
    enabled
  );
  const checked = (magasins.data ?? []).slice(0, MAX_TILLS);
  const ids = checked.map((m) => m.id).join(',');
  const tills = useQuery<Till[]>(
    `caisse-sessions#${ids}#${refreshKey}`,
    () =>
      Promise.all(
        checked.map(async (magasin): Promise<Till> => {
          try {
            return { magasin, session: (await caisseService.getSessionActive(magasin.id)) as TillSession | null };
          } catch (error) {
            return { magasin, error: error ?? new Error('Échec du chargement') };
          }
        })
      ),
    enabled && magasins.data !== undefined
  );
  const unchecked = Math.max(0, (magasins.data?.length ?? 0) - MAX_TILLS);
  return { magasins, tills, unchecked };
}

/**
 * Complément de la pastille « Ouverte » : « depuis 08:05 », « depuis le
 * 23 oct. 2026 à 13:08 par Adjoua Yao ». La pastille dit déjà « Ouverte » :
 * le mot n'est pas répété. `null` sans date d'ouverture.
 */
function openedLabel(session: TillSession, currentUsername?: string): string | null {
  const opened = session.date_ouverture;
  if (!opened) return null;
  const when = isSameLocalDay(opened) ? formatTime(opened) : `le ${formatDateTime(opened)}`;
  const by =
    session.ouvert_par_username && session.ouvert_par_username !== currentUsername
      ? ` par ${session.ouvert_par_nom || session.ouvert_par_username}`
      : '';
  return `depuis ${when}${by}`;
}

/**
 * Ligne de l'équation du tiroir : libellé à gauche, montant à droite — un
 * montant n'en touche jamais un autre (GV-02). `sign` écrit l'opération sur
 * le montant (« +680 900 », « −64 900 ») ; `total` tire le trait du résultat.
 */
function TillAmountRow({
  label,
  value,
  sign,
  total = false,
}: {
  label: string;
  value: Num | null | undefined;
  sign?: '+' | '−';
  total?: boolean;
}) {
  // `toNumber` et non `num` : un montant absent reste « — », jamais 0.
  const n = toNumber(value);
  const shown = n !== null && sign === '−' ? -n : n;
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3', total && 'mt-1 border-t pt-2')}>
      <dt className={total ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      {/* Unité en ligne, comme tout montant de taille courante : l'unité
          « discrète » des tuiles (0,7 em) tomberait ici sous 10 px. */}
      <dd>
        <Money value={shown} signed={sign !== undefined} emphasis={total} />
      </dd>
    </div>
  );
}

function TillBlock({ till, showName, onRetry }: { till: Till; showName: boolean; onRetry: () => void }) {
  const { user } = useAuth();
  const s = till.session;
  const takings = (s?.par_methode ?? []).filter((m) => num(m.total_encaissements) > 0);
  const isManagerRole = user?.role === 'admin' || user?.role === 'manager';
  // P-M2 : ouverte un jour précédent, pas encore bloquée — à clôturer maintenant.
  const late = s && !isStale(s) ? previousDayTill(s.date_ouverture) : null;
  const since = s ? openedLabel(s, user?.username) : null;

  return (
    <div className="space-y-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {showName && <p className="me-1 text-sm font-medium">{till.magasin.nom}</p>}
        {!till.error && (s ? <StatusBadge type="session_caisse" statut="ouverte" /> : <Badge variant="secondary">Fermée</Badge>)}
        {since && <span className="text-sm text-muted-foreground">{since}</span>}
      </div>

      {till.error ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <CircleAlert className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
          <span>Impossible de vérifier cette caisse</span>
          <Button variant="link" size="sm" className="h-6 px-1" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : !s ? (
        <p className="text-sm text-muted-foreground">La caisse est fermée. Ouvrez-la pour encaisser des espèces.</p>
      ) : (
        <>
          {isStale(s) && (
            <p className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />
              {isManagerRole
                ? 'Plus de 24 h sans clôture : contrôlez la caisse puis clôturez-la'
                : 'Plus de 24 h sans clôture : les encaissements sont bloqués. Faites contrôler et clôturer la caisse par le gérant.'}
            </p>
          )}
          {late && (
            <div className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium text-warning-900">{late.title}</p>
                <p>
                  Comptez le tiroir et clôturez-la maintenant, puis ouvrez la caisse du jour. {late.blockedAtLabel}, les
                  encaissements seront bloqués{' '}
                  {isManagerRole ? 'tant qu’elle ne sera pas clôturée' : 'jusqu’au passage d’un gérant'}.
                </p>
              </div>
            </div>
          )}
          {/* Le tiroir en une équation, comme sur le brouillard de caisse :
              fonds + espèces encaissées − sorties = espèces attendues. Libellé à
              gauche, montant à droite : trois montants côte à côte se collaient
              dès 1 000 000 FCFA (« 680 900 FCFA64 900 FCFA », GV-02). */}
          <dl className="grid gap-1 text-sm">
            <TillAmountRow label="Fonds de caisse" value={s.fond_initial} />
            <TillAmountRow label="Espèces encaissées" value={s.especes_encaissees} sign="+" />
            <TillAmountRow label="Sorties d’espèces" value={s.especes_decaissees} sign="−" />
            <TillAmountRow label="Espèces attendues en caisse" value={s.expected_cash} total />
          </dl>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Encaissé depuis l’ouverture</p>
            {takings.length > 0 ? (
              <ul className="space-y-1.5">
                {takings.map((m) => (
                  <li key={m.methode_paiement} className="flex items-center justify-between gap-3 text-sm">
                    <Tag hue={paymentMethodHue(m.methode_paiement)}>{formatPaymentMethod(m.methode_paiement)}</Tag>
                    <Money value={m.total_encaissements} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun encaissement depuis l’ouverture</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CaisseCard({ magasins, tills, unchecked, className }: {
  magasins: Query<Magasin[]>;
  tills: Query<Till[]>;
  unchecked: number;
  className?: string;
}) {
  const list = magasins.data ?? [];
  const action = <HeaderLink to="/caisse">Aller à la caisse</HeaderLink>;

  let content: ReactNode;
  if (magasins.error) {
    content = (
      <SectionError title="Impossible de vérifier l’état de la caisse" error={magasins.error} onRetry={magasins.reload} />
    );
  } else if (magasins.data === undefined || (list.length > 0 && tills.data === undefined)) {
    content = <ListSkeleton rows={2} />;
  } else if (list.length === 0) {
    content = (
      <EmptyState
        compact
        icon={Store}
        title="Aucun magasin ne vous est affecté"
        description="Demandez à votre gérant de vous affecter à un magasin pour tenir sa caisse"
      />
    );
  } else {
    content = (
      <div className="divide-y">
        {(tills.data ?? []).map((till) => (
          <TillBlock key={till.magasin.id} till={till} showName={list.length > 1} onRetry={tills.reload} />
        ))}
        {unchecked > 0 && (
          <p className="pt-3 text-xs text-muted-foreground">
            {plural(unchecked, 'autre magasin n’est pas affiché', 'autres magasins ne sont pas affichés')} ici : ouvrez la
            caisse pour les voir
          </p>
        )}
      </div>
    );
  }

  return (
    <SectionCard
      title={list.length > 1 ? 'Mes caisses' : 'Ma caisse'}
      description={list.length === 1 ? list[0].nom : undefined}
      action={action}
      className={className}
    >
      {content}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub caissier : « Ma caisse » + les ventes du jour
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: number;
  numero_facture?: string;
  statut?: string;
  total?: Num;
  montant_paye?: Num;
  remaining_due?: Num;
  client_nom?: string | null;
  client_prenom?: string | null;
  date_facture?: string;
  location_id?: number | null;
}

/** Factures lues pour reconstituer « aujourd’hui » (l'API n'a pas de filtre par date). */
const INVOICE_SCAN_LIMIT = 100;

const resteDu = (f: InvoiceRow) =>
  f.remaining_due !== undefined && f.remaining_due !== null ? num(f.remaining_due) : num(f.total) - num(f.montant_paye);

function summarizeToday(page: unknown, magasins: Magasin[] | undefined) {
  const rows = rowsOf<InvoiceRow>(page);
  const shopIds = new Set(
    (magasins ?? []).map((m) => m.location_id).filter((id): id is number => typeof id === 'number')
  );
  // Factures sans emplacement (anciennes données) : gardées, plutôt que cachées.
  const inShop = (f: InvoiceRow) => shopIds.size === 0 || f.location_id == null || shopIds.has(f.location_id);
  const todays = rows.filter((f) => isSameLocalDay(f.date_facture) && f.statut !== 'annulee' && inShop(f));
  const unpaid = todays.filter((f) => f.statut === 'en_attente' || f.statut === 'partielle');
  return {
    // Toutes les lignes lues datent d'aujourd'hui : il peut y en avoir d'autres.
    truncated: rows.length >= INVOICE_SCAN_LIMIT && rows.every((f) => isSameLocalDay(f.date_facture)),
    count: todays.length,
    total: todays.reduce((s, f) => s + num(f.total), 0),
    unpaid,
    due: unpaid.reduce((s, f) => s + resteDu(f), 0),
  };
}

function CaissierHub() {
  const canOpen = useRouteAccess();
  const vente = useVenteParDefaut();
  const todayId = useId();
  const [refreshKey, setRefreshKey] = useState(0);
  const { magasins, tills, unchecked } = useTills(refreshKey);
  const invoices = useQuery(`factures-du-jour#${refreshKey}`, () =>
    factureService.getAll(undefined, undefined, 1, INVOICE_SCAN_LIMIT, 'date_facture', 'desc')
  );
  const busy = anyLoading(magasins, tills, invoices);
  const lastUpdated = useLastUpdated(busy);
  const today = useMemo(() => summarizeToday(invoices.data, magasins.data), [invoices.data, magasins.data]);

  // Caisse fermée partout (et vérifiée) : l'action du moment est de l'ouvrir.
  const tillList = tills.data ?? [];
  const allClosed = tillList.length > 0 && tillList.every((t) => !t.error && !t.session);
  // P-M2 : caisse de la veille encore ouverte (et pas encore bloquée) — la
  // clôturer passe avant la première vente du jour.
  const lateTill = tillList
    .map((t) => ({ till: t, late: t.session && !isStale(t.session) ? previousDayTill(t.session.date_ouverture) : null }))
    .find((x) => x.late !== null);
  const primaryAction =
    lateTill?.late && canOpen('/caisse') ? (
      <PrimaryLink to={`/caisse?magasin=${lateTill.till.magasin.id}&cloture=1`} icon={Lock}>
        {lateTill.late.closeLabel}
      </PrimaryLink>
    ) : allClosed && canOpen('/caisse') ? (
      <PrimaryLink to="/caisse" icon={LockOpen}>
        Ouvrir la caisse
      </PrimaryLink>
    ) : vente ? (
      <PrimaryLink to={vente.path} icon={CirclePlus}>
        {vente.label}
      </PrimaryLink>
    ) : undefined;

  const invoicesLoading = invoices.data === undefined && !invoices.error;
  const countHint = today.truncated
    ? `Au moins ${formatNumber(INVOICE_SCAN_LIMIT)} factures`
    : today.count === 0
      ? 'Aucune facture pour le moment'
      : plural(today.count, 'facture', 'factures');

  const unpaidItems: WorkItem[] = today.unpaid.slice(0, 6).map((f) => ({
    key: f.id,
    to: `/factures/${f.id}`,
    title: f.numero_facture || `Facture n° ${f.id}`,
    code: !!f.numero_facture,
    badge: <StatusBadge type="facture" statut={f.statut} />,
    meta: `${f.date_facture ? formatTime(f.date_facture) : '—'} · ${clientName(f)}`,
    aside: (
      <div>
        <p className="text-xs text-muted-foreground">Reste dû</p>
        <Money value={resteDu(f)} />
      </div>
    ),
  }));

  return (
    <PageShell
      title="Tableau de bord"
      description="Votre caisse et les ventes du jour"
      actions={<RefreshControls busy={busy} lastUpdated={lastUpdated} onRefresh={() => setRefreshKey((k) => k + 1)} />}
      primaryAction={primaryAction}
    >
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
        <CaisseCard magasins={magasins} tills={tills} unchecked={unchecked} className="lg:col-span-2" />

        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-span-3">
          <section aria-labelledby={todayId} className="space-y-3">
            <GroupHeading id={todayId} title="Aujourd’hui" description={todayLabel()} />
            <StatGrid>
              <StatTile
                label="Ventes du jour"
                value={today.total}
                format="money"
                hint={countHint}
                loading={invoicesLoading}
                unavailable={!!invoices.error}
              />
              <StatTile
                label="Reste à encaisser"
                value={today.due}
                format="money"
                // Aucune facture : « Ventes du jour » et la file ci-dessous le disent déjà.
                hint={
                  today.count === 0
                    ? undefined
                    : today.unpaid.length === 0
                    ? 'Toutes les factures du jour sont soldées'
                    : `Sur ${plural(today.unpaid.length, 'facture du jour non soldée', 'factures du jour non soldées')}`
                }
                loading={invoicesLoading}
                unavailable={!!invoices.error}
              />
            </StatGrid>
          </section>

          <QueueCard
            title="Factures du jour non soldées"
            description="Ouvrez une facture pour enregistrer son paiement"
            action={<SeeAllLink to="/factures?statut=en_attente" context="factures non payées" />}
            query={invoices}
            items={unpaidItems}
            errorTitle="Impossible de charger les factures du jour"
            emptyTitle={
              today.count === 0 ? 'Aucune facture aujourd’hui' : 'Toutes les factures du jour sont soldées'
            }
            emptyDescription="Les factures du jour qui attendent un paiement apparaîtront ici"
          />
        </div>
      </div>

      <QuickLinks role="caissier" hideWithSidebar />
    </PageShell>
  );
}

/** « jeudi 23 oct. 2026 » */
function todayLabel(): string {
  const now = new Date();
  return `${now.toLocaleDateString('fr-FR', { weekday: 'long' })} ${formatDate(now)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub magasin : devis, bons de livraison, demandes, stock du magasin, caisse
// ─────────────────────────────────────────────────────────────────────────────

interface SalesDocRow {
  id: number;
  numero_devis?: string;
  numero_bl?: string;
  statut?: string;
  total?: Num;
  date_devis?: string;
  date_bl?: string;
  client_nom?: string | null;
  client_prenom?: string | null;
}

const byDateDesc = (date: (r: SalesDocRow) => string | undefined) => (a: SalesDocRow, b: SalesDocRow) =>
  new Date(date(b) ?? 0).getTime() - new Date(date(a) ?? 0).getTime();

function MagasinHub() {
  const canOpen = useRouteAccess();
  const todoId = useId();
  const [refreshKey, setRefreshKey] = useState(0);

  const devis = useQuery(`devis-a-confirmer#${refreshKey}`, async () => {
    const [brouillon, envoye] = await Promise.all([
      devisService.getAll(undefined, 'brouillon', 1, 5, 'date_devis', 'desc'),
      devisService.getAll(undefined, 'envoye', 1, 5, 'date_devis', 'desc'),
    ]);
    return { brouillon, envoye };
  });
  const bls = useQuery(`bl-a-traiter#${refreshKey}`, async () => {
    const [aLivrer, aFacturer] = await Promise.all([
      bonLivraisonService.getAll(undefined, 'valide', 1, 5, 'date_bl', 'desc'),
      bonLivraisonService.getAll(undefined, 'livre', 1, 5, 'date_bl', 'desc'),
    ]);
    return { aLivrer, aFacturer };
  });
  const demandes = useQuery(
    `demandes-a-cloturer#${refreshKey}`,
    () => demandeService.getAll({ statut: 'livree', limit: 5 }),
    canOpen('/demandes')
  );
  const toClose = demandes.data ? totalOf(demandes.data) : 0;
  const { magasins, tills, unchecked } = useTills(refreshKey);
  const shop = magasins.data?.[0];
  const shopLocation = shop?.location_id ?? null;
  const lowStock = useQuery(
    `stock-bas-magasin#${shopLocation}#${refreshKey}`,
    () => produitService.getAll(undefined, undefined, true, 1, 5, 'stock', 'asc', shopLocation ?? undefined),
    shopLocation !== null
  );

  const busy = anyLoading(devis, bls, demandes, magasins, tills, lowStock);
  const lastUpdated = useLastUpdated(busy);

  const devisCount = devis.data ? totalOf(devis.data.brouillon) + totalOf(devis.data.envoye) : undefined;
  const devisItems: WorkItem[] = devis.data
    ? [...rowsOf<SalesDocRow>(devis.data.brouillon), ...rowsOf<SalesDocRow>(devis.data.envoye)]
        .sort(byDateDesc((r) => r.date_devis))
        .slice(0, 5)
        .map((d) => ({
          key: d.id,
          to: `/devis/${d.id}`,
          title: d.numero_devis || `Devis n° ${d.id}`,
          code: !!d.numero_devis,
          badge: <StatusBadge type="devis" statut={d.statut} />,
          meta: `${formatDate(d.date_devis)} · ${clientName(d)}`,
          aside: <Money value={d.total ?? null} />,
        }))
    : [];
  // À livrer d'abord : c'est le client qui attend.
  const blItems: WorkItem[] = bls.data
    ? [...rowsOf<SalesDocRow>(bls.data.aLivrer), ...rowsOf<SalesDocRow>(bls.data.aFacturer)].slice(0, 5).map((b) => ({
        key: b.id,
        to: `/bons-livraison/${b.id}`,
        title: b.numero_bl || `Bon de livraison n° ${b.id}`,
        code: !!b.numero_bl,
        badge: <StatusBadge type="bl" statut={b.statut} />,
        meta: `${formatDate(b.date_bl)} · ${clientName(b)}`,
        aside: <Money value={b.total ?? null} />,
      }))
    : [];

  // Magasin inconnu : la carte stock le dit au lieu d'afficher un faux zéro.
  const noShop = magasins.data !== undefined && shopLocation === null;
  const stockCard = magasins.error
    ? { data: undefined, error: magasins.error, reload: magasins.reload }
    : noShop
      ? { data: [], error: undefined, reload: magasins.reload }
      : lowStock;
  const stockLink = shopLocation ? `/inventaire?low_stock=true&location_id=${shopLocation}` : '/inventaire?low_stock=true';
  const blCount: HeaderCount | undefined = bls.data
    ? [
        { n: totalOf(bls.data.aLivrer), label: 'à livrer' },
        { n: totalOf(bls.data.aFacturer), label: 'à facturer' },
      ]
    : undefined;

  return (
    <PageShell
      title="Tableau de bord"
      description="Devis, livraisons et demandes à faire avancer"
      actions={
        <>
          <RefreshControls busy={busy} lastUpdated={lastUpdated} onRefresh={() => setRefreshKey((k) => k + 1)} />
          {canOpen('/factures/nouvelle') && (
            <SecondaryLink to="/factures/nouvelle" icon={FileText}>
              Nouvelle facture
            </SecondaryLink>
          )}
        </>
      }
      primaryAction={
        canOpen('/devis/nouveau') ? (
          <PrimaryLink to="/devis/nouveau" icon={CirclePlus}>
            Nouveau devis
          </PrimaryLink>
        ) : undefined
      }
    >
      {/* Les autres comptes sont dans l'en-tête de leur carte : celui-ci n'a pas
          de carte. Une seule ligne pleine largeur, seulement quand une demande
          attend la confirmation du magasin — une tuile seule laissait une
          demi-rangée vide. Un échec reste visible (jamais un faux « rien »). */}
      {canOpen('/demandes') && (demandes.error || toClose > 0) && (
        <section aria-labelledby={todoId}>
          <h2 id={todoId} className="sr-only">
            À faire
          </h2>
          {demandes.error ? (
            <SectionError
              title="Impossible de vérifier les demandes à clôturer"
              error={demandes.error}
              onRetry={demandes.reload}
            />
          ) : (
            <Link
              to="/demandes?statut=livree"
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="font-medium tabular-nums">{toClose}</span>{' '}
                {toClose > 1 ? 'demandes à clôturer' : 'demande à clôturer'}
                <span className="text-muted-foreground"> · stock arrivé, confirmez la réception</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      {/* Deux piles indépendantes dès `lg` : une carte courte ne laisse plus de
          trou sous elle. Documents à gauche (devis, BL), stock et caisse à droite :
          sur téléphone l'ordre reste celui du travail — devis, BL, stock, caisse. */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <QueueCard
            title="Devis à confirmer"
            count={devisCount}
            description="Brouillons et devis envoyés : confirmez-en un pour créer son bon de livraison"
            action={<SeeAllLink to="/devis" context="devis" />}
            query={devis}
            items={devisItems}
            errorTitle="Impossible de charger les devis"
            emptyTitle="Aucun devis à confirmer"
            emptyDescription="Les devis en brouillon ou envoyés au client apparaîtront ici"
          />
          <QueueCard
            title="Bons de livraison à traiter"
            count={blCount}
            description="À livrer d’abord, puis à facturer une fois livrés"
            action={<SeeAllLink to="/bons-livraison" context="bons de livraison" />}
            query={bls}
            items={blItems}
            errorTitle="Impossible de charger les bons de livraison"
            emptyTitle="Aucun bon de livraison à traiter"
            emptyDescription="Les bons à livrer ou à facturer apparaîtront ici"
          />
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <QueueCard
            title="Stock bas au magasin"
            count={!noShop && lowStock.data ? totalOf(lowStock.data) : undefined}
            description={shop ? `Produits sous leur stock minimum à ${shop.nom}` : 'Produits sous leur stock minimum'}
            toolbar={
              canOpen('/demandes/nouvelle') ? (
                <Link to="/demandes/nouvelle" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Demander au dépôt
                </Link>
              ) : undefined
            }
            action={noShop ? undefined : <SeeAllLink to={stockLink} context="produits en stock bas au magasin" />}
            query={stockCard}
            items={noShop ? [] : lowStockItems(lowStock.data)}
            errorTitle="Impossible de charger le stock du magasin"
            emptyTitle={noShop ? 'Aucun magasin ne vous est affecté' : 'Aucun produit sous son stock minimum'}
            emptyDescription={
              noShop
                ? 'Demandez à votre gérant de vous affecter à un magasin'
                : 'Le stock du magasin couvre tous les minimums'
            }
          />
          <CaisseCard magasins={magasins} tills={tills} unchecked={unchecked} />
        </div>
      </div>

      <QuickLinks role="magasin_staff" hideWithSidebar />
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub dépôt : réceptions, demandes, transferts, stock du dépôt — sans montants
// ─────────────────────────────────────────────────────────────────────────────

interface PendingOrderRow {
  id: number;
  numero_commande?: string;
  fournisseur_nom?: string | null;
  date_commande?: string;
  date_livraison_prevue?: string | null;
}

interface DemandeRow {
  id: number;
  numero?: string;
  statut?: string;
  magasin_nom?: string | null;
  depot_id?: number | null;
  date_creation?: string;
  date_envoi?: string | null;
  date_decision?: string | null;
}

interface TransferRow {
  id: number;
  numero_transfer?: string;
  statut?: string;
  source_nom?: string | null;
  destination_nom?: string | null;
  date_transfer?: string;
}

interface LocationRow {
  id: number;
  nom: string;
  actif?: boolean;
  location_type?: string | null;
  responsable_id?: number | null;
}

/**
 * Le dépôt de l'utilisateur : aucune API ne le donne directement. Ordre :
 * le dépôt dont il est responsable, le seul dépôt actif, ou celui des demandes
 * qu'il voit (l'API les filtre déjà sur ses dépôts).
 */
function chooseDepot(locations: unknown, userId: number | undefined, demandeDepotIds: number[]): LocationRow | null {
  const depots = rowsOf<LocationRow>(locations).filter((l) => l.location_type === 'depot' && l.actif !== false);
  return (
    depots.find((d) => userId !== undefined && d.responsable_id === userId) ??
    (depots.length === 1 ? depots[0] : undefined) ??
    depots.find((d) => demandeDepotIds.includes(d.id)) ??
    null
  );
}

/** Prochaine étape d'une ligne-lien : même dessin que les liens des tuiles (gris, chevron). */
function ActionHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-sm font-medium text-muted-foreground group-hover:text-foreground">
      {children}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

/** Trajet d'une marchandise (« Dépôt Vridi → Hitek Plateau »), lu « … vers … » comme sur Transferts. */
function GoodsRoute({ from, to }: { from?: string | null; to?: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span>{from || '—'}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only"> vers </span>
      <span>{to || '—'}</span>
    </span>
  );
}

function DepotHub() {
  const { user } = useAuth();
  const canOpen = useRouteAccess();
  const [refreshKey, setRefreshKey] = useState(0);

  const pending = useQuery(`receptions-en-attente#${refreshKey}`, () => receptionService.getPending(), canOpen('/receptions'));
  const demandes = useQuery(
    `demandes-depot#${refreshKey}`,
    async () => {
      const [envoyee, approuvee, partielle] = await Promise.all([
        demandeService.getAll({ statut: 'envoyee', limit: 5 }),
        demandeService.getAll({ statut: 'approuvee', limit: 5 }),
        demandeService.getAll({ statut: 'partiellement_approuvee', limit: 5 }),
      ]);
      return { envoyee, approuvee, partielle };
    },
    canOpen('/demandes')
  );
  const transfers = useQuery(
    `transferts-en-cours#${refreshKey}`,
    async () => {
      const [preparation, livraison] = await Promise.all([
        stockTransferService.getAll(undefined, 'en_preparation', 1, 5),
        stockTransferService.getAll(undefined, 'en_cours', 1, 5),
      ]);
      return { preparation, livraison };
    },
    canOpen('/stock-transfers')
  );
  const locations = useQuery(`emplacements#${refreshKey}`, () => stockLocationService.getAll());

  const demandeRows = demandes.data
    ? [
        ...rowsOf<DemandeRow>(demandes.data.envoyee),
        ...rowsOf<DemandeRow>(demandes.data.approuvee),
        ...rowsOf<DemandeRow>(demandes.data.partielle),
      ]
    : [];
  const depotIdsKey = [...new Set(demandeRows.map((d) => d.depot_id).filter((id): id is number => typeof id === 'number'))]
    .sort((a, b) => a - b)
    .join(',');
  const depot = useMemo(
    () => chooseDepot(locations.data, user?.id, depotIdsKey ? depotIdsKey.split(',').map(Number) : []),
    [locations.data, user?.id, depotIdsKey]
  );
  const lowStock = useQuery(
    `stock-bas-depot#${depot?.id}#${refreshKey}`,
    () => produitService.getAll(undefined, undefined, true, 1, 5, 'stock', 'asc', depot?.id),
    depot !== null
  );

  const busy = anyLoading(pending, demandes, transfers, locations, lowStock);
  const lastUpdated = useLastUpdated(busy);

  const pendingRows = rowsOf<PendingOrderRow>(pending.data);
  const oldest = pendingRows[0];
  const startOfToday = toLocalDay(new Date());
  const pendingItems: WorkItem[] = pendingRows.slice(0, 5).map((c) => {
    const due = toLocalDay(c.date_livraison_prevue);
    const late = !!due && !!startOfToday && due < startOfToday;
    return {
      key: c.id,
      to: `/receptions?commande_id=${c.id}`,
      title: c.numero_commande || `Commande n° ${c.id}`,
      code: !!c.numero_commande,
      badge: late ? <Badge variant="warning">En retard</Badge> : undefined,
      meta: `${c.fournisseur_nom || 'Fournisseur non renseigné'} · ${
        c.date_livraison_prevue ? `livraison prévue le ${formatDate(c.date_livraison_prevue)}` : 'livraison non planifiée'
      }`,
      aside: <ActionHint>Réceptionner</ActionHint>,
    };
  });

  const demandeItems: WorkItem[] = demandeRows.slice(0, 5).map((d) => ({
    key: d.id,
    to: `/demandes/${d.id}`,
    title: d.numero || `Demande n° ${d.id}`,
    code: !!d.numero,
    badge: <StatusBadge type="demande" statut={d.statut} />,
    meta:
      d.statut === 'envoyee'
        ? `${d.magasin_nom || 'Magasin'} · envoyée le ${formatDate(d.date_envoi ?? d.date_creation)}`
        : `${d.magasin_nom || 'Magasin'} · décidée le ${formatDate(d.date_decision)}`,
    aside: <ActionHint>{d.statut === 'envoyee' ? 'Décider' : 'Exécuter'}</ActionHint>,
  }));

  const transferRows = transfers.data
    ? [...rowsOf<TransferRow>(transfers.data.preparation), ...rowsOf<TransferRow>(transfers.data.livraison)]
    : [];
  const transferItems: WorkItem[] = transferRows.slice(0, 5).map((t) => ({
    key: t.id,
    // Ouvre le panneau du transfert sur la liste.
    to: `/stock-transfers?transfert=${t.id}`,
    title: t.numero_transfer || `Transfert n° ${t.id}`,
    code: !!t.numero_transfer,
    badge: <StatusBadge type="transfert" statut={t.statut} />,
    meta: (
      <>
        <GoodsRoute from={t.source_nom} to={t.destination_nom} /> · {formatDate(t.date_transfer)}
      </>
    ),
  }));

  // Dépôt introuvable : la carte le dit (au lieu d'un zéro trompeur). Les
  // demandes servent d'indice : on attend qu'elles aient répondu (ou échoué).
  const demandesSettled = demandes.data !== undefined || !!demandes.error || !canOpen('/demandes');
  const depotUnknown = locations.data !== undefined && depot === null && demandesSettled;
  const stockCard = locations.error
    ? { data: undefined, error: locations.error, reload: locations.reload }
    : depotUnknown
      ? { data: [], error: undefined, reload: locations.reload }
      : lowStock;
  const stockLink = depot ? `/inventaire?low_stock=true&location_id=${depot.id}` : '/inventaire?low_stock=true';
  const demandeCount: HeaderCount | undefined = demandes.data
    ? [
        { n: totalOf(demandes.data.envoyee), label: 'à décider' },
        { n: totalOf(demandes.data.approuvee) + totalOf(demandes.data.partielle), label: 'à exécuter' },
      ]
    : undefined;

  return (
    <PageShell
      title="Tableau de bord"
      description="Réceptions, demandes et transferts à traiter"
      actions={<RefreshControls busy={busy} lastUpdated={lastUpdated} onRefresh={() => setRefreshKey((k) => k + 1)} />}
      primaryAction={
        oldest && canOpen('/receptions') ? (
          <PrimaryLink to={`/receptions?commande_id=${oldest.id}`} icon={Truck}>
            Réceptionner {oldest.numero_commande || 'la commande'}
          </PrimaryLink>
        ) : undefined
      }
    >
      {/* Plus de rangée de tuiles : chaque compte est dans l'en-tête de sa
          carte, au-dessus de ses lignes. Deux piles indépendantes dès `lg` :
          une carte courte ne laisse plus de trou sous elle. Sur téléphone,
          l'ordre de lecture est celui du travail — réceptions, demandes,
          transferts, stock. */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          {canOpen('/receptions') && (
            <QueueCard
              title="Commandes à réceptionner"
              count={pending.data ? pendingRows.length : undefined}
              description="Validées ou expédiées, les plus anciennes d’abord"
              action={<SeeAllLink to="/receptions" context="réceptions" />}
              query={pending}
              items={pendingItems}
              errorTitle="Impossible de charger les commandes à réceptionner"
              emptyTitle="Aucune commande à réceptionner"
              emptyDescription="Les commandes fournisseur validées apparaîtront ici à leur arrivée"
            />
          )}
          {canOpen('/demandes') && (
            <QueueCard
              title="Demandes à traiter"
              count={demandeCount}
              description="À décider, puis à exécuter en créant le transfert"
              action={<SeeAllLink to="/demandes" context="demandes" />}
              query={demandes}
              items={demandeItems}
              errorTitle="Impossible de charger les demandes"
              emptyTitle="Aucune demande à traiter"
              emptyDescription="Les demandes envoyées par les magasins apparaîtront ici"
            />
          )}
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-6">
          {canOpen('/stock-transfers') && (
            <QueueCard
              title="Transferts en cours"
              count={
                transfers.data ? totalOf(transfers.data.preparation) + totalOf(transfers.data.livraison) : undefined
              }
              description="En préparation au dépôt ou en route vers un magasin"
              action={<SeeAllLink to="/stock-transfers" context="transferts" />}
              query={transfers}
              items={transferItems}
              errorTitle="Impossible de charger les transferts"
              emptyTitle="Aucun transfert en cours"
              emptyDescription="Les transferts entre dépôt et magasins apparaîtront ici"
            />
          )}
          <QueueCard
            title="Stock bas au dépôt"
            count={!depotUnknown && lowStock.data ? totalOf(lowStock.data) : undefined}
            description={depot ? `Produits sous leur stock minimum à ${depot.nom}` : 'Produits sous leur stock minimum'}
            toolbar={
              canOpen('/reapprovisionnement') ? (
                <Link to="/reapprovisionnement" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Suggestions d’achat
                </Link>
              ) : undefined
            }
            action={depotUnknown ? undefined : <SeeAllLink to={stockLink} context="produits en stock bas au dépôt" />}
            query={stockCard}
            items={depotUnknown ? [] : lowStockItems(lowStock.data)}
            errorTitle="Impossible de charger le stock du dépôt"
            emptyTitle={depotUnknown ? 'Dépôt non identifié' : 'Aucun produit sous son stock minimum'}
            emptyDescription={
              depotUnknown
                ? 'Ouvrez l’inventaire et choisissez votre dépôt pour voir son stock'
                : 'Le stock du dépôt couvre tous les minimums'
            }
          />
        </div>
      </div>

      <QuickLinks role="depot_staff" hideWithSidebar />
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub gérant / administrateur : « À traiter », « Aujourd’hui », analyse
// ─────────────────────────────────────────────────────────────────────────────

type Period = 7 | 30 | 90;
const PERIODS: Period[] = [7, 30, 90];
const PERIOD_OPTIONS = PERIODS.map((p) => ({
  value: String(p) as `${Period}`,
  label: (
    <>
      <span aria-hidden="true">{p}&nbsp;j</span>
      <span className="sr-only">{p} derniers jours</span>
    </>
  ),
}));

/** Lundi d'abord, comme le calendrier français. */
const WEEKDAYS = [
  { day: 1, label: 'Lun', name: 'lundi' },
  { day: 2, label: 'Mar', name: 'mardi' },
  { day: 3, label: 'Mer', name: 'mercredi' },
  { day: 4, label: 'Jeu', name: 'jeudi' },
  { day: 5, label: 'Ven', name: 'vendredi' },
  { day: 6, label: 'Sam', name: 'samedi' },
  { day: 0, label: 'Dim', name: 'dimanche' },
];


/** `/reports/alerts` plafonne chacune de ses listes à 20 lignes (ReportingService.getAlerts). */
const ALERT_LIST_LIMIT = 20;

/** Au-delà, les catégories sont regroupées en « Autres » : la palette compte 7 teintes. */
const MAX_CATEGORY_SLICES = 6;

/** Mois complets comparés à l'an dernier (`/reports/yoy`), qui finissent le mois dernier. */
const YOY_MONTHS = 3;

const PIPELINE = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'validee', label: 'Validées' },
  { key: 'expediee', label: 'Expédiées' },
  { key: 'livree', label: 'Reçues' },
] as const;

/**
 * Aplat de chaque teinte catégorielle (`paymentMethodHue`, comme la pastille de
 * `<Tag>`) ; mode inconnu → graphite. Classes écrites en entier pour Tailwind.
 */
const HUE_FILL: Record<number, string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
};
const hueFill = (hue: number | undefined) => (hue ? HUE_FILL[hue] : undefined) ?? 'bg-chart-rest';

interface TopProductRow { id: number | null; nom: string | null; total_quantite: Num; total_ventes: Num }
interface TopClientRow { nom: string | null; prenom: string | null; nombre_factures: Num; total_depenses: Num }
interface CategoryRow { categorie: string; total_unites: Num; valeur_vente: Num }
type CommandeStats = Partial<Record<(typeof PIPELINE)[number]['key'], Num>>;
interface PaiementStats {
  par_methode?: { methode_paiement: string | null; nombre: Num; total: Num }[];
  aujourdhui?: { nombre?: Num; total?: Num };
}
interface AlertsData { overdue_invoices?: unknown[]; pending_orders?: unknown[] }
interface ClosureRow { id: number; date_cloture?: string | null; ecart?: Num | null }
interface YoYRow { mois_num: string; chiffre_affaires: Num }
interface YoYData { current_year?: YoYRow[]; previous_year?: YoYRow[]; variation_pct?: number }
interface ForecastData {
  historique?: { mois: string; chiffre_affaires: Num }[];
  forecast?: { mois: string; prevision: Num; min: Num; max: Num };
}

/** Une vérification du bandeau « À traiter ». */
interface Check {
  key: string;
  /** Nom de la vérification quand elle échoue (« factures échues »). */
  name: string;
  state: 'loading' | 'error' | 'ready';
  n: number;
  /** Liste plafonnée par l'API : « Au moins 20 … ». */
  capped?: boolean;
  one: string;
  many: string;
  to?: string;
  icon: LucideIcon;
  retry: () => void;
}

function checkState(q: { data: unknown; error: unknown }): Check['state'] {
  if (q.error) return 'error';
  return q.data === undefined ? 'loading' : 'ready';
}

/**
 * Ce qui demande une action du gérant, toutes sources confondues. Jamais
 * « Rien à traiter » quand une vérification a échoué : le bandeau le dit.
 */
function AttentionBanner({ checks }: { checks: Check[] }) {
  const headingId = useId();
  const items = checks.filter((c) => c.state === 'ready' && c.n > 0);
  const failed = checks.filter((c) => c.state === 'error');
  const pending = checks.filter((c) => c.state === 'loading');
  const retryFailed = () => failed.forEach((c) => c.retry());

  const failureLine =
    failed.length > 0 ? (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <CircleAlert className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
        Vérification impossible : {failed.map((c) => c.name).join(', ')}
        <Button variant="link" size="sm" className="h-6 px-1" onClick={retryFailed}>
          Réessayer
        </Button>
      </p>
    ) : null;

  if (items.length > 0) {
    return (
      <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-warning-200 bg-warning-50 p-3 sm:p-4">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />À traiter
        </h2>
        <ul className="flex flex-wrap gap-2">
          {items.map((c) => {
            const Icon = c.icon;
            const text =
              c.capped && c.n >= ALERT_LIST_LIMIT
                ? `Au moins ${formatNumber(ALERT_LIST_LIMIT)} ${c.many}`
                : plural(c.n, c.one, c.many);
            const chip =
              'inline-flex min-h-9 items-center gap-2 rounded-md border border-warning-200 bg-card px-3 py-1.5 text-sm font-medium text-foreground';
            return (
              <li key={c.key}>
                {c.to ? (
                  <Link
                    to={c.to}
                    className={cn(chip, 'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />
                    <span className="tabular-nums">{text}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ) : (
                  <span className={chip}>
                    <Icon className="h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />
                    <span className="tabular-nums">{text}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {failureLine}
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="rounded-lg border bg-card p-3 sm:p-4">
      <h2 id={headingId} className="sr-only">
        À traiter
      </h2>
      {pending.length > 0 ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Vérification des points à traiter…
        </div>
      ) : failed.length > 0 ? (
        failureLine
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-700" aria-hidden="true" />
          Rien à traiter pour le moment : aucune facture échue, demande, retour ou caisse en attente
        </p>
      )}
    </section>
  );
}

/** Progression vers l'objectif, annoncée comme telle. */
function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      {/* `transform` et non `width` : l'animation ne recalcule pas la mise en page. */}
      <div
        className="h-full origin-left bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

/**
 * Barre fine d'un classement (top 5) : graphite, la première en bleu — la
 * seule valeur encrée de la carte. Décorative : la valeur est écrite à côté.
 */
function RankBar({ value, leader, className }: { value: number; leader: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden="true">
      <div className={cn('h-full rounded-full', leader ? 'bg-chart-1' : 'bg-chart-rest')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DeltaLine({ value, period }: { value: number | null; period: Period }) {
  if (value === null || !Number.isFinite(value)) {
    return <p className="text-xs text-muted-foreground">Pas de ventes sur les {period} jours précédents</p>;
  }
  const rounded = Math.round(value * 10) / 10;
  const Icon = rounded >= 0 ? TrendingUp : TrendingDown;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          'inline-flex items-center gap-1 font-medium tabular-nums',
          rounded > 0 ? 'text-success-700' : rounded < 0 ? 'text-danger-700' : 'text-muted-foreground'
        )}
      >
        {rounded !== 0 && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {formatPercentChange(rounded)}
      </span>
      par rapport aux {period} jours précédents
    </p>
  );
}

/** Rang d'un classement : chiffre discret (l'`<ol>` l'annonce déjà). */
function Rank({ n }: { n: number }) {
  return (
    <span className="w-4 shrink-0 text-sm tabular-nums text-muted-foreground" aria-hidden="true">
      {n}
    </span>
  );
}

function ManagerHub() {
  const { user } = useAuth();
  const canOpen = useRouteAccess();
  const tileLink = useTileLink();
  const reduceMotion = useReducedMotion();
  const chartHeight = useChartHeight();
  const todayId = useId();
  const activityId = useId();
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<Period>(30);
  const rk = refreshKey;

  // « À traiter »
  const alerts = useQuery<AlertsData | null>(`alertes#${rk}`, () => reportService.getAlerts());
  const demandesToDecide = useQuery(
    `demandes-a-decider#${rk}`,
    () => demandeService.getAll({ statut: 'envoyee', limit: 1 }),
    canOpen('/demandes')
  );
  const retours = useQuery(`retours#${rk}`, () => retourService.getStats(), canOpen('/retours'));
  const { magasins, tills } = useTills(rk);
  const closures = useQuery(
    `clotures#${rk}`,
    () => caisseService.getHistorique({ from: localDateParam(7), limit: 50 }),
    canOpen('/caisse/historique')
  );
  const orphans = useQuery(
    `hors-caisse#${rk}`,
    () => caisseService.getAudit({ orphans_only: true, limit: 1 }),
    canOpen('/caisse/audit')
  );

  // « Aujourd’hui »
  const receivables = useQuery(`creances#${rk}`, () => reportService.getReceivables({ limit: 1 }));
  const lowStock = useQuery(`stock-bas#${rk}`, () =>
    produitService.getAll(undefined, undefined, true, 1, 5, 'stock', 'asc')
  );
  const paiements = useQuery<PaiementStats | null>(`paiements#${rk}`, () => paiementService.getStats());

  // Activité commerciale
  const trends = useQuery(`ca#${period}#${rk}`, async () => ({
    days: period * 2,
    rows: ((await factureService.getRevenueTrends(period * 2)) ?? []) as RevenueTrendRow[],
  }));
  const commandes = useQuery<CommandeStats | null>(`commandes#${rk}`, () => commandeService.getStats());
  const recent = useQuery(`factures-recentes#${rk}`, () =>
    factureService.getAll(undefined, undefined, 1, 5, 'date_facture', 'desc')
  );
  const topProducts = useQuery<TopProductRow[]>(`top-produits#${rk}`, () => factureService.getTopProducts(5));
  const topClients = useQuery<TopClientRow[]>(`top-clients#${rk}`, () => factureService.getTopClients(5));
  const categories = useQuery<CategoryRow[]>(`categories#${rk}`, () => produitService.getStockByCategory());
  const yoy = useQuery<YoYData | null>(`yoy#${rk}`, () => reportService.getYoYComparison(YOY_MONTHS));
  const forecast = useQuery<ForecastData | null>(`prevision#${rk}`, () => reportService.getRevenueForecast());

  const busy = anyLoading(
    alerts, demandesToDecide, retours, magasins, tills, closures, orphans, receivables, lowStock,
    paiements, trends, commandes, recent, topProducts, topClients, categories, yoy, forecast
  );
  const lastUpdated = useLastUpdated(busy);

  // ── Caisses : ouvertes, ouvertes depuis 24 h, clôturées avec écart aujourd'hui
  const tillList = tills.data ?? [];
  const tillError = magasins.error ?? tillList.find((t) => t.error)?.error;
  const tillQuery = { data: tills.data, error: tillError };
  const openTills = tillList.filter((t) => t.session).length;
  const staleTills = tillList.filter((t) => t.session && isStale(t.session)).length;
  const gaps = rowsOf<ClosureRow>(closures.data).filter(
    (s) => isSameLocalDay(s.date_cloture) && Math.round(num(s.ecart)) !== 0
  ).length;

  const checks: Check[] = [
    {
      key: 'echues',
      // `/reports/alerts` porte aussi les commandes en retard : un seul nom pour son échec.
      name: 'factures échues et commandes en retard',
      state: checkState(alerts),
      n: alerts.data?.overdue_invoices?.length ?? 0,
      capped: true,
      one: 'facture échue depuis plus de 30 jours',
      many: 'factures échues depuis plus de 30 jours',
      to: canOpen('/relances') ? '/relances' : canOpen('/factures') ? '/factures?statut=en_attente' : undefined,
      icon: FileText,
      retry: alerts.reload,
    },
    ...(canOpen('/demandes')
      ? [{
          key: 'demandes',
          name: 'demandes',
          state: checkState(demandesToDecide),
          n: totalOf(demandesToDecide.data),
          one: 'demande à décider',
          many: 'demandes à décider',
          to: '/demandes?statut=envoyee',
          icon: ClipboardList,
          retry: demandesToDecide.reload,
        } satisfies Check]
      : []),
    ...(canOpen('/retours')
      ? [{
          key: 'retours',
          name: 'retours',
          state: checkState(retours),
          n: num((retours.data as { en_attente?: Num } | null | undefined)?.en_attente),
          one: 'retour à approuver',
          many: 'retours à approuver',
          to: '/retours?statut=en_attente',
          icon: Undo2,
          retry: retours.reload,
        } satisfies Check]
      : []),
    {
      key: 'caisses',
      name: 'caisses',
      state: checkState(tillQuery),
      n: staleTills,
      one: 'caisse ouverte depuis plus de 24 h',
      many: 'caisses ouvertes depuis plus de 24 h',
      to: canOpen('/caisse') ? '/caisse' : undefined,
      icon: Wallet,
      retry: () => (magasins.error ? magasins.reload() : tills.reload()),
    },
    ...(canOpen('/caisse/historique')
      ? [{
          key: 'ecarts',
          name: 'clôtures de caisse',
          state: checkState(closures),
          n: gaps,
          one: 'clôture de caisse avec écart aujourd’hui',
          many: 'clôtures de caisse avec écart aujourd’hui',
          // La même fenêtre que la requête qui les compte (sessions ouvertes depuis 7 jours).
          to: `/caisse/historique?from=${localDateParam(7)}`,
          icon: History,
          retry: closures.reload,
        } satisfies Check]
      : []),
    {
      key: 'commandes',
      name: 'commandes fournisseur',
      state: checkState(alerts),
      n: alerts.data?.pending_orders?.length ?? 0,
      capped: true,
      one: 'commande fournisseur en retard',
      many: 'commandes fournisseur en retard',
      to: canOpen('/commandes') ? '/commandes' : undefined,
      icon: ShoppingCart,
      retry: alerts.reload,
    },
    ...(canOpen('/caisse/audit')
      ? [{
          key: 'hors-caisse',
          name: 'paiements hors caisse',
          state: checkState(orphans),
          n: num(orphans.data?.orphans_total),
          one: 'paiement en espèces hors caisse',
          many: 'paiements en espèces hors caisse',
          to: '/caisse/audit?orphans_only=true',
          icon: ShieldCheck,
          retry: orphans.reload,
        } satisfies Check]
      : []),
  ];
  // La même source (alertes) porte deux vérifications : son échec n'est cité qu'une fois.
  const bannerChecks = checks.filter((c) => !(c.key === 'commandes' && c.state === 'error'));

  // ── Séries de chiffre d'affaires en jours calendaires (utils/revenueSeries)
  const trendsReady = trends.data !== undefined && trends.data.days === period * 2;
  const series = useMemo(
    () => buildDailySeries(trends.data?.rows ?? [], trends.data?.days ?? period * 2),
    [trends.data, period]
  );
  const current = series.slice(-period);
  const previous = series.slice(0, Math.max(0, series.length - period));
  const currentCA = sumTotals(current);
  const previousCA = sumTotals(previous);
  const currentCount = sumCounts(current);
  const todayPoint: DayPoint | undefined = series[series.length - 1];
  const caDelta = previousCA > 0 ? ((currentCA - previousCA) / previousCA) * 100 : null;
  const avgDaily = currentCA / period;
  const panierMoyen = currentCount > 0 ? currentCA / currentCount : 0;
  const bestDay = current.reduce<DayPoint | null>((best, p) => (p.total > (best?.total ?? 0) ? p : best), null);
  const objectifPct = previousCA > 0 ? (currentCA / previousCA) * 100 : 0;
  const weekdayBreakdown = WEEKDAYS.map(({ day, label }) => {
    const days = current.filter((p) => p.date.getDay() === day);
    return { label, moyenne: days.length > 0 ? sumTotals(days) / days.length : 0 };
  });
  const revenueChart = current.map((p) => ({ label: formatDayMonth(p.date), total: p.total }));
  const trendsLoading = !trendsReady && !trends.error;

  // Une barre encrée par graphique, nommée en toutes lettres (la couleur n'est
  // jamais le seul repère) : le meilleur jour est celui de la tuile
  // « Factures émises » (même série, même règle : le premier en cas d'égalité).
  const bestRevenueIndex = maxIndex(revenueChart, (d) => d.total);
  const bestWeekday = WEEKDAYS[maxIndex(weekdayBreakdown, (d) => d.moyenne)];
  const revenueDescription =
    trendsReady && bestDay
      ? `${period} derniers jours. En bleu : le ${formatDayMonth(bestDay.date)}, meilleur jour. Un jour sans facture n’a pas de barre.`
      : `${period} derniers jours. Un jour sans facture n’a pas de barre.`;
  const weekdayDescription =
    trendsReady && currentCA > 0 && bestWeekday
      ? `Sur les ${period} derniers jours, jours sans vente compris. En bleu : le ${bestWeekday.name}, meilleur jour en moyenne.`
      : `Sur les ${period} derniers jours, jours sans vente compris`;

  const categorySlices = useMemo(() => {
    const rows = (categories.data ?? [])
      .map((c) => ({ categorie: c.categorie, valeur_vente: num(c.valeur_vente), total_unites: num(c.total_unites) }))
      .filter((c) => c.valeur_vente > 0)
      .sort((a, b) => b.valeur_vente - a.valeur_vente);
    if (rows.length <= MAX_CATEGORY_SLICES + 1) return rows;
    const rest = rows.slice(MAX_CATEGORY_SLICES);
    return [
      ...rows.slice(0, MAX_CATEGORY_SLICES),
      {
        categorie: `Autres (${rest.length} catégories)`,
        valeur_vente: rest.reduce((s, c) => s + c.valeur_vente, 0),
        total_unites: rest.reduce((s, c) => s + c.total_unites, 0),
      },
    ];
  }, [categories.data]);

  const maxCategorie = categorySlices.reduce((m, c) => Math.max(m, c.valeur_vente), 0);
  const totalCategories = categorySlices.reduce((s, c) => s + c.valeur_vente, 0);

  const topProductRows = topProducts.data ?? [];
  const maxQuantite = Math.max(1, ...topProductRows.map((p) => num(p.total_quantite)));
  const topClientRows = topClients.data ?? [];
  const maxDepenses = Math.max(1, ...topClientRows.map((c) => num(c.total_depenses)));
  const invoiceRows = rowsOf<InvoiceRow>(recent.data).slice(0, 5);
  const paymentMethods = paiements.data?.par_methode ?? [];
  const lowStockTotal = lowStock.data ? totalOf(lowStock.data) : undefined;

  // Répartition des encaissements : du plus gros montant au plus petit, la part
  // de chacun dans le total (une barre empilée + la liste classée).
  const paymentMix = useMemo(() => {
    const rows = (paiements.data?.par_methode ?? [])
      .map((m) => ({
        key: m.methode_paiement ?? 'non-renseigne',
        label: formatPaymentMethod(m.methode_paiement),
        fill: hueFill(paymentMethodHue(m.methode_paiement)),
        total: num(m.total),
        count: num(m.nombre),
      }))
      .sort((a, b) => b.total - a.total);
    const sum = rows.reduce((s, r) => s + Math.max(0, r.total), 0);
    return rows.map((r) => ({ ...r, share: sum > 0 ? (Math.max(0, r.total) / sum) * 100 : 0 }));
  }, [paiements.data]);
  // Sous 1 %, une décimale : « 0,4 % » plutôt qu'un « 0 % » pour un mode utilisé.
  const shareLabel = (share: number) => formatPercent(share, share > 0 && share < 1 ? 1 : 0);
  const paymentMixLabel = `Répartition des encaissements : ${paymentMix
    .filter((r) => r.share > 0)
    .map((r) => `${r.label} ${shareLabel(r.share)}`)
    .join(', ')}`;

  // Comparaison annuelle : le SQL trie par numéro de mois, on remet l'ordre
  // chronologique (la fenêtre se termine le mois dernier).
  const thisMonth = new Date().getMonth() + 1;
  const thisYear = new Date().getFullYear();
  const yoyChart = (yoy.data?.current_year ?? [])
    .map((c) => ({
      month: Number(c.mois_num),
      current: num(c.chiffre_affaires),
      previous: num(yoy.data?.previous_year?.find((p) => p.mois_num === c.mois_num)?.chiffre_affaires),
    }))
    .sort((a, b) => ((a.month - thisMonth + 12) % 12) - ((b.month - thisMonth + 12) % 12))
    .map((r) => ({ ...r, mois: formatMonthShort(r.month) }));
  const yoyHasPrevious = yoyChart.some((r) => r.previous > 0);
  // Légende : les années réellement couvertes. La fenêtre finit le mois dernier,
  // donc en janvier elle est entière dans l'an passé, et en février-mars elle
  // chevauche deux années (« 2026–2027 »).
  const yoyLastMonth = new Date(thisYear, thisMonth - 2, 1);
  const yoyFirstMonth = new Date(thisYear, thisMonth - 1 - YOY_MONTHS, 1);
  const yoyYears = (yearsBack: number) => {
    const from = yoyFirstMonth.getFullYear() - yearsBack;
    const to = yoyLastMonth.getFullYear() - yearsBack;
    return from === to ? String(to) : `${from}–${to}`;
  };
  const yoyCurrentLabel = yoyYears(0);
  const yoyPreviousLabel = yoyYears(1);

  const forecastData = forecast.data;
  const forecastValue = num(forecastData?.forecast?.prevision);
  const forecastMin = num(forecastData?.forecast?.min);
  const forecastMax = num(forecastData?.forecast?.max);
  const forecastHistory = forecastData?.historique ?? [];
  const forecastLowConfidence =
    forecastMax > 0 && (forecastValue <= 0 || (forecastMax - forecastMin) / forecastValue > 1);
  const currentMonthKey = `${thisYear}-${String(thisMonth).padStart(2, '0')}`;
  const forecastChart = [
    ...forecastHistory.map((h) => {
      const label = formatMonthShort(Number(h.mois.slice(5, 7)));
      // Le mois en cours est inclus par le SQL : sans mention, sa chute apparente
      // ressemblait à un effondrement des ventes.
      return { mois: h.mois === currentMonthKey ? `${label} (en cours)` : label, value: num(h.chiffre_affaires) };
    }),
    ...(forecastData?.forecast?.mois
      ? [{ mois: `${formatMonthShort(Number(forecastData.forecast.mois.slice(5, 7)))} (prév.)`, value: forecastValue }]
      : []),
  ];

  const receivablesTotal = (receivables.data as { summary?: { montant_total?: Num } } | undefined)?.summary?.montant_total;
  const receivablesClients = receivables.data ? totalOf(receivables.data) : 0;

  return (
    <PageShell
      title="Tableau de bord"
      description="Ce qui demande votre attention, puis l’activité commerciale"
      actions={<RefreshControls busy={busy} lastUpdated={lastUpdated} onRefresh={() => setRefreshKey((k) => k + 1)} />}
      primaryAction={
        canOpen('/factures/nouvelle') ? (
          <PrimaryLink to="/factures/nouvelle" icon={CirclePlus}>
            Nouvelle facture
          </PrimaryLink>
        ) : undefined
      }
    >
      <AttentionBanner checks={bannerChecks} />

      {/* Aujourd'hui */}
      <section aria-labelledby={todayId} className="space-y-3">
        <GroupHeading id={todayId} title="Aujourd’hui" description={todayLabel()} />
        <StatGrid>
          <StatTile
            label="Chiffre d’affaires du jour"
            value={trends.data ? todayPoint?.total ?? 0 : undefined}
            format="money"
            hint={todayPoint ? plural(todayPoint.count, 'facture', 'factures') : undefined}
            loading={trends.data === undefined && !trends.error}
            unavailable={!!trends.error}
          />
          <StatTile
            label="Encaissé aujourd’hui"
            value={paiements.data ? num(paiements.data.aujourdhui?.total) : undefined}
            format="money"
            hint={paiements.data ? plural(num(paiements.data.aujourdhui?.nombre), 'paiement', 'paiements') : undefined}
            loading={paiements.data === undefined && !paiements.error}
            unavailable={!!paiements.error}
          />
          <StatTile
            label="Reste à encaisser"
            value={receivables.data ? num(receivablesTotal) : undefined}
            format="money"
            hint={receivables.data ? `Chez ${plural(receivablesClients, 'client', 'clients')}` : undefined}
            loading={receivables.data === undefined && !receivables.error}
            unavailable={!!receivables.error}
            footer={tileLink('/relances', 'Voir les relances')}
          />
          <StatTile
            label="Caisses ouvertes"
            value={tillError ? undefined : tills.data ? openTills : undefined}
            hint={
              tills.data
                ? `Sur ${plural(magasins.data?.length ?? 0, 'magasin', 'magasins')}${staleTills > 0 ? ` · ${plural(staleTills, 'à clôturer', 'à clôturer')}` : ''}`
                : undefined
            }
            loading={!tillError && tills.data === undefined}
            unavailable={!!tillError}
            footer={tileLink('/caisse', 'Voir la caisse')}
          />
          <StatTile
            label="Produits en stock bas"
            value={lowStockTotal}
            tone="warning"
            hint="Sous leur stock minimum"
            loading={lowStock.data === undefined && !lowStock.error}
            unavailable={!!lowStock.error}
            footer={tileLink('/inventaire?low_stock=true', 'Voir les produits')}
          />
        </StatGrid>
      </section>

      {/* Activité commerciale : une période pilote les indicateurs et les graphiques */}
      <section aria-labelledby={activityId} className="space-y-3 sm:space-y-4">
        <GroupHeading
          id={activityId}
          title="Activité commerciale"
          description="Factures émises sur la période, hors factures annulées"
        >
          <ChoiceGroup
            label="Période analysée"
            hideLabel
            value={String(period) as `${Period}`}
            onValueChange={(v) => setPeriod(Number(v) as Period)}
            options={PERIOD_OPTIONS}
            size="md"
          />
        </GroupHeading>

        <StatGrid>
          <StatTile
            label={`Chiffre d’affaires sur ${period} jours`}
            value={trendsReady ? currentCA : undefined}
            format="money"
            size="lg"
            hint={`Moyenne : ${chartMoneyTooltip(avgDaily)} par jour`}
            loading={trendsLoading}
            unavailable={!!trends.error}
            footer={trendsReady ? <DeltaLine value={caDelta} period={period} /> : undefined}
          />
          <StatTile
            label="Factures émises"
            value={trendsReady ? currentCount : undefined}
            size="lg"
            hint={
              bestDay
                ? `Meilleur jour : ${formatDayMonth(bestDay.date)} · ${chartMoneyTooltip(bestDay.total)}`
                : 'Aucune vente sur la période'
            }
            loading={trendsLoading}
            unavailable={!!trends.error}
          />
          <StatTile
            label="Panier moyen"
            value={trendsReady ? panierMoyen : undefined}
            format="money"
            size="lg"
            hint="Chiffre d’affaires par facture"
            loading={trendsLoading}
            unavailable={!!trends.error}
          />
        </StatGrid>

        <SectionCard title="Chiffre d’affaires par jour" titleAs="h3" description={revenueDescription}>
          {trends.error ? (
            <SectionError title="Impossible de charger le chiffre d’affaires" error={trends.error} onRetry={trends.reload} />
          ) : trendsLoading ? (
            <Skeleton className="w-full" style={{ height: chartHeight }} />
          ) : currentCA > 0 ? (
            <ResponsiveContainer width="100%" height={chartHeight} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
              <BarChart
                accessibilityLayer
                data={revenueChart}
                title={`Chiffre d’affaires par jour sur les ${period} derniers jours`}
              >
                <CartesianGrid vertical={false} stroke={CHART_GRID} />
                <XAxis dataKey="label" tick={CHART_TICK_STYLE} tickLine={false} minTickGap={16} />
                <YAxis tick={CHART_TICK_STYLE} tickFormatter={chartMoneyTick} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  formatter={chartMoneyTooltip}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }}
                />
                <Bar
                  dataKey="total"
                  name="Chiffre d’affaires"
                  fill={CHART_REST}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={!reduceMotion}
                >
                  {revenueChart.map((d, i) => (
                    <Cell key={d.label} fill={i === bestRevenueIndex ? CHART_PRIMARY : CHART_REST} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={ChartColumn}
              title="Aucune vente sur la période"
              description={`Aucune facture n’a été émise ces ${period} derniers jours`}
            />
          )}
        </SectionCard>
      </section>

      {/* Objectif + commandes fournisseur */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <SectionCard
          title={`Objectif ${period} jours`}
          description={`Cible : le chiffre d’affaires des ${period} jours précédents`}
        >
          {trends.error ? (
            <SectionError title="Impossible de calculer l’objectif" error={trends.error} onRetry={trends.reload} />
          ) : trendsLoading ? (
            <ListSkeleton rows={2} />
          ) : previousCA > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-2xl font-medium tabular-nums">{formatPercent(objectifPct)}</span>
                <span className="text-xs text-muted-foreground">
                  <Money value={currentCA} /> sur <Money value={previousCA} />
                </span>
              </div>
              <Progress value={objectifPct} label="Progression vers l’objectif" />
              {objectifPct >= 100 ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Objectif atteint
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Reste à réaliser : <Money value={previousCA - currentCA} className="font-medium text-foreground" />
                </p>
              )}
            </div>
          ) : (
            // Une cible inventée (CA × 1,1) affichait « 91 % » sans référence réelle.
            <p className="text-sm text-muted-foreground">
              Aucune vente sur les {period} jours précédents : pas de référence pour fixer un objectif
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Commandes fournisseur"
          description="Nombre de commandes par statut"
          action={<SeeAllLink to="/commandes" context="commandes fournisseur" />}
          className="lg:col-span-2"
        >
          {commandes.error ? (
            <SectionError title="Impossible de charger les commandes" error={commandes.error} onRetry={commandes.reload} />
          ) : commandes.data === undefined ? (
            <ListSkeleton rows={2} />
          ) : (
            // Quatre comptes de routine : une ligne de « statut nombre », sans
            // cadres ni icônes colorées (aucun n'est une alerte).
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {PIPELINE.map(({ key, label }) => (
                <div key={key} className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums text-foreground">{formatNumber(num(commandes.data?.[key]))}</dd>
                </div>
              ))}
            </dl>
          )}
        </SectionCard>
      </div>

      <DashboardDemandeWidgets seeAll={<SeeAllLink to="/demandes" context="demandes" />} />

      {/* Activité récente : factures + stock */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <SectionCard
          title="Factures récentes"
          description="Les cinq dernières factures émises"
          action={<SeeAllLink to="/factures" context="factures" />}
        >
          {recent.error ? (
            <SectionError title="Impossible de charger les factures" error={recent.error} onRetry={recent.reload} />
          ) : recent.data === undefined ? (
            <ListSkeleton />
          ) : invoiceRows.length > 0 ? (
            <WorkList
              items={invoiceRows.map((f) => ({
                key: f.id,
                to: `/factures/${f.id}`,
                title: f.numero_facture || `Facture n° ${f.id}`,
                code: !!f.numero_facture,
                badge: <StatusBadge type="facture" statut={f.statut} />,
                meta: `${formatDate(f.date_facture)} · ${clientName(f)}`,
                aside: (
                  <Money
                    value={f.total ?? null}
                    className={f.statut === 'annulee' ? 'text-muted-foreground line-through' : undefined}
                  />
                ),
              }))}
            />
          ) : (
            <EmptyState
              compact
              icon={FileText}
              title="Aucune facture pour le moment"
              description="Les factures émises apparaîtront ici"
            />
          )}
        </SectionCard>

        <QueueCard
          title="Produits en stock bas"
          description={
            lowStockTotal === undefined
              ? 'Produits sous leur stock minimum, tous emplacements confondus'
              : lowStockTotal > 0
                ? `${plural(lowStockTotal, 'produit', 'produits')} sous leur stock minimum, tous emplacements confondus`
                : 'Tous emplacements confondus'
          }
          action={<SeeAllLink to="/inventaire?low_stock=true" context="produits en stock bas" />}
          query={lowStock}
          items={lowStockItems(lowStock.data)}
          errorTitle="Impossible de charger les produits en stock bas"
          emptyTitle="Aucun produit en stock bas"
          emptyDescription="Tous les produits sont au-dessus de leur stock minimum"
        />
      </div>

      {/* Classements — toutes périodes confondues : la période choisie ne s'y applique pas. */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <SectionCard
          title="5 produits les plus vendus"
          description="Par quantité vendue, toutes périodes confondues"
        >
          {topProducts.error ? (
            <SectionError title="Impossible de charger le classement" error={topProducts.error} onRetry={topProducts.reload} />
          ) : topProducts.data === undefined ? (
            <ListSkeleton />
          ) : topProductRows.length > 0 ? (
            <ol className="space-y-3">
              {topProductRows.map((p, i) => {
                const qte = num(p.total_quantite);
                const nom = p.nom || 'Article sans fiche produit';
                return (
                  <li key={p.id ?? i} className="flex items-baseline gap-3">
                    <Rank n={i + 1} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="line-clamp-2 break-words text-sm font-medium" title={nom}>
                          {nom}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">{formatNumber(qte)} u.</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <RankBar value={(qte / maxQuantite) * 100} leader={i === 0} className="flex-1" />
                        <Money value={p.total_ventes} className="shrink-0 text-xs text-muted-foreground" />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              compact
              icon={Package}
              title="Aucun produit vendu"
              description="Le classement apparaîtra après les premières factures"
            />
          )}
        </SectionCard>

        <SectionCard
          title="5 meilleurs clients"
          description="Par chiffre d’affaires, toutes périodes confondues"
          action={<SeeAllLink to="/clients/analytics" context="analyse clients" />}
        >
          {topClients.error ? (
            <SectionError title="Impossible de charger le classement" error={topClients.error} onRetry={topClients.reload} />
          ) : topClients.data === undefined ? (
            <ListSkeleton />
          ) : topClientRows.length > 0 ? (
            <ol className="space-y-3">
              {topClientRows.map((c, i) => {
                const name = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client sans fiche';
                const montant = num(c.total_depenses);
                return (
                  <li key={`${name}-${i}`} className="flex items-baseline gap-3">
                    <Rank n={i + 1} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="line-clamp-2 break-words text-sm font-medium" title={name}>
                          {name}
                        </span>
                        <Money value={montant} className="shrink-0 text-sm" />
                      </div>
                      <div className="flex items-center gap-3">
                        <RankBar value={(montant / maxDepenses) * 100} leader={i === 0} className="flex-1" />
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {plural(num(c.nombre_factures), 'facture', 'factures')}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              compact
              icon={Users}
              title="Aucun client facturé"
              description="Le classement apparaîtra après les premières factures"
            />
          )}
        </SectionCard>
      </div>

      {/* Stock par catégorie + jours de la semaine */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {(categories.error || categories.data === undefined || categorySlices.length > 0) && (
          <SectionCard title="Valeur du stock par catégorie" description="Stock actuel, estimé au prix de vente">
            {categories.error ? (
              <SectionError title="Impossible de charger le stock par catégorie" error={categories.error} onRetry={categories.reload} />
            ) : categories.data === undefined ? (
              <ListSkeleton />
            ) : (
              // Une part se lit dans une liste classée : l'anneau à sept teintes
              // obligeait à faire l'aller-retour entre la couleur et sa légende.
              <ol className="space-y-3">
                {categorySlices.map((cat) => {
                  const valeur = num(cat.valeur_vente);
                  return (
                    <li key={cat.categorie} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium" title={cat.categorie}>
                          {cat.categorie}
                        </span>
                        <Money value={valeur} className="shrink-0 text-sm" />
                      </div>
                      <div className="flex items-center gap-3">
                        <RankBar
                          value={maxCategorie > 0 ? (valeur / maxCategorie) * 100 : 0}
                          leader={valeur === maxCategorie}
                          className="flex-1"
                        />
                        <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {totalCategories > 0 ? formatPercent((valeur / totalCategories) * 100, 0) : '—'}
                          {' · '}
                          {formatNumber(cat.total_unites)} u.
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        )}

        <SectionCard title="Chiffre d’affaires moyen par jour de la semaine" description={weekdayDescription}>
          {trends.error ? (
            <SectionError title="Impossible de charger le chiffre d’affaires" error={trends.error} onRetry={trends.reload} />
          ) : trendsLoading ? (
            <Skeleton className="w-full" style={{ height: chartHeight * 0.75 }} />
          ) : currentCA > 0 ? (
            <ResponsiveContainer
              width="100%"
              height={chartHeight * 0.75}
              minWidth={0}
              initialDimension={{ width: 1, height: 1 }}
            >
              <BarChart accessibilityLayer data={weekdayBreakdown} title="Chiffre d’affaires moyen par jour de la semaine">
                <CartesianGrid vertical={false} stroke={CHART_GRID} />
                <XAxis dataKey="label" tick={CHART_TICK_STYLE} tickLine={false} />
                <YAxis tick={CHART_TICK_STYLE} tickFormatter={chartMoneyTick} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  formatter={chartMoneyTooltip}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }}
                />
                <Bar
                  dataKey="moyenne"
                  name="Chiffre d’affaires moyen"
                  fill={CHART_REST}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reduceMotion}
                >
                  {weekdayBreakdown.map((d) => (
                    <Cell key={d.label} fill={d.label === bestWeekday?.label ? CHART_PRIMARY : CHART_REST} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              compact
              icon={CalendarDays}
              title="Aucune vente sur la période"
              description="La répartition par jour apparaîtra avec les premières ventes"
            />
          )}
        </SectionCard>
      </div>

      {/* Tendances longues */}
      <SectionCard
        title="Comparaison sur un an"
        description={
          yoyChart.length >= 2 && yoyHasPrevious
            ? `Les trois derniers mois complets : ${formatPercentChange(num(yoy.data?.variation_pct))} par rapport à l’an dernier`
            : 'Les trois derniers mois complets, comparés aux mêmes mois de l’an dernier'
        }
      >
        {yoy.error ? (
          <SectionError title="Impossible de charger la comparaison" error={yoy.error} onRetry={yoy.reload} />
        ) : yoy.data === undefined ? (
          <ListSkeleton rows={2} />
        ) : yoyChart.length < 2 ? (
          // Une seule barre de 400 px avec une légende à deux séries ne compare rien.
          <p className="text-sm text-muted-foreground">
            Historique insuffisant : la comparaison apparaîtra après deux mois complets de ventes
          </p>
        ) : (
          <>
            {!yoyHasPrevious && (
              <p className="mb-3 text-sm text-muted-foreground">Pas de ventes l’an dernier sur ces mois</p>
            )}
            {/* Légende : l'année en cours à l'encre (bleu), l'an dernier en graphite. */}
            <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_PRIMARY }} aria-hidden="true" />
                {yoyCurrentLabel}
              </span>
              {yoyHasPrevious && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_SECONDARY }} aria-hidden="true" />
                  {yoyPreviousLabel}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={chartHeight} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
              <BarChart
                accessibilityLayer
                data={yoyChart}
                title={`Chiffre d’affaires mensuel, ${yoyCurrentLabel} comparé à ${yoyPreviousLabel}`}
              >
                <CartesianGrid vertical={false} stroke={CHART_GRID} />
                <XAxis dataKey="mois" tick={CHART_TICK_STYLE} tickLine={false} />
                <YAxis tick={CHART_TICK_STYLE} tickFormatter={chartMoneyTick} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  formatter={chartMoneyTooltip}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: CHART_GRID, fillOpacity: 0.3 }}
                />
                <Bar
                  dataKey="current"
                  fill={CHART_PRIMARY}
                  name={yoyCurrentLabel}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={!reduceMotion}
                />
                {yoyHasPrevious && (
                  <Bar
                    dataKey="previous"
                    fill={CHART_SECONDARY}
                    name={yoyPreviousLabel}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                    isAnimationActive={!reduceMotion}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Prévision du mois prochain"
        description="Moyenne mobile sur trois mois, fourchette indicative"
      >
        {forecast.error ? (
          <SectionError title="Impossible de charger la prévision" error={forecast.error} onRetry={forecast.reload} />
        ) : forecast.data === undefined ? (
          <ListSkeleton rows={2} />
        ) : forecastHistory.length < 3 ? (
          <p className="text-sm text-muted-foreground">
            Historique insuffisant : il faut au moins trois mois de ventes pour estimer le mois prochain
          </p>
        ) : forecastLowConfidence ? (
          <div className="flex items-start gap-3 rounded-md border border-warning-200 bg-warning-50 p-4">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden="true" />
            <div>
              <p className="font-medium">Prévision non affichée : confiance insuffisante</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Les ventes des trois derniers mois sont trop dispersées pour fournir une estimation utile
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Teintes neutres : un minimum n'est pas une alerte, ni un maximum un succès. */}
            <KeyValueList columns={3}>
              <KeyValue label="Prévision" numeric>
                <Money value={forecastValue} className="text-lg font-medium" />
              </KeyValue>
              <KeyValue label="Minimum estimé" numeric>
                <Money value={forecastMin} className="text-lg" />
              </KeyValue>
              <KeyValue label="Maximum estimé" numeric>
                <Money value={forecastMax} className="text-lg" />
              </KeyValue>
            </KeyValueList>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={140} minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <AreaChart
                  accessibilityLayer
                  data={forecastChart}
                  title="Chiffre d’affaires des derniers mois et prévision du mois prochain"
                >
                  {/* Points mensuels reliés en ligne droite : pas de courbe lissée. */}
                  <Area
                    type="linear"
                    dataKey="value"
                    name="Chiffre d’affaires"
                    stroke={CHART_PRIMARY}
                    fill={CHART_PRIMARY}
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={!reduceMotion}
                  />
                  <Tooltip formatter={chartMoneyTooltip} contentStyle={CHART_TOOLTIP_STYLE} />
                  <XAxis dataKey="mois" tick={CHART_TICK_STYLE} tickLine={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </SectionCard>

      {(paiements.error || paiements.data === undefined || paymentMethods.length > 0) && (
        <SectionCard
          title="Encaissements par mode de paiement"
          description="Cumul de tous les paiements enregistrés"
        >
          {paiements.error ? (
            <SectionError title="Impossible de charger les encaissements" error={paiements.error} onRetry={paiements.reload} />
          ) : paiements.data === undefined ? (
            <ListSkeleton rows={2} />
          ) : (
            <div className="space-y-4">
              {/* Une barre, chaque mode à la taille de son montant, dans sa teinte
                  (celle de sa pastille partout ailleurs) ; un filet couleur carte
                  sépare deux parts voisines. */}
              {paymentMix.some((r) => r.share > 0) && (
                <div role="img" aria-label={paymentMixLabel} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                  {paymentMix
                    .filter((r) => r.share > 0)
                    .map((r) => (
                      <div key={r.key} className={cn('h-full min-w-[2px]', r.fill)} style={{ flex: `${r.share} 1 0%` }} />
                    ))}
                </div>
              )}
              {/* Liste classée : la même lecture en mots et en chiffres. Colonnes
                  alignées dès 640 px (sous-grille), deux lignes sur téléphone. */}
              <ol className="space-y-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-8 sm:gap-y-2 sm:space-y-0">
                {paymentMix.map((r) => (
                  <li
                    key={r.key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-sm sm:col-span-4 sm:grid-cols-subgrid"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', r.fill)} />
                      <span className="truncate" title={r.label}>
                        {r.label}
                      </span>
                    </span>
                    <Money value={r.total} className="text-right" />
                    <span className="ps-4 text-xs text-muted-foreground tabular-nums sm:ps-0 sm:text-right sm:text-sm">
                      {plural(r.count, 'paiement', 'paiements')}
                    </span>
                    <span className="text-right text-xs text-muted-foreground tabular-nums sm:text-sm">
                      {shareLabel(r.share)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </SectionCard>
      )}

      <QuickLinks role={user?.role ?? 'manager'} hideWithSidebar />
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rôle de consultation : accès en lecture seule
// ─────────────────────────────────────────────────────────────────────────────

function ViewerHub() {
  return (
    <PageShell title="Tableau de bord" description="Votre compte donne accès à la consultation du stock">
      <QuickLinks role="viewer" />
    </PageShell>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  switch (user?.role) {
    case 'caissier':
      return <CaissierHub />;
    case 'magasin_staff':
      return <MagasinHub />;
    case 'depot_staff':
      return <DepotHub />;
    case 'admin':
    case 'manager':
      return <ManagerHub />;
    default:
      return <ViewerHub />;
  }
}
