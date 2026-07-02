import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { commandeService, produitService } from '../services/api';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TiersPicker } from '../components/TiersPicker';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { Tiers } from '../types';
import { 
  ArrowLeft, ShoppingCart, Truck, CheckCircle, Clock, 
  XCircle, Package, Printer, Edit, Save, Search, 
  Trash2, BookOpen, X, Loader2, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

export default function CommandeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [commande, setCommande] = useState<any>(null);
  const [lignes, setLignes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFournisseur, setSelectedFournisseur] = useState<Tiers | null>(null);
  const [produitSearch, setProduitSearch] = useState('');
  const [produits, setProduits] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [dateLivraison, setDateLivraison] = useState('');
  const [saving, setSaving] = useState(false);

  // Catalog Drawer states
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');

  useEffect(() => {
    loadCommande();
    loadMatch();
  }, [id]);

  const loadMatch = async () => {
    if (!id) return;
    setMatchLoading(true);
    try {
      setMatch(await commandeService.getMatch(parseInt(id)));
    } catch {
      setMatch(null);
    } finally {
      setMatchLoading(false);
    }
  };

  const loadCommande = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await commandeService.getById(parseInt(id));
      setCommande(data);
      setLignes(data.lignes || []);
    } catch (error) {
      toast.error('Erreur lors du chargement de la commande');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    if (!commande) return;
    setSelectedFournisseur({
      id: commande.tiers_id,
      raison_sociale: commande.fournisseur_nom,
      telephone: commande.fournisseur_telephone,
      email: commande.fournisseur_email,
    } as any);
    setDateLivraison(commande.date_livraison_prevue ? commande.date_livraison_prevue.split('T')[0] : '');
    setNotes(commande.notes || '');
    setLignes(commande.lignes.map((l: any) => ({
      produit_id: l.produit_id,
      produit_nom: l.produit_nom,
      produit_reference: l.produit_reference,
      quantite: l.quantite,
      prix_unitaire: parseFloat(l.prix_unitaire) || 0,
      stock: l.stock || 0,
      stock_min: l.stock_min || 0
    })));
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedFournisseur) return;
    if (lignes.length === 0) {
      toast.error('Veuillez ajouter au moins un produit');
      return;
    }

    setSaving(true);
    try {
      await commandeService.update(parseInt(id), {
        tiers_id: selectedFournisseur.id,
        lignes: lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
        })),
        notes: notes || undefined,
        date_livraison_prevue: dateLivraison || undefined,
      });
      toast.success('Commande mise à jour avec succès');
      setIsEditing(false);
      loadCommande();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour de la commande');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Product Autocomplete inside editor
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

  const updateStatut = async (statut: string) => {
    if (!id) return;
    const confirmOpts =
      statut === 'annulee'
        ? { title: 'Annuler cette commande ?', description: 'La commande fournisseur sera annulée.', confirmLabel: 'Annuler la commande', cancelLabel: 'Retour', destructive: true }
        : statut === 'validee'
          ? { title: 'Valider cette commande ?', description: 'La commande sera validée et prête à être expédiée par le fournisseur.', confirmLabel: 'Valider' }
          : { title: 'Marquer la commande comme expédiée ?', confirmLabel: 'Confirmer' };
    if (!(await confirm(confirmOpts))) return;
    try {
      await commandeService.updateStatut(parseInt(id), statut);
      loadCommande();
      toast.success('Statut mis à jour');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Status Stepper layout
  const getStatusStepper = (currentStatut: string) => {
    if (currentStatut === 'annulee') {
      return (
        <div className="flex items-center justify-between w-full max-w-lg mx-auto py-4">
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <div className="w-8 h-8 rounded-full border-2 border-muted flex items-center justify-center bg-background text-muted-foreground">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold">Créée</span>
          </div>
          <div className="flex-1 h-[2px] bg-destructive/50 mx-2 animate-pulse" />
          <div className="flex flex-col items-center gap-1.5 text-destructive">
            <div className="w-8 h-8 rounded-full border-2 border-destructive flex items-center justify-center bg-destructive text-destructive-foreground animate-pulse">
              <XCircle className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold">Annulée</span>
          </div>
        </div>
      );
    }

    const steps = [
      { key: 'en_attente', label: 'En attente', icon: Clock },
      { key: 'validee', label: 'Validée', icon: CheckCircle },
      { key: 'expediee', label: 'Expédiée', icon: Truck },
      { key: 'livree', label: 'Livrée', icon: Package },
    ];

    const currentIdx = steps.findIndex((s) => s.key === currentStatut);

    return (
      <div className="flex items-center justify-between w-full max-w-2xl mx-auto py-4">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = idx < currentIdx;
          const isActive = idx === currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center flex-1 relative">
              {idx > 0 && (
                <div className={`absolute top-4 right-1/2 left-[-50%] h-[2px] -z-10 ${
                  idx <= currentIdx ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
              
              <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isCompleted ? 'bg-primary border-primary text-primary-foreground' :
                isActive ? 'bg-background border-primary text-primary shadow-md scale-110' :
                'bg-background border-muted text-muted-foreground'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-[11px] font-semibold mt-2 ${
                isActive ? 'text-primary font-bold' : 'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Catalog Drawer filters
  const filteredCatalog = catalogProducts.filter((p) => {
    const matchesSearch = p.nom.toLowerCase().includes(catalogSearch.toLowerCase()) || 
                          p.reference.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCategory = catalogCategory === 'all' || p.categorie === catalogCategory;
    return matchesSearch && matchesCategory;
  });

  const catalogCategories = Array.from(new Set(catalogProducts.map(p => p.categorie).filter(Boolean)));

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Chargement de la commande...</p>
        </div>
      </div>
    );
  }

  if (!commande) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <ShoppingCart className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold">Commande non trouvée</h2>
        <Button onClick={() => navigate('/commandes')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux commandes
        </Button>
      </div>
    );
  }

  const sousTotal = isEditing
    ? lignes.reduce((sum, item) => sum + (item.quantite * item.prix_unitaire), 0)
    : parseFloat(commande.sous_total) || 0;

  // VIEW 1: Edit Mode Layout
  if (isEditing) {
    return (
      <div className="p-3 sm:p-6 w-full max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annuler
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Edit className="h-8 w-8 text-primary" />
              Modifier la Commande {commande.numero_commande}
            </h1>
            <p className="text-muted-foreground mt-1">Modifiez les articles et les détails de l'approvisionnement</p>
          </div>
        </div>

        <form onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Metadata */}
          <div className="md:col-span-1 space-y-6">
            <Card className="shadow-md border-border/85">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Fournisseur
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fournisseur *</Label>
                  <TiersPicker role="fournisseur" value={selectedFournisseur} onChange={setSelectedFournisseur} />
                </div>
                {selectedFournisseur && (
                  <div className="p-3 bg-muted/40 rounded-md border text-xs space-y-1.5">
                    <p className="font-semibold text-foreground">{selectedFournisseur.raison_sociale}</p>
                    {selectedFournisseur.email && <p className="text-muted-foreground">Email: {selectedFournisseur.email}</p>}
                    {selectedFournisseur.telephone && <p className="text-muted-foreground">Tél: {selectedFournisseur.telephone}</p>}
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
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="date_livraison">Date de livraison prévue</Label>
                  <Input
                    id="date_livraison"
                    type="date"
                    value={dateLivraison}
                    onChange={(e) => setDateLivraison(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes publiques ou internes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes..."
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher rapidement par nom ou référence..."
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
                              <p className="text-sm font-bold text-primary">{parseFloat(p.prix_achat).toFixed(2)} XOF</p>
                              <p className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${isLowStock ? 'bg-warning-100 dark:bg-warning-500/20 text-warning-800 dark:text-warning-200' : 'bg-success-100 dark:bg-success-500/20 text-success-800 dark:text-success-200'}`}>
                                Stock: {p.stock} (Min: {p.stock_min})
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Table of selected items */}
                {lignes.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-12 text-center h-64 flex flex-col items-center justify-center text-muted-foreground">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="font-semibold text-sm">Le panier est vide</p>
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
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${isLowStock ? 'bg-warning-100 dark:bg-warning-500/20 text-warning-800 dark:text-warning-200' : 'bg-success-100 dark:bg-success-500/20 text-success-800 dark:text-success-200'}`}>
                                      Stock: {ligne.stock} / Min: {ligne.stock_min}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-16 h-8 text-center"
                                  min="1"
                                  value={ligne.quantite}
                                  onChange={(e) => updateQuantite(index, parseInt(e.target.value) || 1)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-28 h-8 pl-1 text-xs"
                                  step="0.01"
                                  value={ligne.prix_unitaire}
                                  onChange={(e) => updatePrix(index, parseFloat(e.target.value) || 0)}
                                />
                              </TableCell>
                              <TableCell className="font-bold text-right text-sm">
                                {(ligne.quantite * ligne.prix_unitaire).toFixed(2)} XOF
                              </TableCell>
                              <TableCell>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0" onClick={() => removeLigne(index)}>
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
                    {lignes.length} article(s)
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block font-semibold uppercase">Nouveau Total</span>
                    <span className="text-2xl font-black text-primary">{sousTotal.toFixed(2)} XOF</span>
                  </div>
                </div>
              )}
            </Card>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving || !selectedFournisseur || lignes.length === 0} className="shadow-lg shadow-primary/20">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Sauvegarder
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Catalog Drawer Backdrop */}
        {showCatalog && (
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowCatalog(false)} />
        )}

        {/* Catalog Drawer */}
        <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${showCatalog ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-muted/40">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Catalogue Produits
              </h3>
              <p className="text-xs text-muted-foreground">Sélectionnez les articles à ajouter</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowCatalog(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Filter Controls */}
          <div className="p-4 border-b space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Rechercher..." 
                value={catalogSearch} 
                onChange={e => setCatalogSearch(e.target.value)}
                className="pl-8 sm:pl-8 text-sm h-9"
              />
            </div>
            
            <Select
              value={catalogCategory}
              onValueChange={(v) => setCatalogCategory(v)}
            >
              <SelectTrigger className="w-full h-9 px-3 text-xs" aria-label="Filtrer par catégorie">
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {catalogCategories.map((cat: any) => (
                  <SelectItem key={cat} value={String(cat)}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Product List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {catalogLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Aucun produit trouvé
              </div>
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
                        <span className="text-xs font-bold text-primary">{parseFloat(p.prix_achat).toFixed(2)} XOF</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isLowStock ? 'bg-warning-100 dark:bg-warning-500/20 text-warning-800 dark:text-warning-200' : 'bg-success-100 dark:bg-success-500/20 text-success-800 dark:text-success-200'}`}>
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
        </div>
      </div>
    );
  }

  // VIEW 2: Detail Display Mode Layout
  return (
    <div className="p-3 sm:p-6 w-full space-y-6">
      {/* Print Styles Injection */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-border {
            border: 1px solid #ddd !important;
            padding: 8px !important;
          }
          .print-header {
            margin-bottom: 24px !important;
          }
        }
      `}</style>

      {/* Header (No print) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/commandes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingCart className="h-8 w-8 text-primary" />
              Commande {commande.numero_commande}
            </h1>
            <p className="text-muted-foreground mt-1">Details du bon de commande fournisseur</p>
          </div>
        </div>
        
        {/* Buttons / Statut */}
        <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end items-center">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimer / PDF
          </Button>
          {commande.statut === 'en_attente' && (
            <Button variant="default" size="sm" onClick={startEditing} className="gap-2">
              <Edit className="h-4 w-4" />
              Modifier
            </Button>
          )}
        </div>
      </div>

      {/* Stepper Timeline (No Print) */}
      <Card className="no-print border border-border/60 shadow-md">
        <CardContent className="p-4">
          {getStatusStepper(commande.statut)}
        </CardContent>
      </Card>

      {/* 3-way match (No Print) */}
      <Card className="no-print border border-border/60 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {match ? (
              match.coherent ? <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-300" />
                : match.within_tolerance ? <Clock className="h-5 w-5 text-warning-500" />
                : <XCircle className="h-5 w-5 text-danger-600 dark:text-danger-300" />
            ) : <Package className="h-5 w-5 text-muted-foreground" />}
            Rapprochement 3 voies
          </CardTitle>
          <CardDescription>Commandé vs Reçu vs Facturé (par produit)</CardDescription>
        </CardHeader>
        <CardContent>
          {matchLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !match || match.lignes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée de rapprochement.</p>
          ) : (
            <>
              {match.violations?.length > 0 && (
                <div className="mb-3 rounded-md border border-danger-300 dark:border-danger-500/30 bg-danger-50 dark:bg-danger-500/10 p-3 text-sm text-danger-800 dark:text-danger-200">
                  <p className="font-medium">Écarts détectés{match.config?.bloquer ? ' (création de facture bloquée)' : ' (avertissement)'} :</p>
                  <ul className="list-disc pl-5 mt-1">
                    {match.violations.map((v: any, i: number) => (
                      <li key={i}>{v.produit_nom || `Produit ${v.produit_id}`} — {v.reasons.join('; ')}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Cmd</TableHead>
                      <TableHead className="text-right">Reçu</TableHead>
                      <TableHead className="text-right">Facturé</TableHead>
                      <TableHead className="text-right">Prix cmd</TableHead>
                      <TableHead className="text-right">Prix fact.</TableHead>
                      <TableHead className="text-center">État</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {match.lignes.map((l: any) => (
                      <TableRow key={l.produit_id}>
                        <TableCell className="text-sm">{l.produit_nom || `#${l.produit_id}`}<span className="block text-xs font-mono text-muted-foreground">{l.reference}</span></TableCell>
                        <TableCell className="text-right num">{l.qte_commandee}</TableCell>
                        <TableCell className="text-right num">{l.qte_recue}</TableCell>
                        <TableCell className="text-right num">{l.qte_facturee}</TableCell>
                        <TableCell className="text-right num">{l.prix_commande ?? '—'}</TableCell>
                        <TableCell className="text-right num">{l.prix_facture ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          {l.coherent ? <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-300 inline" />
                            : l.within_tolerance ? <Clock className="h-4 w-4 text-warning-500 inline" />
                            : <XCircle className="h-4 w-4 text-danger-600 dark:text-danger-300 inline" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Attachments (No Print) */}
      <AttachmentPanel entityType="commande" entityId={commande.id} />

      {/* Actions (No Print) */}
      {commande.statut !== 'livree' && commande.statut !== 'annulee' && (
        <Card className="no-print border border-border/60 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Changer le statut</CardTitle>
            <CardDescription>Mettez à jour le flux de traitement de la commande</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {commande.statut === 'en_attente' && (
                <Button onClick={() => updateStatut('validee')} className="gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Valider la commande
                </Button>
              )}
              {commande.statut === 'validee' && (
                <Button onClick={() => updateStatut('expediee')} className="gap-2">
                  <Truck className="h-4 w-4" />
                  Marquer comme expédiée
                </Button>
              )}
              {(commande.statut === 'en_attente' || commande.statut === 'validee' || commande.statut === 'expediee') && (
                <>
                  <Button onClick={() => navigate(`/receptions?commande_id=${id}`)} className="gap-2 bg-success-600 hover:bg-success-700">
                    <Package className="h-4 w-4" />
                    Enregistrer la réception
                  </Button>
                  <Button onClick={() => updateStatut('annulee')} variant="destructive" className="gap-2">
                    <XCircle className="h-4 w-4" />
                    Annuler
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Printable Area */}
      <div id="print-area" className="space-y-6">
        {/* Printable Header (Visible only on print) */}
        <div className="hidden print:flex justify-between items-start border-b pb-4">
          <div>
            <h1 className="text-2xl font-black uppercase text-primary">BON DE COMMANDE</h1>
            <p className="text-sm font-semibold font-mono mt-1">Commande N°: {commande.numero_commande}</p>
            <p className="text-xs text-muted-foreground">Date: {new Date(commande.date_commande).toLocaleDateString('fr-FR')}</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-foreground">Magasin Programme</h2>
            <p className="text-xs text-muted-foreground">Système d'approvisionnement ERP</p>
          </div>
        </div>

        {/* Commande Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-border/60 shadow-sm print-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-foreground uppercase tracking-wide">Fournisseur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-bold text-base text-primary">{commande.fournisseur_nom}</p>
              {commande.fournisseur_contact && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Contact:</span> {commande.fournisseur_contact}</p>}
              {commande.fournisseur_email && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Email:</span> {commande.fournisseur_email}</p>}
              {commande.fournisseur_telephone && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Téléphone:</span> {commande.fournisseur_telephone}</p>}
            </CardContent>
          </Card>

          <Card className="border border-border/60 shadow-sm print-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-foreground uppercase tracking-wide">Informations Commande</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Numéro de Commande:</span>
                <span className="font-mono font-bold">{commande.numero_commande}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Date de Commande:</span>
                <span className="font-bold">
                  {new Date(commande.date_commande).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
              {commande.date_livraison_prevue && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Date de Livraison Prévue:</span>
                  <span className="font-bold">{new Date(commande.date_livraison_prevue).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              {commande.date_livraison_reelle && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Livraison Réelle:</span>
                  <span className="font-bold text-success-600">{new Date(commande.date_livraison_reelle).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Statut:</span>
                <StatusBadge type="commande" statut={commande.statut} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lines Items Table */}
        <Card className="border border-border/60 shadow-sm print-border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold uppercase tracking-wide">Désignation des Articles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[120px]">Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right w-[100px]">Quantité</TableHead>
                  <TableHead className="text-right w-[160px]">Prix unitaire</TableHead>
                  <TableHead className="text-right w-[160px]">Total HT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lignes.map((ligne) => (
                  <TableRow key={ligne.id}>
                    <TableCell className="font-mono text-xs font-semibold">{ligne.produit_reference}</TableCell>
                    <TableCell className="font-semibold text-sm">{ligne.produit_nom}</TableCell>
                    <TableCell className="text-right font-semibold">{ligne.quantite}</TableCell>
                    <TableCell className="text-right font-semibold">{parseFloat(ligne.prix_unitaire).toFixed(2)} XOF</TableCell>
                    <TableCell className="text-right font-black text-primary">{parseFloat(ligne.total_ligne).toFixed(2)} XOF</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Summary Card */}
        <div className="flex justify-end">
          <Card className="w-full md:w-80 border border-border/60 shadow-md bg-muted/20 print-border">
            <CardContent className="p-4 space-y-2.5">
              <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-muted-foreground font-semibold">Total Partiel</span>
                <span className="font-bold">{sousTotal.toFixed(2)} XOF</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground font-extrabold text-base uppercase">NET À PAYER</span>
                <span className="font-black text-lg text-primary">{sousTotal.toFixed(2)} XOF</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes Section */}
        {commande.notes && (
          <Card className="border border-border/60 shadow-sm print-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase text-muted-foreground">Observations / Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{commande.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
