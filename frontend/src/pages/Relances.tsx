import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PhoneCall, FileDown, Search } from 'lucide-react';
import { api, crmService, tiersService } from '@/services/api';
import { formatCurrency, formatDateShort } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';

interface Creance {
  client_id: number;
  nom: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  plus_ancienne_facture: string | null;
  total_du: string | number;
  moins_30_jours: string | number;
  entre_30_60_jours: string | number;
  plus_60_jours: string | number;
}

/** Canaux de relance proposés — enregistrés comme interactions CRM. */
const CANAUX = ['Téléphone', 'WhatsApp', 'E-mail', 'Passage en boutique'] as const;

const BUCKETS = [
  { value: 'all', label: 'Toutes les créances' },
  { value: 'moins_30_jours', label: 'Moins de 30 jours' },
  { value: 'entre_30_60_jours', label: 'Entre 30 et 60 jours' },
  { value: 'plus_60_jours', label: 'Plus de 60 jours' },
] as const;

/** Nombre de jours écoulés depuis la facture impayée la plus ancienne. */
function joursDeRetard(date: string | null): number | null {
  if (!date) return null;
  const debut = new Date(date);
  if (Number.isNaN(debut.getTime())) return null;
  const diff = Date.now() - debut.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export default function Relances() {
  const [creances, setCreances] = useState<Creance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [montantTotal, setMontantTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [bucket, setBucket] = useState<string>('all');

  /** Date de la dernière relance par client, pour ne pas relancer deux fois le même jour. */
  const [dernieresRelances, setDernieresRelances] = useState<Record<number, string>>({});

  const [cible, setCible] = useState<Creance | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/reports/receivables', {
        params: {
          page,
          limit,
          bucket,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
      });
      setCreances(response.data.data || []);
      setTotal(Number(response.data.pagination?.total || 0));
      setTotalPages(Math.max(1, Number(response.data.pagination?.totalPages || 1)));
      setMontantTotal(Number(response.data.summary?.montant_total || 0));
    } catch (err) {
      setError(err);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des créances'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, bucket, debouncedSearch]);

  useEffect(() => { void load(); }, [load]);

  // Historique des relances déjà passées : une seule requête, indexée par client.
  const loadRelances = useCallback(async () => {
    try {
      const rows = await crmService.listInteractions({ type: 'relance', limit: 200 });
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

  useEffect(() => { void loadRelances(); }, [loadRelances]);

  const tiles: StatTile[] = useMemo(() => {
    const retards = creances
      .map((c) => joursDeRetard(c.plus_ancienne_facture))
      .filter((j): j is number => j !== null);
    const plusAncien = retards.length > 0 ? Math.max(...retards) : 0;
    return [
      { label: 'Clients débiteurs', value: total },
      { label: 'Total à recouvrer', value: formatCurrency(montantTotal), tone: 'text-danger-700' },
      { label: 'Créance la plus ancienne', value: plusAncien > 0 ? `${plusAncien} j` : '—', hint: 'sur cette page' },
    ];
  }, [total, montantTotal, creances]);

  const ouvrirRelance = (creance: Creance) => {
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
        sujet: `Relance ${canal} — ${formatCurrency(Number(cible.total_du || 0))} dû`,
        description: commentaire.trim() || undefined,
        date_rappel: rappel || undefined,
        priorite: 'haute',
      });
      toast.success(`Relance enregistrée pour ${cible.nom}`);
      setCible(null);
      void loadRelances();
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'enregistrement de la relance"));
    } finally {
      setSaving(false);
    }
  };

  const telechargerReleve = async (creance: Creance) => {
    setDownloading(creance.client_id);
    try {
      await tiersService.downloadRelevePdf(creance.client_id, creance.nom);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la génération du relevé'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <PageHeader
        title="Relances clients"
        icon={PhoneCall}
        description="Clients qui vous doivent de l'argent, du plus ancien impayé au plus récent"
        className="mb-6"
      />

      <div className="mb-6">
        <StatsBar tiles={tiles} loading={loading} />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label htmlFor="relance-search">Rechercher un client</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="relance-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom du client…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full sm:w-64 space-y-1.5">
            <Label htmlFor="relance-bucket">Ancienneté</Label>
            <Select
              value={bucket}
              onValueChange={(v) => { setBucket(v); setPage(1); }}
            >
              <SelectTrigger id="relance-bucket">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKETS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <QueryState
          loading={loading}
          error={error}
          onRetry={load}
          skeleton={<TableSkeleton rows={8} columns={6} />}
          isEmpty={creances.length === 0}
          emptyIcon={PhoneCall}
          emptyTitle={
            debouncedSearch || bucket !== 'all'
              ? 'Aucune créance ne correspond aux filtres'
              : 'Aucun client débiteur'
          }
          emptyDescription={
            debouncedSearch || bucket !== 'all'
              ? 'Élargissez la recherche ou changez la tranche d\'ancienneté.'
              : 'Toutes vos factures sont réglées.'
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Impayé depuis</TableHead>
                  <TableHead className="text-right">Total dû</TableHead>
                  <TableHead className="text-right">Dont +60 jours</TableHead>
                  <TableHead>Dernière relance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creances.map((c) => {
                  const retard = joursDeRetard(c.plus_ancienne_facture);
                  const vieux = Number(c.plus_60_jours || 0) > 0;
                  const derniere = dernieresRelances[c.client_id];
                  return (
                    <TableRow key={c.client_id}>
                      <TableCell className="font-medium">
                        {c.nom} {c.prenom || ''}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.telephone ? (
                          <a href={`tel:${c.telephone}`} className="hover:underline">{c.telephone}</a>
                        ) : (
                          <span className="text-muted-foreground">Aucun téléphone</span>
                        )}
                        {c.email && (
                          <span className="block text-xs text-muted-foreground">{c.email}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right num">
                        {retard === null ? '—' : `${retard} j`}
                      </TableCell>
                      <TableCell className="text-right num font-semibold">
                        {formatCurrency(Number(c.total_du || 0))}
                      </TableCell>
                      <TableCell className="text-right num">
                        {vieux ? (
                          <span className="text-danger-700 font-medium">
                            {formatCurrency(Number(c.plus_60_jours))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {derniere ? (
                          formatDateShort(derniere)
                        ) : (
                          <Badge variant="outline">Jamais relancé</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => ouvrirRelance(c)} className="gap-1.5">
                            <PhoneCall className="h-4 w-4" />
                            Relancer
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => telechargerReleve(c)}
                            disabled={downloading === c.client_id}
                            className="gap-1.5"
                          >
                            <FileDown className="h-4 w-4" />
                            {downloading === c.client_id ? 'Relevé…' : 'Relevé'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
          />
        </QueryState>
      </Card>

      <Dialog open={!!cible} onOpenChange={(open) => !open && setCible(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Relancer {cible?.nom}</DialogTitle>
            <DialogDescription>
              {cible && (
                <>
                  {formatCurrency(Number(cible.total_du || 0))} dû
                  {joursDeRetard(cible.plus_ancienne_facture) !== null &&
                    ` · impayé depuis ${joursDeRetard(cible.plus_ancienne_facture)} jours`}
                  . La relance est enregistrée dans l'historique du client.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {cible?.telephone && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                Téléphone : <strong>{cible.telephone}</strong>
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
                    <SelectItem key={c} value={c}>{c}</SelectItem>
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
                placeholder="Ex : promet de passer payer vendredi"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relance-rappel">Me le rappeler le (optionnel)</Label>
              <Input
                id="relance-rappel"
                type="date"
                value={rappel}
                onChange={(e) => setRappel(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCible(null)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={enregistrerRelance} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer la relance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
