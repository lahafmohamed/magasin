import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Search } from 'lucide-react';
import { api } from '../services/authService';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';
import { QueryState } from '@/components/ui/query-state';
import { SortableHeader, toggleSort, SortState } from '@/components/ui/sortable-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { formatFCFA } from '../utils/format';
import { getErrorMessage } from '@/utils/errors';
import { useConfirm } from '@/components/ui/confirm-dialog';
import StatusBadge from '@/components/StatusBadge';

interface Order {
  id: number;
  numero_commande: string;
  fournisseur_nom: string;
  tiers_id: number;
  fournisseur_id?: number;
  date_commande: string;
  statut: string;
  sous_total: string;
  receptions_count: number;
}

interface OrderDetail {
  id: number;
  numero_commande: string;
  fournisseur_nom: string;
  lignes: {
    id: number;
    produit_id: number;
    produit_nom: string;
    produit_reference: string;
    quantite: number;
    prix_unitaire: string;
    stock_actuel: number;
  }[];
}

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
  actif: boolean;
}

type OrderSortKey = 'numero_commande' | 'fournisseur_nom' | 'date_commande' | 'statut' | 'sous_total';

export default function Receptions() {
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sort, setSort] = useState<SortState<OrderSortKey> | null>(null);
  const handleSort = (key: OrderSortKey) => setSort((s) => toggleSort(s, key));

  const fetchLocations = useCallback(async () => {
    try {
      const { data } = await api.get('/stock-locations');
      const allLocations: StockLocation[] = data.data || data;
      const activeLocations = allLocations.filter((location) => location.actif);
      setLocations(activeLocations);

      const principal = activeLocations.find((location) => location.est_principal);
      if (principal) {
        setSelectedLocationId(String(principal.id));
      } else if (activeLocations[0]) {
        setSelectedLocationId(String(activeLocations[0].id));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des emplacements'));
    }
  }, []);

  const fetchPendingOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/receptions/pending');
      setOrders(data.data || data);
    } catch (err) {
      setError(err);
      setOrders([]);
      toast.error(getErrorMessage(err, 'Erreur chargement commandes'));
    } finally {
      setLoading(false);
    }
  }, []);

  const selectOrder = useCallback(async (order: Order) => {
    try {
      const { data } = await api.get(`/receptions/order/${order.id}`);
      const orderDetail = data.data || data;
      setSelectedOrder(orderDetail);
      const quantities: Record<number, number> = {};
      orderDetail.lignes.forEach((ligne: any) => {
        quantities[ligne.produit_id] = ligne.quantite;
      });
      setReceivedQuantities(quantities);
      setNotes('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur chargement commande'));
    }
  }, []);

  useEffect(() => {
    fetchPendingOrders();
    fetchLocations();
  }, [fetchPendingOrders, fetchLocations]);

  useEffect(() => {
    const commandeId = searchParams.get('commande_id');
    if (commandeId && orders.length > 0) {
      const order = orders.find((o) => String(o.id) === commandeId);
      if (order) selectOrder(order);
    }
  }, [orders, searchParams, selectOrder]);

  const handleSubmit = async () => {
    if (!selectedOrder) return;

    if (!selectedLocationId) {
      toast.error('Sélectionnez un emplacement de réception');
      return;
    }

    const lignes: {
      produit_id: number;
      quantite_commandee: number;
      quantite_recue: number;
      cout_unitaire: number;
    }[] = [];

    for (const ligne of selectedOrder.lignes) {
      const quantiteRecue = receivedQuantities[ligne.produit_id] ?? 0;
      if (!Number.isInteger(quantiteRecue) || quantiteRecue < 0) {
        toast.error(`Quantité reçue invalide pour ${ligne.produit_nom}`);
        return;
      }
      if (quantiteRecue > ligne.quantite) {
        toast.error(`Quantité reçue supérieure à la quantité commandée pour ${ligne.produit_nom} (max ${ligne.quantite})`);
        return;
      }
      const coutUnitaire = parseFloat(ligne.prix_unitaire);
      if (!Number.isFinite(coutUnitaire) || coutUnitaire < 0) {
        toast.error(`Prix unitaire invalide pour ${ligne.produit_nom}`);
        return;
      }
      lignes.push({
        produit_id: ligne.produit_id,
        quantite_commandee: ligne.quantite,
        quantite_recue: quantiteRecue,
        cout_unitaire: coutUnitaire,
      });
    }

    if (lignes.every((ligne) => ligne.quantite_recue === 0)) {
      toast.error('Saisissez au moins une quantité reçue');
      return;
    }

    // La réception écrit le stock et recalcule le CMP : on récapitule avant.
    const totalRecu = lignes.reduce((sum, l) => sum + l.quantite_recue, 0);
    const totalValeur = lignes.reduce((sum, l) => sum + l.quantite_recue * l.cout_unitaire, 0);
    const emplacement = locations.find((l) => String(l.id) === selectedLocationId);
    const confirmed = await confirm({
      title: 'Valider cette réception ?',
      description: `${totalRecu} article(s) pour ${formatFCFA(totalValeur)} seront ajoutés au stock de ${emplacement?.nom || "l'emplacement sélectionné"}. Le prix de revient moyen des produits sera recalculé.`,
      confirmLabel: 'Valider la réception',
    });
    if (!confirmed) return;

    setSubmitting(true);

    try {
      await api.post('/receptions', {
        commande_id: selectedOrder.id,
        location_id: parseInt(selectedLocationId, 10),
        lignes,
        notes: notes || undefined,
      });

      toast.success('Réception créée');
      setSelectedOrder(null);
      fetchPendingOrders();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur création réception'));
    } finally {
      setSubmitting(false);
    }
  };

  // La liste des commandes en attente est chargée en entier : le filtre reste
  // côté client, sur le numéro et le fournisseur.
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.numero_commande.toLowerCase().includes(q) ||
        (o.fournisseur_nom || '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  const sortedOrders = useMemo(() => {
    if (!sort) return filteredOrders;
    const arr = [...filteredOrders];
    arr.sort((a, b) => {
      let cmp: number;
      if (sort.key === 'sous_total') {
        cmp = (parseFloat(a.sous_total) || 0) - (parseFloat(b.sous_total) || 0);
      } else if (sort.key === 'date_commande') {
        cmp = new Date(a.date_commande).getTime() - new Date(b.date_commande).getTime();
      } else {
        const av = (a[sort.key] || '').toString().toLowerCase();
        const bv = (b[sort.key] || '').toString().toLowerCase();
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredOrders, sort]);

  if (selectedOrder) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Nouvelle réception — {selectedOrder.numero_commande}</h1>
          <Button variant="ghost" onClick={() => setSelectedOrder(null)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </div>

        <div className="rounded-md border bg-card shadow-sm p-5 mb-6">
          <h2 className="text-base font-semibold mb-2">Fournisseur: {selectedOrder.fournisseur_nom}</h2>
          <p className="text-sm text-muted-foreground">Commande: {selectedOrder.numero_commande}</p>
          <div className="mt-4 max-w-sm space-y-1.5">
            <Label htmlFor="reception-location">Emplacement de réception</Label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger id="reception-location" className="h-9">
                <SelectValue placeholder="Sélectionner un emplacement" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={String(location.id)}>
                    {location.nom} ({location.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border bg-card shadow-sm p-5 mb-6">
          <h3 className="font-semibold mb-4">Produits reçus</h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Référence</th>
                  <th className="px-3 py-2 font-medium">Produit</th>
                  <th className="px-3 py-2 font-medium text-right">Commandé</th>
                  <th className="px-3 py-2 font-medium text-right">Reçu</th>
                  <th className="px-3 py-2 font-medium text-right">Stock actuel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedOrder.lignes.map((ligne) => (
                  <tr key={ligne.produit_id}>
                    <td className="px-3 py-2 num">{ligne.produit_reference}</td>
                    <td className="px-3 py-2">{ligne.produit_nom}</td>
                    <td className="px-3 py-2 text-right num">{ligne.quantite}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number" inputMode="numeric"
                        className="h-8 w-24 ml-auto text-right num"
                        value={receivedQuantities[ligne.produit_id] || 0}
                        min={0}
                        max={ligne.quantite}
                        aria-label={`Quantité reçue pour ${ligne.produit_nom}`}
                        onChange={(e) =>
                          setReceivedQuantities((prev) => ({
                            ...prev,
                            [ligne.produit_id]: parseInt(e.target.value) || 0,
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right num">{ligne.stock_actuel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-1.5 mb-6">
          <Label htmlFor="reception-notes">Notes</Label>
          <Textarea
            id="reception-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes optionnelles"
            rows={3}
          />
        </div>

        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Spinner />
              Validation…
            </>
          ) : 'Valider la réception'}
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Réceptions de commandes</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par n° de commande ou fournisseur…"
            aria-label="Rechercher une commande à réceptionner"
            className="pl-9 w-full sm:w-80"
          />
        </div>
      </div>

      <QueryState
        loading={loading}
        error={error}
        onRetry={fetchPendingOrders}
        skeleton={<TableSkeleton rows={10} columns={6} />}
        isEmpty={sortedOrders.length === 0}
        emptyIcon={PackageCheck}
        emptyTitle={search ? 'Aucune commande ne correspond à cette recherche' : 'Aucune commande en attente de réception'}
        emptyDescription={
          search
            ? 'Vérifiez le numéro de commande ou le nom du fournisseur.'
            : 'Les commandes validées ou expédiées apparaîtront ici.'
        }
      >
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <SortableHeader columnKey="numero_commande" sort={sort} onSort={handleSort}>N° commande</SortableHeader>
                <SortableHeader columnKey="fournisseur_nom" sort={sort} onSort={handleSort}>Fournisseur</SortableHeader>
                <SortableHeader columnKey="date_commande" sort={sort} onSort={handleSort}>Date</SortableHeader>
                <SortableHeader columnKey="statut" sort={sort} onSort={handleSort}>Statut</SortableHeader>
                <SortableHeader columnKey="sous_total" sort={sort} onSort={handleSort} align="right">Montant</SortableHeader>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium num">{order.numero_commande}</td>
                  <td className="px-3 py-2">{order.fournisseur_nom}</td>
                  <td className="px-3 py-2 num">{new Date(order.date_commande).toLocaleDateString('fr-FR')}</td>
                  <td className="px-3 py-2">
                    <StatusBadge type="commande" statut={order.statut} />
                  </td>
                  <td className="px-3 py-2 text-right num">{formatFCFA(order.sous_total)}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" onClick={() => selectOrder(order)}>
                      Réceptionner
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </div>
  );
}
