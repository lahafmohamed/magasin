import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { produitService, commandeService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/loading';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PackageSearch, ShoppingCart, AlertTriangle } from 'lucide-react';
import { formatFCFA } from '../utils/format';
import { getErrorMessage } from '@/utils/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Suggestion {
  produit_id: number;
  reference: string;
  nom: string;
  prix_achat: string;
  stock_min: number;
  stock: number;
  fournisseur_id: number | null;
  fournisseur_nom: string | null;
  quantite_suggeree: number;
}

interface Row extends Suggestion {
  selected: boolean;
  quantite: number;
}

export default function Reapprovisionnement() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await produitService.getReorderSuggestions();
      setRows(
        (data as Suggestion[]).map((s) => ({
          ...s,
          selected: s.fournisseur_id != null,
          quantite: s.quantite_suggeree,
        }))
      );
    } catch (err) {
      setError(err);
      setRows([]);
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des suggestions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.produit_id === id ? { ...r, ...patch } : r)));

  // Group selected rows (with a supplier) by fournisseur for PO generation.
  const groups = useMemo(() => {
    const map = new Map<number, { nom: string; rows: Row[] }>();
    for (const r of rows) {
      if (!r.selected || r.fournisseur_id == null || r.quantite <= 0) continue;
      const g = map.get(r.fournisseur_id) || { nom: r.fournisseur_nom || `Fournisseur ${r.fournisseur_id}`, rows: [] };
      g.rows.push(r);
      map.set(r.fournisseur_id, g);
    }
    return map;
  }, [rows]);

  const generate = async () => {
    if (groups.size === 0) { toast.error('Aucune ligne sélectionnée avec un fournisseur'); return; }

    const fournisseurs = [...groups.values()].map((g) => g.nom).join(', ');
    const totalLignes = [...groups.values()].reduce((sum, g) => sum + g.rows.length, 0);
    const totalMontant = [...groups.values()].reduce(
      (sum, g) => sum + g.rows.reduce((s, r) => s + r.quantite * (Number(r.prix_achat) || 0), 0),
      0
    );
    const confirmed = await confirm({
      title: `Générer ${groups.size} commande(s) fournisseur ?`,
      description: `${totalLignes} ligne(s) pour ${formatFCFA(totalMontant)} seront commandées auprès de : ${fournisseurs}. Une commande distincte est créée par fournisseur.`,
      confirmLabel: 'Générer les commandes',
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
            prix_unitaire: Number(r.prix_achat) || 0,
          })),
          notes: 'Généré depuis le réapprovisionnement automatique',
        });
        ok++;
      }
      toast.success(`${ok} commande(s) fournisseur créée(s)`);
      navigate('/commandes');
    } catch (e) {
      toast.error(getErrorMessage(e, `Erreur après ${ok} commande(s)`));
      load();
    } finally {
      setGenerating(false);
    }
  };

  const sansFournisseur = rows.filter((r) => r.fournisseur_id == null).length;

  return (
    <div className="p-3 sm:p-6 w-full space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PackageSearch className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Réapprovisionnement</h1>
            <p className="text-sm text-muted-foreground">Produits sous le seuil minimum · génération de commandes fournisseur</p>
          </div>
        </div>
        <Button onClick={generate} disabled={generating || groups.size === 0} className="gap-2">
          {generating ? <Spinner /> : <ShoppingCart className="h-4 w-4" />}
          Générer {groups.size > 0 ? `${groups.size} commande(s)` : 'les commandes'}
        </Button>
      </div>

      {sansFournisseur > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {sansFournisseur} produit(s) sans fournisseur par défaut — non sélectionnables pour la génération automatique.
        </div>
      )}

      <QueryState
        loading={loading}
        error={error}
        onRetry={load}
        skeleton={<TableSkeleton rows={8} columns={7} />}
        isEmpty={rows.length === 0}
        emptyIcon={PackageSearch}
        emptyTitle="Aucun produit à réapprovisionner"
        emptyDescription="Tous les stocks sont au-dessus du seuil minimum."
      >
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Seuil mini</TableHead>
                <TableHead className="text-right">Prix achat</TableHead>
                <TableHead className="text-right w-[110px]">Qté à commander</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.produit_id} className={r.fournisseur_id == null ? 'opacity-60' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={r.selected}
                      disabled={r.fournisseur_id == null}
                      onChange={(e) => setRow(r.produit_id, { selected: e.target.checked })}
                      aria-label={`Sélectionner ${r.nom}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.nom}
                    <span className="block text-xs font-mono text-muted-foreground">{r.reference}</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.fournisseur_nom || <span className="text-warning-600">— manquant —</span>}</TableCell>
                  <TableCell className="text-right num">{r.stock}</TableCell>
                  <TableCell className="text-right num">{r.stock_min}</TableCell>
                  <TableCell className="text-right num">{formatFCFA(Number(r.prix_achat))}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" inputMode="numeric"
                      min={1}
                      value={r.quantite}
                      onChange={(e) => setRow(r.produit_id, { quantite: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="h-8 w-24 text-right"
                      disabled={r.fournisseur_id == null}
                      aria-label={`Quantité à commander pour ${r.nom}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryState>
    </div>
  );
}
