import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { comptabiliteService, generalLedgerService } from '@/services/api';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, type TagHue } from '@/components/ui/tag';
import { DocumentCode } from '@/components/ui/document-code';
import { StatusBadge } from '@/components/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { Money } from '@/components/ui/money';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MoneyInput } from '@/components/ui/money-input';
import { Spinner } from '@/components/ui/loading';
import { downloadCsv } from '@/utils/csv';
import { ledgerSourceHref } from '@/utils/ledger';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatDateNumeric, formatNumber } from '@/utils/format';

interface Compte {
  id: number;
  numero: string;
  intitule: string;
  type_compte: string;
  categorie: string | null;
  actif: boolean;
}

interface EcritureComptable {
  id: number;
  numero_piece: string | null;
  date_ecriture: string;
  journal: string;
  piece_id: number | null;
  piece_type: string | null;
  ligne_numero: number;
  compte_id: number;
  compte_numero: string;
  compte_intitule: string;
  debit: string;
  credit: string;
  description: string | null;
  source_id: number | null;
  source_type: string | null;
}

interface BalanceComptable {
  compte_id: number;
  compte_numero: string;
  compte_intitule: string;
  total_debit: string;
  total_credit: string;
  solde: string;
}

/** Ligne du grand-livre d'un compte (`/comptabilite/grand-livre/:numero`). */
interface LigneGrandLivre {
  id: number;
  numero_piece: string | null;
  date_ecriture: string;
  libelle: string | null;
  debit: string;
  credit: string;
}

type PieceLigne = { compte_numero: string; debit: string; credit: string };

type Tab = 'ecritures' | 'grand-livre' | 'trial-balance' | 'chart';

/**
 * Journaux : catégories (teintes `chart-*`), jamais des couleurs de statut. Pas
 * de teinte 1 : c'est le bleu d'accent (actions, valeur à l'encre d'un
 * graphique) — le journal le plus fréquent ne doit pas peindre la colonne en bleu.
 */
const JOURNALS: Record<string, { label: string; hue: TagHue }> = {
  VENTES: { label: 'Ventes', hue: 2 },
  ACHATS: { label: 'Achats', hue: 6 },
  TRESORERIE: { label: 'Trésorerie', hue: 3 },
  OD: { label: 'Opérations diverses', hue: 4 },
};

const ACCOUNT_TYPES: Record<string, { label: string; hue: TagHue }> = {
  actif: { label: 'Actif', hue: 7 },
  passif: { label: 'Passif', hue: 2 },
  capitaux_propres: { label: 'Capitaux propres', hue: 3 },
  charge: { label: 'Charge', hue: 4 },
  produit: { label: 'Produit', hue: 5 },
};

const journalLabel = (code: string) => JOURNALS[code]?.label ?? code;
const accountTypeLabel = (code: string) => ACCOUNT_TYPES[code]?.label ?? code;

const num = (v: string | number | null | undefined) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Montant d'une colonne de tableau : chiffres groupés, sans l'unité — chaque
 * tableau porte une seule légende « Montants en FCFA », jamais l'unité dans
 * certains en-têtes seulement.
 */
const amount = (v: string | number | null | undefined) => formatNumber(Math.round(num(v)));
/** Cellule débit/crédit : vide quand la ligne est de l'autre sens. */
const amountOrBlank = (v: string | number | null | undefined) => (num(v) !== 0 ? amount(v) : '');

/** Somme en centimes (pas de dérive des flottants). */
const sumCents = (values: Array<string | number>) => values.reduce<number>((s, v) => s + Math.round(num(v) * 100), 0) / 100;

/**
 * Montant d'une ligne en carte mobile (GV-05) : l'unité y est écrite, faute
 * de légende sous un tableau ; l'autre sens de la ligne reste vide.
 */
function LedgerAmount({ value }: { value: string | number | null | undefined }) {
  if (num(value) === 0) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Aucun montant</span>
      </span>
    );
  }
  return <Money value={num(value)} />;
}

/**
 * Solde en carte : montant positif + sens écrit en toutes lettres. `medium` :
 * poids 500 (solde cumulé), comme la colonne du tableau — jamais 600 par ligne.
 */
function SoldeAmount({ value, medium = false }: { value: number; medium?: boolean }) {
  const sens = value > 0 ? 'débiteur' : value < 0 ? 'créditeur' : '';
  return (
    <span className="whitespace-nowrap">
      <Money value={Math.abs(value)} className={medium ? 'font-medium' : undefined} />
      {sens && <span className="text-xs text-muted-foreground"> {sens}</span>}
    </span>
  );
}

/** Carte d'un onglet dont la liste devient des cartes sur téléphone : pas de carte dans la carte. */
const FLUSH_CARD = 'max-md:border-0 max-md:bg-transparent max-md:shadow-none';

/** Légende d'unité d'un tableau de montants (les cartes mobiles écrivent l'unité). */
function AmountsCaption({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-2 hidden text-xs text-muted-foreground md:block">
      Montants en FCFA
      {children}
    </p>
  );
}

/** Texte libre (libellé) d'une carte : passe à la ligne au lieu d'être tronqué. */
const wrapText = (text: string) => <span className="block whitespace-normal break-words text-left">{text}</span>;

/**
 * Lignes consécutives d'une même pièce — même numéro, même jour, même journal,
 * même document source. Le numéro, la date et le journal ne s'écrivent qu'une
 * fois par pièce, qui se lit comme un seul bloc débit / crédit.
 *
 * Le regroupement se fait sur la page reçue : une pièce coupée par la
 * pagination recommence en haut de la page suivante avec son en-tête complet.
 * Une ligne sans numéro de pièce reste seule.
 */
function groupByPiece(rows: readonly EcritureComptable[]): EcritureComptable[][] {
  const pieces: EcritureComptable[][] = [];
  for (const row of rows) {
    const current = pieces[pieces.length - 1];
    const head = current?.[0];
    const samePiece =
      !!head &&
      !!row.numero_piece &&
      row.numero_piece === head.numero_piece &&
      row.journal === head.journal &&
      formatDate(row.date_ecriture) === formatDate(head.date_ecriture) &&
      ledgerSourceHref(row) === ledgerSourceHref(head);
    if (samePiece) current.push(row);
    else pieces.push([row]);
  }
  return pieces;
}

/** Numéro d'une pièce, lien vers son document source quand il en a un. */
function PieceNumero({ ecriture }: { ecriture: EcritureComptable }) {
  const href = ledgerSourceHref(ecriture);
  if (href) {
    return (
      <Link
        to={href}
        // `-my-0.5` : la cible garde 24 px sans décaler le texte de la ligne (cellules alignées en haut).
        className="-my-0.5 inline-flex min-h-6 items-center rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ouvrir la pièce ${ecriture.numero_piece}`}
      >
        <DocumentCode>{ecriture.numero_piece}</DocumentCode>
      </Link>
    );
  }
  return ecriture.numero_piece ? <DocumentCode>{ecriture.numero_piece}</DocumentCode> : <>—</>;
}

/** Ligne d'une pièce en carte mobile : compte et libellé à gauche, sens et montant à droite. */
function PieceLigneItem({ ecriture }: { ecriture: EcritureComptable }) {
  const compte = [ecriture.compte_numero, ecriture.compte_intitule].filter(Boolean).join(' ');
  const debit = num(ecriture.debit);
  const credit = num(ecriture.credit);
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="break-words">{compte || <span className="text-muted-foreground">Compte non renseigné</span>}</p>
        {ecriture.description && (
          <p className="break-words text-xs text-muted-foreground">{ecriture.description}</p>
        )}
      </div>
      <dl className="shrink-0 text-right">
        {debit === 0 && credit === 0 ? (
          <div>
            <dt className="sr-only">Montant</dt>
            <dd>
              <LedgerAmount value={0} />
            </dd>
          </div>
        ) : (
          <>
            {debit !== 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">Débit</dt>
                <dd>
                  <LedgerAmount value={debit} />
                </dd>
              </div>
            )}
            {credit !== 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">Crédit</dt>
                <dd>
                  <LedgerAmount value={credit} />
                </dd>
              </div>
            )}
          </>
        )}
      </dl>
    </li>
  );
}

/** Date du jour en LOCAL (YYYY-MM-DD) — toISOString() décalerait vers UTC. */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const firstDayOfYear = () => `${new Date().getFullYear()}-01-01`;

const emptyLignes = (): PieceLigne[] => [
  { compte_numero: '', debit: '', credit: '' },
  { compte_numero: '', debit: '', credit: '' },
];

const unwrapRows = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  const rows = (data as { data?: unknown } | null)?.data;
  return Array.isArray(rows) ? (rows as T[]) : [];
};

export default function GeneralLedger() {
  const [ecritures, setEcritures] = useState<EcritureComptable[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<Compte[]>([]);
  const [trialBalance, setTrialBalance] = useState<BalanceComptable[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('ecritures');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filterJournal, setFilterJournal] = useState<string>('');
  const [filterCompte, setFilterCompte] = useState<string>('all');
  const [pieceSearch, setPieceSearch] = useState('');
  const [libelleSearch, setLibelleSearch] = useState('');
  const [debouncedPieceSearch, setDebouncedPieceSearch] = useState('');
  const [debouncedLibelleSearch, setDebouncedLibelleSearch] = useState('');
  const [dateDebut, setDateDebut] = useState<string>(firstDayOfYear);
  const [dateFin, setDateFin] = useState<string>(todayLocal);

  // Pagination serveur de l'onglet Écritures.
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Grand-livre : les écritures d'un seul compte, avec solde cumulé.
  const [compteGrandLivre, setCompteGrandLivre] = useState('');
  const [grandLivre, setGrandLivre] = useState<LigneGrandLivre[]>([]);

  // Saisie d'une pièce comptable manuelle.
  const [pieceOpen, setPieceOpen] = useState(false);
  const [pieceJournal, setPieceJournal] = useState('OD');
  const [pieceDate, setPieceDate] = useState(todayLocal);
  const [pieceLibelle, setPieceLibelle] = useState('');
  const [pieceLignes, setPieceLignes] = useState<PieceLigne[]>(emptyLignes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedPieceSearch(pieceSearch.trim());
      setDebouncedLibelleSearch(libelleSearch.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [pieceSearch, libelleSearch]);

  // Plan comptable pour les listes de comptes (filtres, saisie) : un échec
  // laisse ces listes vides, l'onglet « Plan comptable » affiche sa propre erreur.
  useEffect(() => {
    generalLedgerService
      .getChartOfAccounts()
      .then((data) => setChartOfAccounts(unwrapRows<Compte>(data)))
      .catch(() => setChartOfAccounts([]));
  }, []);

  // Retour en page 1 quand les filtres des écritures changent.
  useEffect(() => {
    setPage(1);
  }, [filterJournal, filterCompte, debouncedPieceSearch, debouncedLibelleSearch, dateDebut, dateFin]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reload` lit l'onglet et les filtres listés ici
  }, [
    activeTab,
    filterJournal,
    filterCompte,
    debouncedPieceSearch,
    debouncedLibelleSearch,
    dateDebut,
    dateFin,
    page,
    limit,
    compteGrandLivre,
  ]);

  const ecrituresFilters = () => ({
    journal: filterJournal || undefined,
    date_debut: dateDebut,
    date_fin: dateFin,
    compte_id: filterCompte === 'all' ? undefined : Number(filterCompte),
    numero_piece: debouncedPieceSearch || undefined,
    description: debouncedLibelleSearch || undefined,
  });

  /** Recharge l'onglet actif — sert aussi de callback « Réessayer ». */
  const reload = () => {
    if (activeTab === 'ecritures') return fetchEcritures();
    if (activeTab === 'chart') return fetchChartOfAccounts();
    if (activeTab === 'grand-livre') return fetchGrandLivre();
    return fetchTrialBalance();
  };

  const fetchEcritures = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generalLedgerService.getAll({ ...ecrituresFilters(), page, limit });
      setEcritures(unwrapRows<EcritureComptable>(data));
      setTotal(data?.pagination?.total ?? 0);
      setTotalPages(data?.pagination?.totalPages ?? 0);
    } catch (e) {
      setError(e);
      setEcritures([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartOfAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      setChartOfAccounts(unwrapRows<Compte>(await generalLedgerService.getChartOfAccounts()));
    } catch (e) {
      setError(e);
      setChartOfAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrialBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      setTrialBalance(unwrapRows<BalanceComptable>(await generalLedgerService.getTrialBalance(dateDebut, dateFin)));
    } catch (e) {
      setError(e);
      setTrialBalance([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGrandLivre = async () => {
    // Pas de compte choisi : rien à charger, et surtout pas d'état d'erreur.
    if (!compteGrandLivre) {
      setGrandLivre([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setGrandLivre(unwrapRows<LigneGrandLivre>(await comptabiliteService.getGrandLivre(compteGrandLivre, dateDebut, dateFin)));
    } catch (e) {
      setError(e);
      setGrandLivre([]);
    } finally {
      setLoading(false);
    }
  };

  // ===== Saisie d'une pièce comptable =====
  const updateLigne = (idx: number, patch: Partial<PieceLigne>) => {
    setPieceLignes((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const totalDebit = sumCents(pieceLignes.map((l) => l.debit));
  const totalCredit = sumCents(pieceLignes.map((l) => l.credit));
  const ecart = Math.round((totalDebit - totalCredit) * 100) / 100;
  const equilibre = Math.abs(ecart) < 0.005;
  // Chaque ligne porte un compte et exactement un des deux sens (débit XOR crédit).
  const lignesValides = pieceLignes.every((l) => l.compte_numero && num(l.debit) > 0 !== num(l.credit) > 0);
  const canSubmit =
    !!pieceLibelle.trim() && !!pieceDate && pieceLignes.length >= 2 && lignesValides && equilibre && !saving;
  const pieceHint = !pieceLibelle.trim()
    ? 'Saisissez le libellé de l’écriture.'
    : !lignesValides
      ? 'Chaque ligne doit avoir un compte et un montant, au débit ou au crédit.'
      : !equilibre
        ? `L’écriture doit être équilibrée : écart de ${amount(Math.abs(ecart))} FCFA.`
        : null;

  const resetPiece = () => {
    setPieceJournal('OD');
    setPieceDate(todayLocal());
    setPieceLibelle('');
    setPieceLignes(emptyLignes());
  };

  const submitPiece = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await comptabiliteService.enregistrerPiece({
        journal: pieceJournal,
        date_ecriture: pieceDate,
        libelle: pieceLibelle.trim(),
        lignes: pieceLignes.map((l) => ({
          compte_numero: l.compte_numero,
          debit: num(l.debit),
          credit: num(l.credit),
        })),
      });
      const numero = res?.data?.numero_piece ?? res?.numero_piece;
      toast.success(numero ? `Écriture ${numero} enregistrée` : 'Écriture enregistrée');
      setPieceOpen(false);
      resetPiece();
      // La nouvelle pièce doit apparaître tout de suite dans l'onglet consulté.
      void reload();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d’enregistrer l’écriture. Réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  // ===== Exports =====
  const openBlob = (blob: Blob) => {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  };

  const exportBilan = async () => {
    try {
      openBlob(await generalLedgerService.exportBalanceSheetPdf(dateFin));
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible de générer le bilan. Réessayez.'));
    }
  };

  const exportCompteResultat = async () => {
    try {
      openBlob(await generalLedgerService.exportIncomeStatementPdf(dateDebut, dateFin));
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible de générer le compte de résultat. Réessayez.'));
    }
  };

  const exportToPDF = async () => {
    try {
      const blob = await generalLedgerService.exportPdf({
        ...ecrituresFilters(),
        type: activeTab === 'ecritures' ? 'ecritures' : activeTab === 'chart' ? 'chart' : 'balance',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}_${dateDebut}_${dateFin}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Fichier PDF téléchargé');
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d’exporter en PDF. Réessayez.'));
    }
  };

  const exportToCSV = async () => {
    if (activeTab === 'ecritures') {
      // Le tableau ne contient que la page courante : l'export complet (plafonné)
      // vient du point d'export dédié.
      let rows: EcritureComptable[] = ecritures;
      let partial = false;
      try {
        const res = await generalLedgerService.exportAll(ecrituresFilters());
        rows = res.data as EcritureComptable[];
        if (res.truncated) {
          toast.warning('Export limité au nombre maximal de lignes : réduisez la période pour tout exporter.');
        }
      } catch {
        partial = true;
      }
      downloadCsv(
        `ecritures_${dateDebut}_${dateFin}.csv`,
        ['N° pièce', 'Date', 'Journal', 'Compte', 'Libellé', 'Débit', 'Crédit'],
        rows.map((e) => [
          e.numero_piece ?? '',
          formatDateNumeric(e.date_ecriture),
          journalLabel(e.journal),
          `${e.compte_numero} — ${e.compte_intitule}`,
          e.description ?? '',
          num(e.debit).toFixed(0),
          num(e.credit).toFixed(0),
        ])
      );
      if (partial) {
        toast.warning('Export complet impossible : seule la page affichée a été exportée.');
        return;
      }
    } else if (activeTab === 'chart') {
      downloadCsv(
        'plan_comptable.csv',
        ['N°', 'Intitulé', 'Type', 'Catégorie', 'Statut'],
        chartOfAccounts.map((c) => [
          c.numero,
          c.intitule,
          accountTypeLabel(c.type_compte),
          c.categorie || '',
          c.actif ? 'Actif' : 'Inactif',
        ])
      );
    } else if (activeTab === 'trial-balance') {
      downloadCsv(
        `balance_${dateDebut}_${dateFin}.csv`,
        ['N°', 'Compte', 'Total débit', 'Total crédit', 'Solde débiteur', 'Solde créditeur'],
        trialBalance.map((b) => {
          const solde = num(b.solde);
          return [
            b.compte_numero,
            b.compte_intitule,
            num(b.total_debit).toFixed(0),
            num(b.total_credit).toFixed(0),
            solde > 0 ? solde.toFixed(0) : '0',
            solde < 0 ? (-solde).toFixed(0) : '0',
          ];
        })
      );
    } else {
      let solde = 0;
      downloadCsv(
        `grand_livre_${compteGrandLivre}_${dateDebut}_${dateFin}.csv`,
        ['Date', 'N° pièce', 'Libellé', 'Débit', 'Crédit', 'Solde cumulé'],
        grandLivre.map((l) => {
          solde += num(l.debit) - num(l.credit);
          return [
            formatDateNumeric(l.date_ecriture),
            l.numero_piece ?? '',
            l.libelle ?? '',
            num(l.debit).toFixed(0),
            num(l.credit).toFixed(0),
            solde.toFixed(0),
          ];
        })
      );
    }
    toast.success('Fichier CSV téléchargé');
  };

  // ===== Grand-livre : solde cumulé dans l'ordre chronologique renvoyé par le
  // serveur, en centimes (le tableau et les cartes lisent les mêmes lignes). =====
  let soldeCents = 0;
  const grandLivreRows = grandLivre.map((ligne) => {
    soldeCents += Math.round(num(ligne.debit) * 100) - Math.round(num(ligne.credit) * 100);
    return { ligne, solde: soldeCents / 100 };
  });

  // ===== Écritures : lignes regroupées par pièce (page reçue, ordre serveur) =====
  const pieces = groupByPiece(ecritures);

  // ===== Balance : totaux et soldes =====
  const balanceTotals = {
    debit: sumCents(trialBalance.map((b) => b.total_debit)),
    credit: sumCents(trialBalance.map((b) => b.total_credit)),
    soldeDebiteur: sumCents(trialBalance.map((b) => Math.max(0, num(b.solde)))),
    soldeCrediteur: sumCents(trialBalance.map((b) => Math.max(0, -num(b.solde)))),
  };

  const exportMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="touch">
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Exporter
          <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem className="gap-2" onSelect={() => void exportToCSV()}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          Exporter en CSV
        </DropdownMenuItem>
        {activeTab !== 'grand-livre' && (
          <DropdownMenuItem className="gap-2" onSelect={() => void exportToPDF()}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Exporter en PDF
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onSelect={() => void exportBilan()}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          Télécharger le bilan (PDF)
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onSelect={() => void exportCompteResultat()}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          Télécharger le compte de résultat (PDF)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const compteOptions = chartOfAccounts.map((compte) => (
    <SelectItem key={compte.id} value={String(compte.id)}>
      {compte.numero} — {compte.intitule}
    </SelectItem>
  ));

  return (
    <PageShell
      title="Comptabilité"
      description="Écritures, grand-livre, balance et plan comptable (SYSCOHADA)"
      actions={exportMenu}
      primaryAction={
        <Button size="touch" onClick={() => setPieceOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nouvelle écriture
        </Button>
      }
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="ecritures">Écritures</TabsTrigger>
          <TabsTrigger value="grand-livre">Grand-livre</TabsTrigger>
          <TabsTrigger value="trial-balance">Balance</TabsTrigger>
          <TabsTrigger value="chart">Plan comptable</TabsTrigger>
        </TabsList>

        {activeTab !== 'chart' && (
          <Card className="mt-4">
            <CardContent inset="standalone" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gl-debut">Du</Label>
                <DatePicker id="gl-debut" value={dateDebut} onChange={setDateDebut} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gl-fin">Au</Label>
                <DatePicker id="gl-fin" value={dateFin} onChange={setDateFin} />
              </div>
              {activeTab === 'ecritures' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gl-journal">Journal</Label>
                    <Select value={filterJournal || '__all'} onValueChange={(v) => setFilterJournal(v === '__all' ? '' : v)}>
                      <SelectTrigger id="gl-journal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">Tous les journaux</SelectItem>
                        {Object.entries(JOURNALS).map(([code, j]) => (
                          <SelectItem key={code} value={code}>
                            {j.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gl-compte">Compte</Label>
                    <Select value={filterCompte} onValueChange={setFilterCompte}>
                      <SelectTrigger id="gl-compte">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les comptes</SelectItem>
                        {compteOptions}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gl-piece">Numéro de pièce</Label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="gl-piece"
                        type="search"
                        value={pieceSearch}
                        onChange={(event) => setPieceSearch(event.target.value)}
                        placeholder="Ex. : FAC-2026"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gl-libelle">Libellé</Label>
                    <Input
                      id="gl-libelle"
                      type="search"
                      value={libelleSearch}
                      onChange={(event) => setLibelleSearch(event.target.value)}
                      placeholder="Rechercher dans le libellé"
                    />
                  </div>
                </>
              )}
              {activeTab === 'grand-livre' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gl-compte-gl">Compte</Label>
                  <Select value={compteGrandLivre} onValueChange={setCompteGrandLivre}>
                    <SelectTrigger id="gl-compte-gl">
                      <SelectValue placeholder="Choisir un compte…" />
                    </SelectTrigger>
                    <SelectContent>
                      {chartOfAccounts.map((compte) => (
                        <SelectItem key={compte.id} value={compte.numero}>
                          {compte.numero} — {compte.intitule}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Panneau hors de l'ordre de tabulation (APG : il contient des liens et la
            pagination, Tab y entre directement). Focusable, il devenait le « voisin »
            de chaque lien de carte mobile, signalé trop petit par axe (target-size). */}
        <TabsContent value="ecritures" className="mt-4" tabIndex={undefined}>
          <Card className={FLUSH_CARD}>
            <CardHeader className="max-md:px-0">
              <CardTitle>Écritures comptables</CardTitle>
              {!loading && !error && total > 0 && (
                <CardDescription>
                  {formatNumber(total)} {total > 1 ? 'lignes' : 'ligne'} du {formatDate(dateDebut)} au {formatDate(dateFin)}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="max-md:p-0">
              <QueryState
                loading={loading}
                error={error}
                errorTitle="Impossible de charger les écritures"
                isEmpty={ecritures.length === 0}
                onRetry={() => void reload()}
                skeleton={<TableSkeleton rows={8} columns={7} />}
                emptyTitle="Aucune écriture sur la période"
                emptyDescription="Les factures, paiements et dépenses créent leurs écritures automatiquement. Élargissez la période ou saisissez une écriture."
                emptyIcon={FileText}
                emptyAction={
                  <Button variant="outline" onClick={() => setPieceOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Nouvelle écriture
                  </Button>
                }
              >
                <ResponsiveTable
                  table={
                    <Table aria-label="Écritures comptables">
                      <TableHeader>
                        <TableRow>
                          <TableHead>N° pièce</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Journal</TableHead>
                          <TableHead>Compte</TableHead>
                          <TableHead>Libellé</TableHead>
                          <TableHead numeric>Débit</TableHead>
                          <TableHead numeric>Crédit</TableHead>
                        </TableRow>
                      </TableHeader>
                      {/* Un `<tbody>` par pièce : numéro, date et journal s'écrivent une
                          fois (cellules sur toutes les lignes de la pièce), aucun trait
                          entre ses lignes, un seul entre deux pièces, et le survol
                          éclaire la pièce entière. */}
                      {pieces.map((lignes) => {
                        const head = lignes[0];
                        const last = lignes.length - 1;
                        return (
                          <tbody key={head.id} className="border-b last:border-b-0 hover:bg-muted/50">
                            {lignes.map((ecriture, i) => {
                              // Lignes d'une pièce rapprochées ; l'air va entre les pièces.
                              const pad = cn(i === 0 ? 'pt-2.5' : 'pt-1.5', i === last ? 'pb-2.5' : 'pb-1.5');
                              return (
                                <TableRow key={ecriture.id} className="border-b-0 hover:bg-transparent">
                                  {i === 0 && (
                                    <>
                                      <TableCell rowSpan={lignes.length} className="whitespace-nowrap align-top">
                                        <PieceNumero ecriture={head} />
                                      </TableCell>
                                      <TableCell rowSpan={lignes.length} className="whitespace-nowrap align-top">
                                        {formatDate(head.date_ecriture)}
                                      </TableCell>
                                      <TableCell rowSpan={lignes.length} className="align-top">
                                        <Tag hue={JOURNALS[head.journal]?.hue}>{journalLabel(head.journal)}</Tag>
                                      </TableCell>
                                    </>
                                  )}
                                  <TableCell className={cn('align-top', pad)}>
                                    {ecriture.compte_numero || ecriture.compte_intitule ? (
                                      <>
                                        <span className="whitespace-nowrap font-medium">{ecriture.compte_numero}</span>{' '}
                                        <span className="text-muted-foreground">{ecriture.compte_intitule}</span>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell
                                    className={cn('max-w-xs truncate align-top', pad)}
                                    title={ecriture.description ?? undefined}
                                  >
                                    {ecriture.description || '—'}
                                  </TableCell>
                                  <TableCell numeric className={cn('align-top', pad)}>
                                    {amountOrBlank(ecriture.debit)}
                                  </TableCell>
                                  <TableCell numeric className={cn('align-top', pad)}>
                                    {amountOrBlank(ecriture.credit)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </tbody>
                        );
                      })}
                    </Table>
                  }
                  cards={pieces.map((lignes) => {
                    const head = lignes[0];
                    const href = ledgerSourceHref(head);
                    return (
                      <DataCard
                        key={head.id}
                        title={head.numero_piece ? <DocumentCode>{head.numero_piece}</DocumentCode> : 'Pièce sans numéro'}
                        href={href ?? undefined}
                        linkLabel={href ? `Ouvrir la pièce ${head.numero_piece}` : undefined}
                        badge={<Tag hue={JOURNALS[head.journal]?.hue}>{journalLabel(head.journal)}</Tag>}
                      >
                        <DataCardRow label="Date" value={formatDate(head.date_ecriture)} />
                        {/* Une carte par pièce : ses lignes dessous, chacune avec son sens. */}
                        <ul
                          className="mt-2 space-y-2 border-t pt-2"
                          aria-label={head.numero_piece ? `Lignes de la pièce ${head.numero_piece}` : 'Lignes de la pièce'}
                        >
                          {lignes.map((ecriture) => (
                            <PieceLigneItem key={ecriture.id} ecriture={ecriture} />
                          ))}
                        </ul>
                      </DataCard>
                    );
                  })}
                />
                <AmountsCaption />
                {total > 0 && (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    limit={limit}
                    onPageChange={setPage}
                    onLimitChange={(n) => {
                      setLimit(n);
                      setPage(1);
                    }}
                  />
                )}
              </QueryState>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grand-livre" className="mt-4">
          <Card className={FLUSH_CARD}>
            <CardHeader className="max-md:px-0">
              <CardTitle>Grand-livre</CardTitle>
              <CardDescription>Mouvements d’un compte et solde cumulé sur la période</CardDescription>
            </CardHeader>
            <CardContent className="max-md:p-0">
              {!compteGrandLivre ? (
                <p className="text-sm text-muted-foreground">
                  Choisissez un compte ci-dessus pour voir ses mouvements et son solde cumulé sur la période
                </p>
              ) : (
                <QueryState
                  loading={loading}
                  error={error}
                  errorTitle="Impossible de charger le grand-livre"
                  isEmpty={grandLivre.length === 0}
                  onRetry={() => void reload()}
                  skeleton={<TableSkeleton rows={8} columns={6} />}
                  emptyTitle="Aucun mouvement sur ce compte"
                  emptyDescription="Aucune écriture ne touche ce compte sur la période choisie"
                  emptyIcon={Search}
                >
                  <ResponsiveTable
                    table={
                      <Table aria-label={`Grand-livre du compte ${compteGrandLivre}`}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>N° pièce</TableHead>
                            <TableHead>Libellé</TableHead>
                            <TableHead numeric>Débit</TableHead>
                            <TableHead numeric>Crédit</TableHead>
                            <TableHead numeric>Solde cumulé</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grandLivreRows.map(({ ligne, solde }) => (
                            <TableRow key={ligne.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(ligne.date_ecriture)}</TableCell>
                              <TableCell>
                                {ligne.numero_piece ? <DocumentCode>{ligne.numero_piece}</DocumentCode> : '—'}
                              </TableCell>
                              <TableCell>{ligne.libelle || '—'}</TableCell>
                              <TableCell numeric>{amountOrBlank(ligne.debit)}</TableCell>
                              <TableCell numeric>{amountOrBlank(ligne.credit)}</TableCell>
                              <TableCell numeric className="font-medium">
                                {amount(Math.abs(solde))}{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {solde > 0 ? 'D' : solde < 0 ? 'C' : ''}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    }
                    cards={grandLivreRows.map(({ ligne, solde }) => (
                      <DataCard
                        key={ligne.id}
                        title={ligne.numero_piece ? <DocumentCode>{ligne.numero_piece}</DocumentCode> : 'Pièce sans numéro'}
                      >
                        <DataCardRow label="Date" value={formatDate(ligne.date_ecriture)} />
                        <DataCardRow label="Libellé" value={ligne.libelle ? wrapText(ligne.libelle) : '—'} />
                        <DataCardRow label="Débit" value={<LedgerAmount value={ligne.debit} />} numeric />
                        <DataCardRow label="Crédit" value={<LedgerAmount value={ligne.credit} />} numeric />
                        <DataCardRow label="Solde cumulé" value={<SoldeAmount value={solde} medium />} numeric />
                      </DataCard>
                    ))}
                  />
                  <AmountsCaption> · D : solde débiteur · C : solde créditeur</AmountsCaption>
                </QueryState>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart" className="mt-4">
          <Card className={FLUSH_CARD}>
            <CardHeader className="max-md:px-0">
              <CardTitle>Plan comptable</CardTitle>
            </CardHeader>
            <CardContent className="max-md:p-0">
              <QueryState
                loading={loading}
                error={error}
                errorTitle="Impossible de charger le plan comptable"
                isEmpty={chartOfAccounts.length === 0}
                onRetry={() => void reload()}
                skeleton={<TableSkeleton rows={8} columns={5} />}
                emptyTitle="Aucun compte dans le plan comptable"
                emptyDescription="Le plan comptable n’est pas installé. Contactez votre administrateur."
                emptyIcon={FileText}
              >
                <ResponsiveTable
                  table={
                    <Table aria-label="Plan comptable">
                      <TableHeader>
                        <TableRow>
                          <TableHead>N°</TableHead>
                          <TableHead>Intitulé</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Catégorie</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chartOfAccounts.map((compte) => (
                          <TableRow key={compte.id}>
                            <TableCell className="whitespace-nowrap font-medium">{compte.numero}</TableCell>
                            <TableCell>{compte.intitule}</TableCell>
                            <TableCell>
                              <Tag hue={ACCOUNT_TYPES[compte.type_compte]?.hue}>{accountTypeLabel(compte.type_compte)}</Tag>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{compte.categorie || '—'}</TableCell>
                            {/* Pastille pour l'exception seulement : un compte actif est l'état normal. */}
                            <TableCell>{!compte.actif && <StatusBadge type="compte" statut="inactif" />}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  }
                  cards={chartOfAccounts.map((compte) => (
                    <DataCard
                      key={compte.id}
                      title={`${compte.numero} — ${compte.intitule}`}
                      badge={compte.actif ? undefined : <StatusBadge type="compte" statut="inactif" />}
                    >
                      <DataCardRow
                        label="Type"
                        value={<Tag hue={ACCOUNT_TYPES[compte.type_compte]?.hue}>{accountTypeLabel(compte.type_compte)}</Tag>}
                      />
                      <DataCardRow label="Catégorie" value={compte.categorie || '—'} />
                    </DataCard>
                  ))}
                />
              </QueryState>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial-balance" className="mt-4">
          <Card className={FLUSH_CARD}>
            <CardHeader className="max-md:px-0">
              <CardTitle>Balance des comptes</CardTitle>
              <CardDescription>
                Totaux et soldes de chaque compte du {formatDate(dateDebut)} au {formatDate(dateFin)}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-md:p-0">
              <QueryState
                loading={loading}
                error={error}
                errorTitle="Impossible de charger la balance"
                isEmpty={trialBalance.length === 0}
                onRetry={() => void reload()}
                skeleton={<TableSkeleton rows={8} columns={6} />}
                emptyTitle="Aucun mouvement sur la période"
                emptyDescription="Élargissez la période pour voir les soldes des comptes"
                emptyIcon={FileText}
              >
                <ResponsiveTable
                  table={
                    <Table aria-label="Balance des comptes">
                      <TableHeader>
                        <TableRow>
                          <TableHead>N°</TableHead>
                          <TableHead>Compte</TableHead>
                          <TableHead numeric>Total débit</TableHead>
                          <TableHead numeric>Total crédit</TableHead>
                          <TableHead numeric>Solde débiteur</TableHead>
                          <TableHead numeric>Solde créditeur</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trialBalance.map((balance) => {
                          const solde = num(balance.solde);
                          return (
                            <TableRow key={balance.compte_id}>
                              <TableCell className="whitespace-nowrap font-medium">{balance.compte_numero}</TableCell>
                              <TableCell>{balance.compte_intitule}</TableCell>
                              <TableCell numeric>{amount(balance.total_debit)}</TableCell>
                              <TableCell numeric>{amount(balance.total_credit)}</TableCell>
                              <TableCell numeric className="font-medium">{solde > 0 ? amount(solde) : ''}</TableCell>
                              <TableCell numeric className="font-medium">{solde < 0 ? amount(-solde) : ''}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={2} className="font-medium">
                            Total
                          </TableCell>
                          <TableCell numeric className="font-medium">
                            {amount(balanceTotals.debit)}
                          </TableCell>
                          <TableCell numeric className="font-medium">
                            {amount(balanceTotals.credit)}
                          </TableCell>
                          <TableCell numeric className="font-medium">
                            {amount(balanceTotals.soldeDebiteur)}
                          </TableCell>
                          <TableCell numeric className="font-medium">
                            {amount(balanceTotals.soldeCrediteur)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  }
                  cards={
                    <>
                      {trialBalance.map((balance) => (
                        <DataCard key={balance.compte_id} title={`${balance.compte_numero} — ${balance.compte_intitule}`}>
                          <DataCardRow label="Débit" value={<Money value={num(balance.total_debit)} />} numeric />
                          <DataCardRow label="Crédit" value={<Money value={num(balance.total_credit)} />} numeric />
                          <DataCardRow label="Solde" value={<SoldeAmount value={num(balance.solde)} medium />} numeric />
                        </DataCard>
                      ))}
                      {/* Totaux au poids 500, comme le pied du tableau. */}
                      <DataCard title="Total de la balance" className="bg-muted/40">
                        <DataCardRow label="Débit" value={<Money value={balanceTotals.debit} className="font-medium" />} numeric />
                        <DataCardRow label="Crédit" value={<Money value={balanceTotals.credit} className="font-medium" />} numeric />
                        <DataCardRow
                          label="Soldes débiteurs"
                          value={<Money value={balanceTotals.soldeDebiteur} className="font-medium" />}
                          numeric
                        />
                        <DataCardRow
                          label="Soldes créditeurs"
                          value={<Money value={balanceTotals.soldeCrediteur} className="font-medium" />}
                          numeric
                        />
                      </DataCard>
                    </>
                  }
                />
                <AmountsCaption />
              </QueryState>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Saisie d'une pièce comptable — le seul chemin d'écriture manuelle. */}
      <Dialog open={pieceOpen} onOpenChange={(o) => !saving && setPieceOpen(o)}>
        <DialogContent className="sm:max-w-2xl">
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitPiece();
            }}
          >
            <DialogHeader>
              <DialogTitle>Nouvelle écriture comptable</DialogTitle>
              <DialogDescription>
                Une écriture équilibrée : le total des débits doit égaler le total des crédits.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="piece-journal">Journal</Label>
                  <Select value={pieceJournal} onValueChange={setPieceJournal}>
                    <SelectTrigger id="piece-journal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VENTES">Ventes</SelectItem>
                      <SelectItem value="ACHATS">Achats</SelectItem>
                      <SelectItem value="TRESORERIE">Trésorerie et caisse</SelectItem>
                      <SelectItem value="OD">Opérations diverses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="piece-date">Date</Label>
                  <DatePicker id="piece-date" value={pieceDate} onChange={setPieceDate} required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="piece-libelle">Libellé</Label>
                <Input
                  id="piece-libelle"
                  value={pieceLibelle}
                  maxLength={500}
                  placeholder="Libellé de l’écriture"
                  onChange={(e) => setPieceLibelle(e.target.value)}
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="sr-only">Lignes de l’écriture</legend>
                <div className="flex items-center justify-between gap-2">
                  <p aria-hidden="true" className="text-sm font-medium">
                    Lignes
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPieceLignes((ls) => [...ls, { compte_numero: '', debit: '', credit: '' }])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Ajouter une ligne
                  </Button>
                </div>
                <div
                  aria-hidden="true"
                  className="hidden grid-cols-[1fr_9rem_9rem_2.25rem] gap-2 px-0.5 text-xs text-muted-foreground sm:grid"
                >
                  <span>Compte</span>
                  <span>Débit</span>
                  <span>Crédit</span>
                  <span />
                </div>
                {pieceLignes.map((l, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 items-center gap-2 rounded-md border p-2 sm:grid-cols-[1fr_9rem_9rem_2.25rem] sm:border-0 sm:p-0"
                  >
                    <div className="col-span-2 sm:col-span-1">
                      <Select value={l.compte_numero} onValueChange={(v) => updateLigne(i, { compte_numero: v })}>
                        <SelectTrigger aria-label={`Compte, ligne ${i + 1}`}>
                          <SelectValue placeholder="Compte…" />
                        </SelectTrigger>
                        <SelectContent>
                          {chartOfAccounts.map((c) => (
                            <SelectItem key={c.id} value={c.numero}>
                              {c.numero} — {c.intitule}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <MoneyInput
                      value={l.debit}
                      onChange={(raw) => updateLigne(i, { debit: raw })}
                      aria-label={`Débit, ligne ${i + 1}`}
                      placeholder="Débit"
                    />
                    <MoneyInput
                      value={l.credit}
                      onChange={(raw) => updateLigne(i, { credit: raw })}
                      aria-label={`Crédit, ligne ${i + 1}`}
                      placeholder="Crédit"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="col-span-2 justify-self-end text-muted-foreground hover:bg-danger-50 hover:text-danger-700 sm:col-span-1"
                      aria-label={`Supprimer la ligne ${i + 1}`}
                      disabled={pieceLignes.length <= 2}
                      onClick={() => setPieceLignes((ls) => ls.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </fieldset>

              <dl className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Total débit</dt>
                  <dd className="tabular-nums">{amount(totalDebit)} FCFA</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Total crédit</dt>
                  <dd className="tabular-nums">{amount(totalCredit)} FCFA</dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
                  <dt>Écart</dt>
                  <dd className={equilibre ? 'tabular-nums' : 'tabular-nums text-danger-700'}>{amount(ecart)} FCFA</dd>
                </div>
              </dl>
              {pieceHint && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {pieceHint}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPieceOpen(false)} disabled={saving}>
                Annuler
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving && <Spinner className="mr-2" />}
                Enregistrer l’écriture
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
