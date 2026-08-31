import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, FileText, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { SortableHeader, toggleSort, SortState } from '@/components/ui/sortable-header';
import { factureFournisseurService, receptionService, produitService, acompteFournisseurService } from '../services/api';
import { TiersPicker } from '../components/TiersPicker';
import { Tiers } from '../types';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errors';
import { MoneyInput } from '../components/ui/money-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryState } from '@/components/ui/query-state';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { formatCurrency, formatDateShort } from '../utils/format';
import { formatPaymentMethod } from '../utils/paymentMethod';


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
    total_ligne: string;
  }[];
}

interface Product {
  id: number;
  reference: string;
  nom: string;
}

// Statuts propres aux factures fournisseur — non couverts par <StatusBadge>
// (pas de type "facture fournisseur") ; map locale sur les variantes sémantiques de <Badge>.
const STATUT_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' }> = {
  en_attente: { label: 'En attente', variant: 'warning' },
  validee: { label: 'Validée', variant: 'info' },
  partiellement_payee: { label: 'Partielle', variant: 'default' },
  payee: { label: 'Payée', variant: 'success' },
  annulee: { label: 'Annulée', variant: 'secondary' },
};

function StatutBadge({ statut }: { statut: string }) {
  const config = STATUT_CONFIG[statut];
  if (!config) return <Badge variant="outline">{statut}</Badge>;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const TABLE_HEAD = 'h-auto px-1 py-1.5 font-medium text-xs';

export default function FacturesFournisseur() {
  const [factures, setFactures] = useState<FactureFournisseur[]>([]);
  const [selectedFacture, setSelectedFacture] = useState<FactureDetail | null>(null);
  const [selectedFactureId, setSelectedFactureId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);
  const [selectedFournisseur, setSelectedFournisseur] = useState<Tiers | null>(null);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Recherche serveur (n° interne, n° fournisseur, raison sociale) — débouncée
  // pour ne pas requêter à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Pagination serveur (l'API renvoie { data, pagination: { total, totalPages } }).
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Tri client sur la page courante uniquement (le backend ne supporte pas de
  // paramètre de tri sur cette liste — ORDER BY date_facture DESC fixe).
  type FactureSortKey = 'numero_facture_interne' | 'fournisseur_nom' | 'date_facture' | 'total';
  const [sort, setSort] = useState<SortState<FactureSortKey> | null>(null);
  const handleSort = (key: FactureSortKey) => setSort((s) => toggleSort(s, key));

  const [formData, setFormData] = useState({
    reception_id: '',
    numero_facture_fournisseur: '',
    date_facture: new Date().toISOString().split('T')[0],
    date_echeance: '',
    condition_paiement: '',
    notes: '',
    lignes: [] as Array<{ produit_id: number | null; description: string; quantite: number; prix_unitaire: number }>,
  });

  const [paymentData, setPaymentData] = useState({
    montant: '',
    methode_paiement: 'virement',
    reference: '',
  });

  const [showAcompteApply, setShowAcompteApply] = useState(false);
  const [acomptesDispo, setAcomptesDispo] = useState<Array<{ id: number; montant: string; montant_restant: string; date_acompte: string; methode_paiement: string }>>([]);
  const [acompteApplyForm, setAcompteApplyForm] = useState({ acompte_id: '', montant: '' });

  const fetchFactures = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await factureFournisseurService.getAll(debouncedSearch || undefined, filterStatut || undefined, undefined, page, limit);
      const rows = data.data || data;
      setFactures(Array.isArray(rows) ? rows : []);
      setTotal(data.pagination?.total ?? (Array.isArray(rows) ? rows.length : 0));
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors du chargement des factures fournisseur'));
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatut, page, limit]);

  const fetchReceptions = async () => {
    try {
      const data = await receptionService.getAll();
      setReceptions(data.data || data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors du chargement des réceptions'));
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await produitService.getAll();
      setProducts(data.data || data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erreur lors du chargement des produits'));
    }
  };

  const loadFactureDetail = useCallback(async (id: number) => {
    setSelectedFactureId(id);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await factureFournisseurService.getById(id);
      setSelectedFacture(data.data || data);
    } catch (error) {
      setSelectedFacture(null);
      setDetailError(error);
      toast.error(getErrorMessage(error, 'Erreur lors du chargement du détail de la facture'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFactures();
  }, [fetchFactures]);

  useEffect(() => {
    fetchReceptions();
    fetchProducts();
  }, []);

  const addLine = () => {
    setFormData({
      ...formData,
      lignes: [...formData.lignes, { produit_id: null, description: '', quantite: 1, prix_unitaire: 0 }],
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

      toast.success('Facture fournisseur créée');
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
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la création de la facture'));
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
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors du chargement des acomptes'));
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
      loadFactureDetail(selectedFacture.id);
      fetchFactures();
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'application de l'acompte"));
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
      toast.success('Paiement enregistré');
      setShowPaymentForm(false);
      setPaymentData({ montant: '', methode_paiement: 'virement', reference: '' });
      loadFactureDetail(selectedFacture.id);
      fetchFactures();
    } catch (err) {
      toast.error(getErrorMessage(err, "Erreur lors de l'enregistrement du paiement"));
    } finally {
      setSubmitting(false);
    }
  };

  const sortedFactures = useMemo(() => {
    if (!sort) return factures;
    const arr = [...factures];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'total':
          cmp = parseFloat(a.total) - parseFloat(b.total);
          break;
        case 'date_facture':
          cmp = new Date(a.date_facture).getTime() - new Date(b.date_facture).getTime();
          break;
        default:
          cmp = String(a[sort.key]).localeCompare(String(b[sort.key]), 'fr');
          break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [factures, sort]);

  return (
    <div className="container mx-auto p-6">
      <PageHeader
        title="Factures fournisseur"
        className="mb-6"
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par n° de facture ou fournisseur…"
                aria-label="Rechercher une facture fournisseur"
                className="pl-9 w-full sm:w-80"
              />
            </div>
            <Select
              value={filterStatut === '' ? '__all' : filterStatut}
              onValueChange={(v) => {
                setFilterStatut(v === '__all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-auto" aria-label="Filtrer par statut">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Tous les statuts</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="validee">Validée</SelectItem>
                <SelectItem value="partiellement_payee">Partiellement payée</SelectItem>
                <SelectItem value="payee">Payée</SelectItem>
                <SelectItem value="annulee">Annulée</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowCreateForm(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouvelle facture
            </Button>
          </>
        }
      />

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle facture fournisseur</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="ff-fournisseur">Fournisseur *</Label>
                <TiersPicker id="ff-fournisseur" role="fournisseur" value={selectedFournisseur} onChange={setSelectedFournisseur} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ff-num">N° facture fournisseur *</Label>
                <Input id="ff-num" value={formData.numero_facture_fournisseur} onChange={(e) => setFormData({ ...formData, numero_facture_fournisseur: e.target.value })} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ff-date">Date facture *</Label>
                <DatePicker id="ff-date" value={formData.date_facture} onChange={(date_facture) => setFormData({ ...formData, date_facture })} required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ff-ech">Date échéance</Label>
                <DatePicker id="ff-ech" value={formData.date_echeance} onChange={(date_echeance) => setFormData({ ...formData, date_echeance })} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ff-rec">Réception liée</Label>
                <Select
                  value={formData.reception_id === '' ? '__none' : formData.reception_id}
                  onValueChange={(v) => setFormData({ ...formData, reception_id: v === '__none' ? '' : v })}
                >
                  <SelectTrigger id="ff-rec">
                    <SelectValue placeholder="Aucune" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Aucune</SelectItem>
                    {receptions.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.numero_reception}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ff-cond">Condition de paiement</Label>
                <Input id="ff-cond" value={formData.condition_paiement} onChange={(e) => setFormData({ ...formData, condition_paiement: e.target.value })} placeholder="ex: 30 jours" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium">Lignes de facture</p>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </div>

              <div className="space-y-2">
                {formData.lignes.map((ligne, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2">
                    <Select
                      value={ligne.produit_id ? String(ligne.produit_id) : '__none'}
                      onValueChange={(v) => updateLine(index, 'produit_id', v === '__none' ? null : parseInt(v))}
                    >
                      <SelectTrigger className="col-span-5" aria-label="Produit">
                        <SelectValue placeholder="Produit…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Produit…</SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" inputMode="numeric"
                      className="col-span-3 num"
                      placeholder="Qté"
                      value={ligne.quantite}
                      min={1}
                      onChange={(e) => updateLine(index, 'quantite', parseInt(e.target.value))}
                    />
                    <Input
                      type="number" inputMode="decimal"
                      className="col-span-3 num"
                      placeholder="Prix unit."
                      value={ligne.prix_unitaire}
                      step={0.01}
                      onChange={(e) => updateLine(index, 'prix_unitaire', parseFloat(e.target.value))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="col-span-1 h-9 w-9 p-0 text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                      onClick={() => removeLine(index)}
                      aria-label="Supprimer la ligne"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ff-notes">Notes</Label>
              <Textarea id="ff-notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreateForm(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner className="mr-2" />
                    Création…
                  </>
                ) : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentForm && !!selectedFacture} onOpenChange={(open) => { if (!open) setShowPaymentForm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer paiement</DialogTitle>
          </DialogHeader>
          {selectedFacture && (
            <form onSubmit={handlePayment} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ff-paiement-montant">Montant *</Label>
                <MoneyInput
                  id="ff-paiement-montant"
                  value={paymentData.montant}
                  onChange={(v) => setPaymentData({ ...paymentData, montant: v })}
                  required
                />
                <p className="text-xs text-muted-foreground num">Reste dû: {formatCurrency(selectedFacture.reste_due)}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-meth">Méthode de paiement *</Label>
                <Select
                  value={paymentData.methode_paiement}
                  onValueChange={(v) => setPaymentData({ ...paymentData, methode_paiement: v })}
                >
                  <SelectTrigger id="pay-meth">
                    <SelectValue placeholder="Méthode de paiement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virement">Virement</SelectItem>
                    <SelectItem value="cheque">Chèque</SelectItem>
                    <SelectItem value="espece">Espèces</SelectItem>
                    <SelectItem value="carte">Carte</SelectItem>
                    <SelectItem value="wave">Wave</SelectItem>
                    <SelectItem value="orange_money">Orange Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">Référence</Label>
                <Input id="pay-ref" value={paymentData.reference} onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })} />
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setShowPaymentForm(false)}>Annuler</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner className="mr-2" />
                      Enregistrement…
                    </>
                  ) : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAcompteApply && !!selectedFacture} onOpenChange={(open) => { if (!open) setShowAcompteApply(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedFacture && `Appliquer acompte sur facture ${selectedFacture.numero_facture_interne}`}
            </DialogTitle>
          </DialogHeader>
          {selectedFacture && (
            acomptesDispo.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">Aucun acompte disponible pour ce fournisseur.</p>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setShowAcompteApply(false)}>Fermer</Button>
                </DialogFooter>
              </>
            ) : (
              <form onSubmit={handleAcompteApply} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ac-id">Acompte *</Label>
                  <Select
                    value={acompteApplyForm.acompte_id === '' ? '__none' : acompteApplyForm.acompte_id}
                    onValueChange={v => {
                      const val = v === '__none' ? '' : v;
                      const ac = acomptesDispo.find(a => a.id === parseInt(val));
                      setAcompteApplyForm({
                        acompte_id: val,
                        montant: ac ? String(Math.min(parseFloat(ac.montant_restant), parseFloat(selectedFacture.reste_due))) : '',
                      });
                    }}
                  >
                    <SelectTrigger id="ac-id">
                      <SelectValue placeholder="— Sélectionner —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Sélectionner —</SelectItem>
                      {acomptesDispo.map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          #{a.id} — {formatDateShort(a.date_acompte)} — restant {formatCurrency(a.montant_restant)} ({formatPaymentMethod(a.methode_paiement)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ff-acompte-montant">Montant à appliquer *</Label>
                  <MoneyInput
                    id="ff-acompte-montant"
                    value={acompteApplyForm.montant}
                    onChange={v => setAcompteApplyForm(p => ({ ...p, montant: v }))}
                    required
                  />
                  <p className="text-xs text-muted-foreground num">
                    Reste dû facture: {formatCurrency(selectedFacture.reste_due)}
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setShowAcompteApply(false)}>Annuler</Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Spinner className="mr-2" />
                        Application…
                      </>
                    ) : 'Appliquer'}
                  </Button>
                </DialogFooter>
              </form>
            )
          )}
        </DialogContent>
      </Dialog>

      <div className={`grid grid-cols-1 gap-6 ${selectedFactureId !== null ? 'lg:grid-cols-2' : ''}`}>
        <div className="rounded-md border bg-card shadow-sm">
          <div className="p-5">
            <h2 className="text-lg font-semibold mb-3">Factures</h2>
            <QueryState
              loading={loading}
              error={loadError}
              isEmpty={factures.length === 0}
              onRetry={fetchFactures}
              skeleton={<TableSkeleton rows={10} columns={6} />}
              emptyTitle="Aucune facture fournisseur"
              emptyIcon={FileText}
            >
              <ResponsiveTable
                table={
                  <div className="rounded-md border">
                    <Table className="text-xs">
                      <TableHeader className="bg-muted/50">
                        <TableRow className="text-xs uppercase tracking-wide hover:bg-transparent">
                          <SortableHeader columnKey="numero_facture_interne" sort={sort} onSort={handleSort} buttonClassName="px-1 sm:px-1.5 py-1.5 text-xs">N° interne</SortableHeader>
                          <SortableHeader columnKey="fournisseur_nom" sort={sort} onSort={handleSort} buttonClassName="px-1 sm:px-1.5 py-1.5 text-xs">Fournisseur</SortableHeader>
                          <SortableHeader columnKey="date_facture" sort={sort} onSort={handleSort} buttonClassName="px-1 sm:px-1.5 py-1.5 text-xs">Date</SortableHeader>
                          <SortableHeader columnKey="total" sort={sort} onSort={handleSort} align="right" buttonClassName="px-1 sm:px-1.5 py-1.5 text-xs">Total</SortableHeader>
                          <TableHead className={TABLE_HEAD}>Statut</TableHead>
                          <TableHead className={TABLE_HEAD}>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedFactures.map((facture) => (
                          <TableRow key={facture.id} className="hover:bg-muted/30">
                            <TableCell className="px-1 py-1.5 font-medium text-xs num">{facture.numero_facture_interne}</TableCell>
                            <TableCell className="px-1 py-1.5">{facture.fournisseur_nom}</TableCell>
                            <TableCell className="px-1 py-1.5 text-xs num">{formatDateShort(facture.date_facture)}</TableCell>
                            <TableCell className="px-1 py-1.5 text-right font-medium num">{formatCurrency(facture.total)}</TableCell>
                            <TableCell className="px-1 py-1.5">
                              <StatutBadge statut={facture.statut} />
                            </TableCell>
                            <TableCell className="px-1 py-1.5">
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => loadFactureDetail(facture.id)}>Voir</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                }
                cards={sortedFactures.map((facture) => (
                  <DataCard
                    key={facture.id}
                    title={facture.numero_facture_interne}
                    badge={<StatutBadge statut={facture.statut} />}
                    onClick={() => loadFactureDetail(facture.id)}
                  >
                    <DataCardRow label="Fournisseur" value={facture.fournisseur_nom} />
                    <DataCardRow label="Date" value={<span className="num">{formatDateShort(facture.date_facture)}</span>} />
                    <DataCardRow label="Total" value={<span className="font-medium num">{formatCurrency(facture.total)}</span>} />
                  </DataCard>
                ))}
              />
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(l) => {
                  setLimit(l);
                  setPage(1);
                }}
              />
            </QueryState>
          </div>
        </div>

        {selectedFactureId !== null && (
          <div className="rounded-md border bg-card shadow-sm">
            <div className="p-5">
              <QueryState
                loading={detailLoading}
                error={detailError}
                onRetry={() => loadFactureDetail(selectedFactureId)}
                skeleton={<CardSkeleton lines={6} />}
              >
                {selectedFacture && (
                  <>
                    <h2 className="text-lg font-semibold mb-3">{selectedFacture.numero_facture_interne}</h2>
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Fournisseur:</p>
                        <p className="font-semibold">{selectedFacture.fournisseur_nom}</p>
                        <p className="text-muted-foreground mt-2">N° facture:</p>
                        <p className="font-semibold">{selectedFacture.numero_facture_fournisseur}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-muted-foreground">Date:</p>
                        <p className="font-semibold">{formatDateShort(selectedFacture.date_facture)}</p>
                        {selectedFacture.date_echeance && (
                          <>
                            <p className="text-muted-foreground mt-2">Échéance:</p>
                            <p className="font-semibold">{formatDateShort(selectedFacture.date_echeance)}</p>
                          </>
                        )}
                      </div>
                      <div className="col-span-2 border-t pt-3 flex justify-between items-center">
                        <span className="text-muted-foreground">Statut:</span>
                        <StatutBadge statut={selectedFacture.statut} />
                      </div>
                    </div>

                    <div className="mb-4 p-3 bg-muted/40 rounded-md border text-sm space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Facture:</span>
                        <span className="font-semibold">{formatCurrency(selectedFacture.total)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Montant payé:</span>
                        <span className="font-semibold text-success-700">{formatCurrency(selectedFacture.montant_paye)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1.5 font-bold">
                        <span>Reste à payer:</span>
                        <span className={parseFloat(selectedFacture.reste_due) > 0 ? "text-danger-600" : "text-success-600"}>
                          {formatCurrency(selectedFacture.reste_due)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-md border mb-4">
                      {selectedFacture.lignes.length === 0 ? (
                        <EmptyState
                          icon={FileText}
                          title="Aucune ligne"
                          description="Cette facture ne comporte aucune ligne."
                          className="py-8"
                        />
                      ) : (
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow className="text-xs uppercase tracking-wide hover:bg-transparent">
                              <TableHead className="h-auto px-3 py-2 text-xs">Produit</TableHead>
                              <TableHead className="h-auto px-3 py-2 text-xs text-right">Qté</TableHead>
                              <TableHead className="h-auto px-3 py-2 text-xs text-right">Prix unit.</TableHead>
                              <TableHead className="h-auto px-3 py-2 text-xs text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedFacture.lignes.map((ligne) => (
                              <TableRow key={ligne.id}>
                                <TableCell className="px-3 py-2">{ligne.produit_nom || ligne.description}</TableCell>
                                <TableCell className="px-3 py-2 text-right num">{ligne.quantite}</TableCell>
                                <TableCell className="px-3 py-2 text-right num">{formatCurrency(ligne.prix_unitaire)}</TableCell>
                                <TableCell className="px-3 py-2 text-right font-medium num">{formatCurrency(ligne.total_ligne)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {selectedFacture.statut !== 'payee' && (
                        <>
                          <Button variant="success" onClick={() => setShowPaymentForm(true)}>
                            Enregistrer paiement
                          </Button>
                          <Button variant="outline" onClick={openAcompteApply}>
                            Appliquer acompte
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </QueryState>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
