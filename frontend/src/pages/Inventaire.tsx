import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { produitService, tiersService, stockLocationService } from '../services/api';
import { Produit } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SortableHeader, SortState } from '@/components/ui/sortable-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Plus, Search, Pencil, Trash2, AlertCircle, XCircle, Package, Download, Filter, History, Clock, ArrowUpCircle, ArrowDownCircle, RefreshCw, Loader2, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, normalizeSearch } from '@/utils/format';
import { downloadCsv } from '@/utils/csv';

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  actif: boolean;
  est_principal: boolean;
}

export default function Inventaire() {
  const confirm = useConfirm();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduit, setEditingProduit] = useState<Produit | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [produitToDelete, setProduitToDelete] = useState<Produit | null>(null);
  
  // Stock history
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Produit | null>(null);
  const [stockHistory, setStockHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Purchase info (supplier, price, top buyer)
  const [purchaseInfoDialogOpen, setPurchaseInfoDialogOpen] = useState(false);
  const [selectedProductForPurchaseInfo, setSelectedProductForPurchaseInfo] = useState<Produit | null>(null);
  const [purchaseInfo, setPurchaseInfo] = useState<any>(null);
  const [loadingPurchaseInfo, setLoadingPurchaseInfo] = useState(false);
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Bulk operations state
  const [bulkAdjustQuantity, setBulkAdjustQuantity] = useState('');
  const [bulkAdjustType, setBulkAdjustType] = useState<'add' | 'subtract' | 'set'>('add');
  const [bulkCategory, setBulkCategory] = useState('');
  
  // Category filter
  const [categorieFilter, setCategorieFilter] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  
  // Fournisseurs
  const [fournisseurs, setFournisseurs] = useState<any[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [selectedAdjustLocationId, setSelectedAdjustLocationId] = useState<string>('');
  
  // Pagination & Sorting — default 50/page so the row virtualizer (windowed
  // rendering below) actually earns its keep on large catalogs; the page-size
  // selector still offers 10/20/50/100.
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState('nom');
  const [order, setOrder] = useState('asc');

  const [formData, setFormData] = useState({
    reference: '',
    nom: '',
    description: '',
    categorie: '',
    prix_achat: 0,
    prix_vente: 0,
    stock: 0,
    initial_stock: 0,
    location_id: '',
    stock_min: 5,
    fournisseur_id: null as number | null,
  });

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(normalizeSearch(search));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (searchParams.get('low_stock') === 'true') {
      setLowStockOnly(true);
    }
    // Deep-link depuis la recherche globale (Ctrl+K) : ?search=<référence>
    const q = searchParams.get('search');
    if (q) {
      setSearch(q);
      setDebouncedSearch(normalizeSearch(q));
    }
  }, [searchParams]);

  useEffect(() => {
    loadProduits();
  }, [debouncedSearch, lowStockOnly, categorieFilter, page, limit, sort, order, selectedAdjustLocationId]);

  useEffect(() => {
    loadStockLocations();
  }, []);

  useEffect(() => {
    if (showForm) {
      tiersService.getAll({ role: 'fournisseur', limit: 200 })
        .then((response) => {
          const fournisseursList = Array.isArray(response)
            ? response
            : Array.isArray(response?.data)
              ? response.data
              : [];
          setFournisseurs(fournisseursList);
        })
        .catch((error) => {
          console.error('Erreur chargement fournisseurs:', error);
          setFournisseurs([]);
        });
      loadStockLocations();
    }
  }, [showForm]);

  const getDefaultLocationId = (locations: StockLocation[]): string => {
    const activeLocations = locations.filter((location) => location.actif);
    const principal = activeLocations.find((location) => location.est_principal);
    if (principal) return String(principal.id);
    if (activeLocations[0]) return String(activeLocations[0].id);
    return '';
  };

  const loadStockLocations = async () => {
    try {
      const response = await stockLocationService.getAll();
      const locations = (response.data || response || []) as StockLocation[];
      const activeLocations = locations.filter((location) => location.actif);
      setStockLocations(activeLocations);

      const defaultLocation = getDefaultLocationId(activeLocations);
      if (!selectedAdjustLocationId && defaultLocation) {
        setSelectedAdjustLocationId(defaultLocation);
      }

      setFormData((prev) => {
        if (prev.location_id || !defaultLocation) return prev;
        return { ...prev, location_id: defaultLocation };
      });
    } catch (error) {
      console.error('Erreur chargement locations:', error);
    }
  };

  const loadProduits = async () => {
    setLoading(true);
    try {
      const categorie = categorieFilter === 'all' ? undefined : categorieFilter;
      const locationId = selectedAdjustLocationId ? parseInt(selectedAdjustLocationId, 10) : undefined;
      const response = await produitService.getAll(debouncedSearch, categorie, lowStockOnly, page, limit, sort, order, locationId);
      const produitsData = response?.data ?? response ?? [];
      setProduits(Array.isArray(produitsData) ? produitsData : []);
      setTotal(response.pagination?.total ?? 0);
      setTotalPages(response.pagination?.totalPages ?? 0);

      // Extract categories from data
      const cats = [...new Set((Array.isArray(produitsData) ? produitsData : []).map((p: Produit) => p.categorie).filter(Boolean))] as string[];
      setCategories(cats);
    } catch (error) {
      console.error('❌ Error loading produits:', error);
      toast.error('Erreur lors du chargement des produits');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // guard against double-submit (duplicate product)
    setSubmitting(true);
    try {
      if (editingProduit) {
        await produitService.update(editingProduit.id, {
          reference: formData.reference,
          nom: formData.nom,
          description: formData.description,
          categorie: formData.categorie,
          prix_achat: formData.prix_achat,
          prix_vente: formData.prix_vente,
          stock: formData.stock,
          stock_min: formData.stock_min,
          fournisseur_id: formData.fournisseur_id,
        });
      } else {
        await produitService.create({
          reference: formData.reference,
          nom: formData.nom,
          description: formData.description,
          categorie: formData.categorie,
          prix_achat: formData.prix_achat,
          prix_vente: formData.prix_vente,
          stock: formData.initial_stock,
          initial_stock: formData.initial_stock,
          location_id: formData.location_id ? parseInt(formData.location_id, 10) : undefined,
          stock_min: formData.stock_min,
          fournisseur_id: formData.fournisseur_id,
        });
      }
      resetForm();
      loadProduits();
      toast.success(editingProduit ? 'Produit modifié avec succès' : 'Produit ajouté avec succès');
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (produit: Produit) => {
    setEditingProduit(produit);
    setFormData({
      reference: produit.reference,
      nom: produit.nom,
      description: produit.description || '',
      categorie: produit.categorie || '',
      prix_achat: parseFloat(produit.prix_achat as any) || 0,
      prix_vente: parseFloat(produit.prix_vente as any) || 0,
      stock: typeof produit.stock === 'string' ? parseInt(produit.stock) : produit.stock,
      initial_stock: 0,
      location_id: getDefaultLocationId(stockLocations),
      stock_min: typeof produit.stock_min === 'string' ? parseInt(produit.stock_min) : produit.stock_min,
      fournisseur_id: (produit as any).fournisseur_id || null,
    });
    setShowForm(true);
  };

  const handleDeleteClick = (produit: Produit) => {
    setProduitToDelete(produit);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!produitToDelete) return;
    setDeleting(produitToDelete.id);
    try {
      await produitService.delete(produitToDelete.id);
      loadProduits();
      toast.success('Produit supprimé avec succès');
    } catch {
      toast.error('Ce produit est peut-être lié à des factures');
    } finally {
      setDeleting(null);
      setDeleteDialogOpen(false);
      setProduitToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirm({ title: `Supprimer ${selectedIds.length} produit(s) ?`, description: 'Cette action est irréversible.', confirmLabel: 'Supprimer', destructive: true }))) return;
    
    let successCount = 0;
    for (const id of selectedIds) {
      try {
        await produitService.delete(id);
        successCount++;
      } catch {
        // Continue with others
      }
    }
    
    if (successCount > 0) {
      toast.success(`${successCount} produit(s) supprimé(s) avec succès`);
      setSelectedIds([]);
      loadProduits();
    }
  };

  const handleBulkStockAdjust = async () => {
    if (selectedIds.length === 0 || !bulkAdjustQuantity) return;
    
    const quantity = parseInt(bulkAdjustQuantity);
    if (isNaN(quantity) || quantity < 0) {
      toast.error('Veuillez entrer une quantité valide');
      return;
    }

    const locationId = selectedAdjustLocationId ? parseInt(selectedAdjustLocationId, 10) : undefined;
    let successCount = 0;

    for (const id of selectedIds) {
      try {
        let delta = quantity;
        if (bulkAdjustType === 'subtract') delta = -quantity;
        if (bulkAdjustType === 'set') {
          // For set operation, we need to get current stock first
          const product = produits.find(p => p.id === id);
          if (product) {
            const currentStock = typeof product.stock === 'string' ? parseInt(product.stock) : product.stock;
            delta = quantity - currentStock;
          }
        }
        
        await produitService.adjustStock(id, delta, locationId);
        successCount++;
      } catch (error) {
        console.error(`Failed to adjust stock for product ${id}:`, error);
      }
    }

    if (successCount > 0) {
      const operation = bulkAdjustType === 'add' ? 'ajouté(s)' : bulkAdjustType === 'subtract' ? 'retiré(s)' : 'défini(s)';
      toast.success(`Stock ${operation} pour ${successCount} produit(s) avec succès`);
      setBulkAdjustQuantity('');
      setSelectedIds([]);
      loadProduits();
    }
  };

  const handleBulkCategoryChange = async () => {
    if (selectedIds.length === 0 || !bulkCategory) return;

    let successCount = 0;
    for (const id of selectedIds) {
      try {
        await produitService.update(id, { categorie: bulkCategory });
        successCount++;
      } catch (error) {
        console.error(`Failed to update category for product ${id}:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(`Catégorie changée pour ${successCount} produit(s) avec succès`);
      setBulkCategory('');
      setSelectedIds([]);
      loadProduits();
    }
  };

  const resetForm = () => {
    const defaultLocation = getDefaultLocationId(stockLocations);
    setShowForm(false);
    setEditingProduit(null);
    setFormData({
      reference: '',
      nom: '',
      description: '',
      categorie: '',
      prix_achat: 0,
      prix_vente: 0,
      stock: 0,
      initial_stock: 0,
      location_id: defaultLocation,
      stock_min: 5,
      fournisseur_id: null,
    });
  };

  const getStockBadge = (stock: number, stock_min: number) => {
    if (stock <= 0) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rupture</Badge>;
    }
    const color = stock <= stock_min ? 'text-warning' : 'text-foreground';
    return <span className={`num font-semibold ${color}`}>{stock}</span>;
  };

  const handleSort = (column: string) => {
    if (sort === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setOrder('asc');
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === produits.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(produits.map(p => p.id));
    }
  };



  const openHistory = async (produit: Produit) => {
    setSelectedProductForHistory(produit);
    setHistoryDialogOpen(true);
    setLoadingHistory(true);
    try {
      const history = await produitService.getStockHistory(produit.id, 50);
      setStockHistory(history ?? []);
    } catch (error) {
      toast.error('Erreur lors du chargement de l\'historique');
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openPurchaseInfo = async (produit: Produit) => {
    setSelectedProductForPurchaseInfo(produit);
    setPurchaseInfoDialogOpen(true);
    setLoadingPurchaseInfo(true);
    setPurchaseInfo(null);
    try {
      const info = await produitService.getPurchaseInfo(produit.id);
      setPurchaseInfo(info);
    } catch (error) {
      toast.error('Erreur lors du chargement des informations d\'achat');
      console.error(error);
    } finally {
      setLoadingPurchaseInfo(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Référence', 'Nom', 'Catégorie', 'Prix Achat', 'Prix Vente', 'Marge', 'Stock', 'Stock Min'];
    const rows = produits.map(p => {
      const prixAchat = parseFloat(p.prix_achat as any) || 0;
      const prixVente = parseFloat(p.prix_vente as any) || 0;
      const marge = prixVente - prixAchat;
      const margePercent = prixAchat > 0 ? ((marge / prixAchat) * 100).toFixed(1) : '0';
      return [
        p.reference,
        p.nom,
        p.categorie || '',
        prixAchat.toFixed(2),
        prixVente.toFixed(2),
        `${margePercent}%`,
        typeof p.stock === 'string' ? parseInt(p.stock) : p.stock,
        typeof p.stock_min === 'string' ? parseInt(p.stock_min) : p.stock_min,
      ];
    });
    
    downloadCsv(`inventaire_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success('Export CSV réussi');
  };

  const sortState: SortState<'reference' | 'nom' | 'categorie' | 'prix_vente' | 'stock'> = {
    key: sort as 'reference' | 'nom' | 'categorie' | 'prix_vente' | 'stock',
    dir: order === 'desc' ? 'desc' : 'asc',
  };

  // --- Virtualization of the product table rows ---
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: produits.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 48, // estimated row height in px (refined via measureElement)
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const renderProductRow = (p: Produit, index: number) => {
    const prixVente = parseFloat(p.prix_vente as any) || 0;
    const prixAchat = parseFloat(p.prix_achat as any) || 0;
    const marge = prixVente - prixAchat;
    const margeNum = prixVente > 0 && prixAchat > 0 ? (marge / prixAchat) * 100 : null;
    const stock = typeof p.stock === 'string' ? parseInt(p.stock) : p.stock;
    const stockMin = typeof p.stock_min === 'string' ? parseInt(p.stock_min) : p.stock_min;

    return (
      <TableRow
        key={p.id}
        data-index={index}
        ref={rowVirtualizer.measureElement}
        className={`${selectedIds.includes(p.id) ? 'bg-primary/5' : index % 2 === 1 ? 'bg-muted/30' : ''} hover:bg-muted/50 transition-colors`}
      >
        <TableCell>
          <input
            type="checkbox"
            checked={selectedIds.includes(p.id)}
            onChange={() => toggleSelection(p.id)}
            aria-label={`Sélectionner ${p.nom}`}
            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
          />
        </TableCell>
        <TableCell className="font-mono text-sm">
          <span
            onClick={() => openPurchaseInfo(p)}
            className="cursor-pointer hover:underline hover:text-primary transition-colors"
            title="Voir infos d'achat"
          >
            {p.reference}
          </span>
        </TableCell>
        <TableCell className="font-semibold">
          <span className="font-semibold">{p.nom}</span>
        </TableCell>
        <TableCell>
          {p.categorie
            ? <span className="text-sm">{p.categorie}</span>
            : <span className="text-xs text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="text-right">
          {prixVente > 0 ? (
            <span className="font-semibold whitespace-nowrap num">{formatCurrency(prixVente)}</span>
          ) : (
            <span className="text-xs font-medium text-warning-700">Prix non renseigné</span>
          )}
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          {margeNum === null ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span
              className={`text-sm font-medium num ${margeNum >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {margeNum >= 0 ? '+' : ''}{margeNum.toFixed(1)}%
            </span>
          )}
        </TableCell>
        <TableCell>{getStockBadge(stock, stockMin)}</TableCell>

        <TableCell className="text-right">
          <div className="flex justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openHistory(p)}
              title="Historique des mouvements"
              aria-label="Historique des mouvements"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleEdit(p)}
              title="Modifier le produit"
              aria-label="Modifier le produit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => handleDeleteClick(p)}
              disabled={deleting === p.id}
              title="Supprimer le produit"
              aria-label="Supprimer le produit"
            >
              {deleting === p.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderProductCard = (p: Produit) => {
    const prixVente = parseFloat(p.prix_vente as any) || 0;
    const stock = typeof p.stock === 'string' ? parseInt(p.stock) : p.stock;
    const stockMin = typeof p.stock_min === 'string' ? parseInt(p.stock_min) : p.stock_min;

    return (
      <article
        key={p.id}
        className={`rounded-lg border bg-card p-3 shadow-xs ${
          selectedIds.includes(p.id) ? 'border-primary bg-primary/5' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <label className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border">
            <input
              type="checkbox"
              checked={selectedIds.includes(p.id)}
              onChange={() => toggleSelection(p.id)}
              aria-label={`Sélectionner ${p.nom}`}
              className="h-5 w-5 rounded border-input text-primary focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="min-w-0 flex-1">
            <h2 className="break-words font-semibold leading-snug">{p.nom}</h2>
            <button
              type="button"
              onClick={() => openPurchaseInfo(p)}
              className="mt-1 min-h-11 max-w-full break-all text-left font-mono text-sm text-primary underline-offset-2 hover:underline"
            >
              {p.reference}
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={`Actions pour ${p.nom}`}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => openHistory(p)}>
                <History className="h-4 w-4" />
                Historique du stock
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => handleEdit(p)}>
                <Pencil className="h-4 w-4" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-11 gap-2 text-destructive focus:text-destructive"
                disabled={deleting === p.id}
                onSelect={() => handleDeleteClick(p)}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Prix de vente</dt>
            <dd className="mt-1 break-words font-semibold">
              {prixVente > 0 ? (
                formatCurrency(prixVente)
              ) : (
                <span className="text-warning-700">Prix non renseigné</span>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Stock disponible</dt>
            <dd className="mt-1">{getStockBadge(stock, stockMin)}</dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted-foreground">Catégorie</dt>
            <dd className="mt-1 break-words">{p.categorie || 'Non renseignée'}</dd>
          </div>
        </dl>
      </article>
    );
  };

  return (
    <div className="p-3 sm:p-6 w-full">
      <div className="mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-6 w-6 sm:h-8 sm:w-8" />
              Inventaire
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Gestion de vos produits et stocks</p>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Ajouter Produit
          </Button>
        </div>

      {/* Filtres */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom ou référence..."
                  className="pl-12 sm:pl-12 h-10"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
            </div>
            
            {/* Category Filter */}
            {categories.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={categorieFilter}
                  onValueChange={(v) => { setCategorieFilter(v); setPage(1); }}
                >
                  <SelectTrigger className="h-9 w-auto" aria-label="Filtrer par catégorie">
                    <SelectValue placeholder="Toutes catégories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes catégories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <Button
              variant={lowStockOnly ? "default" : "outline"}
              onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
              className="gap-2 h-10"
            >
              <AlertCircle className="h-4 w-4" />
              Stock bas
            </Button>

            {stockLocations.length > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="adjust-location" className="text-xs text-muted-foreground">Dépôt :</Label>
                <Select
                  value={selectedAdjustLocationId}
                  onValueChange={(v) => setSelectedAdjustLocationId(v)}
                >
                  <SelectTrigger id="adjust-location" className="h-9 w-auto" aria-label="Sélectionner le dépôt">
                    <SelectValue placeholder="Dépôt" />
                  </SelectTrigger>
                  <SelectContent>
                    {stockLocations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.nom} ({location.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex-1"></div>

            {/* Export CSV */}
            <Button variant="outline" onClick={exportToCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Exporter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-2 z-20 flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md flex-wrap shadow-sm">
          <span className="text-sm font-medium text-primary">{selectedIds.length} sélectionné(s)</span>

          {/* Bulk Stock Adjustment */}
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="Quantité"
              className="w-20 h-8 text-xs"
              value={bulkAdjustQuantity}
              onChange={(e) => setBulkAdjustQuantity(e.target.value)}
            />
            <Select
              value={bulkAdjustType}
              onValueChange={(v) => setBulkAdjustType(v as 'add' | 'subtract' | 'set')}
            >
              <SelectTrigger className="h-8 w-16" aria-label="Type d'ajustement de stock">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">+</SelectItem>
                <SelectItem value="subtract">-</SelectItem>
                <SelectItem value="set">=</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkStockAdjust}
              className="gap-1 h-8"
              disabled={!bulkAdjustQuantity}
            >
              <Package className="h-3 w-3" />
              Stock
            </Button>
          </div>

          {/* Bulk Category Change */}
          <Select
            value={bulkCategory === '' ? '__all' : bulkCategory}
            onValueChange={(v) => setBulkCategory(v === '__all' ? '' : v)}
          >
            <SelectTrigger className="h-8 w-32" aria-label="Changer la catégorie">
              <SelectValue placeholder="Catégorie..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Catégorie...</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkCategoryChange}
            className="gap-1 h-8"
            disabled={!bulkCategory}
          >
            <Filter className="h-3 w-3" />
            Catégorie
          </Button>

          <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2 h-8">
            <Trash2 className="h-3 w-3" />
            Supprimer
          </Button>

          <div className="flex-1"></div>

          <Button variant="ghost" size="icon" onClick={() => setSelectedIds([])} className="h-8 w-8" title="Effacer la sélection" aria-label="Effacer la sélection">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Formulaire Modal */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduit ? 'Modifier Produit' : 'Ajouter Produit'}
            </DialogTitle>
            <DialogDescription>
              {editingProduit ? 'Modifiez les informations du produit' : 'Remplissez les informations du nouveau produit'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reference">Référence *</Label>
                <Input
                  id="reference"
                  required
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="REF-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nom">Nom *</Label>
                <Input
                  id="nom"
                  required
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  placeholder="Nom du produit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categorie">Catégorie</Label>
                <Input
                  id="categorie"
                  value={formData.categorie}
                  onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                  placeholder="Catégorie"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fournisseur">Fournisseur</Label>
                <Select
                  value={formData.fournisseur_id ? String(formData.fournisseur_id) : '__all'}
                  onValueChange={(v) => setFormData({ ...formData, fournisseur_id: v === '__all' ? null : parseInt(v) })}
                >
                  <SelectTrigger id="fournisseur" className="h-9 w-full" aria-label="Fournisseur">
                    <SelectValue placeholder="Aucun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Aucun</SelectItem>
                    {(Array.isArray(fournisseurs) ? fournisseurs : []).map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.raison_sociale}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editingProduit ? (
                <div className="space-y-2">
                  <Label htmlFor="stock">Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="location_id">Dépôt cible</Label>
                    <Select
                      value={formData.location_id === '' ? '__all' : formData.location_id}
                      onValueChange={(v) => setFormData({ ...formData, location_id: v === '__all' ? '' : v })}
                    >
                      <SelectTrigger id="location_id" className="h-9 w-full" aria-label="Dépôt cible">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">Sélectionner...</SelectItem>
                        {stockLocations.map((location) => (
                          <SelectItem key={location.id} value={String(location.id)}>
                            {location.nom} ({location.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="initial_stock">Stock initial du dépôt</Label>
                    <Input
                      id="initial_stock"
                      type="number"
                      min="0"
                      value={formData.initial_stock}
                      onChange={(e) => setFormData({ ...formData, initial_stock: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="prix_achat">Prix d'achat</Label>
                <MoneyInput
                  id="prix_achat"
                  value={formData.prix_achat || ''}
                  onChange={(v) => setFormData({ ...formData, prix_achat: parseFloat(v) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prix_vente">Prix de vente *</Label>
                <MoneyInput
                  id="prix_vente"
                  required
                  value={formData.prix_vente || ''}
                  onChange={(v) => setFormData({ ...formData, prix_vente: parseFloat(v) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_min">Stock minimum</Label>
                <Input
                  id="stock_min"
                  type="number"
                  min="0"
                  value={formData.stock_min}
                  onChange={(e) => setFormData({ ...formData, stock_min: parseInt(e.target.value) || 5 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description optionnelle"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enregistrement…' : editingProduit ? 'Modifier' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tableau */}
      <Card>
          <CardContent className="p-0">
            <div className="space-y-3 p-3 md:hidden">
              {loading ? (
                <TableSkeleton rows={6} columns={2} />
              ) : produits?.length === 0 ? (
                <EmptyState icon={Package} title="Aucun produit trouvé" />
              ) : (
                produits.map(renderProductCard)
              )}
            </div>
            <div
              ref={tableScrollRef}
              className="relative hidden w-full overflow-auto max-h-[calc(100vh-320px)] md:block"
            >
            <table className="w-full caption-bottom text-sm table-fixed [&_td]:py-2 [&_th]:py-2 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-card [&_thead_th]:h-10">
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === produits.length && produits.length > 0}
                      onChange={selectAll}
                      aria-label="Tout sélectionner"
                      className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                    />
                  </TableHead>
                  <SortableHeader columnKey="reference" sort={sortState} onSort={handleSort}>Référence</SortableHeader>
                  <SortableHeader columnKey="nom" sort={sortState} onSort={handleSort}>Nom</SortableHeader>
                  <SortableHeader columnKey="categorie" sort={sortState} onSort={handleSort}>Catégorie</SortableHeader>
                  <SortableHeader columnKey="prix_vente" sort={sortState} onSort={handleSort} align="right">Prix Vente</SortableHeader>
                  <TableHead className="text-right">Marge</TableHead>
                  <SortableHeader columnKey="stock" sort={sortState} onSort={handleSort}>Stock</SortableHeader>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <TableSkeleton rows={10} columns={8} />
                    </TableCell>
                  </TableRow>
                ) : produits?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState icon={Package} title="Aucun produit trouvé" />
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={8} style={{ height: paddingTop }} />
                      </tr>
                    )}
                    {virtualRows.map((virtualRow) =>
                      renderProductRow(produits[virtualRow.index], virtualRow.index)
                    )}
                    {paddingBottom > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={8} style={{ height: paddingBottom }} />
                      </tr>
                    )}
                  </>
                )}
              </TableBody>
            </table>
            </div>
          </CardContent>
        </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer le produit "{produitToDelete?.nom}" ({produitToDelete?.reference}) ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting === produitToDelete?.id}>
              {deleting === produitToDelete?.id ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock History Modal */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historique des mouvements - {selectedProductForHistory?.nom} ({selectedProductForHistory?.reference})
            </DialogTitle>
            <DialogDescription>
              Stock actuel: <span className="font-bold">{selectedProductForHistory?.stock}</span> unités
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : stockHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mb-2 opacity-50" />
                <p>Aucun mouvement enregistré</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stockHistory.map((movement) => {
                  const quantite = parseInt(movement.quantite);
                  const isPositive = quantite > 0;
                  
                  const getMovementIcon = () => {
                    switch (movement.type_mouvement) {
                      case 'vente':
                        return <ArrowDownCircle className="h-4 w-4 text-danger-500" />;
                      case 'retour':
                        return <ArrowUpCircle className="h-4 w-4 text-success-500" />;
                      case 'ajustement':
                        return <RefreshCw className="h-4 w-4 text-warning-500" />;
                      default:
                        return <Clock className="h-4 w-4 text-gray-500" />;
                    }
                  };

                  const getMovementLabel = () => {
                    const labels: Record<string, string> = {
                      vente: 'Vente',
                      retour: 'Retour',
                      ajustement: 'Ajustement',
                      commande: 'Commande',
                      perte: 'Perte',
                      autre: 'Autre',
                    };
                    return labels[movement.type_mouvement] || 'Autre';
                  };

                  return (
                    <div
                      key={movement.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="mt-1">
                        {getMovementIcon()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{getMovementLabel()}</span>
                          <span className={`text-sm font-bold ${isPositive ? 'text-success-600' : 'text-danger-600'}`}>
                            {isPositive ? '+' : ''}{quantite}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(movement.date_mouvement).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Stock: {movement.stock_avant} → {movement.stock_apres}
                          </span>
                        </div>
                        {movement.raison && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            Raison: {movement.raison}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Info Dialog */}
      <Dialog open={purchaseInfoDialogOpen} onOpenChange={setPurchaseInfoDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Informations d'achat - {selectedProductForPurchaseInfo?.nom} ({selectedProductForPurchaseInfo?.reference})
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            {loadingPurchaseInfo ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : purchaseInfo ? (
              <>
                {/* Default Supplier */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Fournisseur par défaut</h4>
                    {purchaseInfo.default_supplier ? (
                      <div>
                        <p className="font-medium">{purchaseInfo.default_supplier.raison_sociale}</p>
                        {purchaseInfo.default_supplier.telephone && (
                          <p className="text-sm text-muted-foreground">Tel: {purchaseInfo.default_supplier.telephone}</p>
                        )}
                        {purchaseInfo.default_supplier.email && (
                          <p className="text-sm text-muted-foreground">Email: {purchaseInfo.default_supplier.email}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucun fournisseur par défaut</p>
                    )}
                  </div>

                  {/* Purchase Price Stats */}
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Prix d'achat</h4>
                    {purchaseInfo.price_stats ? (
                      <div className="space-y-2">
                        {purchaseInfo.price_stats.prix_min === purchaseInfo.price_stats.prix_max ? (
                          <p className="text-2xl font-bold">{formatCurrency(purchaseInfo.price_stats.prix_min)}</p>
                        ) : (
                          <div>
                            <p className="text-lg font-bold">
                              {formatCurrency(purchaseInfo.price_stats.prix_min)} - {formatCurrency(purchaseInfo.price_stats.prix_max)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Moyenne: {formatCurrency(purchaseInfo.price_stats.prix_moyen)} · {purchaseInfo.price_stats.total_achats} achat(s)
                            </p>
                          </div>
                        )}
                        {purchaseInfo.recent_purchase && (
                          <p className="text-xs text-muted-foreground border-t pt-1 mt-1">
                            Dernier: {formatCurrency(purchaseInfo.recent_purchase.prix_unitaire)}
                            {purchaseInfo.recent_purchase.fournisseur && ` chez ${purchaseInfo.recent_purchase.fournisseur}`}
                            {purchaseInfo.recent_purchase.date && ` (${new Date(purchaseInfo.recent_purchase.date).toLocaleDateString('fr-FR')})`}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-2xl font-bold">{formatCurrency(purchaseInfo.prix_achat)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Prix par défaut (aucun achat enregistré)</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* All Purchase History (combined) */}
                {(purchaseInfo.purchase_history?.length > 0 || purchaseInfo.order_history?.length > 0) && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Tous les achats</h4>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Fournisseur</th>
                            <th className="text-left p-2">Document</th>
                            <th className="text-right p-2">Qté</th>
                            <th className="text-right p-2">Prix unitaire</th>
                            <th className="text-right p-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...(purchaseInfo.purchase_history || []).map((item: any) => ({ ...item, source: 'Facture' })),
                            ...(purchaseInfo.order_history || []).map((item: any) => ({ ...item, source: 'Commande' })),
                          ]
                            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((item: any, i: number) => (
                              <tr key={i} className="border-t hover:bg-muted/30">
                                <td className="p-2 text-xs">{item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '-'}</td>
                                <td className="p-2">{item.fournisseur || '-'}</td>
                                <td className="p-2">
                                  <span className="text-xs font-mono">{item.numero || item.source || '-'}</span>
                                  <span className="text-[10px] text-muted-foreground ml-1">{item.source}</span>
                                </td>
                                <td className="p-2 text-right">{item.quantite}</td>
                                <td className="p-2 text-right font-semibold">{formatCurrency(item.prix_unitaire)}</td>
                                <td className="p-2 text-right font-medium">{formatCurrency(parseFloat(item.prix_unitaire) * (item.quantite || 1))}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* No purchase history */}
                {(!purchaseInfo.purchase_history || purchaseInfo.purchase_history.length === 0) &&
                 (!purchaseInfo.order_history || purchaseInfo.order_history.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mb-2 opacity-50" />
                    <p>Aucun achat enregistré pour ce produit</p>
                  </div>
                )}

                {/* Top Buyer */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">Qui achète le plus ?</h4>
                  {purchaseInfo.top_buyer ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-lg">
                          {purchaseInfo.top_buyer.prenom
                            ? `${purchaseInfo.top_buyer.prenom} ${purchaseInfo.top_buyer.raison_sociale}`
                            : purchaseInfo.top_buyer.raison_sociale}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {purchaseInfo.top_buyer.telephone && `Tel: ${purchaseInfo.top_buyer.telephone}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{purchaseInfo.top_buyer.total_quantite} unités</p>
                        <p className="text-sm text-muted-foreground">
                          {purchaseInfo.top_buyer.nombre_factures} facture(s) · {formatCurrency(purchaseInfo.top_buyer.total_depense)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune vente enregistrée pour ce produit</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mb-2 opacity-50" />
                <p>Erreur de chargement</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {!loading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
        />
      )}
      </div>
    </div>
  );
}
