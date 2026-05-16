import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/authService';
import { toast } from 'sonner';

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

      toast.success('Réception créée avec succès');
      setSelectedOrder(null);
      fetchPendingOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur création réception');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  if (selectedOrder) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Nouvelle Réception - {selectedOrder.numero_commande}</h1>
          <button className="btn btn-ghost" onClick={() => setSelectedOrder(null)}>← Retour</button>
        </div>

        <div className="card bg-base-100 shadow-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Fournisseur: {selectedOrder.fournisseur_nom}</h2>
          <p className="text-sm text-base-content/60">Commande: {selectedOrder.numero_commande}</p>
          <div className="mt-4 max-w-sm">
            <label className="label"><span className="label-text">Location de reception</span></label>
            <select
              className="select select-bordered w-full"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.nom} ({location.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl p-6 mb-6">
          <h3 className="font-semibold mb-4">Produits reçus</h3>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Produit</th>
                  <th>Commandé</th>
                  <th>Reçu</th>
                  <th>Stock actuel</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrder.lignes.map((ligne) => (
                  <tr key={ligne.produit_id}>
                    <td>{ligne.produit_reference}</td>
                    <td>{ligne.produit_nom}</td>
                    <td>{ligne.quantite}</td>
                    <td>
                      <input
                        type="number"
                        className="input input-bordered input-sm w-24"
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
                    <td>{ligne.stock_actuel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="form-control mb-6">
          <label className="label">
            <span className="label-text">Notes</span>
          </label>
          <textarea
            className="textarea textarea-bordered h-24"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes optionnelles..."
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <span className="loading loading-spinner"></span> : 'Valider la réception'}
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Réceptions de Commandes</h1>

      {orders.length === 0 ? (
        <div className="alert alert-info">
          <span>Aucune commande en attente de réception.</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>N° Commande</th>
                <th>Fournisseur</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Montant</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-medium">{order.numero_commande}</td>
                  <td>{order.fournisseur_nom}</td>
                  <td>{new Date(order.date_commande).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <span className={`badge ${
                      order.statut === 'validee' ? 'badge-warning' :
                      order.statut === 'expediee' ? 'badge-info' : 'badge-ghost'
                    }`}>
                      {order.statut}
                    </span>
                  </td>
                  <td>{parseFloat(order.sous_total).toFixed(2)} XOF</td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => selectOrder(order)}>
                      Réceptionner
                    </button>
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
