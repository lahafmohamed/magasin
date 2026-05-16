import { useState, useEffect } from 'react';
import { stockLocationService } from '../services/api';
import { toast } from 'sonner';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  adresse: string | null;
  responsable_id: number | null;
  responsable_username: string | null;
  actif: boolean;
  est_principal: boolean;
  created_at: string;
}

interface StockLevel {
  id: number;
  produit_id: number;
  quantite: number;
  quantite_reservee: number;
  produit_nom: string;
  reference: string;
  prix_vente: string;
  quantite_disponible: number;
}

export default function StockLocations() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StockLocation | null>(null);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    code: '',
    nom: '',
    adresse: '',
    est_principal: false,
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const data = await stockLocationService.getAll();
      setLocations(data.data || data);
    } catch {
      toast.error('Erreur chargement locations');
    } finally {
      setLoading(false);
    }
  };

  const fetchStockLevels = async (locationId: number) => {
    try {
      const data = await stockLocationService.getStockLevels(locationId);
      setStockLevels(data.data || data);
    } catch {
      toast.error('Erreur chargement stock');
    }
  };

  const handleSelectLocation = async (location: StockLocation) => {
    setSelectedLocation(location);
    setSearchQuery('');
    await fetchStockLevels(location.id);
  };

  const filteredStockLevels = stockLevels.filter((level) =>
    level.produit_nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
    level.reference.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await stockLocationService.create(formData);
      toast.success('Location créée avec succès');
      setShowCreateForm(false);
      setFormData({ code: '', nom: '', adresse: '', est_principal: false });
      fetchLocations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur création location');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestion des Locations de Stock</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
          + Nouvelle Location
        </button>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card bg-base-100 shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Nouvelle Location</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Code *</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  required
                />
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Nom *</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  required
                />
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Adresse</span>
                </label>
                <textarea
                  className="textarea textarea-bordered"
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                />
              </div>

              <div className="form-control mb-4">
                <label className="label cursor-pointer">
                  <span className="label-text">Location principale</span>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={formData.est_principal}
                    onChange={(e) => setFormData({ ...formData, est_principal: e.target.checked })}
                  />
                </label>
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="loading loading-spinner"></span> : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Locations List */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Locations</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Nom</th>
                    <th>Principal</th>
                    <th>Statut</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((location) => (
                    <tr key={location.id} className={selectedLocation?.id === location.id ? 'bg-primary/10' : ''}>
                      <td className="font-medium">{location.code}</td>
                      <td>{location.nom}</td>
                      <td>{location.est_principal ? '✓' : ''}</td>
                      <td>
                        <span className={`badge ${location.actif ? 'badge-success' : 'badge-ghost'}`}>
                          {location.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => handleSelectLocation(location)}>
                          Voir Stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Stock Levels */}
        {selectedLocation && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Stock - {selectedLocation.nom}</h2>
              <div className="form-control mb-4">
                <input
                  type="text"
                  placeholder="Rechercher un produit..."
                  className="input input-bordered"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {filteredStockLevels.length === 0 ? (
                <div className="alert alert-info">
                  <span>Aucun stock dans cette location</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Référence</th>
                        <th>Produit</th>
                        <th>Quantité</th>
                        <th>Réservé</th>
                        <th>Disponible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockLevels.map((level) => (
                        <tr key={level.id}>
                          <td>{level.reference}</td>
                          <td>{level.produit_nom}</td>
                          <td>{level.quantite}</td>
                          <td>{level.quantite_reservee}</td>
                          <td className="font-medium">{level.quantite_disponible}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
