import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  History,
  Lock,
  LockOpen,
  ReceiptText,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag } from '@/components/ui/tag';
import { DocumentCode } from '@/components/ui/document-code';
import { Money } from '@/components/ui/money';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { ChoiceGroup } from '@/components/ui/choice-chips';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QueryErrorState, QueryState } from '@/components/ui/query-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { StatusBadge } from '@/components/StatusBadge';
import { caisseService, type CaisseMouvement, type CaisseParMethode } from '@/services/api';
import { useAuth } from '@/lib/AuthContext';
import { PRODUCT_NAME } from '@/lib/brand';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { canRunSingleKeyShortcut, useSingleKeyShortcuts } from '@/lib/shortcutPreferences';
import { tillGapTone, type TillGapTone } from '@/utils/tillGap';
import { previousDayTill } from '@/utils/tillSession';
import { libelleMouvementLisible } from '@/utils/caisseLibelle';
import { getErrorMessage } from '@/utils/errors';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatSignedCurrency,
  formatTime,
  toNumber,
} from '@/utils/format';
import {
  PAYMENT_METHOD_OPTIONS,
  formatPaymentMethod,
  paymentMethodHue,
  type PaymentMethod,
} from '@/utils/paymentMethod';

interface Magasin {
  id: number;
  code: string;
  nom: string;
}

/** `GET /caisse/session-active` — montants NUMERIC parfois en chaîne : passer par `toNumber`. */
interface SessionCaisse {
  id: number;
  magasin_id: number;
  magasin_nom?: string;
  magasin_code?: string;
  date_ouverture: string;
  fond_initial: number | string;
  total_encaissements?: number | string;
  total_decaissements?: number | string;
  /** Tous modes confondus : ce n'est PAS le contenu du tiroir (U-03). */
  solde_theorique?: number | string;
  /** Fonds + espèces encaissées − espèces décaissées : ce que le tiroir doit contenir. */
  expected_cash?: number | string;
  especes_encaissees?: number | string;
  especes_decaissees?: number | string;
  hors_especes_encaissees?: number | string;
  hors_especes_decaissees?: number | string;
  par_methode?: CaisseParMethode[];
  statut: 'ouverte' | 'cloturee';
  ouvert_par_username?: string | null;
  /** Nom complet de la personne (CPG2-05) ; l'identifiant de connexion seulement à défaut. */
  ouvert_par_nom?: string | null;
  session_age_hours?: number;
  requires_manager_action?: boolean;
}

type MouvementCaisse = CaisseMouvement;

interface ClosurePreview {
  session_id: number;
  fond_initial: number | string;
  expected_cash: number | string;
  especes_encaissees?: number | string;
  especes_decaissees?: number | string;
  fond_final_compte: number | string | null;
  ecart: number | null;
  par_methode: CaisseParMethode[];
  orphan_mouvements: Array<{ id: number; categorie: string; montant: number | string; libelle: string | null }>;
  can_close: boolean;
}

type DiversType = 'encaissement' | 'decaissement';
type DiversCategorie = 'apport' | 'autre_entree' | 'retrait_banque' | 'autre_sortie';

// --- Dialogue de clôture : un seul réducteur pour les champs interdépendants
// (comptage, aperçu serveur, commentaire, chargement / erreur).
interface CloseDialogState {
  fondFinal: string;
  preview: ClosurePreview | null;
  commentaire: string;
  loading: boolean;
  error: string | null;
}

type CloseDialogAction =
  | { type: 'setFondFinal'; value: string }
  | { type: 'previewLoading' }
  | { type: 'previewLoaded'; preview: ClosurePreview }
  | { type: 'previewError'; error: string }
  | { type: 'setCommentaire'; value: string }
  | { type: 'reset' };

const initialCloseDialogState: CloseDialogState = {
  fondFinal: '',
  preview: null,
  commentaire: '',
  loading: false,
  error: null,
};

function closeDialogReducer(state: CloseDialogState, action: CloseDialogAction): CloseDialogState {
  switch (action.type) {
    case 'setFondFinal':
      return { ...state, fondFinal: action.value };
    case 'previewLoading':
      return { ...state, loading: true, error: null };
    case 'previewLoaded':
      return { ...state, preview: action.preview, loading: false, error: null };
    case 'previewError':
      return { ...state, loading: false, error: action.error };
    case 'setCommentaire':
      return { ...state, commentaire: action.value };
    case 'reset':
      return initialCloseDialogState;
    default:
      return state;
  }
}

/** Libellés des catégories de mouvement (jamais le code brut à l'écran). */
const CATEGORY_LABELS: Record<string, string> = {
  paiement_client: 'Paiement client',
  acompte_client: 'Acompte client',
  apport: 'Apport d’espèces',
  autre_entree: 'Autre entrée',
  depense: 'Dépense',
  paiement_fournisseur: 'Paiement fournisseur',
  acompte_fournisseur: 'Acompte fournisseur',
  retrait_banque: 'Dépôt à la banque',
  remboursement_client: 'Remboursement client',
  autre_sortie: 'Autre sortie',
};

const categoryLabel = (code: string) =>
  CATEGORY_LABELS[code] ?? (code ? code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ') : '—');

const DIVERS_CATEGORIES: Record<DiversType, ReadonlyArray<{ value: DiversCategorie; label: string }>> = {
  encaissement: [
    { value: 'apport', label: CATEGORY_LABELS.apport },
    { value: 'autre_entree', label: CATEGORY_LABELS.autre_entree },
  ],
  decaissement: [
    { value: 'retrait_banque', label: CATEGORY_LABELS.retrait_banque },
    // Une dépense (transport, fournitures…) passe par Dépenses (P-M3) : le
    // libellé le rappelle au moment du choix.
    { value: 'autre_sortie', label: 'Autre sortie (hors dépense)' },
  ],
};

/** Titre et aide du dialogue, d'après le bouton qui l'a ouvert (P-M3). */
const DIVERS_TEXT: Record<DiversType, { title: string; description: string; placeholder: string }> = {
  encaissement: {
    title: 'Ajouter une entrée',
    description: 'Apport d’espèces ou autre entrée dans la caisse : le motif est obligatoire.',
    placeholder: 'Ex. : apport du gérant…',
  },
  decaissement: {
    title: 'Ajouter une sortie',
    description: 'Dépôt à la banque ou autre sortie de la caisse : le motif est obligatoire.',
    placeholder: 'Ex. : erreur de caisse…',
  },
};

/** Un ancien libellé porte un identifiant interne (« Paiement facture #113 ») : ne pas l'afficher seul. */
const hasInternalId = (libelle: string | null | undefined) => !!libelle && /#\d+/.test(libelle);

/** Encadré de l'écart dans le dialogue de clôture (règle commune : `utils/tillGap`). */
const ECART_BOX: Record<TillGapTone, string> = {
  ok: 'border-success-200 bg-success-50 text-success-800',
  warning: 'border-warning-200 bg-warning-50 text-warning-800',
  danger: 'border-danger-200 bg-danger-50 text-danger-800',
};
function ecartPhrase(ecart: number): string {
  const rounded = Math.round(ecart);
  if (rounded === 0) return 'Aucun écart : les espèces comptées correspondent.';
  return rounded < 0
    ? `Il manque ${formatCurrency(-rounded)} en espèces.`
    : `${formatCurrency(rounded)} d’espèces en trop.`;
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * La date d'un mouvement ne s'écrit qu'une fois par jour : sur la première
 * ligne d'un jour autre qu'aujourd'hui (liste du plus récent au plus ancien).
 * Une session ouverte la veille ne répète plus « 23 oct. 2026 » à chaque ligne.
 */
function showsDate(rows: readonly MouvementCaisse[], index: number): boolean {
  const d = new Date(rows[index].date_mouvement);
  if (Number.isNaN(d.getTime()) || isSameDay(d, new Date())) return false;
  if (index === 0) return true;
  const previous = new Date(rows[index - 1].date_mouvement);
  return Number.isNaN(previous.getTime()) || !isSameDay(d, previous);
}

/**
 * Heure d'un mouvement dans le tableau, avec la date dessous sur la première
 * ligne d'un jour passé — sur une ligne, la date élargissait la colonne et
 * poussait « Espèces en caisse » hors du tableau à 1366 px (GV-37).
 */
function QuandCell({ date, showDate }: { date: string; showDate: boolean }) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return <>—</>;
  if (!showDate) return <span className="tabular-nums">{formatTime(d)}</span>;
  return (
    <span className="flex flex-col leading-tight">
      <span className="tabular-nums">{formatTime(d)}</span>
      <span className="text-xs text-muted-foreground">{formatDate(d)}</span>
    </span>
  );
}

/** « 14:46 », ou « 22 oct. 2026 à 14:46 » sur la première carte d'un jour passé. */
function quand(date: string, showDate: boolean): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return showDate ? formatDateTime(d) : formatTime(d);
}

const httpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

/** Pluriel français : 0 et 1 au singulier. */
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

const VISIBLE_MOUVEMENTS = 10;

/**
 * Sens du mouvement : une catégorie, pas un statut — étiquette neutre. Le
 * montant signé de la ligne porte seul la couleur.
 */
function TypeTag({ type }: { type: MouvementCaisse['type'] }) {
  return type === 'encaissement' ? (
    <Tag icon={ArrowDownLeft}>Entrée</Tag>
  ) : (
    <Tag icon={ArrowUpRight}>Sortie</Tag>
  );
}

/** Durée d'une session restée ouverte : « 30 heures », « 7 jours ». */
function sessionDuration(hours: number | undefined): string | null {
  if (hours === undefined || !Number.isFinite(hours) || hours < 24) return null;
  if (hours < 48) return `${Math.floor(hours)} heures`;
  return `${Math.floor(hours / 24)} jours`;
}

/**
 * Sous-titre d'une caisse ouverte : « MAG-PLT — Hitek Plateau · ouverte le
 * 23 oct. 2026 à 13:08 par Adjoua Yao ». À 390 px la ligne passe à la ligne
 * entre les mots, jamais dans le code du magasin ni dans la date, et le point
 * médian reste collé au nom du magasin.
 */
function SessionSummary({
  magasin,
  ouverture,
  par,
}: {
  /** `null` quand le sélecteur de magasin de l'en-tête le montre déjà. */
  magasin: { code: string; nom: string } | null;
  ouverture: string;
  par: string | null;
}) {
  return (
    <>
      {magasin && (
        <>
          <span className="whitespace-nowrap">{magasin.code}</span>
          {'\u00A0— '}
          {magasin.nom}
          {'\u00A0· '}
        </>
      )}
      {magasin ? 'ouverte le ' : 'Ouverte le '}
      <span className="whitespace-nowrap">{formatDateTime(ouverture)}</span>
      {par && ` par ${par}`}
    </>
  );
}

/** Une ligne de la bande du tiroir : terme nommé, opérateur, montant. */
function DrawerTerm({ op, label, value }: { op?: string; label: string; value: number | null }) {
  return (
    <tr>
      <th scope="row" className="py-0.5 pe-3 text-left font-normal text-muted-foreground">
        {label}
      </th>
      <td className="w-4 py-0.5 text-center">{op}</td>
      <td className="w-px whitespace-nowrap py-0.5 text-right">
        <Money value={value} />
      </td>
    </tr>
  );
}

/**
 * Indicateur principal : le tiroir posé comme une bande de caisse — fonds
 * initial + entrées en espèces − sorties en espèces = espèces attendues.
 * Chaque terme est nommé et le résultat est le seul grand chiffre : le
 * caissier refait le calcul de tête avant de compter.
 */
function DrawerEquationTile({
  fondInitial,
  entrees,
  sorties,
  attendues,
  className,
}: {
  fondInitial: number | null;
  entrees: number | null;
  sorties: number | null;
  attendues: number | null;
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardContent inset="standalone" className="flex h-full flex-col">
        {/* Un petit tableau plutôt qu'une liste : les opérateurs tiennent une
            colonne, juste à gauche des montants, comme sur une bande de caisse. */}
        <table className="w-full text-sm">
          <caption className="pb-2 text-left text-xs font-medium text-muted-foreground">
            Espèces attendues en caisse
          </caption>
          <tbody>
            <DrawerTerm label="Fonds initial" value={fondInitial} />
            <DrawerTerm op="+" label="Entrées en espèces" value={entrees} />
            <DrawerTerm op="−" label="Sorties en espèces" value={sorties} />
            <tr>
              <th scope="row" className="border-t pt-2 text-left font-normal">
                <span className="sr-only">Espèces attendues</span>
              </th>
              <td className="border-t pt-2 text-center align-baseline">=</td>
              <td className="whitespace-nowrap border-t pt-2 text-right align-baseline text-xl font-medium leading-tight sm:text-2xl">
                {attendues === null ? (
                  <span className="text-sm text-muted-foreground">Indisponible</span>
                ) : (
                  <Money value={attendues} unit="subtle" />
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Grille des indicateurs : la bande du tiroir sur deux colonnes, la dernière tuile seule sur téléphone en prend deux. */
const KPI_GRID =
  'grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-5 min-[360px]:[&>:last-child]:col-span-2 lg:[&>:last-child]:col-span-1';

function MethodTag({ method }: { method: string }) {
  return <Tag hue={paymentMethodHue(method)}>{formatPaymentMethod(method)}</Tag>;
}

/** Ligne libellé / montant d'un récapitulatif chiffré. */
function AmountRow({
  label,
  value,
  emphasis = false,
  signed = false,
}: {
  label: ReactNode;
  value: number | string | null | undefined;
  emphasis?: boolean;
  signed?: boolean;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', emphasis && 'border-t pt-2 font-semibold')}>
      <dt className={emphasis ? undefined : 'text-muted-foreground'}>{label}</dt>
      <dd>
        <Money value={value} signed={signed} emphasis={emphasis} />
      </dd>
    </div>
  );
}

/** Totaux par mode de paiement (session ouverte et aperçu de clôture). */
function ParMethodeTable({ rows, label }: { rows: CaisseParMethode[]; label: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={ArrowLeftRight}
        title="Aucun mouvement sur cette session"
        description="Les encaissements et décaissements apparaîtront ici, par mode de paiement"
      />
    );
  }
  return (
    <>
      {/* Téléphone : deux lignes par mode — trois colonnes de montants n'y tiennent pas (GV-06). */}
      <ul className="divide-y sm:hidden" aria-label={label}>
        {rows.map((p) => {
          const nb = toNumber(p.nb) ?? 0;
          return (
            <li key={p.methode_paiement} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <MethodTag method={p.methode_paiement} />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {nb} {plural(nb, 'opération', 'opérations')}
                </span>
              </div>
              <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">Encaissé</dt>
                  <dd>
                    <Money value={p.total_encaissements} />
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">Décaissé</dt>
                  <dd>
                    <Money value={p.total_decaissements} />
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <div className="hidden sm:block">
        <Table aria-label={label}>
          <TableHeader>
            <TableRow>
              <TableHead>Mode de paiement</TableHead>
              <TableHead numeric>Encaissé</TableHead>
              <TableHead numeric>Décaissé</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const nb = toNumber(p.nb) ?? 0;
              return (
                <TableRow key={p.methode_paiement}>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                      <MethodTag method={p.methode_paiement} />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {nb} {plural(nb, 'opération', 'opérations')}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    <Money value={p.total_encaissements} />
                  </TableCell>
                  <TableCell numeric>
                    <Money value={p.total_decaissements} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/**
 * Libellé d'un mouvement (P-M4) : le document réglé (lien vers la facture ou
 * l'avoir) et le client, jamais un identifiant interne. Les anciennes lignes
 * (« Paiement facture #113 ») sont relues à partir du document résolu par le
 * serveur.
 */
function MouvementLabel({ m, canOpen }: { m: MouvementCaisse; canOpen: (path: string) => boolean }) {
  const doc =
    m.facture_id && m.numero_facture
      ? { numero: m.numero_facture, to: `/factures/${m.facture_id}`, kind: 'la facture' }
      : m.avoir_id && m.numero_avoir
        ? { numero: m.numero_avoir, to: `/avoirs/${m.avoir_id}`, kind: 'l’avoir' }
        : null;
  const client = m.tiers_nom?.trim() || null;
  // Sans document, le libellé reste la meilleure description — sauf s'il ne
  // désigne le client que par son identifiant. Les anciens libellés de dépense
  // sont relus dans la forme actuelle (CPG2-03).
  const libelle = libelleMouvementLisible(m.libelle);
  const primary = doc ? null : hasInternalId(libelle) && client ? client : libelle;
  const showClient = !!client && (doc !== null || (primary !== client && !primary?.includes(client)));

  return (
    <div className="min-w-0">
      {doc ? (
        canOpen(doc.to) ? (
          <Link
            to={doc.to}
            className="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ouvrir ${doc.kind} ${doc.numero}`}
          >
            <DocumentCode>{doc.numero}</DocumentCode>
          </Link>
        ) : (
          <DocumentCode>{doc.numero}</DocumentCode>
        )
      ) : (
        <span className="block truncate" title={primary ?? undefined}>
          {primary || '—'}
        </span>
      )}
      {showClient && (
        <span className="block truncate text-xs text-muted-foreground" title={client ?? undefined}>
          {client}
        </span>
      )}
    </div>
  );
}

/** Titre d'une carte mobile de mouvement : le numéro du document réglé (mono), sinon le libellé. */
function mouvementTitle(m: MouvementCaisse): ReactNode {
  if (m.numero_facture) return <DocumentCode>{m.numero_facture}</DocumentCode>;
  if (m.numero_avoir) return <DocumentCode>{m.numero_avoir}</DocumentCode>;
  if (hasInternalId(m.libelle) && m.tiers_nom) return m.tiers_nom;
  return libelleMouvementLisible(m.libelle) || categoryLabel(m.categorie);
}

export default function CaisseV2() {
  const { user } = useAuth();
  const canOpen = useRouteAccess();
  const [singleKeyShortcuts] = useSingleKeyShortcuts();
  // `?magasin=3&cloture=1` : le tableau de bord ouvre la clôture de la caisse
  // restée ouverte la veille (P-M2).
  const [searchParams] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const wantsClose = searchParams.get('cloture') === '1';
  const initialMagasin = useRef(Number(searchParams.get('magasin')) || null);

  // ----- Données -----
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [magasinsLoading, setMagasinsLoading] = useState(true);
  const [magasinsError, setMagasinsError] = useState<unknown>(null);
  const [selectedMagasin, setSelectedMagasin] = useState<number | null>(null);

  const [session, setSession] = useState<SessionCaisse | null>(null);
  /** Magasin auquel appartient l'état de session affiché : rien ne s'affiche tant qu'il diffère du magasin choisi. */
  const [sessionFor, setSessionFor] = useState<number | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const sessionReq = useRef(0);

  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([]);
  const [mouvementsLoading, setMouvementsLoading] = useState(false);
  const [mouvementsError, setMouvementsError] = useState<unknown>(null);
  const mouvementsReq = useRef(0);
  const [showAllMouvements, setShowAllMouvements] = useState(false);

  // ----- Ouverture -----
  const [openDialog, setOpenDialog] = useState(false);
  const [fondInitial, setFondInitial] = useState('');
  const [fondInitialError, setFondInitialError] = useState<string | null>(null);
  const [commentaireOuverture, setCommentaireOuverture] = useState('');
  const [opening, setOpening] = useState(false);
  const fondInitialRef = useRef<HTMLInputElement>(null);

  // ----- Clôture -----
  const [closeDialog, setCloseDialog] = useState(false);
  const [closeState, dispatchClose] = useReducer(closeDialogReducer, initialCloseDialogState);
  const [closing, setClosing] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const previewReqId = useRef(0);
  const countRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // ----- Mouvement divers -----
  const [diversDialog, setDiversDialog] = useState(false);
  const [diversType, setDiversType] = useState<DiversType>('encaissement');
  const [diversCategorie, setDiversCategorie] = useState<DiversCategorie>('apport');
  const [diversMethode, setDiversMethode] = useState<PaymentMethod>('espece');
  const [diversMontant, setDiversMontant] = useState('');
  const [diversLibelle, setDiversLibelle] = useState('');
  const [diversErrors, setDiversErrors] = useState<{ montant?: string; libelle?: string }>({});
  const [diversSubmitting, setDiversSubmitting] = useState(false);
  // Clé d'idempotence stable pour la durée de vie du dialogue : un nouvel envoi
  // après une erreur réseau réutilise la même clé (pas de doublon côté serveur).
  const diversKeyRef = useRef('');
  const diversMontantRef = useRef<HTMLInputElement>(null);
  const diversLibelleRef = useRef<HTMLInputElement>(null);

  const isManager = ['admin', 'manager'].includes(user?.role ?? '');
  const staleSession = Boolean(session?.requires_manager_action);
  const staleSessionNeedsManager = staleSession && !isManager;

  // ===== Chargements =====
  const loadMagasins = useCallback(async () => {
    setMagasinsLoading(true);
    setMagasinsError(null);
    try {
      const rows = (await caisseService.getMagasins()) as Magasin[];
      setMagasins(rows);
      // Un seul magasin : il est choisi d'office ; sinon celui du lien d'arrivée.
      const fromLink = rows.find((m) => m.id === initialMagasin.current)?.id ?? null;
      setSelectedMagasin((current) => current ?? fromLink ?? (rows.length === 1 ? rows[0].id : null));
    } catch (err) {
      setMagasinsError(err);
    } finally {
      setMagasinsLoading(false);
    }
  }, []);

  const loadMouvements = useCallback(async (sessionId: number, silent = false) => {
    const req = ++mouvementsReq.current;
    if (!silent) setMouvementsLoading(true);
    setMouvementsError(null);
    try {
      const rows = (await caisseService.getMouvements(sessionId)) as MouvementCaisse[];
      if (req !== mouvementsReq.current) return;
      setMouvements(rows);
    } catch (err) {
      if (req !== mouvementsReq.current) return;
      setMouvements([]);
      setMouvementsError(err);
    } finally {
      if (req === mouvementsReq.current) setMouvementsLoading(false);
    }
  }, []);

  /**
   * Session ouverte d'un magasin. Un échec n'est JAMAIS présenté comme une
   * caisse fermée : on afficherait « Ouvrir la caisse » sur une caisse ouverte
   * (409 à la tentative). `silent` : actualisation après une action, sans
   * squelette.
   */
  const loadSession = useCallback(
    async (magasinId: number, silent = false) => {
      const req = ++sessionReq.current;
      if (!silent) setSessionLoading(true);
      setSessionError(null);
      try {
        const data = (await caisseService.getSessionActive(magasinId)) as SessionCaisse | null;
        if (req !== sessionReq.current) return;
        setSession(data);
        setSessionFor(magasinId);
        if (data?.id) {
          void loadMouvements(data.id, silent);
        } else {
          mouvementsReq.current++;
          setMouvements([]);
          setMouvementsError(null);
          setMouvementsLoading(false);
        }
      } catch (err) {
        if (req !== sessionReq.current) return;
        setSession(null);
        setSessionFor(magasinId);
        setSessionError(err);
      } finally {
        if (req === sessionReq.current) setSessionLoading(false);
      }
    },
    [loadMouvements]
  );

  useEffect(() => {
    void loadMagasins();
  }, [loadMagasins]);

  useEffect(() => {
    // Changement de magasin : la session du magasin précédent ne doit jamais rester affichée.
    setSession(null);
    setMouvements([]);
    setShowAllMouvements(false);
    if (selectedMagasin) void loadSession(selectedMagasin);
  }, [selectedMagasin, loadSession]);

  const sessionReady =
    selectedMagasin !== null && sessionFor === selectedMagasin && !sessionLoading;
  const sessionOpen = sessionReady && !sessionError && session !== null;
  const sessionClosed = sessionReady && !sessionError && session === null;

  // ===== Ouverture de caisse =====
  const openOpenDialog = () => {
    setFondInitial('');
    setFondInitialError(null);
    setCommentaireOuverture('');
    setOpenDialog(true);
  };

  const handleOpenSession = async () => {
    if (!selectedMagasin || opening) return;
    if (fondInitial === '') {
      setFondInitialError('Saisissez le fonds de caisse initial.');
      fondInitialRef.current?.focus();
      return;
    }
    setOpening(true);
    try {
      await caisseService.ouvrir({
        magasin_id: selectedMagasin,
        fond_initial: Number(fondInitial),
        commentaire_ouverture: commentaireOuverture.trim() || undefined,
      });
      toast.success(`Caisse ouverte avec un fonds de ${formatCurrency(fondInitial)}`);
      setOpenDialog(false);
      void loadSession(selectedMagasin, true);
    } catch (error) {
      const status = httpStatus(error);
      if (status === 409) {
        toast.error('Une caisse est déjà ouverte pour ce magasin : elle vient d’être rechargée.');
        setOpenDialog(false);
        void loadSession(selectedMagasin);
      } else if (status === 403) {
        toast.error('Vous ne pouvez pas ouvrir cette caisse. Demandez à un gérant.');
      } else {
        toast.error(getErrorMessage(error, 'Impossible d’ouvrir la caisse. Réessayez.'));
      }
    } finally {
      setOpening(false);
    }
  };

  // ===== Clôture =====
  const loadClosurePreview = useCallback(async (sessionId: number, fondFinalNum?: number) => {
    // Seule la dernière requête peut écrire son résultat : des réponses
    // désordonnées (saisie rapide du comptage) sont ignorées.
    const reqId = ++previewReqId.current;
    dispatchClose({ type: 'previewLoading' });
    try {
      const data = (await caisseService.getCloturePreview(sessionId, fondFinalNum)) as unknown as ClosurePreview;
      if (reqId !== previewReqId.current) return;
      dispatchClose({ type: 'previewLoaded', preview: data });
    } catch (e) {
      if (reqId !== previewReqId.current) return;
      dispatchClose({ type: 'previewError', error: getErrorMessage(e, 'Le calcul de la clôture a échoué.') });
    }
  }, []);

  const openCloseDialog = () => {
    if (!session) return;
    previewReqId.current++;
    dispatchClose({ type: 'reset' });
    setCountError(null);
    setCommentError(null);
    setCloseDialog(true);
    void loadClosurePreview(session.id);
  };

  const closeCloseDialog = () => {
    previewReqId.current++;
    setCloseDialog(false);
    dispatchClose({ type: 'reset' });
  };

  // Lien « Clôturer la caisse d’hier » du tableau de bord (P-M2) : la clôture
  // s'ouvre dès que la session est chargée, puis le paramètre est retiré.
  const openCloseRef = useRef(openCloseDialog);
  openCloseRef.current = openCloseDialog;
  useEffect(() => {
    if (!wantsClose || !sessionReady) return;
    if (sessionOpen && !staleSessionNeedsManager) openCloseRef.current();
    patchParams({ cloture: null, magasin: null });
  }, [wantsClose, sessionReady, sessionOpen, staleSessionNeedsManager, patchParams]);

  // Recalcul de l'écart quand le comptage change — différé de 300 ms pour ne
  // pas solliciter le serveur à chaque frappe.
  useEffect(() => {
    if (!closeDialog || !session?.id || closeState.fondFinal === '') return;
    const n = Number(closeState.fondFinal);
    if (Number.isNaN(n)) return;
    const sessionId = session.id;
    const timer = setTimeout(() => {
      void loadClosurePreview(sessionId, n);
    }, 300);
    return () => clearTimeout(timer);
  }, [closeState.fondFinal, closeDialog, session?.id, loadClosurePreview]);

  const preview = closeState.preview;
  const countNumber = closeState.fondFinal === '' ? null : Number(closeState.fondFinal);
  // L'écart affiché doit correspondre au comptage saisi, pas à une saisie précédente.
  const previewMatchesCount =
    preview !== null && countNumber !== null && toNumber(preview.fond_final_compte) === countNumber;
  const ecart = previewMatchesCount ? preview.ecart : null;
  const ecartNonNul = ecart !== null && Math.round(ecart) !== 0;
  const orphans = preview?.orphan_mouvements ?? [];

  const handleCloseSession = async () => {
    if (!session || closing || !selectedMagasin) return;
    setCountError(null);
    setCommentError(null);
    if (countNumber === null) {
      setCountError('Saisissez le montant des espèces comptées dans la caisse.');
      countRef.current?.focus();
      return;
    }
    // Calcul en cours, ou clôture bloquée : le bouton est désactivé, rien à faire.
    if (!preview || closeState.loading || !previewMatchesCount || !preview.can_close) return;
    if (ecartNonNul && !closeState.commentaire.trim()) {
      setCommentError(
        `Écart de ${formatSignedCurrency(ecart)} : expliquez-le dans le commentaire avant de clôturer.`
      );
      commentRef.current?.focus();
      return;
    }
    setClosing(true);
    try {
      const result = (await caisseService.cloturer(session.id, {
        fond_final_compte: countNumber,
        commentaire_cloture: closeState.commentaire.trim() || undefined,
      })) as { message?: unknown } | null;
      const message = typeof result?.message === 'string' && result.message ? result.message : 'Caisse clôturée';
      toast.success(message);
      closeCloseDialog();
      void loadSession(selectedMagasin, true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Impossible de clôturer la caisse. Réessayez.'));
    } finally {
      setClosing(false);
    }
  };

  // ===== Mouvement divers =====
  const openDivers = (type: DiversType) => {
    if (!session) return;
    if (staleSessionNeedsManager) {
      toast.error('Session ouverte depuis plus de 24 heures : un gérant doit la contrôler et la clôturer.');
      return;
    }
    setDiversType(type);
    setDiversCategorie(DIVERS_CATEGORIES[type][0].value);
    setDiversMethode('espece');
    setDiversMontant('');
    setDiversLibelle('');
    setDiversErrors({});
    diversKeyRef.current = '';
    setDiversDialog(true);
  };

  const handleDiversSubmit = async () => {
    if (!session || diversSubmitting || !selectedMagasin) return;
    const montant = Number(diversMontant);
    const errors: { montant?: string; libelle?: string } = {};
    if (!diversMontant || !(montant > 0)) errors.montant = 'Saisissez un montant supérieur à 0 FCFA.';
    if (diversLibelle.trim().length < 3) errors.libelle = 'Saisissez le motif du mouvement (3 caractères au moins).';
    setDiversErrors(errors);
    if (errors.montant) {
      diversMontantRef.current?.focus();
      return;
    }
    if (errors.libelle) {
      diversLibelleRef.current?.focus();
      return;
    }
    setDiversSubmitting(true);
    try {
      if (!diversKeyRef.current) {
        diversKeyRef.current = `divers-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }
      await caisseService.mouvementDivers(session.id, {
        type: diversType,
        categorie: diversCategorie,
        montant,
        methode_paiement: diversMethode,
        libelle: diversLibelle.trim(),
        idempotency_key: diversKeyRef.current,
      });
      toast.success(
        diversType === 'encaissement'
          ? `Entrée de ${formatCurrency(montant)} enregistrée`
          : `Sortie de ${formatCurrency(montant)} enregistrée`
      );
      setDiversDialog(false);
      void loadSession(selectedMagasin, true);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d’enregistrer le mouvement. Réessayez.'));
    } finally {
      setDiversSubmitting(false);
    }
  };

  // ===== Raccourcis E / S / O =====
  // Les gestionnaires changent à chaque rendu : publiés dans une ref pour que
  // l'écouteur clavier reste monté une seule fois. Chaque raccourci ne vaut que
  // dans l'état où son action a un sens (O sans session, E/S avec une session).
  const shortcutsRef = useRef({
    canOpenSession: false,
    canDivers: false,
    open: () => {},
    divers: (_type: DiversType) => {},
  });
  shortcutsRef.current = {
    canOpenSession: sessionClosed,
    canDivers: sessionOpen && !staleSessionNeedsManager,
    open: openOpenDialog,
    divers: openDivers,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!canRunSingleKeyShortcut(e)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.toLowerCase();
      const run = shortcutsRef.current;
      if (key === 'e' && run.canDivers) {
        e.preventDefault();
        run.divers('encaissement');
      } else if (key === 's' && run.canDivers) {
        e.preventDefault();
        run.divers('decaissement');
      } else if (key === 'o' && run.canOpenSession) {
        e.preventDefault();
        run.open();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ===== Mouvements : du plus récent au plus ancien, avec le solde espèces =====
  const chronological = useMemo(
    () =>
      [...mouvements].sort((a, b) => {
        const diff = new Date(a.date_mouvement).getTime() - new Date(b.date_mouvement).getTime();
        return diff !== 0 ? diff : a.id - b.id;
      }),
    [mouvements]
  );

  /**
   * Espèces dans le tiroir après chaque mouvement en espèces (en centimes pour
   * éviter la dérive des flottants). Le dernier solde vaut `expected_cash` : la
   * colonne et l'indicateur racontent la même chose.
   */
  const cashAfter = useMemo(() => {
    const map = new Map<number, number>();
    if (!session) return map;
    let cents = Math.round((toNumber(session.fond_initial) ?? 0) * 100);
    for (const m of chronological) {
      if (m.methode_paiement !== 'espece') continue;
      const amount = Math.round((toNumber(m.montant) ?? 0) * 100);
      cents += m.type === 'encaissement' ? amount : -amount;
      map.set(m.id, cents / 100);
    }
    return map;
  }, [session, chronological]);

  const newestFirst = useMemo(() => [...chronological].reverse(), [chronological]);
  const visibleMouvements = showAllMouvements ? newestFirst : newestFirst.slice(0, VISIBLE_MOUVEMENTS);
  const hiddenCount = newestFirst.length - visibleMouvements.length;

  const signedAmount = (m: MouvementCaisse) => {
    const n = toNumber(m.montant) ?? 0;
    return m.type === 'encaissement' ? n : -n;
  };

  const cashCell = (m: MouvementCaisse) =>
    m.methode_paiement === 'espece' ? (
      <Money value={cashAfter.get(m.id) ?? null} />
    ) : (
      <span className="text-muted-foreground" title="Hors espèces : sans effet sur le tiroir">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Hors espèces</span>
      </span>
    );

  // ===== En-tête =====
  const magasinCourant = magasins.find((m) => m.id === selectedMagasin) ?? null;
  const magasinLabel = (m: Magasin) => `${m.code} — ${m.nom}`;

  const headerActions = (
    <>
      {magasins.length > 1 && (
        <Select
          value={selectedMagasin ? String(selectedMagasin) : ''}
          onValueChange={(v) => setSelectedMagasin(Number(v))}
        >
          <SelectTrigger className="w-full sm:w-64" aria-label="Magasin">
            <SelectValue placeholder="Choisir un magasin" />
          </SelectTrigger>
          <SelectContent>
            {magasins.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {magasinLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {canOpen('/caisse/historique') && (
        <Link to="/caisse/historique" className={buttonVariants({ variant: 'outline', size: 'touch' })}>
          <History className="mr-2 h-4 w-4" aria-hidden="true" />
          Historique des caisses
        </Link>
      )}
    </>
  );

  // P-M2 : session ouverte un jour précédent — à compter et clôturer avant de vendre.
  const lateTill = sessionOpen && session ? previousDayTill(session.date_ouverture) : null;

  // Session trop ancienne pour un caissier : seul un gérant peut la clôturer —
  // le bandeau le dit, aucun bouton désactivé ne le répète.
  let primaryAction: ReactNode = null;
  if (sessionOpen && !staleSessionNeedsManager) {
    primaryAction = (
      <Button
        size="touch"
        onClick={openCloseDialog}
        aria-describedby={staleSession ? 'caisse-session-ancienne' : lateTill ? 'caisse-veille' : undefined}
      >
        <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
        {lateTill ? lateTill.closeLabel : 'Clôturer la caisse'}
      </Button>
    );
  } else if (sessionClosed) {
    primaryAction = (
      <Button size="touch" onClick={openOpenDialog} aria-keyshortcuts={singleKeyShortcuts ? 'O' : undefined}>
        <LockOpen className="mr-2 h-4 w-4" aria-hidden="true" />
        Ouvrir la caisse
      </Button>
    );
  }

  const meta = sessionOpen ? (
    <StatusBadge type="session_caisse" statut="ouverte" />
  ) : sessionClosed ? (
    <Badge variant="secondary" icon={Lock}>
      Fermée
    </Badge>
  ) : null;

  // Caisse ouverte : où, depuis quand et par qui tient en une ligne sous le
  // titre — la carte qui le disait pesait autant que les indicateurs. Le fonds
  // initial reste le premier terme de la bande du tiroir. Le magasin n'est pas
  // répété quand le sélecteur de l'en-tête l'affiche déjà.
  const sessionMagasin =
    session?.magasin_code && session.magasin_nom
      ? { code: session.magasin_code, nom: session.magasin_nom }
      : magasinCourant;
  const description =
    sessionOpen && session ? (
      <SessionSummary
        magasin={magasins.length > 1 ? null : sessionMagasin}
        ouverture={session.date_ouverture}
        par={session.ouvert_par_nom || session.ouvert_par_username || null}
      />
    ) : (
      'Ouvrez la caisse, enregistrez les mouvements, clôturez en fin de journée'
    );

  const shell = (children: ReactNode) => (
    <PageShell
      title="Caisse"
      description={description}
      meta={meta}
      actions={headerActions}
      primaryAction={primaryAction}
    >
      {children}
    </PageShell>
  );

  // ===== Branches de rendu =====
  if (magasinsLoading) {
    return shell(<ListSkeleton items={4} />);
  }

  if (magasinsError) {
    return shell(
      <Card>
        <QueryErrorState
          error={magasinsError}
          title="Impossible de charger vos magasins"
          onRetry={() => void loadMagasins()}
        />
      </Card>
    );
  }

  if (magasins.length === 0) {
    return shell(
      <Card>
        <EmptyState
          icon={Store}
          title="Aucun magasin ne vous est affecté"
          description="Demandez à l’administrateur de vous affecter à un magasin pour tenir sa caisse"
        />
      </Card>
    );
  }

  if (!selectedMagasin) {
    return shell(
      <Card>
        <EmptyState
          icon={Store}
          title="Choisissez un magasin"
          description="Sélectionnez en haut de la page le magasin dont vous tenez la caisse"
        />
      </Card>
    );
  }

  const dialogs = (
    <>
      {/* Ouverture */}
      <Dialog open={openDialog} onOpenChange={(o) => !opening && setOpenDialog(o)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid grid-cols-[minmax(0,1fr)] gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleOpenSession();
            }}
          >
            <DialogHeader>
              <DialogTitle>Ouvrir la caisse</DialogTitle>
              <DialogDescription>
                Comptez les espèces du tiroir avant la première vente : ce montant devient le fonds de caisse.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="caisse-fond-initial">
                  Fonds de caisse initial
                  <RequiredMark />
                </Label>
                <MoneyInput
                  id="caisse-fond-initial"
                  ref={fondInitialRef}
                  autoFocus
                  value={fondInitial}
                  onChange={(v) => {
                    setFondInitial(v);
                    if (fondInitialError) setFondInitialError(null);
                  }}
                  placeholder="50 000"
                  className="mt-1"
                  {...fieldErrorProps('caisse-fond-initial', fondInitialError)}
                />
                <FieldError id="caisse-fond-initial">{fondInitialError}</FieldError>
                <p className="mt-1 text-sm text-muted-foreground">Espèces comptées à l’ouverture</p>
              </div>
              <div>
                <Label htmlFor="caisse-commentaire-ouverture">Commentaire (facultatif)</Label>
                <Input
                  id="caisse-commentaire-ouverture"
                  value={commentaireOuverture}
                  onChange={(e) => setCommentaireOuverture(e.target.value)}
                  placeholder="Ex. : fonds de caisse habituel"
                  maxLength={2000}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)} disabled={opening}>
                Annuler
              </Button>
              <Button type="submit" disabled={opening}>
                {opening ? (
                  <>
                    <Spinner className="mr-2" />
                    Ouverture…
                  </>
                ) : (
                  'Ouvrir la caisse'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clôture */}
      <Dialog
        open={closeDialog}
        onOpenChange={(o) => {
          if (!o && !closing) closeCloseDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <form
            className="grid grid-cols-[minmax(0,1fr)] gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleCloseSession();
            }}
          >
            <DialogHeader>
              <DialogTitle>Clôturer la caisse</DialogTitle>
              <DialogDescription>
                Comptez les espèces du tiroir et saisissez le montant : l’écart est calculé sur les espèces
                uniquement. Les autres modes de paiement sont affichés pour contrôle.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {closeState.error ? (
                <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
                  <p className="font-medium">Impossible de calculer la clôture</p>
                  <p className="mt-0.5">{closeState.error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => session && void loadClosurePreview(session.id, countNumber ?? undefined)}
                  >
                    Recalculer
                  </Button>
                </div>
              ) : !preview ? (
                <TableSkeleton rows={3} columns={3} />
              ) : (
                <>
                  {orphans.length > 0 && (
                    <div
                      role="alert"
                      className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800"
                    >
                      <p className="flex items-start gap-2 font-medium">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        Clôture impossible :{' '}
                        {orphans.length === 1
                          ? '1 mouvement n’est lié à aucun document'
                          : `${orphans.length} mouvements ne sont liés à aucun document`}
                      </p>
                      <ul className="mt-2 list-disc space-y-0.5 ps-5">
                        {orphans.slice(0, 5).map((o) => (
                          <li key={o.id}>
                            Mouvement n° {o.id} · {categoryLabel(o.categorie)} · {formatCurrency(o.montant)}
                            {o.libelle ? ` — ${o.libelle}` : ''}
                          </li>
                        ))}
                      </ul>
                      {orphans.length > 5 && (
                        <p className="mt-1">
                          … et {orphans.length - 5} {plural(orphans.length - 5, 'autre', 'autres')}.
                        </p>
                      )}
                      {/* CP-CAI-02 : aucun écran ne rattache ni n'annule un mouvement (U-27) —
                          on dit la seule démarche possible, sans lien vers une impasse. */}
                      <p className="mt-2">
                        Ces mouvements ne peuvent pas encore être corrigés depuis l’application. Notez leurs numéros et
                        signalez-les à votre administrateur, qui fera corriger les données par le support{' '}
                        {PRODUCT_NAME}. La caisse reste ouverte en attendant.
                      </p>
                    </div>
                  )}

                  <section aria-labelledby="cloture-par-mode" className="space-y-1">
                    <h3 id="cloture-par-mode" className="text-sm font-medium">
                      Par mode de paiement
                    </h3>
                    <div className="rounded-md border">
                      <ParMethodeTable rows={preview.par_methode ?? []} label="Totaux de la session par mode de paiement" />
                    </div>
                  </section>

                  <dl className="space-y-1 rounded-md border p-3 text-sm">
                    <AmountRow label="Fonds de caisse initial" value={preview.fond_initial} />
                    <AmountRow label="Espèces encaissées" value={toNumber(preview.especes_encaissees)} signed />
                    <AmountRow
                      label="Espèces décaissées"
                      value={(() => {
                        const n = toNumber(preview.especes_decaissees);
                        return n === null ? null : -n;
                      })()}
                      signed
                    />
                    <AmountRow label="Espèces attendues en caisse" value={preview.expected_cash} emphasis />
                  </dl>
                </>
              )}

              <div>
                <Label htmlFor="caisse-especes-comptees">
                  Espèces comptées
                  <RequiredMark />
                </Label>
                <MoneyInput
                  id="caisse-especes-comptees"
                  ref={countRef}
                  autoFocus
                  value={closeState.fondFinal}
                  onChange={(v) => {
                    dispatchClose({ type: 'setFondFinal', value: v });
                    if (countError) setCountError(null);
                  }}
                  placeholder="0"
                  className="mt-1"
                  {...fieldErrorProps('caisse-especes-comptees', countError)}
                />
                <FieldError id="caisse-especes-comptees">{countError}</FieldError>
              </div>

              <div aria-live="polite">
                {ecart !== null ? (
                  <div className={cn('rounded-md border p-3', ECART_BOX[tillGapTone(ecart)])}>
                    <p className="text-sm font-medium">Écart sur les espèces</p>
                    <p className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">
                      {tillGapTone(ecart) === 'ok' ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                      )}
                      {formatSignedCurrency(ecart)}
                    </p>
                    <p className="mt-1 text-sm">
                      {ecartPhrase(ecart)}
                      {ecartNonNul && ' Expliquez l’écart dans le commentaire.'}
                    </p>
                  </div>
                ) : countNumber !== null && closeState.loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner />
                    Calcul de l’écart…
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="caisse-commentaire-cloture">
                  Commentaire
                  {ecartNonNul ? <RequiredMark /> : ' (facultatif)'}
                </Label>
                <Textarea
                  id="caisse-commentaire-cloture"
                  ref={commentRef}
                  rows={2}
                  value={closeState.commentaire}
                  onChange={(e) => {
                    dispatchClose({ type: 'setCommentaire', value: e.target.value });
                    if (commentError) setCommentError(null);
                  }}
                  placeholder={ecartNonNul ? 'Expliquez l’écart…' : 'Commentaire facultatif…'}
                  maxLength={2000}
                  className="mt-1"
                  {...fieldErrorProps('caisse-commentaire-cloture', commentError)}
                />
                <FieldError id="caisse-commentaire-cloture">{commentError}</FieldError>
              </div>
            </div>

            <DialogFooter sticky>
              <Button type="button" variant="outline" onClick={closeCloseDialog} disabled={closing}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant="warning"
                disabled={
                  closing ||
                  closeState.loading ||
                  !!closeState.error ||
                  !preview ||
                  !preview.can_close ||
                  (countNumber !== null && !previewMatchesCount)
                }
              >
                {closing ? (
                  <>
                    <Spinner className="mr-2" />
                    Clôture…
                  </>
                ) : (
                  'Clôturer la caisse'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mouvement divers */}
      <Dialog open={diversDialog} onOpenChange={(o) => !diversSubmitting && setDiversDialog(o)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid grid-cols-[minmax(0,1fr)] gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleDiversSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{DIVERS_TEXT[diversType].title}</DialogTitle>
              <DialogDescription>{DIVERS_TEXT[diversType].description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ChoiceGroup<DiversType>
                label="Type de mouvement"
                value={diversType}
                onValueChange={(t) => {
                  setDiversType(t);
                  setDiversCategorie(DIVERS_CATEGORIES[t][0].value);
                }}
                options={[
                  { value: 'encaissement', label: 'Entrée', icon: ArrowDownLeft },
                  { value: 'decaissement', label: 'Sortie', icon: ArrowUpRight },
                ]}
                layout="grid-2"
                shape="tile"
                size="touch"
              />
              {/* P-M3 : une seule façon d'enregistrer une dépense — Dépenses, qui la
                  sort aussi du tiroir et la classe par catégorie. */}
              {diversType === 'decaissement' && (
                <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="flex items-start gap-2">
                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                      Une dépense (transport, fournitures, repas…) ? Enregistrez-la dans Dépenses : elle sort aussi du
                      tiroir et reste classée par catégorie.
                    </span>
                  </p>
                  {canOpen('/depenses') && (
                    <Link
                      to="/depenses?nouvelle=1"
                      onClick={() => setDiversDialog(false)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'touch' }), 'self-start')}
                    >
                      Nouvelle dépense
                    </Link>
                  )}
                </div>
              )}
              <ChoiceGroup<DiversCategorie>
                label="Catégorie"
                value={diversCategorie}
                onValueChange={setDiversCategorie}
                options={DIVERS_CATEGORIES[diversType]}
                layout="wrap"
                shape="tile"
                size="touch"
              />
              <div>
                <Label htmlFor="divers-methode">Mode de paiement</Label>
                <Select value={diversMethode} onValueChange={(v) => setDiversMethode(v as PaymentMethod)}>
                  <SelectTrigger id="divers-methode" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {diversMethode !== 'espece' && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Hors espèces : ce mouvement ne change pas les espèces attendues dans le tiroir.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="divers-montant">
                  Montant
                  <RequiredMark />
                </Label>
                <MoneyInput
                  id="divers-montant"
                  ref={diversMontantRef}
                  autoFocus
                  value={diversMontant}
                  onChange={(v) => {
                    setDiversMontant(v);
                    if (diversErrors.montant) setDiversErrors((err) => ({ ...err, montant: undefined }));
                  }}
                  placeholder="0"
                  className="mt-1"
                  {...fieldErrorProps('divers-montant', diversErrors.montant)}
                />
                <FieldError id="divers-montant">{diversErrors.montant}</FieldError>
              </div>
              <div>
                <Label htmlFor="divers-motif">
                  Motif
                  <RequiredMark />
                </Label>
                <Input
                  id="divers-motif"
                  ref={diversLibelleRef}
                  value={diversLibelle}
                  onChange={(e) => {
                    setDiversLibelle(e.target.value);
                    if (diversErrors.libelle) setDiversErrors((err) => ({ ...err, libelle: undefined }));
                  }}
                  placeholder={DIVERS_TEXT[diversType].placeholder}
                  maxLength={500}
                  className="mt-1"
                  {...fieldErrorProps('divers-motif', diversErrors.libelle)}
                />
                <FieldError id="divers-motif">{diversErrors.libelle}</FieldError>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDiversDialog(false)} disabled={diversSubmitting}>
                Annuler
              </Button>
              <Button type="submit" disabled={diversSubmitting}>
                {diversSubmitting ? (
                  <>
                    <Spinner className="mr-2" />
                    Enregistrement…
                  </>
                ) : (
                  'Enregistrer le mouvement'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  if (!sessionReady) {
    return shell(
      <div className="space-y-4" aria-busy="true">
        <StatGrid className={KPI_GRID}>
          <StatTile label="Espèces attendues en caisse" size="lg" loading className="min-[360px]:col-span-2" />
          <StatTile label="Encaissements, tous modes" loading />
          <StatTile label="Décaissements, tous modes" loading />
          <StatTile label="Hors espèces, pas dans le tiroir" loading />
        </StatGrid>
        <ListSkeleton items={4} />
      </div>
    );
  }

  if (sessionError) {
    return shell(
      <Card>
        <QueryErrorState
          error={sessionError}
          title="Impossible de charger la caisse de ce magasin"
          onRetry={() => void loadSession(selectedMagasin)}
        />
      </Card>
    );
  }

  if (!session) {
    return shell(
      <>
        <Card>
          <EmptyState
            icon={Lock}
            title={magasinCourant ? `Caisse fermée — ${magasinLabel(magasinCourant)}` : 'Caisse fermée'}
            description="Ouvrez la caisse pour encaisser des espèces : comptez d’abord le fonds de caisse du tiroir"
            action={
              <Button size="touch" onClick={openOpenDialog}>
                <LockOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                Ouvrir la caisse
              </Button>
            }
          />
          {singleKeyShortcuts && (
            <p className="hidden pb-6 text-center text-xs text-muted-foreground md:block">
              Raccourci : <kbd className="rounded border bg-muted px-1 font-sans">O</kbd> ouvre la caisse
            </p>
          )}
        </Card>
        {dialogs}
      </>
    );
  }

  // ===== Caisse ouverte =====
  const staleFor = sessionDuration(session.session_age_hours);
  const expectedCash = toNumber(session.expected_cash);
  const totalEnc = toNumber(session.total_encaissements);
  const totalDec = toNumber(session.total_decaissements);
  const especesEnc = toNumber(session.especes_encaissees);
  const especesDec = toNumber(session.especes_decaissees);
  const horsEspecesEnc = toNumber(session.hors_especes_encaissees);
  const horsEspecesDec = toNumber(session.hors_especes_decaissees) ?? 0;
  const nonCash = (session.par_methode ?? []).filter(
    (p) => p.methode_paiement !== 'espece' && (toNumber(p.total_encaissements) ?? 0) !== 0
  );

  return shell(
    <>
      {/* La clôture se lance par l'action principale de l'en-tête : le bandeau
          dit seulement depuis quand, et qui doit agir. */}
      {staleSession && (
        <div
          id="caisse-session-ancienne"
          className="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden="true" />
          <div className="min-w-0 text-sm text-danger-800">
            <p className="font-medium">
              {staleFor ? `Caisse ouverte depuis ${staleFor}` : 'Caisse ouverte depuis plus de 24 heures'}
            </p>
            <p>Elle doit être contrôlée et clôturée avant de poursuivre les opérations courantes.</p>
            {staleSessionNeedsManager && <p className="mt-1">Demandez à un gérant de la contrôler et de la clôturer.</p>}
          </div>
        </div>
      )}

      {lateTill && !staleSession && (
        <div
          id="caisse-veille"
          className="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 p-4"
        >
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden="true" />
          <div className="min-w-0 text-sm text-warning-800">
            <p className="font-medium">{lateTill.title}</p>
            <p>
              Comptez le tiroir et clôturez-la maintenant, puis ouvrez la caisse du jour. {lateTill.blockedAtLabel}, les
              encaissements seront bloqués {isManager ? 'tant qu’elle ne sera pas clôturée' : 'jusqu’au passage d’un gérant'}.
            </p>
          </div>
        </div>
      )}

      <StatGrid className={KPI_GRID}>
        <DrawerEquationTile
          className="min-[360px]:col-span-2"
          fondInitial={toNumber(session.fond_initial)}
          entrees={especesEnc}
          sorties={especesDec}
          attendues={expectedCash}
        />
        <StatTile
          label="Encaissements, tous modes"
          format="money"
          value={totalEnc ?? undefined}
          unavailable={totalEnc === null}
          hint={especesEnc !== null ? `dont ${formatCurrency(especesEnc)} en espèces` : undefined}
        />
        <StatTile
          label="Décaissements, tous modes"
          format="money"
          value={totalDec ?? undefined}
          unavailable={totalDec === null}
          hint={especesDec !== null ? `dont ${formatCurrency(especesDec)} en espèces` : undefined}
        />
        <StatTile
          label="Hors espèces, pas dans le tiroir"
          format="money"
          value={horsEspecesEnc ?? undefined}
          unavailable={horsEspecesEnc === null}
          hint={
            nonCash.length === 0
              ? 'Aucun paiement par carte, chèque, virement ou mobile money'
              : horsEspecesDec > 0
                ? `Sorties hors espèces : ${formatCurrency(horsEspecesDec)}`
                : undefined
          }
          footer={
            nonCash.length > 0 ? (
              <dl className="space-y-0.5 text-xs" aria-label="Encaissements hors espèces par mode de paiement">
                {nonCash.map((p) => (
                  <div key={p.methode_paiement} className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <dt className="text-muted-foreground">{formatPaymentMethod(p.methode_paiement)}</dt>
                    <dd className="whitespace-nowrap tabular-nums">{formatCurrency(p.total_encaissements)}</dd>
                  </div>
                ))}
              </dl>
            ) : undefined
          }
        />
      </StatGrid>

      <Card className="min-w-0 max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <CardHeader className="gap-3 max-md:px-0 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1">
              <CardTitle>Mouvements de la session</CardTitle>
              <CardDescription>
                {mouvements.length > 0
                  ? `${mouvements.length} ${plural(mouvements.length, 'mouvement', 'mouvements')}, du plus récent au plus ancien`
                  : 'Paiements en espèces, dépenses et mouvements divers'}
              </CardDescription>
            </div>
            {/* Session trop ancienne pour un caissier : rien à ajouter tant qu'un gérant ne l'a pas clôturée. */}
            {!staleSessionNeedsManager && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="touch"
                  onClick={() => openDivers('encaissement')}
                  aria-keyshortcuts={singleKeyShortcuts ? 'E' : undefined}
                >
                  <ArrowDownLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Ajouter une entrée
                </Button>
                <Button
                  variant="outline"
                  size="touch"
                  onClick={() => openDivers('decaissement')}
                  aria-keyshortcuts={singleKeyShortcuts ? 'S' : undefined}
                >
                  <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" />
                  Ajouter une sortie
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3 max-md:p-0">
            {singleKeyShortcuts && !staleSessionNeedsManager && (
              <p className="hidden text-xs text-muted-foreground md:block">
                Raccourcis : <kbd className="rounded border bg-muted px-1 font-sans">E</kbd> entrée ·{' '}
                <kbd className="rounded border bg-muted px-1 font-sans">S</kbd> sortie ·{' '}
                <kbd className="rounded border bg-muted px-1 font-sans">Entrée</kbd> valide le formulaire
              </p>
            )}
            <QueryState
              loading={mouvementsLoading && mouvements.length === 0}
              error={mouvementsError}
              errorTitle="Impossible de charger les mouvements"
              onRetry={() => void loadMouvements(session.id)}
              isEmpty={mouvements.length === 0}
              skeleton={<TableSkeleton rows={5} columns={6} />}
              emptyIcon={ArrowLeftRight}
              emptyTitle="Aucun mouvement dans cette session"
              emptyDescription="Les paiements en espèces et les mouvements divers apparaîtront ici"
            >
              <ResponsiveTable
                table={
                  <Table aria-label="Mouvements de la session">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Heure</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Mode de paiement</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead numeric>Montant</TableHead>
                        <TableHead numeric>Espèces en caisse</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleMouvements.map((m, i) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap">
                            <QuandCell date={m.date_mouvement} showDate={showsDate(visibleMouvements, i)} />
                          </TableCell>
                          <TableCell>
                            <TypeTag type={m.type} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{categoryLabel(m.categorie)}</TableCell>
                          <TableCell>
                            <MethodTag method={m.methode_paiement} />
                          </TableCell>
                          <TableCell className="max-w-[15rem]">
                            <MouvementLabel m={m} canOpen={canOpen} />
                          </TableCell>
                          <TableCell numeric>
                            <Money value={signedAmount(m)} tone="delta" />
                          </TableCell>
                          <TableCell numeric>{cashCell(m)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
                cards={visibleMouvements.map((m, i) => {
                  const docHref = m.facture_id
                    ? `/factures/${m.facture_id}`
                    : m.avoir_id
                      ? `/avoirs/${m.avoir_id}`
                      : null;
                  return (
                  <DataCard
                    key={m.id}
                    title={mouvementTitle(m)}
                    wrapTitle
                    titleAs="h3"
                    href={docHref && canOpen(docHref) ? docHref : undefined}
                    badge={<TypeTag type={m.type} />}
                  >
                    <DataCardRow label="Heure" value={quand(m.date_mouvement, showsDate(visibleMouvements, i))} numeric />
                    {m.tiers_nom && <DataCardRow label="Client" value={m.tiers_nom} />}
                    <DataCardRow label="Catégorie" value={categoryLabel(m.categorie)} />
                    <DataCardRow label="Mode de paiement" value={<MethodTag method={m.methode_paiement} />} />
                    <DataCardRow label="Montant" value={<Money value={signedAmount(m)} tone="delta" />} numeric />
                    <DataCardRow label="Espèces en caisse" value={cashCell(m)} numeric />
                  </DataCard>
                  );
                })}
              />
              {(hiddenCount > 0 || showAllMouvements) && newestFirst.length > VISIBLE_MOUVEMENTS && (
                <div className="flex justify-center border-t pt-3">
                  <Button variant="ghost" onClick={() => setShowAllMouvements((v) => !v)}>
                    {showAllMouvements
                      ? `Afficher les ${VISIBLE_MOUVEMENTS} derniers mouvements`
                      : `Afficher les ${newestFirst.length} mouvements`}
                  </Button>
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>

      {dialogs}
    </>
  );
}
