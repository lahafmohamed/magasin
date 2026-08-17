import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Undo2, Plus, Eye } from 'lucide-react';
import { retourService, factureService } from '@/services/api';
import { FactureComplete } from '@/types';
import { formatCurrency, formatDateShort } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { DocumentPicker, DocumentOption } from '@/components/DocumentPicker';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { StatsBar, type StatTile } from '@/components/ui/stats-bar';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Retour {
  id: number;
  numero_retour: string;
  client_nom: string | null;
  total_remboursement: string | number;
  statut: string;
  notes: string | null;
  created_at: string;
  cree_par_username: string | null;
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
  montant_total_rembourse: string | number;
}

/** Motifs courants en magasin informatique ; « Autre » ouvre une saisie libre. */
const RAISONS = [
  'Produit défectueux',
  'Ne correspond pas à la commande',
  'Erreur de référence',
  'Client a changé d\'avis',
  'Autre',
] as const;

interface LigneRetour {
  selected: boolean;
  quantite: number;
  raison: string;
  raisonLibre: string;
}

export default function Retours() {
  const confirm = useConfirm();

  const [retours, setRetours] = useState<Retour[]>([]);
  const [stats, setStats] = useState<RetourStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, statsData] = await Promise.all([
        retourService.getAll(page, limit),
        retourService.getStats(),
      ]);
      const rows = (list as any)?.data ?? list ?? [];
      setRetours(Array.isArray(rows) ? rows : []);
      setTotal((list as any)?.pagination?.total ?? (Array.isArray(rows) ? rows.length : 0));
      setTotalPages((list as any)?.pagination?.totalPages ?? 1);
      setStats(statsData?.data ?? statsData ?? null);
    } catch (err) {
      setError(err);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des retours'));
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => { void load(); }, [load]);

  const tiles: StatTile[] = useMemo(() => [
    { label: 'Retours', value: Number(stats?.total_retours || 0) },
    { label: 'En attente', value: Number(stats?.en_attente || 0), tone: 'text-warning-700' },
    { label: 'Approuvés', value: Number(stats?.traites || 0), tone: 'text-success-700' },
    { label: 'Total remboursé', value: formatCurrency(Number(stats?.montant_total_rembourse || 0)) },
  ], [stats]);

  const searchFactures = async (q: string): Promise<DocumentOption[]> => {
    const res = await factureService.getAll(q, undefined, 1, 10);
    const rows: any[] = res?.data ?? [];
    return rows.map((f) => ({
      id: f.id,
      numero: f.numero_facture,
      tiers_nom: `${f.client_nom || ''} ${f.client_prenom || ''}`.trim() || null,
      montant: f.total ?? null,
      date: f.date_facture,
      statut: f.statut,
    }));
  };

  // Charge les lignes de la facture choisie : ce sont les seuls articles
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
      toast.error(getErrorMessage(err, 'Impossible de charger les articles de cette facture'));
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
    () => selectedLignes.reduce(
      (sum, l) => sum + (lignes[l.produit_id]?.quantite || 0) * Number(l.prix_unitaire || 0),
      0
    ),
    [selectedLignes, lignes]
  );

  const submit = async () => {
    if (!facture) {
      toast.error("Sélectionnez la facture d'origine");
      return;
    }
    if (selectedLignes.length === 0) {
      toast.error('Sélectionnez au moins un article à retourner');
      return;
    }

    const payload: { facture_id: number; produit_id: number; quantite: number; raison: string }[] = [];
    for (const l of selectedLignes) {
      const state = lignes[l.produit_id];
      const quantite = Number(state.quantite);
      if (!Number.isInteger(quantite) || quantite < 1) {
        toast.error(`Quantité invalide pour ${l.produit_nom}`);
        return;
      }
      if (quantite > Number(l.quantite)) {
        toast.error(`Quantité supérieure à la quantité facturée pour ${l.produit_nom} (max ${l.quantite})`);
        return;
      }
      const raison = state.raison === 'Autre' ? state.raisonLibre.trim() : state.raison;
      if (!raison) {
        toast.error(`Précisez le motif du retour pour ${l.produit_nom}`);
        return;
      }
      payload.push({ facture_id: facture.id, produit_id: l.produit_id, quantite, raison });
    }

    // `factures.tiers_id` est la colonne réelle ; `client_id` n'est qu'un alias
    // hérité, absent de la projection — d'où le fallback.
    const clientId = facture.tiers_id ?? facture.client_id;
    if (!clientId) {
      toast.error("Client introuvable sur cette facture");
      return;
    }

    setSubmitting(true);
    try {
      const result = await retourService.create({
        client_id: clientId,
        lignes: payload,
        notes: notes.trim() || undefined,
      });
      const numero = (result as any)?.data?.numero_retour ?? (result as any)?.numero_retour ?? '';
      toast.success(
        `Retour ${numero} enregistré. Le stock sera réintégré à l'approbation.`.trim()
      );
      resetForm();
      void load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la création du retour'));
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (retour: Retour) => {
    setDetailLoading(true);
    setDetail({ ...retour, lignes: [] });
    try {
      const data = await retourService.getById(retour.id);
      const payload = data?.data ?? data;
      setDetail({ ...retour, ...payload, lignes: payload?.lignes || [] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors du chargement du retour'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const approuver = async (retour: Retour) => {
    const ok = await confirm({
      title: 'Approuver ce retour ?',
      description: `Les articles du retour ${retour.numero_retour} seront remis en stock et ${formatCurrency(Number(retour.total_remboursement || 0))} seront dus au client. Cette opération met à jour l'inventaire.`,
      confirmLabel: 'Approuver et remettre en stock',
    });
    if (!ok) return;
    try {
      await retourService.updateStatut(retour.id, 'traite');
      toast.success('Retour approuvé — stock réintégré');
      void load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'approbation du retour"));
    }
  };

  const annuler = async (retour: Retour) => {
    const dejaTraite = retour.statut === 'traite';
    const ok = await confirm({
      title: 'Annuler ce retour ?',
      description: dejaTraite
        ? `Le retour ${retour.numero_retour} a déjà été approuvé : les articles seront retirés du stock où ils avaient été réintégrés.`
        : `Le retour ${retour.numero_retour} sera annulé. Aucun mouvement de stock n'a encore eu lieu.`,
      confirmLabel: 'Annuler le retour',
      cancelLabel: 'Retour',
      destructive: true,
    });
    if (!ok) return;
    try {
      await retourService.updateStatut(retour.id, 'annule');
      toast.success('Retour annulé');
      void load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'annulation du retour"));
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <PageHeader
        title="Retours clients"
        icon={Undo2}
        description="Marchandise rapportée par un client — le stock n'est réintégré qu'après approbation"
        className="mb-6"
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nouveau retour
          </Button>
        }
      />

      <div className="mb-6">
        <StatsBar tiles={tiles} loading={loading} />
      </div>

      <Card>
        <QueryState
          loading={loading}
          error={error}
          onRetry={load}
          skeleton={<TableSkeleton rows={8} columns={6} />}
          isEmpty={retours.length === 0}
          emptyIcon={Undo2}
          emptyTitle="Aucun retour enregistré"
          emptyDescription="Les marchandises rapportées par vos clients apparaîtront ici."
          emptyAction={
            <Button onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Enregistrer le premier retour
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° retour</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retours.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-medium">{r.numero_retour}</TableCell>
                    <TableCell>{r.client_nom || '—'}</TableCell>
                    <TableCell className="num">{formatDateShort(r.created_at)}</TableCell>
                    <TableCell className="text-right num font-medium">
                      {formatCurrency(Number(r.total_remboursement || 0))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge type="retour" statut={r.statut} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(r)} className="gap-1.5">
                          <Eye className="h-4 w-4" />
                          Détail
                        </Button>
                        {r.statut === 'en_attente' && (
                          <Button size="sm" onClick={() => approuver(r)}>
                            Approuver
                          </Button>
                        )}
                        {r.statut !== 'annule' && (
                          <Button variant="outline" size="sm" onClick={() => annuler(r)}>
                            Annuler
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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

      {/* Création */}
      <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : resetForm())}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nouveau retour client</DialogTitle>
            <DialogDescription>
              Choisissez la facture d'origine, puis les articles rapportés. Le stock ne bougera
              qu'une fois le retour approuvé.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="retour-facture">Facture d'origine<span className="text-destructive"> *</span></Label>
              <DocumentPicker
                inputId="retour-facture"
                value={selectedFacture}
                onChange={onPickFacture}
                search={searchFactures}
                placeholder="Rechercher une facture (numéro, client)…"
              />
            </div>

            {factureLoading && (
              <p className="text-sm text-muted-foreground">Chargement des articles de la facture…</p>
            )}

            {facture && !factureLoading && (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  Client : <strong>{facture.client_nom}</strong> · Facture{' '}
                  <strong>{facture.numero_facture}</strong> du {formatDateShort(facture.date_facture)}
                </div>

                {(facture.lignes || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Cette facture ne comporte aucun article retournable.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead>Article</TableHead>
                          <TableHead className="text-right">Facturé</TableHead>
                          <TableHead className="text-right w-[110px]">Qté retournée</TableHead>
                          <TableHead className="w-[230px]">Motif</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(facture.lignes || []).map((l) => {
                          const state = lignes[l.produit_id];
                          if (!state) return null;
                          return (
                            <TableRow key={l.produit_id}>
                              <TableCell>
                                <Checkbox
                                  checked={state.selected}
                                  onChange={(e) => setLigne(l.produit_id, { selected: e.target.checked })}
                                  aria-label={`Retourner ${l.produit_nom}`}
                                />
                              </TableCell>
                              <TableCell className="text-sm">
                                {l.produit_nom}
                                <span className="block text-xs font-mono text-muted-foreground">
                                  {l.produit_reference}
                                </span>
                              </TableCell>
                              <TableCell className="text-right num">{l.quantite}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={1}
                                  max={Number(l.quantite)}
                                  value={state.quantite}
                                  disabled={!state.selected}
                                  onChange={(e) =>
                                    setLigne(l.produit_id, {
                                      quantite: Math.max(1, parseInt(e.target.value) || 1),
                                    })
                                  }
                                  className="h-8 w-20 text-right"
                                  aria-label={`Quantité retournée pour ${l.produit_nom}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={state.raison}
                                  onValueChange={(v) => setLigne(l.produit_id, { raison: v })}
                                  disabled={!state.selected}
                                >
                                  <SelectTrigger aria-label={`Motif du retour pour ${l.produit_nom}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {RAISONS.map((r) => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {state.selected && state.raison === 'Autre' && (
                                  <Input
                                    value={state.raisonLibre}
                                    onChange={(e) => setLigne(l.produit_id, { raisonLibre: e.target.value })}
                                    placeholder="Ex : écran rayé à la livraison"
                                    className="mt-1.5 h-8"
                                    aria-label={`Motif détaillé pour ${l.produit_nom}`}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="retour-notes">Notes</Label>
                  <Textarea
                    id="retour-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex : matériel rapporté en boutique par le client, emballage d'origine"
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm text-muted-foreground">
                    {selectedLignes.length} article(s) à retourner
                  </span>
                  <span className="text-xl font-bold">{formatCurrency(totalRetour)}</span>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm} disabled={submitting}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={submitting || selectedLignes.length === 0}>
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
              {detail?.client_nom || '—'} · {detail && formatDateShort(detail.created_at)}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground py-4">Chargement du détail…</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {detail && <StatusBadge type="retour" statut={detail.statut} />}
                <span className="text-lg font-bold">
                  {formatCurrency(Number(detail?.total_remboursement || 0))}
                </span>
              </div>

              {detail?.lignes?.length ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Article</TableHead>
                        <TableHead>Facture</TableHead>
                        <TableHead className="text-right">Qté</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>Motif</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.lignes.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm">
                            {l.produit_nom}
                            <span className="block text-xs font-mono text-muted-foreground">
                              {l.produit_reference}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{l.numero_facture || '—'}</TableCell>
                          <TableCell className="text-right num">{l.quantite}</TableCell>
                          <TableCell className="text-right num">
                            {formatCurrency(Number(l.total_ligne || 0))}
                          </TableCell>
                          <TableCell className="text-sm">{l.raison || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune ligne à afficher.</p>
              )}

              {detail?.notes && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">{detail.notes}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
