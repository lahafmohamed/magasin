import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FileMinus, Plus, Undo2, X } from 'lucide-react';
import { creditNoteService, factureService, retourService } from '@/services/api';
import type { FactureComplete } from '@/types';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { DocumentPicker, type DocumentOption } from '@/components/DocumentPicker';
import StatusBadge, { getStatusOptions } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleChip } from '@/components/ui/choice-chips';
import { DocumentCode } from '@/components/ui/document-code';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { PageShell } from '@/components/ui/page-shell';
import { QueryState } from '@/components/ui/query-state';
import { Pagination } from '@/components/ui/pagination';
import { ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { Money } from '@/components/ui/money';
import { RequiredMark } from '@/components/ui/required-mark';
import { LoadingState, Spinner } from '@/components/ui/loading';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { useSearchParamsPatch } from '@/hooks/useUrlState';

interface Retour {
  id: number;
  numero_retour: string;
  tiers_id?: number | null;
  client_nom: string | null;
  total_remboursement: string | number;
  statut: string;
  notes: string | null;
  created_at: string;
  cree_par_username?: string | null;
  /** Avoir actif émis pour ce retour (U-08). */
  avoir_id?: number | null;
  numero_avoir?: string | null;
}

interface RetourLigne {
  id: number;
  produit_nom: string | null;
  produit_reference: string | null;
  numero_facture: string | null;
  quantite: number;
  prix_unitaire: string | number;
  total_ligne: string | number;
  raison: string | null;
}

interface RetourStats {
  total_retours: string | number;
  en_attente: string | number;
  traites: string | number;
  annules: string | number;
  /** Retours approuvés uniquement. */
  montant_total_rembourse: string | number;
  /** Retours en attente de décision. */
  montant_en_attente?: string | number;
}

/** Motifs courants en magasin informatique ; « Autre » ouvre une saisie libre. */
const RAISONS = [
  'Produit défectueux',
  'Ne correspond pas à la commande',
  'Erreur de référence',
  'Le client a changé d’avis',
  'Autre',
] as const;

interface LigneRetour {
  selected: boolean;
  quantite: number;
  raison: string;
  raisonLibre: string;
}

/** Retour approuvé sans avoir : son avoir reste à créer. */
const needsAvoir = (r: Retour) => r.statut === 'traite' && !r.avoir_id;

/** Puces de statut : les mêmes mots que la pastille. */
const STATUS_CHIPS = [{ value: 'all', label: 'Tous' }, ...getStatusOptions('retour')];

export default function Retours() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const canOpen = useRouteAccess();

  const [retours, setRetours] = useState<Retour[]>([]);
  const [stats, setStats] = useState<RetourStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  // Statut porté par l'adresse : « N retours à approuver » du tableau de bord
  // ouvre `/retours?statut=en_attente`.
  const [params] = useSearchParams();
  const patchParams = useSearchParamsPatch();
  const statutParam = params.get('statut') ?? 'all';
  const statut = STATUS_CHIPS.some((c) => c.value === statutParam) ? statutParam : 'all';
  const setStatut = (value: string) => {
    patchParams({ statut: value === 'all' ? null : value });
    setPage(1);
  };
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Détail
  const [detail, setDetail] = useState<(Retour & { lignes: RetourLigne[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Création
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFacture, setSelectedFacture] = useState<DocumentOption | null>(null);
  const [facture, setFacture] = useState<FactureComplete | null>(null);
  const [factureLoading, setFactureLoading] = useState(false);
  const [lignes, setLignes] = useState<Record<number, LigneRetour>>({});
  const [notes, setNotes] = useState('');

  const loadStats = useCallback(async () => {
    setStatsError(false);
    try {
      const data = (await retourService.getStats()) as RetourStats | { data?: RetourStats } | null;
      setStats(data && 'data' in data && data.data ? data.data : ((data as RetourStats | null) ?? null));
    } catch {
      // Les tuiles affichent « Indisponible » : un échec ne doit pas ressembler à zéro.
      setStats(null);
      setStatsError(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await retourService.getAll(page, limit, statut === 'all' ? undefined : statut);
      const rows = (list?.data ?? []) as Retour[];
      setRetours(Array.isArray(rows) ? rows : []);
      setTotal(list?.pagination?.total ?? (Array.isArray(rows) ? rows.length : 0));
      setTotalPages(list?.pagination?.totalPages ?? 1);
    } catch (err) {
      setError(err);
      setRetours([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, statut]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const reloadAll = () => {
    void load();
    void loadStats();
  };

  const searchFactures = async (q: string): Promise<DocumentOption[]> => {
    const res = (await factureService.getAll(q, undefined, 1, 10)) as {
      data?: Array<{
        id: number;
        numero_facture: string;
        client_nom?: string | null;
        client_prenom?: string | null;
        total?: number | string | null;
        date_facture?: string | null;
        statut?: string | null;
      }>;
    } | null;
    return (res?.data ?? []).map((f) => ({
      id: f.id,
      numero: f.numero_facture,
      tiers_nom: `${f.client_nom || ''} ${f.client_prenom || ''}`.trim() || null,
      montant: f.total ?? null,
      date: f.date_facture ?? null,
      statut: f.statut ?? null,
    }));
  };

  // Charge les lignes de la facture choisie : ce sont les seuls produits
  // retournables, et le client du retour est celui de la facture.
  const onPickFacture = async (doc: DocumentOption | null) => {
    setSelectedFacture(doc);
    setFacture(null);
    setLignes({});
    if (!doc) return;
    setFactureLoading(true);
    try {
      const data = await factureService.getById(doc.id);
      setFacture(data);
      const initial: Record<number, LigneRetour> = {};
      (data.lignes || []).forEach((l) => {
        initial[l.produit_id] = { selected: false, quantite: 1, raison: RAISONS[0], raisonLibre: '' };
      });
      setLignes(initial);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de charger les produits de cette facture.'));
    } finally {
      setFactureLoading(false);
    }
  };

  const setLigne = (produitId: number, patch: Partial<LigneRetour>) =>
    setLignes((prev) => ({ ...prev, [produitId]: { ...prev[produitId], ...patch } }));

  const resetForm = () => {
    setShowForm(false);
    setSelectedFacture(null);
    setFacture(null);
    setLignes({});
    setNotes('');
  };

  const selectedLignes = useMemo(
    () => (facture?.lignes || []).filter((l) => lignes[l.produit_id]?.selected),
    [facture, lignes]
  );

  const totalRetour = useMemo(
    () =>
      selectedLignes.reduce(
        (sum, l) => sum + (lignes[l.produit_id]?.quantite || 0) * (toNumber(l.prix_unitaire) ?? 0),
        0
      ),
    [selectedLignes, lignes]
  );

  const submit = async () => {
    if (!facture) {
      toast.error('Choisissez la facture d’origine.');
      return;
    }
    if (selectedLignes.length === 0) {
      toast.error('Cochez au moins un produit à retourner.');
      return;
    }

    const payload: { facture_id: number; produit_id: number; quantite: number; raison: string }[] = [];
    for (const l of selectedLignes) {
      const state = lignes[l.produit_id];
      const quantite = Number(state.quantite);
      if (!Number.isInteger(quantite) || quantite < 1) {
        toast.error(`Saisissez une quantité d’au moins 1 pour « ${l.produit_nom} ».`);
        return;
      }
      if (quantite > Number(l.quantite)) {
        toast.error(`« ${l.produit_nom} » : ${l.quantite} au plus, la quantité facturée.`);
        return;
      }
      const raison = state.raison === 'Autre' ? state.raisonLibre.trim() : state.raison;
      if (!raison) {
        toast.error(`Précisez le motif du retour de « ${l.produit_nom} ».`);
        return;
      }
      payload.push({ facture_id: facture.id, produit_id: l.produit_id, quantite, raison });
    }

    // `factures.tiers_id` est la colonne réelle ; `client_id` n'est qu'un alias
    // hérité, absent de la projection — d'où le repli.
    const clientId = facture.tiers_id ?? facture.client_id;
    if (!clientId) {
      toast.error('Client introuvable sur cette facture.');
      return;
    }

    setSubmitting(true);
    try {
      const result = (await retourService.create({
        client_id: clientId,
        lignes: payload,
        notes: notes.trim() || undefined,
      })) as { numero_retour?: string; data?: { numero_retour?: string } } | null;
      const numero = result?.data?.numero_retour ?? result?.numero_retour ?? '';
      toast.success(
        `${numero ? `Retour ${numero}` : 'Retour'} enregistré : le stock sera réintégré à l’approbation.`
      );
      resetForm();
      reloadAll();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer le retour. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (retour: Retour) => {
    setDetailLoading(true);
    setDetail({ ...retour, lignes: [] });
    try {
      const data = (await retourService.getById(retour.id)) as (Retour & { lignes?: RetourLigne[] }) | null;
      setDetail({ ...retour, ...(data ?? {}), lignes: data?.lignes || [] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de charger le détail du retour.'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** U-08 : l'avoir du retour approuvé, en un clic, puis sa fiche. */
  const creerAvoir = async (retour: Retour) => {
    const montant = formatCurrency(retour.total_remboursement);
    const ok = await confirm({
      title: `Créer l’avoir du retour ${retour.numero_retour} ?`,
      description: `Un avoir de ${montant} sera créé pour ${retour.client_nom || 'le client'}. Vous pourrez ensuite l’imputer sur une facture ou le rembourser.`,
      confirmLabel: `Créer l’avoir de ${montant}`,
    });
    if (!ok) return;
    setBusyId(retour.id);
    try {
      const result = await creditNoteService.createFromRetour(retour.id);
      toast.success(`Avoir ${result.numero_avoir} créé pour le retour ${retour.numero_retour}`);
      setDetail(null);
      if (result.avoir_id && canOpen(`/avoirs/${result.avoir_id}`)) {
        navigate(`/avoirs/${result.avoir_id}`);
      } else {
        reloadAll();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer l’avoir. Réessayez.'));
      reloadAll();
    } finally {
      setBusyId(null);
    }
  };

  const approuver = async (retour: Retour) => {
    const ok = await confirm({
      title: `Approuver le retour ${retour.numero_retour} ?`,
      description: `Les produits du retour ${retour.numero_retour} seront remis en stock. Pour créditer ou rembourser le client (${formatCurrency(retour.total_remboursement)}), créez ensuite son avoir.`,
      confirmLabel: 'Approuver et remettre en stock',
    });
    if (!ok) return;
    setBusyId(retour.id);
    try {
      await retourService.updateStatut(retour.id, 'traite');
      toast.success(`Retour ${retour.numero_retour} approuvé : stock réintégré`, {
        action: {
          label: 'Créer l’avoir',
          onClick: () => void creerAvoir({ ...retour, statut: 'traite' }),
        },
      });
      setDetail(null);
      reloadAll();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’approuver le retour. Réessayez.'));
    } finally {
      setBusyId(null);
    }
  };

  const annuler = async (retour: Retour) => {
    const dejaTraite = retour.statut === 'traite';
    const ok = await confirm({
      title: `Annuler le retour ${retour.numero_retour} ?`,
      description: dejaTraite
        ? `Le retour ${retour.numero_retour} a déjà été approuvé : ses produits seront retirés du stock où ils avaient été réintégrés.`
        : `Le retour ${retour.numero_retour} sera annulé. Aucun mouvement de stock n’a encore eu lieu.`,
      confirmLabel: 'Annuler le retour',
      cancelLabel: 'Garder le retour',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(retour.id);
    try {
      await retourService.updateStatut(retour.id, 'annule');
      toast.success(`Retour ${retour.numero_retour} annulé`);
      setDetail(null);
      reloadAll();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’annuler le retour. Réessayez.'));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Numéro de l'avoir émis. Dans la liste : couleur du texte, souligné au
   * survol (le bleu reste aux actions) ; dans une phrase (`inline`) : lien bleu.
   */
  const avoirLink = (r: Retour, inline = false) =>
    r.avoir_id && r.numero_avoir ? (
      canOpen(`/avoirs/${r.avoir_id}`) ? (
        <Link
          to={`/avoirs/${r.avoir_id}`}
          className={inline ? 'text-primary underline-offset-4 hover:underline' : 'underline-offset-4 hover:underline'}
        >
          <DocumentCode>{r.numero_avoir}</DocumentCode>
        </Link>
      ) : (
        <DocumentCode>{r.numero_avoir}</DocumentCode>
      )
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  /**
   * Actions d'un retour : approuver (en attente), créer l'avoir (approuvé sans
   * avoir), annuler (sauf si un avoir actif existe : l'API le refuse — il faut
   * d'abord annuler l'avoir). Le détail s'ouvre par le numéro du retour. Dans
   * le tableau, « Annuler » est une icône nommée, grise au repos : le libellé
   * complet faisait déborder la ligne, et le rouge se garde pour le survol.
   */
  const rowActions = (r: Retour, place: 'table' | 'card') => {
    const busy = busyId === r.id;
    const size = place === 'card' ? 'touch' : 'default';
    const canCancel = r.statut !== 'annule' && !r.avoir_id;
    // Rien à faire : pas de rangée d'actions vide au pied de la carte.
    if (r.statut !== 'en_attente' && !needsAvoir(r) && !canCancel) return null;
    return (
      <>
        {r.statut === 'en_attente' && (
          <Button
            variant="outline"
            size={size}
            onClick={() => void approuver(r)}
            disabled={busy}
            aria-label={`Approuver le retour ${r.numero_retour}`}
          >
            Approuver
          </Button>
        )}
        {needsAvoir(r) && (
          <Button
            variant="outline"
            size={size}
            onClick={() => void creerAvoir(r)}
            disabled={busy}
            aria-label={`Créer l’avoir du retour ${r.numero_retour}`}
          >
            Créer l’avoir
          </Button>
        )}
        {canCancel &&
          (place === 'table' ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void annuler(r)}
              disabled={busy}
              className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
              aria-label={`Annuler le retour ${r.numero_retour}`}
              title="Annuler le retour"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="touch"
              onClick={() => void annuler(r)}
              disabled={busy}
              className="text-muted-foreground hover:bg-danger-50 hover:text-danger-700"
              aria-label={`Annuler le retour ${r.numero_retour}`}
            >
              Annuler le retour
            </Button>
          ))}
      </>
    );
  };

  const table = (
    <Table aria-label="Retours clients">
      <TableHeader>
        <TableRow>
          <TableHead>N° de retour</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Date</TableHead>
          <TableHead numeric>Montant</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Avoir</TableHead>
          <TableHead className="w-[1%]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {retours.map((r) => (
          <TableRow key={r.id}>
            {/* Le numéro ouvre le détail : plus de colonne « Voir » à part. */}
            <TableCell className="whitespace-nowrap">
              <button
                type="button"
                onClick={() => void openDetail(r)}
                aria-label={`Voir le retour ${r.numero_retour}`}
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <DocumentCode>{r.numero_retour}</DocumentCode>
              </button>
            </TableCell>
            <TableCell>{r.client_nom || '—'}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
            <TableCell numeric className="font-medium">
              <Money value={r.total_remboursement} />
            </TableCell>
            <TableCell>
              <StatusBadge type="retour" statut={r.statut} />
            </TableCell>
            <TableCell>{avoirLink(r)}</TableCell>
            <TableCell>
              {/* Boutons de 36 px rattrapés par la marge négative : chaque ligne garde 40 px. */}
              <div className="-my-2 flex items-center justify-end gap-1.5">{rowActions(r, 'table')}</div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const cards = retours.map((r) => (
    <DataCard
      key={r.id}
      onClick={() => void openDetail(r)}
      linkLabel={`Voir le retour ${r.numero_retour}`}
      title={<DocumentCode className="font-normal">{r.numero_retour}</DocumentCode>}
      badge={<StatusBadge type="retour" statut={r.statut} />}
      actions={rowActions(r, 'card')}
    >
      <DataCardRow label="Client" value={r.client_nom || '—'} />
      <DataCardRow label="Date" value={formatDate(r.created_at)} />
      <DataCardRow label="Montant" value={<Money value={r.total_remboursement} />} numeric />
      {r.numero_avoir && <DataCardRow label="Avoir" value={avoirLink(r)} />}
    </DataCard>
  ));

  const statsLoading = !stats && !statsError;
  const enAttente = toNumber(stats?.en_attente) ?? 0;
  const montantEnAttente = toNumber(stats?.montant_en_attente);

  return (
    <PageShell
      title="Retours clients"
      description="Produits rapportés par vos clients : le stock n’est réintégré qu’après approbation, l’avoir se crée ensuite"
      primaryAction={
        <Button size="touch" onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau retour
        </Button>
      }
    >
      <StatGrid>
        <StatTile
          label="Retours"
          value={toNumber(stats?.total_retours)}
          loading={statsLoading}
          unavailable={statsError}
        />
        {/* Un décompte qui attend l'utilisateur reste neutre (comme « À confirmer » sur les devis). */}
        <StatTile
          label="En attente d’approbation"
          value={toNumber(stats?.en_attente)}
          hint={enAttente > 0 && montantEnAttente !== null ? `${formatCurrency(montantEnAttente)} à décider` : undefined}
          loading={statsLoading}
          unavailable={statsError}
        />
        <StatTile label="Approuvés" value={toNumber(stats?.traites)} loading={statsLoading} unavailable={statsError} />
        <StatTile
          label="Valeur des retours approuvés"
          value={toNumber(stats?.montant_total_rembourse)}
          format="money"
          loading={statsLoading}
          unavailable={statsError}
        />
      </StatGrid>

      {/* Les puces se suffisent : pas de carte autour d'une seule rangée de filtres. */}
      <div role="group" aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <ToggleChip key={c.value} pressed={statut === c.value} onPressedChange={() => setStatut(c.value)}>
            {c.label}
          </ToggleChip>
        ))}
      </div>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <QueryState
          loading={loading}
          error={error}
          onRetry={() => void load()}
          errorTitle="Impossible de charger les retours"
          skeleton={
            <>
              <div className="hidden md:block">
                <TableSkeleton rows={8} columns={7} />
              </div>
              <div className="md:hidden">
                <ListSkeleton items={4} />
              </div>
            </>
          }
          isEmpty={retours.length === 0}
          emptyIcon={Undo2}
          emptyTitle={statut === 'all' ? 'Aucun retour enregistré' : 'Aucun retour avec ce statut'}
          emptyDescription={
            statut === 'all'
              ? 'Les marchandises rapportées par vos clients apparaîtront ici'
              : 'Choisissez un autre statut ou affichez tous les retours'
          }
          emptyAction={
            statut === 'all' ? (
              <Button size="touch" onClick={() => setShowForm(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Enregistrer le premier retour
              </Button>
            ) : (
              <Button variant="outline" size="touch" onClick={() => setStatut('all')} className="gap-2">
                <X className="h-4 w-4" aria-hidden="true" />
                Afficher tous les retours
              </Button>
            )
          }
        >
          <ResponsiveTable table={table} cards={cards} />
        </QueryState>
      </Card>

      {!loading && !error && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => {
            setLimit(l);
            setPage(1);
          }}
        />
      )}

      {/* Création */}
      <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : resetForm())}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nouveau retour client</DialogTitle>
            <DialogDescription>
              Choisissez la facture d’origine, puis les produits rapportés. Le stock ne bougera qu’une fois le retour
              approuvé.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="retour-facture">
                Facture d’origine
                <RequiredMark />
              </Label>
              <DocumentPicker
                inputId="retour-facture"
                value={selectedFacture}
                onChange={(doc) => void onPickFacture(doc)}
                search={searchFactures}
                placeholder="Rechercher une facture (numéro ou client)…"
              />
            </div>

            {factureLoading && <LoadingState message="Chargement des produits de la facture…" className="py-6" />}

            {facture && !factureLoading && (
              <>
                <p className="rounded-md border bg-muted/40 p-3 text-sm">
                  Client : <span className="font-medium">{facture.client_nom}</span> · Facture{' '}
                  <DocumentCode>{facture.numero_facture}</DocumentCode> du {formatDate(facture.date_facture)}
                </p>

                {(facture.lignes || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Cette facture ne comporte aucun produit retournable</p>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">Produits rapportés</legend>
                    <ul className="space-y-2">
                      {(facture.lignes || []).map((l) => {
                        const state = lignes[l.produit_id];
                        if (!state) return null;
                        const checkboxId = `retour-ligne-${l.produit_id}`;
                        return (
                          <li key={l.produit_id} className="rounded-md border p-3">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={checkboxId}
                                checked={state.selected}
                                onChange={(e) => setLigne(l.produit_id, { selected: e.target.checked })}
                                className="mt-0.5"
                              />
                              <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer text-sm">
                                <span className="font-medium">{l.produit_nom}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {l.produit_reference && (
                                    <>
                                      <DocumentCode>{l.produit_reference}</DocumentCode> ·{' '}
                                    </>
                                  )}
                                  facturé : {formatNumber(l.quantite)} · <Money value={l.prix_unitaire} /> l’unité
                                </span>
                              </label>
                            </div>
                            {state.selected && (
                              <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr] sm:ps-7">
                                <div className="space-y-1">
                                  <Label htmlFor={`${checkboxId}-qte`} className="text-xs">
                                    Quantité retournée
                                  </Label>
                                  <Input
                                    id={`${checkboxId}-qte`}
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={Number(l.quantite)}
                                    value={state.quantite}
                                    onChange={(e) =>
                                      setLigne(l.produit_id, {
                                        quantite: Math.max(1, parseInt(e.target.value, 10) || 1),
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`${checkboxId}-motif`} className="text-xs">
                                    Motif
                                  </Label>
                                  <Select value={state.raison} onValueChange={(v) => setLigne(l.produit_id, { raison: v })}>
                                    <SelectTrigger id={`${checkboxId}-motif`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {RAISONS.map((r) => (
                                        <SelectItem key={r} value={r}>
                                          {r}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {state.raison === 'Autre' && (
                                    <Input
                                      value={state.raisonLibre}
                                      onChange={(e) => setLigne(l.produit_id, { raisonLibre: e.target.value })}
                                      placeholder="Ex. : écran rayé à la livraison"
                                      className="mt-1.5"
                                      aria-label={`Motif détaillé du retour de ${l.produit_nom}`}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="retour-notes">
                    Notes <span className="font-normal text-muted-foreground">(facultatif)</span>
                  </Label>
                  <Textarea
                    id="retour-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex. : matériel rapporté en boutique par le client, emballage d’origine"
                    rows={2}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <span className="text-sm text-muted-foreground">
                    {selectedLignes.length} {selectedLignes.length > 1 ? 'produits à retourner' : 'produit à retourner'}
                  </span>
                  <Money value={totalRetour} className="text-lg font-semibold" />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="touch" onClick={resetForm} disabled={submitting}>
              Annuler
            </Button>
            <Button size="touch" onClick={() => void submit()} disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              {submitting ? 'Enregistrement…' : 'Enregistrer le retour'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Détail */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Retour {detail?.numero_retour}</DialogTitle>
            <DialogDescription>
              {detail?.client_nom || '—'} · {detail && formatDate(detail.created_at)}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <LoadingState message="Chargement du détail…" className="py-6" />
          ) : (
            detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge type="retour" statut={detail.statut} />
                  <Money value={detail.total_remboursement} className="text-lg font-semibold" />
                </div>

                {detail.avoir_id && detail.numero_avoir && (
                  <p className="text-sm">
                    Avoir émis : {avoirLink(detail, true)}
                    {detail.statut === 'traite' && (
                      <span className="block text-xs text-muted-foreground">
                        Pour annuler ce retour, annulez d’abord l’avoir <DocumentCode>{detail.numero_avoir}</DocumentCode>
                      </span>
                    )}
                  </p>
                )}

                {detail.lignes.length > 0 ? (
                  <Table aria-label={`Produits du retour ${detail.numero_retour}`}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>Facture</TableHead>
                        <TableHead numeric>Qté</TableHead>
                        <TableHead numeric>Montant</TableHead>
                        <TableHead>Motif</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.lignes.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            {l.produit_nom}
                            {l.produit_reference && (
                              <DocumentCode className="block text-xs text-muted-foreground">
                                {l.produit_reference}
                              </DocumentCode>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.numero_facture ? <DocumentCode>{l.numero_facture}</DocumentCode> : '—'}
                          </TableCell>
                          <TableCell numeric>{formatNumber(l.quantite)}</TableCell>
                          <TableCell numeric>
                            <Money value={l.total_ligne} />
                          </TableCell>
                          <TableCell>{l.raison || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">Ce retour ne contient aucun produit</p>
                )}

                {detail.notes && <p className="rounded-md border bg-muted/40 p-3 text-sm">{detail.notes}</p>}
              </div>
            )
          )}

          {detail && !detailLoading && (detail.statut === 'en_attente' || needsAvoir(detail)) && (
            <DialogFooter className="gap-2 sm:gap-0">
              {detail.statut === 'en_attente' && (
                <Button size="touch" onClick={() => void approuver(detail)} disabled={busyId === detail.id}>
                  Approuver et remettre en stock
                </Button>
              )}
              {needsAvoir(detail) && (
                <Button
                  size="touch"
                  onClick={() => void creerAvoir(detail)}
                  disabled={busyId === detail.id}
                  className="gap-2"
                >
                  <FileMinus className="h-4 w-4" aria-hidden="true" />
                  Créer l’avoir de {formatCurrency(detail.total_remboursement)}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
