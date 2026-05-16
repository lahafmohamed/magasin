import { useState, useEffect } from 'react';
import { factureFournisseurService, receptionService, produitService, acompteFournisseurService } from '../services/api';
import { TiersPicker } from '../components/TiersPicker';
import { Tiers } from '../types';
import { toast } from 'sonner';
import { MoneyInput } from '../components/ui/money-input';


interface Reception {
  id: number;
  numero_reception: string;
}

interface FactureFournisseur {
  id: number;
  tiers_id: number;
  fournisseur_id?: number;
  fournisseur_nom: string;
  reception_id: number | null;
  numero_reception: string | null;
  numero_facture_fournisseur: string;
  numero_facture_interne: string;
  date_facture: string;
  date_echeance: string | null;
  sous_total: string;
  tva: string;
  total: string;
  montant_paye: string;
  reste_due: string;
  statut: string;
  condition_paiement: string | null;
  notes: string | null;
  created_at: string;
}

interface FactureDetail extends FactureFournisseur {
  lignes: {
    id: number;
    produit_id: number | null;
    produit_nom: string | null;
    produit_reference: string | null;
    description: string | null;
    quantite: number;
    prix_unitaire: string;
    tva_taux: string;
    total_ligne: string;
  }[];
}

interface Product {
  id: number;
  reference: string;
  nom: string;
}

export default function FacturesFournisseur() {
  const [factures, setFactures] = useState<FactureFournisseur[]>([]);
  const [selectedFacture, setSelectedFacture] = useState<FactureDetail | null>(null);
  const [selectedFournisseur, setSelectedFournisseur] = useState<Tiers | null>(null);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('');

  const [formData, setFormData] = useState({
    reception_id: '',
    numero_facture_fournisseur: '',
    date_facture: new Date().toISOString().split('T')[0],
    date_echeance: '',
    condition_paiement: '',
    notes: '',
    lignes: [] as Array<{ produit_id: number | null; description: string; quantite: number; prix_unitaire: number; tva_taux: number }>,
  });

  const [paymentData, setPaymentData] = useState({
    montant: '',
    methode_paiement: 'virement',
    reference: '',
  });

  const [showAcompteApply, setShowAcompteApply] = useState(false);
  const [acomptesDispo, setAcomptesDispo] = useState<Array<{ id: number; montant: string; montant_restant: string; date_acompte: string; methode_paiement: string }>>([]);
  const [acompteApplyForm, setAcompteApplyForm] = useState({ acompte_id: '', montant: '' });

  useEffect(() => {
    fetchFactures();
    fetchReceptions();
    fetchProducts();
  }, [filterStatut]);

  const fetchFactures = async () => {
    try {
      const data = await factureFournisseurService.getAll(undefined, filterStatut || undefined, undefined, 1, 20);
      setFactures(data.data || data);
    } catch (error: any) {
      console.error('Error fetching factures fournisseur:', error);
      toast.error(error.response?.data?.error || 'Erreur chargement factures');
    } finally {
      setLoading(false);
    }
  };

  const fetchReceptions = async () => {
    try {
      const data = await receptionService.getAll();
      setReceptions(data.data || data);
    } catch (error: any) {
      console.error('Error fetching réceptions:', error);
      toast.error(error.response?.data?.error || 'Erreur chargement réceptions');
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await produitService.getAll();
      setProducts(data.data || data);
    } catch {
      toast.error('Erreur chargement produits');
    }
  };

  const handleSelectFacture = async (facture: FactureFournisseur) => {
    try {
      const data = await factureFournisseurService.getById(facture.id);
      setSelectedFacture(data.data || data);
    } catch {
      toast.error('Erreur chargement détails');
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lignes: [...formData.lignes, { produit_id: null, description: '', quantite: 1, prix_unitaire: 0, tva_taux: 19 }],
    });
  };

  const removeLine = (index: number) => {
    const newLignes = formData.lignes.filter((_, i) => i !== index);
    setFormData({ ...formData, lignes: newLignes });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLignes = [...formData.lignes];
    newLignes[index] = { ...newLignes[index], [field]: value };
    setFormData({ ...formData, lignes: newLignes });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (!selectedFournisseur || !formData.numero_facture_fournisseur || !formData.date_facture) {
      toast.error('Remplissez tous les champs obligatoires');
      setSubmitting(false);
      return;
    }

    if (formData.lignes.length === 0) {
      toast.error('Ajoutez au moins une ligne');
      setSubmitting(false);
      return;
    }

    try {
      await factureFournisseurService.create({
        tiers_id: selectedFournisseur!.id,
        reception_id: formData.reception_id ? parseInt(formData.reception_id) : undefined,
        numero_facture_fournisseur: formData.numero_facture_fournisseur,
        date_facture: formData.date_facture,
        date_echeance: formData.date_echeance || undefined,
        condition_paiement: formData.condition_paiement || undefined,
        lignes: formData.lignes,
        notes: formData.notes || undefined,
      });

      toast.success('Facture fournisseur créée avec succès');
      setShowCreateForm(false);
      setSelectedFournisseur(null);
      setFormData({
        reception_id: '',
        numero_facture_fournisseur: '',
        date_facture: new Date().toISOString().split('T')[0],
        date_echeance: '',
        condition_paiement: '',
        notes: '',
        lignes: [],
      });
      fetchFactures();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur création facture');
    } finally {
      setSubmitting(false);
    }
  };

  const openAcompteApply = async () => {
    if (!selectedFacture) return;
    try {
      const list = await acompteFournisseurService.listForFournisseur(selectedFacture.tiers_id);
      setAcomptesDispo(list);
      setAcompteApplyForm({ acompte_id: '', montant: '' });
      setShowAcompteApply(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur chargement acomptes');
    }
  };

  const handleAcompteApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacture || !acompteApplyForm.acompte_id || !acompteApplyForm.montant) return;
    setSubmitting(true);
    try {
      await acompteFournisseurService.apply(parseInt(acompteApplyForm.acompte_id), {
        facture_id: Number(selectedFacture.id),
        montant: parseFloat(acompteApplyForm.montant),
      });
      toast.success('Acompte appliqué');
      setShowAcompteApply(false);
      handleSelectFacture(selectedFacture);
      fetchFactures();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur application acompte');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacture || !paymentData.montant) return;

    setSubmitting(true);
    try {
      await factureFournisseurService.recordPayment(Number(selectedFacture.id), {
        montant: Number(paymentData.montant),
        methode_paiement: paymentData.methode_paiement,
        reference: paymentData.reference || undefined,
      });
      toast.success('Paiement enregistré avec succès');
      setShowPaymentForm(false);
      setPaymentData({ montant: '', methode_paiement: 'virement', reference: '' });
      handleSelectFacture(selectedFacture);
      fetchFactures();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur paiement');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatutBadge = (statut: string) => {
    const badges: Record<string, string> = {
      'en_attente': 'badge-warning',
      'validee': 'badge-info',
      'partiellement_payee': 'badge-primary',
      'payee': 'badge-success',
      'annulee': 'badge-ghost',
    };
    return badges[statut] || 'badge-ghost';
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Factures Fournisseur</h1>
        <div className="flex gap-2">
          <select
            className="select select-bordered"
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="en_attente">En attente</option>
            <option value="validee">Validée</option>
            <option value="partiellement_payee">Partiellement payée</option>
            <option value="payee">Payée</option>
            <option value="annulee">Annulée</option>
          </select>
          <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
            + Nouvelle Facture
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card bg-base-100 shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Nouvelle Facture Fournisseur</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="form-control col-span-2">
                  <label className="label">
                    <span className="label-text">Fournisseur *</span>
                  </label>
                  <TiersPicker role="fournisseur" value={selectedFournisseur} onChange={setSelectedFournisseur} />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">N° Facture Fournisseur *</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={formData.numero_facture_fournisseur}
                    onChange={(e) => setFormData({ ...formData, numero_facture_fournisseur: e.target.value })}
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Date Facture *</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={formData.date_facture}
                    onChange={(e) => setFormData({ ...formData, date_facture: e.target.value })}
                    required
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Date Échéance</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={formData.date_echeance}
                    onChange={(e) => setFormData({ ...formData, date_echeance: e.target.value })}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Réception liée</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={formData.reception_id}
                    onChange={(e) => setFormData({ ...formData, reception_id: e.target.value })}
                  >
                    <option value="">Aucune</option>
                    {receptions.map((r) => (
                      <option key={r.id} value={r.id}>{r.numero_reception}</option>
                    ))}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Condition de paiement</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered"
                    value={formData.condition_paiement}
                    onChange={(e) => setFormData({ ...formData, condition_paiement: e.target.value })}
                    placeholder="ex: 30 jours"
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-semibold">Lignes de facture</label>
                  <button type="button" className="btn btn-sm btn-outline" onClick={addLine}>
                    + Ajouter
                  </button>
                </div>

                {formData.lignes.map((ligne, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 mb-2">
                    <select
                      className="select select-bordered col-span-4"
                      value={ligne.produit_id || ''}
                      onChange={(e) => updateLine(index, 'produit_id', e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">Produit...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.nom}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="input input-bordered col-span-2"
                      placeholder="Qté"
                      value={ligne.quantite}
                      min={1}
                      onChange={(e) => updateLine(index, 'quantite', parseInt(e.target.value))}
                    />
                    <input
                      type="number"
                      className="input input-bordered col-span-2"
                      placeholder="Prix unit."
                      value={ligne.prix_unitaire}
                      step={0.01}
                      onChange={(e) => updateLine(index, 'prix_unitaire', parseFloat(e.target.value))}
                    />
                    <input
                      type="number"
                      className="input input-bordered col-span-2"
                      placeholder="TVA %"
                      value={ligne.tva_taux}
                      onChange={(e) => updateLine(index, 'tva_taux', parseFloat(e.target.value))}
                    />
                    <button type="button" className="btn btn-sm btn-error col-span-1" onClick={() => removeLine(index)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Notes</span>
                </label>
                <textarea
                  className="textarea textarea-bordered"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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

      {/* Payment Form Modal */}
      {showPaymentForm && selectedFacture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card bg-base-100 shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Enregistrer Paiement</h2>
            <form onSubmit={handlePayment}>
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Montant *</span>
                </label>
                <MoneyInput
                  value={paymentData.montant}
                  onChange={(v) => setPaymentData({ ...paymentData, montant: v })}
                  required
                />
                <label className="label">
                  <span className="label-text text-xs">Reste dû: {selectedFacture.reste_due} XOF</span>
                </label>
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Méthode de paiement *</span>
                </label>
                <select
                  className="select select-bordered"
                  value={paymentData.methode_paiement}
                  onChange={(e) => setPaymentData({ ...paymentData, methode_paiement: e.target.value })}
                  required
                >
                  <option value="virement">Virement</option>
                  <option value="cheque">Chèque</option>
                  <option value="espece">Espèce</option>
                  <option value="carte">Carte</option>
                </select>
              </div>

              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Référence</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered"
                  value={paymentData.reference}
                  onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPaymentForm(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="loading loading-spinner"></span> : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Factures List */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Factures</h2>
            {factures.length === 0 ? (
              <div className="alert alert-info">
                <span>Aucune facture fournisseur</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>N° Interne</th>
                      <th>Fournisseur</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Statut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((facture) => (
                      <tr key={facture.id}>
                        <td className="font-medium text-xs">{facture.numero_facture_interne}</td>
                        <td>{facture.fournisseur_nom}</td>
                        <td className="text-xs">{new Date(facture.date_facture).toLocaleDateString('fr-FR')}</td>
                        <td className="font-medium">{parseFloat(facture.total).toFixed(2)} XOF</td>
                        <td><span className={`badge ${getStatutBadge(facture.statut)}`}>{facture.statut}</span></td>
                        <td>
                          <button className="btn btn-sm" onClick={() => handleSelectFacture(facture)}>
                            Voir
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

        {/* Facture Details */}
        {selectedFacture && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">{selectedFacture.numero_facture_interne}</h2>
              <div className="mb-4 space-y-1">
                <p className="text-sm">Fournisseur: <strong>{selectedFacture.fournisseur_nom}</strong></p>
                <p className="text-sm">N° Facture: <strong>{selectedFacture.numero_facture_fournisseur}</strong></p>
                <p className="text-sm">Date: <strong>{new Date(selectedFacture.date_facture).toLocaleDateString('fr-FR')}</strong></p>
                {selectedFacture.date_echeance && (
                  <p className="text-sm">Échéance: <strong>{new Date(selectedFacture.date_echeance).toLocaleDateString('fr-FR')}</strong></p>
                )}
                <p className="text-sm">Statut: <span className={`badge ${getStatutBadge(selectedFacture.statut)}`}>{selectedFacture.statut}</span></p>
              </div>

              <div className="overflow-x-auto mb-4">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Qté</th>
                      <th>Prix Unit.</th>
                      <th>TVA%</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFacture.lignes.map((ligne) => (
                      <tr key={ligne.id}>
                        <td>{ligne.produit_nom || ligne.description}</td>
                        <td>{ligne.quantite}</td>
                        <td>{parseFloat(ligne.prix_unitaire).toFixed(2)}</td>
                        <td>{ligne.tva_taux}%</td>
                        <td className="font-medium">{parseFloat(ligne.total_ligne).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                {selectedFacture.statut !== 'payee' && (
                  <>
                    <button className="btn btn-success" onClick={() => setShowPaymentForm(true)}>
                      Enregistrer Paiement
                    </button>
                    <button className="btn btn-outline" onClick={openAcompteApply}>
                      Appliquer acompte
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showAcompteApply && selectedFacture && (
          <div className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg mb-4">Appliquer acompte sur facture {selectedFacture.numero_facture_interne}</h3>
              {acomptesDispo.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun acompte disponible pour ce fournisseur.</p>
              ) : (
                <form onSubmit={handleAcompteApply} className="space-y-3">
                  <div>
                    <label className="label"><span className="label-text">Acompte *</span></label>
                    <select
                      className="select select-bordered w-full"
                      value={acompteApplyForm.acompte_id}
                      onChange={e => {
                        const ac = acomptesDispo.find(a => a.id === parseInt(e.target.value));
                        setAcompteApplyForm({
                          acompte_id: e.target.value,
                          montant: ac ? String(Math.min(parseFloat(ac.montant_restant), parseFloat(selectedFacture.reste_due))) : '',
                        });
                      }}
                      required
                    >
                      <option value="">-- Sélectionner --</option>
                      {acomptesDispo.map(a => (
                        <option key={a.id} value={a.id}>
                          #{a.id} — {new Date(a.date_acompte).toLocaleDateString()} — restant {parseFloat(a.montant_restant).toFixed(2)} ({a.methode_paiement})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label"><span className="label-text">Montant à appliquer *</span></label>
                    <MoneyInput
                      value={acompteApplyForm.montant}
                      onChange={v => setAcompteApplyForm(p => ({ ...p, montant: v }))}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Reste dû facture : {parseFloat(selectedFacture.reste_due).toFixed(2)}
                    </p>
                  </div>
                  <div className="modal-action">
                    <button type="button" className="btn btn-ghost" onClick={() => setShowAcompteApply(false)}>Annuler</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? 'Application...' : 'Appliquer'}
                    </button>
                  </div>
                </form>
              )}
              {acomptesDispo.length === 0 && (
                <div className="modal-action">
                  <button className="btn btn-ghost" onClick={() => setShowAcompteApply(false)}>Fermer</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
