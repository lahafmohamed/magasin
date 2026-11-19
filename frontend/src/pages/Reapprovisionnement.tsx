import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, PackageSearch, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { produitService, commandeService } from '../services/api';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { Money } from '@/components/ui/money';
import { DocumentCode } from '@/components/ui/document-code';
import { Spinner } from '@/components/ui/loading';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRouteAccess } from '@/hooks/useRouteAccess';
import { formatCurrency, formatNumber, toNumber } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';

interface Suggestion {
  produit_id: number;
  reference: string;
  nom: string;
  prix_achat: number | string;
  stock_min: number | string;
  stock: number | string;
  fournisseur_id: number | null;
  fournisseur_nom: string | null;
  quantite_suggeree: number | string;
}

interface Row extends Suggestion {
  selected: boolean;
  quantite: number;
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n > 1 ? many : one}`;

/**
 * Stock face à son minimum en une cellule, « 4 · min. 10 » comme sur le
 * tableau de bord (« 4 / 10 » se lisait comme une fraction). Deux colonnes de
 * même largeur ne laissaient pas voir lequel des deux chiffres comptait.
 */
function StockVsMin({ row }: { row: Suggestion }) {
  return (
    <span className="whitespace-nowrap">
      {formatNumber(toNumber(row.stock) ?? 0)}
      <span className="text-muted-foreground"> · min. {formatNumber(toNumber(row.stock_min) ?? 0)}</span>
    </span>
  );
}

export default function Reapprovisionnement() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const canOpen = useRouteAccess();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await produitService.getReorderSuggestions()) as Suggestion[];
      setRows(
        data.map((s) => ({
          ...s,
          selected: s.fournisseur_id != null,
          quantite: Math.max(1, Math.round(toNumber(s.quantite_suggeree) ?? 1)),
        }))
      );
    } catch (err) {
      setError(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.produit_id === id ? { ...r, ...patch } : r)));

  const commandables = rows.filter((r) => r.fournisseur_id != null);
  const selected = rows.filter((r) => r.selected && r.fournisseur_id != null && r.quantite > 0);
  const allSelected = commandables.length > 0 && commandables.every((r) => r.selected);
  const someSelected = commandables.some((r) => r.selected);
  const sansFournisseur = rows.length - commandables.length;

  // Une commande par fournisseur.
  const groups = new Map<number, { nom: string; rows: Row[] }>();
  for (const r of selected) {
    const fournisseurId = r.fournisseur_id as number;
    const g = groups.get(fournisseurId) || { nom: r.fournisseur_nom || 'Fournisseur inconnu', rows: [] };
    g.rows.push(r);
    groups.set(fournisseurId, g);
  }

  const montantEstime = selected.reduce((sum, r) => sum + r.quantite * (toNumber(r.prix_achat) ?? 0), 0);
  const nbCommandes = groups.size;

  const generate = async () => {
    if (nbCommandes === 0) return;
    const fournisseurs = [...groups.values()].map((g) => g.nom).join(', ');
    const confirmed = await confirm({
      title: nbCommandes === 1 ? 'Créer 1 commande fournisseur ?' : `Créer ${nbCommandes} commandes fournisseur ?`,
      description: `${plural(selected.length, 'produit', 'produits')} pour ${formatCurrency(montantEstime)} ${
        selected.length > 1 ? 'seront commandés' : 'sera commandé'
      } auprès de : ${fournisseurs}. Une commande est créée par fournisseur ; vous pourrez la valider ensuite.`,
      confirmLabel: nbCommandes === 1 ? 'Créer la commande' : 'Créer les commandes',
    });
    if (!confirmed) return;

    setGenerating(true);
    let ok = 0;
    try {
      for (const [tiers_id, g] of groups) {
        await commandeService.create({
          tiers_id,
          lignes: g.rows.map((r) => ({
            produit_id: r.produit_id,
            quantite: r.quantite,
            prix_unitaire: toNumber(r.prix_achat) ?? 0,
          })),
          notes: 'Créée depuis les suggestions d’achat',
        });
        ok++;
      }
      toast.success(ok > 1 ? `${ok} commandes fournisseur créées` : '1 commande fournisseur créée');
      navigate('/commandes');
    } catch (e) {
      if (ok === 0) {
        toast.error(getErrorMessage(e, 'Impossible de créer les commandes fournisseur. Réessayez.'));
      } else {
        toast.error(
          ok > 1
            ? `${ok} commandes fournisseur ont été créées, puis une erreur a arrêté la génération.`
            : '1 commande fournisseur a été créée, puis une erreur a arrêté la génération.',
          {
            description:
              'Vérifiez la liste des commandes fournisseur avant de relancer, pour éviter les doublons.',
          }
        );
      }
      void load();
    } finally {
      setGenerating(false);
    }
  };

  const generateLabel =
    nbCommandes === 0
      ? 'Créer les commandes fournisseur'
      : nbCommandes === 1
        ? 'Créer 1 commande fournisseur'
        : `Créer ${nbCommandes} commandes fournisseur`;

  const quantityInput = (r: Row, mobile = false) => (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      value={r.quantite}
      onChange={(e) => setRow(r.produit_id, { quantite: Math.max(1, parseInt(e.target.value, 10) || 1) })}
      disabled={r.fournisseur_id == null}
      aria-label={`Quantité à commander — ${r.nom}`}
      className={mobile ? 'h-11 w-28 text-right tabular-nums' : 'ms-auto w-24 text-right tabular-nums'}
    />
  );

  const fournisseurCell = (r: Row) =>
    r.fournisseur_nom ? r.fournisseur_nom : <span className="text-muted-foreground">Aucun fournisseur</span>;

  return (
    <PageShell
      title="Suggestions d’achat"
      description="Produits sous leur stock minimum. Sélectionnez-les pour créer une commande par fournisseur."
      primaryAction={
        <Button size="touch" className="gap-2" onClick={() => void generate()} disabled={generating || nbCommandes === 0}>
          {generating ? <Spinner /> : <ShoppingCart className="h-4 w-4" aria-hidden="true" />}
          {generateLabel}
        </Button>
      }
    >
      {!loading && !error && sansFournisseur > 0 && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            {sansFournisseur > 1
              ? `${formatNumber(sansFournisseur)} produits n’ont pas de fournisseur par défaut : renseignez-le dans leur fiche pour les commander ici`
              : '1 produit n’a pas de fournisseur par défaut : renseignez-le dans sa fiche pour le commander ici'}
          </p>
          {canOpen('/inventaire') && (
            <Link to="/inventaire" className="font-medium underline underline-offset-2">
              Ouvrir l’inventaire
            </Link>
          )}
        </div>
      )}

      {/* Une ligne au-dessus du tableau plutôt que trois tuiles : le nombre de
          lignes se lit dans le tableau, le nombre de commandes sur le bouton. */}
      {!loading && !error && rows.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {selected.length === 0 ? (
            'Sélectionnez au moins un produit qui a un fournisseur par défaut'
          ) : (
            <>
              <span className="font-medium tabular-nums text-foreground">{formatNumber(selected.length)}</span>{' '}
              {selected.length > 1 ? 'sélectionnés' : 'sélectionné'} sur{' '}
              <span className="tabular-nums">{formatNumber(rows.length)}</span> ·{' '}
              <Money value={montantEstime} className="font-medium text-foreground" /> estimés
            </>
          )}
        </p>
      )}

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            onRetry={() => void load()}
            errorTitle="Impossible de charger les suggestions d’achat"
            skeleton={<TableSkeleton rows={8} columns={6} />}
            isEmpty={rows.length === 0}
            emptyIcon={PackageSearch}
            emptyTitle="Aucun produit à commander"
            emptyDescription="Tous les produits sont au-dessus de leur stock minimum"
          >
            <ResponsiveTable
              table={
                <Table aria-label="Produits sous leur stock minimum">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={someSelected && !allSelected}
                          disabled={commandables.length === 0}
                          onChange={() =>
                            setRows((rs) =>
                              rs.map((r) => (r.fournisseur_id != null ? { ...r, selected: !allSelected } : r))
                            )
                          }
                          aria-label="Sélectionner tous les produits qui ont un fournisseur"
                        />
                      </TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead numeric>Stock</TableHead>
                      <TableHead numeric>Prix d’achat</TableHead>
                      <TableHead numeric>Quantité à commander</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.produit_id}>
                        <TableCell>
                          <Checkbox
                            checked={r.selected}
                            disabled={r.fournisseur_id == null}
                            onChange={(e) => setRow(r.produit_id, { selected: e.target.checked })}
                            aria-label={`Sélectionner ${r.nom}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.nom}</span>
                          <DocumentCode className="block text-xs text-muted-foreground">{r.reference}</DocumentCode>
                        </TableCell>
                        <TableCell>{fournisseurCell(r)}</TableCell>
                        <TableCell numeric>
                          <StockVsMin row={r} />
                        </TableCell>
                        <TableCell numeric>
                          <Money value={r.prix_achat} />
                        </TableCell>
                        <TableCell numeric>{quantityInput(r)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={rows.map((r) => (
                <DataCard
                  key={r.produit_id}
                  title={r.nom}
                  actions={
                    <div className="flex w-full items-center justify-between gap-3">
                      <label className="flex min-h-11 items-center gap-3 text-sm">
                        <Checkbox
                          checked={r.selected}
                          disabled={r.fournisseur_id == null}
                          onChange={(e) => setRow(r.produit_id, { selected: e.target.checked })}
                          aria-label={r.fournisseur_id == null ? `Sans fournisseur — ${r.nom}` : `Commander ${r.nom}`}
                          className="h-5 w-5"
                        />
                        {r.fournisseur_id == null ? 'Sans fournisseur' : 'Commander'}
                      </label>
                      {quantityInput(r, true)}
                    </div>
                  }
                >
                  <DataCardRow label="Référence" value={<DocumentCode>{r.reference}</DocumentCode>} />
                  <DataCardRow label="Fournisseur" value={fournisseurCell(r)} />
                  <DataCardRow label="Stock" value={<StockVsMin row={r} />} numeric />
                  <DataCardRow label="Prix d’achat" value={<Money value={r.prix_achat} />} numeric />
                </DataCard>
              ))}
            />
          </QueryState>
        </CardContent>
      </Card>
    </PageShell>
  );
}
