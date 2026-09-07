import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, FileDown, FileText, Plus, Search, Trash2 } from 'lucide-react';
import { comptabiliteService, generalLedgerService } from '../services/api';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MoneyInput } from '@/components/ui/money-input';
import { Spinner } from '@/components/ui/loading';
import { downloadCsv } from '../utils/csv';
import { Input } from '@/components/ui/input';
import { ledgerSourceHref } from '@/utils/ledger';
import { getErrorMessage } from '@/utils/errors';

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

const SELECT_CLS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const BADGE_BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

const JOURNAL_BADGE: Record<string, string> = {
  ACHATS: 'bg-danger-100 text-danger-700',
  VENTES: 'bg-success-100 text-success-700',
  TRESORERIE: 'bg-info-100 text-info-700',
  OD: 'bg-warning-100 text-warning-800',
};

const TYPE_BADGE: Record<string, string> = {
  actif: 'bg-info-100 text-info-700',
  passif: 'bg-warning-100 text-warning-800',
  capitaux_propres: 'bg-success-100 text-success-700',
  charge: 'bg-danger-100 text-danger-700',
  produit: 'bg-primary-100 text-primary-700',
};

const TYPE_LABELS: Record<string, string> = {
  actif: 'Actif',
  passif: 'Passif',
  capitaux_propres: 'Capitaux propres',
  charge: 'Charge',
  produit: 'Produit',
};

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

const formatNum = (s: string | number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(parseFloat(String(s)) || 0));

const TABLE_HEAD = 'px-3 py-2 font-medium';
const NUM_CELL = 'px-3 py-2 text-right num';

/** Date du jour en LOCAL (YYYY-MM-DD) — toISOString() décalerait vers UTC. */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyLignes = (): PieceLigne[] => [
  { compte_numero: '', debit: '', credit: '' },
  { compte_numero: '', debit: '', credit: '' },
];

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
  const [descriptionSearch, setDescriptionSearch] = useState('');
  const [debouncedPieceSearch, setDebouncedPieceSearch] = useState('');
  const [debouncedDescriptionSearch, setDebouncedDescriptionSearch] = useState('');
  const [dateDebut, setDateDebut] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState<string>(new Date().toISOString().split('T')[0]);

  // Server-side pagination for the écritures tab (a full year of journal
  // lines was previously fetched capped at 50 with no way to page through).
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
      setDebouncedDescriptionSearch(descriptionSearch.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [pieceSearch, descriptionSearch]);

  useEffect(() => {
    generalLedgerService.getChartOfAccounts()
      .then((data) => setChartOfAccounts(data.data || data))
      .catch(() => setChartOfAccounts([]));
  }, []);

  // Reset to page 1 when the écritures filters change
  useEffect(() => {
    setPage(1);
  }, [
    filterJournal,
    filterCompte,
    debouncedPieceSearch,
    debouncedDescriptionSearch,
    dateDebut,
    dateFin,
  ]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    filterJournal,
    filterCompte,
    debouncedPieceSearch,
    debouncedDescriptionSearch,
    dateDebut,
    dateFin,
    page,
    limit,
    compteGrandLivre,
  ]);

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
      const data = await generalLedgerService.getAll({
        journal: filterJournal || undefined,
        date_debut: dateDebut,
        date_fin: dateFin,
        compte_id: filterCompte === 'all' ? undefined : Number(filterCompte),
        numero_piece: debouncedPieceSearch || undefined,
        description: debouncedDescriptionSearch || undefined,
        page,
        limit,
      });
      setEcritures(data.data || data);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 0);
    } catch (e) {
      setError(e);
      setEcritures([]);
      setTotal(0);
      setTotalPages(0);
      toast.error(getErrorMessage(e, 'Erreur chargement écritures'));
    } finally {
      setLoading(false);
    }
  };

  const fetchChartOfAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generalLedgerService.getChartOfAccounts();
      setChartOfAccounts(data.data || data);
    } catch (e) {
      setError(e);
      setChartOfAccounts([]);
      toast.error(getErrorMessage(e, 'Erreur chargement plan comptable'));
    } finally {
      setLoading(false);
    }
  };

  const fetchTrialBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generalLedgerService.getTrialBalance(dateDebut, dateFin);
      setTrialBalance(data.data || data);
    } catch (e) {
      setError(e);
      setTrialBalance([]);
      toast.error(getErrorMessage(e, 'Erreur chargement balance comptable'));
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
      const data = await comptabiliteService.getGrandLivre(compteGrandLivre, dateDebut, dateFin);
      setGrandLivre(data || []);
    } catch (e) {
      setError(e);
      setGrandLivre([]);
      toast.error(getErrorMessage(e, 'Erreur chargement grand-livre'));
    } finally {
      setLoading(false);
    }
  };

  // ===== Saisie d'une pièce comptable =====
  const updateLigne = (idx: number, patch: Partial<PieceLigne>) => {
    setPieceLignes((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const totalDebit = pieceLignes.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = pieceLignes.reduce((s, l) => s + num(l.credit), 0);
  const ecart = totalDebit - totalCredit;
  const equilibre = Math.abs(ecart) < 0.005;
  // Chaque ligne porte un compte et exactement un des deux sens (débit XOR crédit).
  const lignesValides = pieceLignes.every(
    (l) => l.compte_numero && num(l.debit) > 0 !== num(l.credit) > 0
  );
  const canSubmit =
    !!pieceLibelle.trim() && !!pieceDate && pieceLignes.length >= 2 && lignesValides && equilibre && !saving;

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
      const numero = res?.data?.numero_piece;
      toast.success(numero ? `Écriture ${numero} enregistrée` : 'Écriture enregistrée');
      setPieceOpen(false);
      resetPiece();
      // La nouvelle pièce doit apparaître tout de suite dans l'onglet consulté.
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erreur lors de l'enregistrement de l'écriture"));
    } finally {
      setSaving(false);
    }
  };

  const openBlob = (blob: Blob) => {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  };

  const exportBilan = async () => {
    try {
      openBlob(await generalLedgerService.exportBalanceSheetPdf(dateFin));
    } catch (e) {
      toast.error(getErrorMessage(e, 'Erreur lors de la génération du bilan'));
    }
  };

  const exportCompteResultat = async () => {
    try {
      openBlob(await generalLedgerService.exportIncomeStatementPdf(dateDebut, dateFin));
    } catch (e) {
      toast.error(getErrorMessage(e, 'Erreur lors de la génération du compte de résultat'));
    }
  };

  const exportToPDF = async () => {
    try {
      const blob = await generalLedgerService.exportPdf({
        journal: filterJournal || undefined,
        date_debut: dateDebut,
        date_fin: dateFin,
        compte_id: filterCompte === 'all' ? undefined : Number(filterCompte),
        numero_piece: debouncedPieceSearch || undefined,
        description: debouncedDescriptionSearch || undefined,
        type: activeTab === 'ecritures' ? 'ecritures' : activeTab === 'chart' ? 'chart' : 'balance',
      });
      // Le grand-livre n'a pas de gabarit PDF côté serveur : le bouton est masqué
      // sur cet onglet, cette garde couvre un appel qui passerait quand même.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}_${dateDebut}_${dateFin}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export PDF réussi');
    } catch (e) {
      toast.error(getErrorMessage(e, "Erreur lors de l'export PDF"));
    }
  };

  const exportToCSV = async () => {
    let exportFailed = false;
    if (activeTab === 'ecritures') {
      // Pull the full (capped) set from the dedicated export endpoint — the
      // table only holds the current page now that écritures are paginated.
      let allEcritures: EcritureComptable[] = ecritures;
      try {
        const res = await generalLedgerService.exportAll({
          journal: filterJournal || undefined,
          date_debut: dateDebut,
          date_fin: dateFin,
          compte_id: filterCompte === 'all' ? undefined : Number(filterCompte),
          numero_piece: debouncedPieceSearch || undefined,
          description: debouncedDescriptionSearch || undefined,
        });
        allEcritures = res.data || res || ecritures;
        if (res.truncated) {
          toast.warning('Export limité au plafond de lignes — affinez la période.');
        }
      } catch (err) {
        toast.error(getErrorMessage(err, 'Export CSV incomplet — export de la page courante.'));
        exportFailed = true;
      }
      const headers = ['N° pièce', 'Date', 'Journal', 'Compte', 'Description', 'Débit', 'Crédit'];
      const rows = allEcritures.map((e) => [
        e.numero_piece,
        new Date(e.date_ecriture).toLocaleDateString('fr-FR'),
        e.journal,
        `${e.compte_numero} — ${e.compte_intitule}`,
        e.description,
        parseFloat(e.debit).toFixed(0),
        parseFloat(e.credit).toFixed(0),
      ]);
      downloadCsv(`ecritures_${dateDebut}_${dateFin}.csv`, headers, rows);
    } else if (activeTab === 'chart') {
      const headers = ['N°', 'Intitulé', 'Type', 'Catégorie', 'Statut'];
      const rows = chartOfAccounts.map((c) => [
        c.numero,
        c.intitule,
        TYPE_LABELS[c.type_compte] || c.type_compte,
        c.categorie || '',
        c.actif ? 'Actif' : 'Inactif',
      ]);
      downloadCsv('plan_comptable.csv', headers, rows);
    } else if (activeTab === 'trial-balance') {
      const headers = ['N°', 'Compte', 'Total débit', 'Total crédit', 'Solde'];
      const rows = trialBalance.map((b) => [
        b.compte_numero,
        b.compte_intitule,
        parseFloat(b.total_debit).toFixed(0),
        parseFloat(b.total_credit).toFixed(0),
        parseFloat(b.solde).toFixed(0),
      ]);
      downloadCsv(`balance_${dateDebut}_${dateFin}.csv`, headers, rows);
    } else if (activeTab === 'grand-livre') {
      const headers = ['Date', 'N° pièce', 'Libellé', 'Débit', 'Crédit', 'Solde cumulé'];
      let solde = 0;
      const rows = grandLivre.map((l) => {
        solde += (parseFloat(l.debit) || 0) - (parseFloat(l.credit) || 0);
        return [
          new Date(l.date_ecriture).toLocaleDateString('fr-FR'),
          l.numero_piece ?? '',
          l.libelle ?? '',
          (parseFloat(l.debit) || 0).toFixed(0),
          (parseFloat(l.credit) || 0).toFixed(0),
          solde.toFixed(0),
        ];
      });
      downloadCsv(`grand_livre_${compteGrandLivre}_${dateDebut}_${dateFin}.csv`, headers, rows);
    }
    if (!exportFailed) toast.success('Export CSV réussi');
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comptabilité</h1>
          <p className="text-sm text-muted-foreground">OHADA / SYSCOHADA</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBilan} className="gap-2">
            <FileDown className="h-4 w-4" />
            Bilan PDF
          </Button>
          <Button variant="outline" onClick={exportCompteResultat} className="gap-2">
            <FileDown className="h-4 w-4" />
            Compte de résultat PDF
          </Button>
          {activeTab !== 'grand-livre' && (
            <Button variant="outline" onClick={exportToPDF} className="gap-2">
              <FileText className="h-4 w-4" />
              Exporter en PDF
            </Button>
          )}
          <Button variant="outline" onClick={exportToCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exporter en CSV
          </Button>
          <Button onClick={() => setPieceOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouvelle écriture
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
      <TabsList className="mb-6">
        {[
          { id: 'ecritures', label: 'Écritures' },
          { id: 'grand-livre', label: 'Grand-livre' },
          { id: 'trial-balance', label: 'Balance' },
          { id: 'chart', label: 'Plan comptable' },
        ].map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="rounded-md border bg-card shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="gl-debut">Date début</Label>
            <DatePicker id="gl-debut" value={dateDebut} onChange={setDateDebut} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gl-fin">Date fin</Label>
            <DatePicker id="gl-fin" value={dateFin} onChange={setDateFin} />
          </div>
          {activeTab === 'ecritures' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="gl-journal">Journal</Label>
                <Select value={filterJournal || '__all'} onValueChange={(v) => setFilterJournal(v === '__all' ? '' : v)}>
                  <SelectTrigger id="gl-journal" className={SELECT_CLS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Tous les journaux</SelectItem>
                    <SelectItem value="ACHATS">Achats</SelectItem>
                    <SelectItem value="VENTES">Ventes</SelectItem>
                    <SelectItem value="TRESORERIE">Trésorerie</SelectItem>
                    <SelectItem value="OD">Opérations diverses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gl-compte">Compte</Label>
                <Select value={filterCompte} onValueChange={setFilterCompte}>
                  <SelectTrigger id="gl-compte">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les comptes</SelectItem>
                    {chartOfAccounts.map((compte) => (
                      <SelectItem key={compte.id} value={String(compte.id)}>
                        {compte.numero} — {compte.intitule}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gl-piece">Numéro de pièce</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="gl-piece"
                    value={pieceSearch}
                    onChange={(event) => setPieceSearch(event.target.value)}
                    placeholder="Ex. FAC-2026"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gl-description">Description</Label>
                <Input
                  id="gl-description"
                  value={descriptionSearch}
                  onChange={(event) => setDescriptionSearch(event.target.value)}
                  placeholder="Rechercher dans le libellé"
                />
              </div>
            </>
          )}
          {activeTab === 'grand-livre' && (
            <div className="space-y-1.5">
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
        </div>
      </div>

      <TabsContent value="ecritures">
        <div className="rounded-md border bg-card shadow-sm">
          <div className="p-5">
            <h2 className="text-lg font-semibold mb-3">Écritures comptables</h2>
            <QueryState
              loading={loading}
              error={error}
              isEmpty={ecritures.length === 0}
              onRetry={reload}
              skeleton={<TableSkeleton rows={8} columns={7} />}
              emptyTitle="Aucune écriture"
              emptyDescription="Aucune écriture pour la période sélectionnée."
              emptyIcon={FileText}
            >
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className={TABLE_HEAD}>N° pièce</th>
                      <th className={TABLE_HEAD}>Date</th>
                      <th className={TABLE_HEAD}>Journal</th>
                      <th className={TABLE_HEAD}>Compte</th>
                      <th className={TABLE_HEAD}>Description</th>
                      <th className={TABLE_HEAD + ' text-right'}>Débit (FCFA)</th>
                      <th className={TABLE_HEAD + ' text-right'}>Crédit (FCFA)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ecritures.map((ecriture) => (
                      <tr key={ecriture.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium text-xs num">
                          {ledgerSourceHref(ecriture) ? (
                            <Link
                              to={ledgerSourceHref(ecriture)!}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                              aria-label={`Ouvrir la pièce ${ecriture.numero_piece}`}
                            >
                              {ecriture.numero_piece}
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Link>
                          ) : (
                            ecriture.numero_piece
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs num">{new Date(ecriture.date_ecriture).toLocaleDateString('fr-FR')}</td>
                        <td className="px-3 py-2">
                          <span className={`${BADGE_BASE} ${JOURNAL_BADGE[ecriture.journal] || 'bg-muted text-muted-foreground'}`}>
                            {ecriture.journal}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{ecriture.compte_numero} — {ecriture.compte_intitule}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{ecriture.description || '—'}</td>
                        <td className={NUM_CELL + ' font-medium'}>{formatNum(ecriture.debit)}</td>
                        <td className={NUM_CELL + ' font-medium'}>{formatNum(ecriture.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  limit={limit}
                  onPageChange={setPage}
                  onLimitChange={(n) => { setLimit(n); setPage(1); }}
                />
              )}
            </QueryState>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="grand-livre">
        <div className="rounded-md border bg-card shadow-sm">
          <div className="p-5">
            <h2 className="text-lg font-semibold mb-3">Grand-livre</h2>
            {!compteGrandLivre ? (
              <p className="text-sm text-muted-foreground">
                Choisissez un compte ci-dessus pour voir ses mouvements et son solde cumulé sur la période.
              </p>
            ) : (
              <QueryState
                loading={loading}
                error={error}
                isEmpty={grandLivre.length === 0}
                onRetry={reload}
                skeleton={<TableSkeleton rows={8} columns={6} />}
                emptyTitle="Aucun mouvement"
                emptyDescription="Aucun mouvement sur ce compte pour la période sélectionnée."
                emptyIcon={Search}
              >
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className={TABLE_HEAD}>Date</th>
                        <th className={TABLE_HEAD}>N° pièce</th>
                        <th className={TABLE_HEAD}>Libellé</th>
                        <th className={TABLE_HEAD + ' text-right'}>Débit (FCFA)</th>
                        <th className={TABLE_HEAD + ' text-right'}>Crédit (FCFA)</th>
                        <th className={TABLE_HEAD + ' text-right'}>Solde cumulé</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        // Le solde cumulé se calcule en parcourant les lignes dans
                        // l'ordre chronologique renvoyé par le serveur.
                        let solde = 0;
                        return grandLivre.map((ligne) => {
                          solde += (parseFloat(ligne.debit) || 0) - (parseFloat(ligne.credit) || 0);
                          return (
                            <tr key={ligne.id} className="hover:bg-muted/30">
                              <td className="px-3 py-2 text-xs num">
                                {new Date(ligne.date_ecriture).toLocaleDateString('fr-FR')}
                              </td>
                              <td className="px-3 py-2 font-medium text-xs num">{ligne.numero_piece || '—'}</td>
                              <td className="px-3 py-2 text-xs">{ligne.libelle || '—'}</td>
                              <td className={NUM_CELL}>{parseFloat(ligne.debit) > 0 ? formatNum(ligne.debit) : ''}</td>
                              <td className={NUM_CELL}>{parseFloat(ligne.credit) > 0 ? formatNum(ligne.credit) : ''}</td>
                              <td className={NUM_CELL + ' font-semibold'}>{formatNum(solde)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </QueryState>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="chart">
        <div className="rounded-md border bg-card shadow-sm">
          <div className="p-5">
            <h2 className="text-lg font-semibold mb-3">Plan comptable</h2>
            <QueryState
              loading={loading}
              error={error}
              isEmpty={chartOfAccounts.length === 0}
              onRetry={reload}
              skeleton={<TableSkeleton rows={8} columns={5} />}
              emptyTitle="Plan comptable vide"
              emptyDescription="Aucun compte défini."
              emptyIcon={FileText}
            >
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className={TABLE_HEAD}>N°</th>
                    <th className={TABLE_HEAD}>Intitulé</th>
                    <th className={TABLE_HEAD}>Type</th>
                    <th className={TABLE_HEAD}>Catégorie</th>
                    <th className={TABLE_HEAD}>Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {chartOfAccounts.map((compte) => (
                    <tr key={compte.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium num">{compte.numero}</td>
                      <td className="px-3 py-2">{compte.intitule}</td>
                      <td className="px-3 py-2">
                        <span className={`${BADGE_BASE} ${TYPE_BADGE[compte.type_compte] || 'bg-muted text-muted-foreground'}`}>
                          {TYPE_LABELS[compte.type_compte] || compte.type_compte}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{compte.categorie || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`${BADGE_BASE} ${
                          compte.actif ? 'bg-success-100 text-success-700' : 'bg-muted text-muted-foreground'
                        }`}>
                          {compte.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </QueryState>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="trial-balance">
        <div className="rounded-md border bg-card shadow-sm">
          <div className="p-5">
            <h2 className="text-lg font-semibold mb-3">Balance comptable</h2>
            <QueryState
              loading={loading}
              error={error}
              isEmpty={trialBalance.length === 0}
              onRetry={reload}
              skeleton={<TableSkeleton rows={8} columns={5} />}
              emptyTitle="Aucun mouvement comptable"
              emptyDescription="Aucune écriture sur la période sélectionnée."
              emptyIcon={FileText}
            >
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className={TABLE_HEAD}>N°</th>
                      <th className={TABLE_HEAD}>Compte</th>
                      <th className={TABLE_HEAD + ' text-right'}>Total débit</th>
                      <th className={TABLE_HEAD + ' text-right'}>Total crédit</th>
                      <th className={TABLE_HEAD + ' text-right'}>Solde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {trialBalance.map((balance) => (
                      <tr key={balance.compte_id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium num">{balance.compte_numero}</td>
                        <td className="px-3 py-2">{balance.compte_intitule}</td>
                        <td className={NUM_CELL + ' font-medium'}>{formatNum(balance.total_debit)}</td>
                        <td className={NUM_CELL + ' font-medium'}>{formatNum(balance.total_credit)}</td>
                        <td className={`${NUM_CELL} font-semibold ${
                          parseFloat(balance.solde) >= 0 ? 'text-success-700' : 'text-danger-700'
                        }`}>
                          {formatNum(balance.solde)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QueryState>
          </div>
        </div>
      </TabsContent>
      </Tabs>

      {/* Saisie d'une pièce comptable — le seul chemin d'écriture manuelle. */}
      <Dialog open={pieceOpen} onOpenChange={(o) => { if (!saving) setPieceOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle écriture comptable</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="piece-journal">Journal</Label>
                <Select value={pieceJournal} onValueChange={setPieceJournal}>
                  <SelectTrigger id="piece-journal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENTES">VENTES — Ventes</SelectItem>
                    <SelectItem value="ACHATS">ACHATS — Achats</SelectItem>
                    <SelectItem value="TRESORERIE">TRESORERIE — Trésorerie / Caisse</SelectItem>
                    <SelectItem value="OD">OD — Opérations diverses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="piece-date">Date</Label>
                <DatePicker id="piece-date" value={pieceDate} onChange={setPieceDate} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="piece-libelle">Libellé</Label>
              <Input
                id="piece-libelle"
                value={pieceLibelle}
                maxLength={500}
                placeholder="Libellé de l'écriture"
                onChange={(e) => setPieceLibelle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Lignes</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setPieceLignes((ls) => [...ls, { compte_numero: '', debit: '', credit: '' }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                </Button>
              </div>
              <div className="hidden sm:grid grid-cols-[1fr_9rem_9rem_2rem] gap-2 px-0.5 text-xs text-muted-foreground">
                <span>Compte</span><span>Débit</span><span>Crédit</span><span />
              </div>
              {pieceLignes.map((l, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_9rem_2rem] gap-2 items-center">
                  <Select value={l.compte_numero} onValueChange={(v) => updateLigne(i, { compte_numero: v })}>
                    <SelectTrigger aria-label={`Compte ligne ${i + 1}`}>
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
                  <MoneyInput value={l.debit} onChange={(raw) => updateLigne(i, { debit: raw })} aria-label={`Débit ligne ${i + 1}`} />
                  <MoneyInput value={l.credit} onChange={(raw) => updateLigne(i, { credit: raw })} aria-label={`Crédit ligne ${i + 1}`} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 justify-self-end sm:justify-self-auto text-muted-foreground"
                    aria-label={`Supprimer la ligne ${i + 1}`}
                    disabled={pieceLignes.length <= 2}
                    onClick={() => setPieceLignes((ls) => ls.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total débit</span>
                <span className="num">{formatNum(totalDebit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total crédit</span>
                <span className="num">{formatNum(totalCredit)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Écart</span>
                <span className={`num ${equilibre ? '' : 'text-danger-700'}`}>{formatNum(ecart)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPieceOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={submitPiece} disabled={!canSubmit} className="gap-1">
              {saving && <Spinner />} Enregistrer l'écriture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
