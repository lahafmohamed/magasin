import { useState, useEffect } from 'react';
import { employeService } from '../services/api';
import { toast } from 'sonner';
import { MoneyInput } from '../components/ui/money-input';

interface Employe {
  id: number;
  utilisateur_id: number | null;
  username: string | null;
  matricule: string;
  nom_complet: string;
  poste: string | null;
  departement: string | null;
  date_embauche: string;
  date_naissance: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  salaire_base: string | null;
  commission_taux: string;
  actif: boolean;
  created_at: string;
}

interface CommissionSummary {
  total_ventes: number;
  total_montant_ventes: string;
  total_commissions: string;
  commissions_en_attente: number;
  commissions_payees: number;
}

export default function Employes() {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [selectedEmploye, setSelectedEmploye] = useState<Employe | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterDepartement, setFilterDepartement] = useState<string>('');

  const [formData, setFormData] = useState({
    matricule: '',
    nom_complet: '',
    poste: '',
    departement: '',
    date_embauche: new Date().toISOString().split('T')[0],
    date_naissance: '',
    telephone: '',
    email: '',
    adresse: '',
    salaire_base: '',
    commission_taux: '0',
  });

  useEffect(() => {
    fetchEmployes();
  }, [filterDepartement]);

  const fetchEmployes = async () => {
    try {
      const data = await employeService.getAll(undefined, filterDepartement || undefined);
      setEmployes(data.data || data);
    } catch {
      toast.error('Erreur chargement employés');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmploye = async (employe: Employe) => {
    setSelectedEmploye(employe);
    try {
      const dateDebut = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const dateFin = new Date().toISOString().split('T')[0];
      const data = await employeService.getCommissionSummary(employe.id, dateDebut, dateFin);
      setCommissionSummary(data.data || data);
    } catch {
      toast.error('Erreur chargement commissions');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await employeService.create({
        ...formData,
        salaire_base: formData.salaire_base ? parseFloat(formData.salaire_base) : undefined,
        commission_taux: parseFloat(formData.commission_taux),
      });

      toast.success('Employé créé avec succès');
      setShowCreateForm(false);
      setFormData({
        matricule: '',
        nom_complet: '',
        poste: '',
        departement: '',
        date_embauche: new Date().toISOString().split('T')[0],
        date_naissance: '',
        telephone: '',
        email: '',
        adresse: '',
        salaire_base: '',
        commission_taux: '0',
      });
      fetchEmployes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur création employé');
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
        <h1 className="text-2xl font-bold">Gestion des Employés</h1>
        <div className="flex gap-2">
          <select
            className="select select-bordered"
            value={filterDepartement}
            onChange={(e) => setFilterDepartement(e.target.value)}
          >
            <option value="">Tous les départements</option>
            <option value="Vente">Vente</option>
            <option value="Magasin">Magasin</option>
            <option value="Administration">Administration</option>
          </select>
          <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
            + Nouvel Employé
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card bg-base-100 shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Nouvel Employé</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Matricule *</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={formData.matricule}
                    onChange={(e) => setFormData({ ...formData, matricule: e.target.value })}
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Nom Complet *</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={formData.nom_complet}
                    onChange={(e) => setFormData({ ...formData, nom_complet: e.target.value })}
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Poste</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={formData.poste}
                    onChange={(e) => setFormData({ ...formData, poste: e.target.value })}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Département</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={formData.departement}
                    onChange={(e) => setFormData({ ...formData, departement: e.target.value })}
                  >
                    <option value="">Sélectionner...</option>
                    <option value="Vente">Vente</option>
                    <option value="Magasin">Magasin</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Date d'embauche *</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={formData.date_embauche}
                    onChange={(e) => setFormData({ ...formData, date_embauche: e.target.value })}
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Date de naissance</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={formData.date_naissance}
                    onChange={(e) => setFormData({ ...formData, date_naissance: e.target.value })}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Téléphone</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Email</span>
                  </label>
                  <input
                    type="email"
                    className="input input-bordered"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Salaire de base</span>
                  </label>
                  <MoneyInput
                    value={formData.salaire_base}
                    onChange={(v) => setFormData({ ...formData, salaire_base: v })}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Taux Commission (%)</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered"
                    value={formData.commission_taux}
                    onChange={(e) => setFormData({ ...formData, commission_taux: e.target.value })}
                    step={0.01}
                    min={0}
                    max={100}
                  />
                </div>
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
        {/* Employes List */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Employés</h2>
            {employes.length === 0 ? (
              <div className="alert alert-info">
                <span>Aucun employé</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom</th>
                      <th>Poste</th>
                      <th>Dépt.</th>
                      <th>Commission</th>
                      <th>Statut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employes.map((employe) => (
                      <tr key={employe.id} className={selectedEmploye?.id === employe.id ? 'bg-primary/10' : ''}>
                        <td className="font-medium text-xs">{employe.matricule}</td>
                        <td>{employe.nom_complet}</td>
                        <td className="text-xs">{employe.poste || '-'}</td>
                        <td><span className="badge badge-sm">{employe.departement || '-'}</span></td>
                        <td className="text-xs">{employe.commission_taux}%</td>
                        <td>{employe.actif ? <span className="badge badge-success">Actif</span> : <span className="badge badge-ghost">Inactif</span>}</td>
                        <td>
                          <button className="btn btn-sm" onClick={() => handleSelectEmploye(employe)}>
                            Détails
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Employe Details */}
        {selectedEmploye && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">{selectedEmploye.nom_complet}</h2>
              <div className="mb-4 space-y-1">
                <p className="text-sm">Matricule: <strong>{selectedEmploye.matricule}</strong></p>
                <p className="text-sm">Poste: <strong>{selectedEmploye.poste || '-'}</strong></p>
                <p className="text-sm">Département: <strong>{selectedEmploye.departement || '-'}</strong></p>
                <p className="text-sm">Date d'embauche: <strong>{new Date(selectedEmploye.date_embauche).toLocaleDateString('fr-FR')}</strong></p>
                {selectedEmploye.telephone && <p className="text-sm">Téléphone: <strong>{selectedEmploye.telephone}</strong></p>}
                {selectedEmploye.email && <p className="text-sm">Email: <strong>{selectedEmploye.email}</strong></p>}
                {selectedEmploye.salaire_base && <p className="text-sm">Salaire de base: <strong>{parseFloat(selectedEmploye.salaire_base).toFixed(2)} XOF</strong></p>}
                <p className="text-sm">Taux commission: <strong>{selectedEmploye.commission_taux}%</strong></p>
              </div>

              {commissionSummary && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Résumé des Commissions (Année en cours)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="stat bg-base-200 rounded-box p-4">
                      <div className="stat-title">Total Ventes</div>
                      <div className="stat-value text-lg">{commissionSummary.total_ventes}</div>
                      <div className="stat-desc">{parseFloat(commissionSummary.total_montant_ventes).toFixed(2)} XOF</div>
                    </div>
                    <div className="stat bg-base-200 rounded-box p-4">
                      <div className="stat-title">Total Commissions</div>
                      <div className="stat-value text-lg text-success">{parseFloat(commissionSummary.total_commissions).toFixed(2)} XOF</div>
                      <div className="stat-desc">{commissionSummary.commissions_payees} payées</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
