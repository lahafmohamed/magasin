import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, PackageCheck } from 'lucide-react';
import { api } from '../services/authService';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { SortableHeader, toggleSort, SortState } from '@/components/ui/sortable-header';
import { formatFCFA } from '../utils/format';

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

const STATUT_BADGE: Record<string, string> = {
  validee: 'bg-warning-100 text-warning-800',
  expediee: 'bg-info-100 text-info-700',
};

export default function Receptions() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sort, setSort] = useState<SortState<OrderSortKey> | null>(null);
  const handleSort = (key: OrderSortKey) => setSort((s) => toggleSort(s, key));

  useEffect(() => {
    fetchPendingOrders();
    fetchLocations();
  }, []);

  useEffect(() => {
    const commandeId = searchParams.get('commande_id');
    if (commandeId && orders.length > 0) {
      const order = orders.find((o) => String(o.id) === commandeId);
      if (order) selectOrder(order);
    }
  }, [orders, searchParams]);

  const fetchLocations = async () => {
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
    } catch {
      toast.error('Erreur chargement locations');
    }
  };

  const fetchPendingOrders = async () => {
    try {
      const { data } = await api.get('/receptions/pending');
      setOrders(data.data || data);
    } catch {
      toast.error('Erreur chargement commandes');
    } finally {
      setLoading(false);
    }
  };

  const selectOrder = async (order: Order) => {
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
    } catch {
      toast.error('Erreur chargement commande');
    }
  };

  const handleSubmit = async () => {
    if (!selectedOrder) return;
    setSubmitting(true);

    try {
      const lignes = selectedOrder.lignes.map((ligne) => ({
        produit_id: ligne.produit_id,
        quantite_commandee: ligne.quantite,
        quantite_recue: receivedQuantities[ligne.produit_id] || 0,
        cout_unitaire: parseFloat(ligne.prix_unitaire),
      }));

      await api.post('/receptions', {
        commande_id: selectedOrder.id,
        location_id: selectedLocationId ? parseInt(selectedLocationId, 10) : undefined,
        lignes,
        notes: notes || undefined,
      });

      toast.success('Réception créée');
      setSelectedOrder(null);
      fetchPendingOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur création réception');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedOrders = useMemo(() => {
    if (!sort) return orders;
    const arr = [...orders];
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
  }, [orders, sort]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

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
            <Label htmlFor="reception-location">Location de réception</Label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger id="reception-location" className="h-9">
                <SelectValue placeholder="Sélectionner une location" />
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
                        type="number"
                        className="h-8 w-24 ml-auto text-right num"
                        value={receivedQuantities[ligne.produit_id] || 0}
                        min={0}
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
              <Loader2 className="h-4 w-4 animate-spin" />
              Validation…
            </>
          ) : 'Valider la réception'}
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Réceptions de commandes</h1>

      {orders.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Aucune commande en attente de réception." />
      ) : (
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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUT_BADGE[order.statut] || 'bg-muted text-muted-foreground'
                    }`}>
                      {order.statut}
                    </span>
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
      )}
    </div>
  );
}
