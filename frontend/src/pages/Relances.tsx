import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { FileDown, PhoneCall, Search } from 'lucide-react';
import { crmService, reportService, tiersService } from '@/services/api';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { RECEIVABLE_BUCKETS, daysSince, type ReceivableBucket, type ReceivableRow } from '@/utils/receivables';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Spinner } from '@/components/ui/loading';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { iconForPath } from '@/config/routeAccess';

/** Canaux de relance proposés — enregistrés comme interactions CRM. */
const CANAUX = ['Téléphone', 'WhatsApp', 'E-mail', 'Passage en boutique'] as const;

interface InteractionRow {
  tiers_id?: number | string | null;
  date_interaction?: string | null;
  created_at?: string | null;
}

const nomClient = (c: ReceivableRow) => `${c.nom} ${c.prenom || ''}`.trim();
const retardLabel = (jours: number | null) => (jours === null ? '—' : `${formatNumber(jours)} j`);
const clientsLabel = (n: number) => `${formatNumber(n)} ${n > 1 ? 'clients' : 'client'}`;

/** Totaux de toute la balance âgée, sans filtre : les tuiles du haut ne bougent pas avec les filtres. */
interface OverallReceivables {
  clients: number;
  montant: number;
}

export default function Relances() {
  const canOpen = useRouteAccess();
  const PageIcon = iconForPath('/relances') ?? PhoneCall;

  const [creances, setCreances] = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [montantTotal, setMontantTotal] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [bucket, setBucket] = useState<ReceivableBucket>('all');

  /** Date de la dernière relance par client, pour ne pas relancer deux fois le même jour. */
  const [dernieresRelances, setDernieresRelances] = useState<Record<number, string>>({});

  const [cible, setCible] = useState<ReceivableRow | null>(null);
  const [canal, setCanal] = useState<string>(CANAUX[0]);
  const [commentaire, setCommentaire] = useState('');
  const [rappel, setRappel] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  /**
   * « Clients débiteurs » et « Total à recouvrer » portent sur TOUTE la balance
   * âgée. Calculés sur la réponse filtrée, ils affichaient 0 FCFA sous un
   * filtre « Plus de 60 jours » alors que des millions restaient dus
   * (G-SLIST-01) : une requête sans filtre les alimente, le chiffre filtré
   * est donné à part, nommé comme tel.
   */
  const [overall, setOverall] = useState<OverallReceivables | null>(null);
  const [overallError, setOverallError] = useState<unknown>(null);

  const loadOverall = useCallback(async () => {
    setOverallError(null);
    try {
      const response = await reportService.getReceivables({ page: 1, limit: 1 });
      setOverall({
        clients: Number(response?.pagination?.total || 0),
        montant: toNumber(response?.summary?.montant_total) ?? 0,
      });
    } catch (err) {
      setOverall(null);
      setOverallError(err);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const unfiltered = bucket === 'all' && !debouncedSearch;
    try {
      const response = await reportService.getReceivables({
        page,
        limit,
        bucket,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const rows = (response?.data ?? []) as ReceivableRow[];
      const count = Number(response?.pagination?.total || 0);
      const montant = toNumber(response?.summary?.montant_total) ?? 0;
      setCreances(Array.isArray(rows) ? rows : []);
      setTotal(count);
      setTotalPages(Math.max(1, Number(response?.pagination?.totalPages || 1)));
      setMontantTotal(montant);
      // Sans filtre, la réponse EST la balance entière : les tuiles suivent.
      if (unfiltered) {
        setOverall({ clients: count, montant });
        setOverallError(null);
      }
    } catch (err) {
      setError(err);
      setCreances([]);
      setMontantTotal(null);
      if (unfiltered) {
        setOverall(null);
        setOverallError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, bucket, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = debouncedSearch !== '' || bucket !== 'all';

  // Sous un filtre, la liste ne donne plus la balance entière : une requête
  // sans filtre (une seule ligne) alimente les tuiles si elles sont vides.
  useEffect(() => {
    if (filtered && overall === null && !overallError) void loadOverall();
  }, [filtered, overall, overallError, loadOverall]);

  // Historique des relances déjà passées : une seule requête, indexée par client.
  const loadRelances = useCallback(async () => {
    try {
      const rows = (await crmService.listInteractions({ type: 'relance', limit: 200 })) as InteractionRow[];
      const map: Record<number, string> = {};
      for (const row of rows) {
        const tiersId = Number(row.tiers_id);
        const date = row.date_interaction || row.created_at;
        if (!tiersId || !date) continue;
        if (!map[tiersId] || new Date(date) > new Date(map[tiersId])) {
          map[tiersId] = date;
        }
      }
      setDernieresRelances(map);
    } catch {
      // L'historique est un confort : son absence ne doit pas masquer les créances.
      setDernieresRelances({});
    }
  }, []);

  useEffect(() => {
    void loadRelances();
  }, [loadRelances]);

  const plusAncien = useMemo(() => {
    const retards = creances.map((c) => daysSince(c.plus_ancienne_facture)).filter((j): j is number => j !== null);
    return retards.length > 0 ? Math.max(...retards) : null;
  }, [creances]);

  const ouvrirRelance = (creance: ReceivableRow) => {
    setCible(creance);
    setCanal(creance.telephone ? 'Téléphone' : 'E-mail');
    setCommentaire('');
    setRappel('');
  };

  const enregistrerRelance = async () => {
    if (!cible) return;
    setSaving(true);
    try {
      await crmService.createInteraction({
        tiers_id: cible.client_id,
        type: 'relance',
        sujet: `Relance ${canal} — ${formatCurrency(cible.total_du)} dû`,
        description: commentaire.trim() || undefined,
        date_rappel: rappel || undefined,
        priorite: 'haute',
      });
      toast.success(`Relance enregistrée pour ${nomClient(cible)}`);
      setCible(null);
      void loadRelances();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer la relance. Réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  const telechargerReleve = async (creance: ReceivableRow) => {
    setDownloading(creance.client_id);
    try {
      await tiersService.downloadRelevePdf(creance.client_id, creance.nom);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de générer le relevé de compte. Réessayez.'));
    } finally {
      setDownloading(null);
    }
  };

  const clientLink = (c: ReceivableRow) =>
    canOpen(`/tiers/${c.client_id}`) ? (
      <Link to={`/tiers/${c.client_id}`} className="font-medium underline-offset-4 hover:underline">
        {nomClient(c)}
      </Link>
    ) : (
      <span className="font-medium">{nomClient(c)}</span>
    );

  const coordonnees = (c: ReceivableRow) => (
    <>
      {c.telephone ? (
        <a href={`tel:${c.telephone}`} className="whitespace-nowrap underline-offset-4 hover:underline">
          {c.telephone}
        </a>
      ) : (
        <span className="text-muted-foreground">Aucun téléphone</span>
      )}
      {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
    </>
  );

  /** « Jamais relancé » est une absence de date, pas un statut : texte atténué, sans pastille. */
  const jamaisRelance = <span className="text-muted-foreground">Jamais relancé</span>;

  const derniereRelance = (c: ReceivableRow) => {
    const derniere = dernieresRelances[c.client_id];
    return derniere ? formatDate(derniere) : jamaisRelance;
  };

  /**
   * Tableau : boutons discrets (`ghost`) — 32 boutons encadrés sur une page de
   * seize clients faisaient une grille de cases —, « Relancer » en texte, le
   * relevé en icône nommée (la ligne débordait). Carte : deux boutons encadrés
   * de 44 px.
   */
  const actions = (c: ReceivableRow, place: 'table' | 'card') => (
    <>
      <Button
        variant={place === 'card' ? 'outline' : 'ghost'}
        size={place === 'card' ? 'touch' : 'default'}
        onClick={() => ouvrirRelance(c)}
        aria-label={`Relancer ${nomClient(c)}`}
      >
        Relancer
      </Button>
      {place === 'table' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void telechargerReleve(c)}
          disabled={downloading === c.client_id}
          aria-label={`Télécharger le relevé de compte de ${nomClient(c)}`}
          title="Télécharger le relevé de compte (PDF)"
        >
          {downloading === c.client_id ? <Spinner /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="touch"
          onClick={() => void telechargerReleve(c)}
          disabled={downloading === c.client_id}
          className="gap-2"
          aria-label={`Télécharger le relevé de compte de ${nomClient(c)}`}
        >
          {downloading === c.client_id && <Spinner />}
          Télécharger le relevé
        </Button>
      )}
    </>
  );

  const table = (
    <Table aria-label="Clients à relancer">
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Coordonnées</TableHead>
          <TableHead numeric>Impayé depuis</TableHead>
          <TableHead numeric>Total dû</TableHead>
          <TableHead numeric>Dont plus de 60 jours</TableHead>
          <TableHead>Dernière relance</TableHead>
          <TableHead className="w-[1%]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {creances.map((c) => {
          const vieux = toNumber(c.plus_60_jours) ?? 0;
          return (
            <TableRow key={c.client_id}>
              <TableCell>{clientLink(c)}</TableCell>
              <TableCell>{coordonnees(c)}</TableCell>
              <TableCell numeric>{retardLabel(daysSince(c.plus_ancienne_facture))}</TableCell>
              <TableCell numeric className="font-medium">
                <Money value={c.total_du} />
              </TableCell>
              <TableCell numeric>
                {vieux > 0 ? <Money value={vieux} tone="danger" /> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap">{derniereRelance(c)}</TableCell>
              <TableCell>
                {/* Boutons de 36 px rattrapés par la marge négative : chaque ligne garde sa hauteur. */}
                <div className="-my-2 flex items-center justify-end gap-1">{actions(c, 'table')}</div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  const cards = creances.map((c) => {
    const vieux = toNumber(c.plus_60_jours) ?? 0;
    const tiersHref = canOpen(`/tiers/${c.client_id}`) ? `/tiers/${c.client_id}` : undefined;
    return (
      <DataCard
        key={c.client_id}
        href={tiersHref}
        linkLabel={tiersHref ? `Ouvrir la fiche de ${nomClient(c)}` : undefined}
        title={nomClient(c)}
        badge={dernieresRelances[c.client_id] ? undefined : jamaisRelance}
        actions={actions(c, 'card')}
      >
        <DataCardRow label="Total dû" value={<Money value={c.total_du} className="font-medium" />} numeric />
        <DataCardRow label="Impayé depuis" value={retardLabel(daysSince(c.plus_ancienne_facture))} numeric />
        {vieux > 0 && <DataCardRow label="Dont plus de 60 jours" value={<Money value={vieux} tone="danger" />} numeric />}
        <DataCardRow
          label="Téléphone"
          value={
            c.telephone ? (
              <a href={`tel:${c.telephone}`} className="underline underline-offset-4">
                {c.telephone}
              </a>
            ) : (
              'Aucun'
            )
          }
        />
        {dernieresRelances[c.client_id] && (
          <DataCardRow label="Dernière relance" value={formatDate(dernieresRelances[c.client_id])} />
        )}
      </DataCard>
    );
  });

  const joursCible = cible ? daysSince(cible.plus_ancienne_facture) : null;
  /** Chiffre de la vue filtrée, sous les totaux de toute la balance. */
  const showFilteredHint = filtered && !loading && !error;

  return (
    <PageShell
      title="Relances clients"
      description="Clients qui vous doivent de l’argent, du plus ancien impayé au plus récent"
    >
      {/* Le montant en dernier : sur téléphone, la dernière tuile d'un nombre
          impair prend toute la largeur et le montant ne se coupe pas. Neutre :
          ce que la page doit recouvrer est son sujet, pas une alerte. */}
      <StatGrid>
        <StatTile
          label="Clients débiteurs"
          value={overall ? overall.clients : null}
          hint={showFilteredHint ? `Selon les filtres : ${clientsLabel(total)}` : undefined}
          loading={overall === null && !overallError}
          unavailable={overall === null && !!overallError}
        />
        <StatTile
          label="Créance la plus ancienne"
          value={plusAncien === null ? '—' : `${formatNumber(plusAncien)} j`}
          hint={plusAncien === null ? undefined : 'sur cette page'}
          loading={loading}
          unavailable={!!error}
        />
        <StatTile
          label="Total à recouvrer"
          value={overall ? overall.montant : null}
          format="money"
          hint={
            showFilteredHint && montantTotal !== null ? `Selon les filtres : ${formatCurrency(montantTotal)}` : undefined
          }
          loading={overall === null && !overallError}
          unavailable={overall === null && !!overallError}
        />
      </StatGrid>

      <Card>
        <CardContent inset="standalone">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="relance-search">Rechercher un client</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="relance-search"
                  type="search"
                  enterKeyHint="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom du client…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="relance-bucket">Ancienneté</Label>
              <Select
                value={bucket}
                onValueChange={(v) => {
                  setBucket(v as ReceivableBucket);
                  setPage(1);
                }}
              >
                <SelectTrigger id="relance-bucket">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECEIVABLE_BUCKETS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <QueryState
          loading={loading}
          error={error}
          onRetry={() => void load()}
          errorTitle="Impossible de charger les créances"
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
          isEmpty={creances.length === 0}
          emptyIcon={PageIcon}
          emptyTitle={filtered ? 'Aucune créance ne correspond aux filtres' : 'Aucun client débiteur'}
          emptyDescription={
            filtered
              ? 'Élargissez la recherche ou changez la tranche d’ancienneté'
              : 'Toutes vos factures sont payées'
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

      <Dialog open={!!cible} onOpenChange={(open) => !open && setCible(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Relancer {cible ? nomClient(cible) : ''}</DialogTitle>
            <DialogDescription>
              {cible && (
                <>
                  {formatCurrency(cible.total_du)} dû
                  {joursCible !== null && ` · impayé depuis ${formatNumber(joursCible)} jours`}. La relance est
                  enregistrée dans l’historique du client.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {cible?.telephone && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                Téléphone :{' '}
                <a href={`tel:${cible.telephone}`} className="font-medium underline underline-offset-4">
                  {cible.telephone}
                </a>
                {cible.email && <span className="block">E-mail : {cible.email}</span>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="relance-canal">Comment avez-vous relancé ?</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger id="relance-canal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANAUX.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relance-commentaire">Ce que le client a répondu</Label>
              <Textarea
                id="relance-commentaire"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Ex. : promet de passer payer vendredi"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relance-rappel">
                Me le rappeler le <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <Input id="relance-rappel" type="date" value={rappel} onChange={(e) => setRappel(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="touch" onClick={() => setCible(null)} disabled={saving}>
              Annuler
            </Button>
            <Button size="touch" onClick={() => void enregistrerRelance()} disabled={saving} className="gap-2">
              {saving && <Spinner />}
              {saving ? 'Enregistrement…' : 'Enregistrer la relance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
