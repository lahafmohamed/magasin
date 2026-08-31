import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commandeService, produitService } from '../services/api';
import { useAuth } from '../lib/AuthContext';
import { TiersPicker } from '../components/TiersPicker';
import { Tiers } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableHeader, type SortState } from '@/components/ui/sortable-header';
import { Pagination } from '@/components/ui/pagination';
import { LoadingState, Spinner } from '@/components/ui/loading';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryState } from '@/components/ui/query-state';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import {
  Plus, Search, Trash2, ShoppingCart, CheckCircle, Clock,
  Truck, XCircle, Package, ArrowLeft, Calendar,
  X, AlertTriangle, BookOpen,
  TrendingUp
} from 'lucide-react';
import { formatCurrency, normalizeSearch } from '@/utils/format';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/utils/errors';

export default function Commandes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const canCreate = ['admin', 'manager', 'depot_staff'].includes(user?.role || '');
  
  const [commandes, setCommandes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Server-side pagination (list was previously fetch-all + client-sorted)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [selectedFournisseur, setSelectedFournisseur] = useState<Tiers | null>(null);
  const [produitSearch, setProduitSearch] = useState('');
  const [produits, setProduits] = useState<any[]>([]);
  const [lignes, setLignes] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [dateLivraison, setDateLivraison] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Catalog Drawer states
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');

  // Quick product creation
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateNom, setQuickCreateNom] = useState('');
  const [quickCreateReference, setQuickCreateReference] = useState('');
  const [quickCreatePrix, setQuickCreatePrix] = useState('');
  const [quickCreateCategorie, setQuickCreateCategorie] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever the filters or sort change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sortKey, sortOrder]);

  useEffect(() => {
    loadCommandes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, sortKey, sortOrder, page, limit]);

  const loadCommandes = async () => {
    setLoading(true);
    setError(null);
    try {
      const statut = statusFilter === 'all' ? undefined : statusFilter;
      const res = await commandeService.getAll(normalizeSearch(debouncedSearch), statut, page, limit, sortKey, sortOrder);
      setCommandes(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 0);
    } catch (err) {
      // Erreur conservée en état → QueryState propose « Réessayer » au lieu de
      // laisser une liste vide derrière un toast qui disparaît.
      setError(err);
      setCommandes([]);
      toast.error('Erreur lors du chargement');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (produitSearch.length >= 2) {
      produitService.searchFuzzy(produitSearch, 10, 0.1).then(setProduits).catch(console.error);
    } else {
      setProduits([]);
    }
  }, [produitSearch]);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const data = await produitService.getAll(undefined, undefined, false, 1, 100);
      setCatalogProducts(data.data || data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (showCatalog) {
      loadCatalog();
    }
  }, [showCatalog]);

  const addProduit = (produit: any) => {
    const exists = lignes.find((l) => l.produit_id === produit.id);
    if (exists) {
      toast.warning('Ce produit est déjà dans la commande');
      return;
    }
    setLignes([...lignes, {
      produit_id: produit.id,
      produit_nom: produit.nom,
      produit_reference: produit.reference,
      quantite: 1,
      prix_unitaire: parseFloat(produit.prix_achat) || 0,
      stock: produit.stock || 0,
      stock_min: produit.stock_min || 0
    }]);
    setProduitSearch('');
    setProduits([]);
  };

  const openQuickCreate = () => {
    setQuickCreateNom(produitSearch);
    setQuickCreateReference('');
    setQuickCreatePrix('');
    setQuickCreateCategorie('');
    setShowQuickCreate(true);
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCreateNom || !quickCreateReference) {
      toast.error('Le nom et la référence sont requis');
      return;
    }
    setQuickCreating(true);
    try {
      const result = await produitService.create({
        nom: quickCreateNom,
        reference: quickCreateReference,
        prix_achat: parseFloat(quickCreatePrix) || 0,
        prix_vente: parseFloat(quickCreatePrix) || 0,
        categorie: quickCreateCategorie || null,
        description: '',
        stock: 0,
        stock_min: 0,
      });
      setShowQuickCreate(false);
      addProduit({ id: result.id, nom: quickCreateNom, reference: quickCreateReference, prix_achat: parseFloat(quickCreatePrix) || 0, stock: 0, stock_min: 0 });
      toast.success(`Produit "${quickCreateNom}" créé et ajouté à la commande`);
    } catch (error) {
      toast.error('Erreur lors de la création du produit');
      console.error(error);
    } finally {
      setQuickCreating(false);
    }
  };

  const updateQuantite = (index: number, quantite: number) => {
    const newLignes = [...lignes];
    newLignes[index].quantite = Math.max(1, quantite);
    setLignes(newLignes);
  };

  const updatePrix = (index: number, prix: number) => {
    const newLignes = [...lignes];
    newLignes[index].prix_unitaire = Math.max(0, prix);
    setLignes(newLignes);
  };

  const removeLigne = (index: number) => {
    setLignes(lignes.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFournisseur) {
      toast.error('Veuillez sélectionner un fournisseur');
      return;
    }
    if (lignes.length === 0) {
      toast.error('Veuillez ajouter au moins un produit');
      return;
    }

    setSubmitting(true);
    try {
      const result = await commandeService.create({
        tiers_id: selectedFournisseur!.id,
        lignes: lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
        })),
        notes: notes || undefined,
        date_livraison_prevue: dateLivraison || undefined,
      });
      toast.success(`Commande ${result.numero_commande} créée avec succès!`);
      resetForm();
      loadCommandes();
    } catch (error) {
      toast.error('Erreur lors de la création de la commande');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedFournisseur(null);
    setLignes([]);
    setNotes('');
    setDateLivraison('');
    setProduitSearch('');
  };

  const updateStatut = async (e: React.MouseEvent, id: number, statut: string) => {
    e.stopPropagation(); // Avoid triggering row navigation
    const confirmOpts =
      statut === 'annulee'
        ? { title: 'Annuler cette commande ?', description: 'La commande fournisseur sera annulée.', confirmLabel: 'Annuler la commande', cancelLabel: 'Retour', destructive: true }
        : statut === 'validee'
          ? { title: 'Valider cette commande ?', description: 'La commande sera validée et prête à être expédiée par le fournisseur.', confirmLabel: 'Valider' }
          : { title: 'Marquer la commande comme expédiée ?', confirmLabel: 'Marquer comme expédiée' };
    if (!(await confirm(confirmOpts))) return;
    try {
      await commandeService.updateStatut(id, statut);
      loadCommandes();
      toast.success('Statut mis à jour');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur lors de la mise à jour'));
    }
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'en_attente':
        return <Badge variant="warning" className="gap-1"><Clock className="h-3 w-3" /> En attente</Badge>;
      case 'validee':
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Validée</Badge>;
      case 'expediee':
        return <Badge variant="info" className="gap-1"><Truck className="h-3 w-3" /> Expédiée</Badge>;
      case 'livree':
        return <Badge variant="success" className="gap-1"><Package className="h-3 w-3" /> Livrée</Badge>;
      case 'annulee':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Annulée</Badge>;
      default:
        return <Badge variant="outline">{statut}</Badge>;
    }
  };

  // KPI Calculations
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const stats = commandes.reduce((acc, c) => {
    const cDate = new Date(c.date_commande);
    const isThisMonth = cDate.getMonth() === currentMonth && cDate.getFullYear() === currentYear;
    
    if (isThisMonth && c.statut !== 'annulee') {
      acc.totalMonth += parseFloat(c.sous_total) || 0;
    }
    
    if (c.statut === 'en_attente') {
      acc.pendingCount += 1;
    }
    
    if (c.statut !== 'livree' && c.statut !== 'annulee' && c.date_livraison_prevue) {
      const isLate = c.date_livraison_prevue.split('T')[0] < todayStr;
      if (isLate) {
        acc.lateCount += 1;
      }
    }
    
    return acc;
  }, { totalMonth: 0, pendingCount: 0, lateCount: 0 });

  // Sorting logic
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const ordersSort: SortState = { key: sortKey, dir: sortOrder };

  // Rows arrive already sorted + paginated from the server.
  const sortedCommandes = commandes;

  // Catalog Drawer filters
  const filteredCatalog = catalogProducts.filter((p) => {
    const matchesSearch = p.nom.toLowerCase().includes(catalogSearch.toLowerCase()) || 
                          p.reference.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCategory = catalogCategory === 'all' || p.categorie === catalogCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(catalogProducts.map(p => p.categorie).filter(Boolean)));

  const grandTotal = lignes.reduce((sum, item) => sum + (item.quantite * item.prix_unitaire), 0);

  // VIEW 1: Full-Page creation workspace
  if (showForm) {
    return (
      <div className="p-3 sm:p-6 w-full max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={resetForm}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingCart className="h-8 w-8 text-primary" />
              Nouvelle commande fournisseur
            </h1>
            <p className="text-muted-foreground mt-1">Créez un bon de commande pour réapprovisionner vos stocks</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Metadata */}
          <div className="md:col-span-1 space-y-6">
            <Card className="shadow-md border-border/85">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Fournisseur
                </CardTitle>
                <CardDescription>Sélectionnez le tiers fournisseur</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cmd-fournisseur">Fournisseur *</Label>
                  <TiersPicker id="cmd-fournisseur" role="fournisseur" value={selectedFournisseur} onChange={setSelectedFournisseur} />
                </div>
                {selectedFournisseur && (
                  <div className="p-3 bg-muted/40 rounded-md border text-xs space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    <p className="font-semibold text-foreground">{selectedFournisseur.raison_sociale}</p>
                    {selectedFournisseur.email && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <span className="font-semibold">Email:</span> {selectedFournisseur.email}
                      </p>
                    )}
                    {selectedFournisseur.telephone && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <span className="font-semibold">Tél:</span> {selectedFournisseur.telephone}
                      </p>
                    )}
                    {selectedFournisseur.adresse && (
                      <p className="text-muted-foreground flex items-center gap-1 flex-wrap">
                        <span className="font-semibold">Adresse:</span> {selectedFournisseur.adresse}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-md border-border/85">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Livraison & Notes
                </CardTitle>
                <CardDescription>Informations prévisionnelles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="date_livraison">Date de livraison prévue</Label>
                  <DatePicker
                    id="date_livraison"
                    value={dateLivraison}
                    onChange={setDateLivraison}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes publiques ou internes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Instructions de livraison, références, etc."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Items Table */}
          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-md border-border/85 flex flex-col h-full min-h-[500px]">
              <CardHeader className="pb-3 flex-row justify-between items-center space-y-0">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    Articles commandés
                  </CardTitle>
                  <CardDescription>Ajoutez des articles et gérez les quantités</CardDescription>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowCatalog(true)}
                  className="gap-2 border-primary/40 hover:bg-primary/5 text-primary"
                >
                  <BookOpen className="h-4 w-4" />
                  Parcourir le catalogue
                </Button>
              </CardHeader>
              
              <CardContent className="flex-1 space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher rapidement par nom ou référence pour ajouter…"
                    value={produitSearch}
                    onChange={(e) => setProduitSearch(e.target.value)}
                    className="pl-10 sm:pl-10 h-10 border-muted-foreground/30 focus-visible:ring-primary"
                  />
                  {produits.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-border">
                      {produits.map((p) => {
                        const isLowStock = p.stock <= p.stock_min;
                        return (
                          <li
                            key={p.id}
                            className="px-3 py-2.5 hover:bg-muted/50 cursor-pointer flex justify-between items-center transition-colors"
                            onMouseDown={() => addProduit(p)}
                          >
                            <div>
                              <p className="text-sm font-semibold">{p.nom}</p>
                              <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-primary">{formatCurrency(p.prix_achat)}</p>
                              <p className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${isLowStock ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'}`}>
                                Stock: {p.stock} (Min: {p.stock_min})
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {produitSearch.length >= 2 && produits.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg">
                      <EmptyState
                        icon={AlertTriangle}
                        title={`Aucun produit ne correspond à « ${produitSearch} »`}
                        description="Vérifiez l'orthographe ou créez la fiche produit maintenant."
                        className="py-6"
                        action={
                          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={openQuickCreate}>
                            <Plus className="h-3.5 w-3.5" />
                            Créer "{produitSearch}"
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Table of selected items */}
                {lignes.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-12 text-center flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="font-semibold text-sm">Le panier est vide</p>
                    <p className="text-xs mt-1 max-w-[280px]">Recherchez des articles ci-dessus ou parcourez le catalogue pour garnir la commande.</p>
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden bg-card/30">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[120px]">Réf</TableHead>
                          <TableHead>Désignation</TableHead>
                          <TableHead className="w-[100px] text-center">Quantité</TableHead>
                          <TableHead className="w-[140px]">Prix Unitaire</TableHead>
                          <TableHead className="w-[120px] text-right">Total</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lignes.map((ligne, index) => {
                          const isLowStock = ligne.stock <= ligne.stock_min;
                          return (
                            <TableRow key={index} className="hover:bg-muted/20">
                              <TableCell className="font-mono text-xs font-semibold">{ligne.produit_reference}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-semibold text-sm">{ligne.produit_nom}</p>
                                  <div className="flex gap-2 items-center mt-1">
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${isLowStock ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'}`}>
                                      Stock: {ligne.stock} / Min: {ligne.stock_min}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number" inputMode="numeric"
                                  className="w-16 h-8 text-center"
                                  min="1"
                                  value={ligne.quantite}
                                  onChange={(e) => updateQuantite(index, parseInt(e.target.value) || 1)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="relative">
                                  <Input
                                    type="number" inputMode="decimal"
                                    className="w-28 h-8 pl-1 text-xs"
                                    step="0.01"
                                    value={ligne.prix_unitaire}
                                    onChange={(e) => updatePrix(index, parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="font-bold text-right text-sm">
                                {formatCurrency(ligne.quantite * ligne.prix_unitaire)}
                              </TableCell>
                              <TableCell>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0" onClick={() => removeLigne(index)} aria-label="Retirer cet article">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>

              {/* Total Summary */}
              {lignes.length > 0 && (
                <div className="p-4 border-t bg-muted/30 flex justify-between items-center rounded-b-lg">
                  <div className="text-xs text-muted-foreground font-semibold">
                    {lignes.length} article(s) distincts
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block font-semibold uppercase">Total à commander</span>
                    <span className="text-2xl font-black text-primary">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              )}
            </Card>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={resetForm} className="border-border hover:bg-muted">
                Annuler
              </Button>
              <Button type="submit" disabled={submitting || !selectedFournisseur || lignes.length === 0} className="shadow-lg shadow-primary/20">
                {submitting ? (
                  <>
                    <Spinner className="mr-2" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Créer la commande
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Quick Product Creation Modal */}
        <Dialog open={showQuickCreate} onOpenChange={setShowQuickCreate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nouveau produit</DialogTitle>
              <DialogDescription>
                Créez rapidement un produit et ajoutez-le à la commande
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleQuickCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qc_nom">Nom du produit *</Label>
                <Input id="qc_nom" value={quickCreateNom} onChange={e => setQuickCreateNom(e.target.value)} placeholder="Ex: Clavier USB" autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qc_ref">Référence *</Label>
                <Input id="qc_ref" value={quickCreateReference} onChange={e => setQuickCreateReference(e.target.value)} placeholder="Ex: CLV-001" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qc_prix">Prix d'achat (FCFA)</Label>
                  <Input id="qc_prix" type="number" inputMode="decimal" step="0.01" value={quickCreatePrix} onChange={e => setQuickCreatePrix(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qc_cat">Catégorie</Label>
                  <Input id="qc_cat" value={quickCreateCategorie} onChange={e => setQuickCreateCategorie(e.target.value)} placeholder="Ex: Périphériques" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowQuickCreate(false)}>Annuler</Button>
                <Button type="submit" disabled={quickCreating || !quickCreateNom || !quickCreateReference}>
                  {quickCreating ? <><Spinner className="mr-1" /> Création…</> : 'Créer & Ajouter'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Tiroir catalogue */}
        <Sheet open={showCatalog} onOpenChange={setShowCatalog}>
          <SheetContent side="right" showClose={false}>
          <div className="p-4 border-b flex justify-between items-center bg-muted/40">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Catalogue produits
              </SheetTitle>
              <SheetDescription className="text-xs">Sélectionnez les articles à ajouter</SheetDescription>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="sm" aria-label="Fermer le catalogue">
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          </div>

          {/* Filter Controls */}
          <div className="p-4 border-b space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Rechercher…" 
                  value={catalogSearch} 
                  onChange={e => setCatalogSearch(e.target.value)}
                  className="pl-8 sm:pl-8 text-sm h-9"
              />
            </div>
            
            <Select value={catalogCategory} onValueChange={setCatalogCategory}>
              <SelectTrigger className="w-full h-9 text-xs" aria-label="Filtrer par catégorie">
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat} value={String(cat)}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Product List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {catalogLoading ? (
              <LoadingState />
            ) : filteredCatalog.length === 0 ? (
              <EmptyState icon={Package} title="Aucun produit trouvé" />
            ) : (
              filteredCatalog.map((p) => {
                const inCart = lignes.some(l => l.produit_id === p.id);
                const isLowStock = p.stock <= p.stock_min;
                return (
                  <div key={p.id} className="p-3 border rounded-lg hover:bg-muted/30 transition-colors flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.nom}</p>
                      <p className="text-xs font-mono text-muted-foreground">{p.reference}</p>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="text-xs font-bold text-primary">{formatCurrency(p.prix_achat)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLowStock ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'}`}>
                          Stock: {p.stock} (Min: {p.stock_min})
                        </span>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant={inCart ? "secondary" : "default"}
                      disabled={inCart}
                      onClick={() => addProduit(p)}
                    >
                      {inCart ? "Ajouté" : "Ajouter"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // VIEW 2: Default Orders list
  return (
    <div className="p-3 sm:p-6 w-full space-y-6">
      {/* Page Title & Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-8 w-8 text-primary" />
            Commandes fournisseur
          </h1>
          <p className="text-muted-foreground mt-1">Gérez le réapprovisionnement et le suivi des stocks</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" />
            Nouvelle commande
          </Button>
        )}
      </div>

      {/* KPI Cards section (Glassmorphism inspired) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Month Volume */}
        <Card className="bg-card/40 backdrop-blur-md border border-border/60 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commande ce mois</span>
              <h2 className="text-xl sm:text-2xl font-black text-foreground">{formatCurrency(stats.totalMonth)}</h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-success-500/10 flex items-center justify-center text-success-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Pending Orders */}
        <Card className="bg-card/40 backdrop-blur-md border border-border/60 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">En attente</span>
              <h2 className="text-xl sm:text-2xl font-black text-foreground">{stats.pendingCount} commande(s)</h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-warning-500/10 flex items-center justify-center text-warning-600">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Late Deliveries */}
        <Card className="bg-card/40 backdrop-blur-md border border-border/60 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">En Retard</span>
              <h2 className="text-xl sm:text-2xl font-black text-destructive">{stats.lateCount} livraison(s)</h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-danger-500/10 flex items-center justify-center text-danger-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="border border-border/60 shadow-md">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par numero de commande ou fournisseur…"
              className="pl-10 sm:pl-10 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-44 text-xs" aria-label="Filtrer par statut">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="validee">Validée</SelectItem>
                <SelectItem value="expediee">Expédiée</SelectItem>
                <SelectItem value="livree">Livrée</SelectItem>
                <SelectItem value="annulee">Annulée</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="border border-border/60 shadow-md overflow-hidden">
          <CardContent className="p-0">
            <QueryState
              loading={loading}
              error={error}
              isEmpty={sortedCommandes.length === 0}
              onRetry={loadCommandes}
              skeleton={<div className="px-3 pb-3 md:p-4"><ListSkeleton items={6} /></div>}
              emptyIcon={ShoppingCart}
              emptyTitle="Aucune commande trouvée"
              emptyDescription="Essayez de modifier vos termes de recherche ou filtrez par un autre statut."
            >
            <ResponsiveTable
              className="px-3 pb-3 md:p-0"
              cards={
                (
                  sortedCommandes.map((c) => {
                    const isLate = c.statut !== 'livree' && c.statut !== 'annulee' && c.date_livraison_prevue && c.date_livraison_prevue.split('T')[0] < todayStr;
                    return (
                      <DataCard
                        key={c.id}
                        onClick={() => navigate(`/commandes/${c.id}`)}
                        title={<span className="font-mono text-primary">{c.numero_commande}</span>}
                        badge={getStatutBadge(c.statut)}
                      >
                        <DataCardRow label="Fournisseur" value={c.fournisseur_nom || '—'} />
                        <DataCardRow label="Date" value={new Date(c.date_commande).toLocaleDateString('fr-FR')} />
                        <DataCardRow label="Montant" value={<span className="num font-semibold">{formatCurrency(c.sous_total)}</span>} />
                        <DataCardRow
                          label="Livraison"
                          value={c.date_livraison_prevue
                            ? <span className={isLate ? 'text-destructive font-semibold' : ''}>{new Date(c.date_livraison_prevue).toLocaleDateString('fr-FR')}</span>
                            : '—'}
                        />
                        <div className="mt-2 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {c.statut === 'en_attente' && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-success-600" onClick={(e) => updateStatut(e, c.id, 'validee')} aria-label="Valider la commande">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {c.statut === 'validee' && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-info-600" onClick={(e) => updateStatut(e, c.id, 'expediee')} aria-label="Marquer comme expédiée">
                              <Truck className="h-4 w-4" />
                            </Button>
                          )}
                          {(c.statut === 'en_attente' || c.statut === 'validee' || c.statut === 'expediee') && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-success-600" onClick={(e) => { e.stopPropagation(); navigate(`/receptions?commande_id=${c.id}`); }} aria-label="Réceptionner la commande">
                              <Package className="h-4 w-4" />
                            </Button>
                          )}
                          {c.statut !== 'annulee' && (
                            <Button variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={(e) => updateStatut(e, c.id, 'annulee')} aria-label="Annuler la commande">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </DataCard>
                    );
                  })
                )
              }
              table={
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <SortableHeader columnKey="numero" sort={ordersSort} onSort={handleSort}>N° Commande</SortableHeader>
                  <TableHead>Fournisseur</TableHead>
                  <SortableHeader columnKey="date" sort={ordersSort} onSort={handleSort}>Date</SortableHeader>
                  <SortableHeader columnKey="montant" sort={ordersSort} onSort={handleSort} align="right">Montant</SortableHeader>
                  <SortableHeader columnKey="livraison" sort={ordersSort} onSort={handleSort}>Livraison prévue</SortableHeader>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCommandes.map((c) => {
                  const isLate = c.statut !== 'livree' && c.statut !== 'annulee' && c.date_livraison_prevue && c.date_livraison_prevue.split('T')[0] < todayStr;
                  return (
                    <TableRow 
                      key={c.id} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors group" 
                      onClick={() => navigate(`/commandes/${c.id}`)}
                    >
                      <TableCell className="font-mono font-bold text-primary group-hover:underline">{c.numero_commande}</TableCell>
                      <TableCell className="font-semibold">{c.fournisseur_nom}</TableCell>
                      <TableCell>{new Date(c.date_commande).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="text-right font-bold num">{formatCurrency(c.sous_total)}</TableCell>
                      <TableCell>
                        {c.date_livraison_prevue ? (
                          <span className={`inline-flex items-center gap-1 font-semibold ${isLate ? 'text-destructive' : ''}`}>
                            {new Date(c.date_livraison_prevue).toLocaleDateString('fr-FR')}
                            {isLate && <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{getStatutBadge(c.statut)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.statut === 'en_attente' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-success-600 hover:text-success-700 hover:bg-success-500/10"
                              onClick={(e) => updateStatut(e, c.id, 'validee')}
                              title="Valider la commande"
                              aria-label="Valider la commande"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {c.statut === 'validee' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-info-600 hover:text-info-700 hover:bg-info-500/10"
                              onClick={(e) => updateStatut(e, c.id, 'expediee')}
                              title="Marquer comme expédiee"
                              aria-label="Marquer comme expédiée"
                            >
                              <Truck className="h-4 w-4" />
                            </Button>
                          )}
                          {(c.statut === 'en_attente' || c.statut === 'validee' || c.statut === 'expediee') && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-success-600 hover:text-success-700 hover:bg-success-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/receptions?commande_id=${c.id}`);
                              }}
                              title="Receptionner la commande"
                              aria-label="Réceptionner la commande"
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                          )}
                          {c.statut !== 'annulee' && (
                            <Button 
                              variant="destructive"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => updateStatut(e, c.id, 'annulee')}
                              title="Annuler la commande"
                              aria-label="Annuler la commande"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              }
            />
            </QueryState>
            {!loading && total > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(n) => { setLimit(n); setPage(1); }}
              />
            )}
          </CardContent>
        </Card>
    </div>
  );
}
