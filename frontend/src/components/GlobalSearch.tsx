import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  produitService,
  tiersService,
  factureService,
  devisService,
  bonLivraisonService,
  commandeService,
} from '../services/api';
import {
  Command,
  Package,
  Users,
  FileText,
  Search,
  FilePlus,
  FileCheck,
  ShoppingCart,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '../utils/format';

type ResultType = 'produit' | 'tiers' | 'facture' | 'devis' | 'bon de livraison' | 'commande';

interface SearchResult {
  type: ResultType;
  id: number;
  title: string;
  subtitle: string;
  url: string;
}

const RESULT_TYPE_LABELS: Record<ResultType, string> = {
  produit: 'Produit',
  tiers: 'Contact',
  facture: 'Facture',
  devis: 'Devis',
  'bon de livraison': 'Bon de livraison',
  commande: 'Commande fournisseur',
};

/** Un endpoint paginé renvoie `{data}` ; un endpoint brut renvoie un tableau. */
function rows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toggle with Ctrl+K / Cmd+K
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Search on input change
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (!search) {
      setResults([]);
      return;
    }

    setLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        // Chaque source échoue indépendamment : un 403 sur un module interdit au
        // rôle courant ne doit pas vider toute la palette.
        const [produits, tiersResults, factures, devis, bls, commandes] = await Promise.all([
          produitService.searchFuzzy(search, 5, 0.1).catch(() => []),
          tiersService.search(search).catch(() => []),
          factureService.getAll(search, undefined, 1, 5).catch(() => ({ data: [] })),
          devisService.getAll(search, undefined, 1, 4).catch(() => ({ data: [] })),
          bonLivraisonService.getAll(search, undefined, 1, 4).catch(() => ({ data: [] })),
          commandeService.getAll(search, undefined, 1, 4).catch(() => ({ data: [] })),
        ]);

        const searchResults: SearchResult[] = [
          ...rows(produits).map((p: any) => ({
            type: 'produit' as const,
            id: p.id,
            title: p.nom,
            subtitle: `${p.reference} - ${p.categorie || 'Sans catégorie'}`,
            // Deep-link : la liste ouvre déjà filtrée sur la référence trouvée.
            url: `/inventaire?search=${encodeURIComponent(p.reference || p.nom)}`,
          })),
          ...rows(tiersResults).slice(0, 5).map((t: any) => ({
            type: 'tiers' as const,
            id: t.id,
            title: t.raison_sociale,
            subtitle: t.email || t.telephone || (t.est_client && t.est_fournisseur ? 'Client & Fournisseur' : t.est_client ? 'Client' : 'Fournisseur'),
            url: `/tiers/${t.id}`,
          })),
          ...rows(factures).map((f: any) => ({
            type: 'facture' as const,
            id: f.id,
            title: f.numero_facture,
            subtitle: `${f.client_nom || '-'} - ${formatCurrency(f.total)}`,
            url: `/factures/${f.id}`,
          })),
          ...rows(devis).map((d: any) => ({
            type: 'devis' as const,
            id: d.id,
            title: d.numero_devis,
            subtitle: `${d.client_nom || '-'} - ${formatCurrency(d.total)}`,
            url: `/devis/${d.id}`,
          })),
          ...rows(bls).map((b: any) => ({
            type: 'bon de livraison' as const,
            id: b.id,
            title: b.numero_bl,
            subtitle: `${b.client_nom || '-'} - ${formatCurrency(b.total)}`,
            url: `/bons-livraison/${b.id}`,
          })),
          ...rows(commandes).map((c: any) => ({
            type: 'commande' as const,
            id: c.id,
            title: c.numero_commande,
            subtitle: `${c.fournisseur_nom || '-'} - ${formatCurrency(c.sous_total ?? c.total)}`,
            url: `/commandes/${c.id}`,
          })),
        ];

        setResults(searchResults);
        setSelectedIndex(0);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setSearch('');
    navigate(result.url);
  };

  // Keyboard navigation for the results list (the palette was mouse-only past typing).
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = results[selectedIndex];
      if (result) handleSelect(result);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'produit': return <Package className="h-4 w-4 text-blue-500" />;
      case 'facture': return <FileText className="h-4 w-4 text-purple-500" />;
      case 'tiers': return <Users className="h-4 w-4 text-orange-500" />;
      case 'devis': return <FilePlus className="h-4 w-4 text-sky-500" />;
      case 'bon de livraison': return <FileCheck className="h-4 w-4 text-teal-500" />;
      case 'commande': return <ShoppingCart className="h-4 w-4 text-amber-500" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-2xl">
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        <DialogDescription className="sr-only">
          Recherchez un produit, un contact ou un document, puis utilisez les flèches et Entrée pour ouvrir le résultat.
        </DialogDescription>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher produits, contacts, factures, devis, BL, commandes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleInputKeyDown}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-autocomplete="list"
              aria-controls="global-search-results"
              className="border-none focus-visible:ring-0 shadow-none"
              autoFocus
            />
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <Command className="h-3 w-3" /> K
            </kbd>
          </div>
        </div>
        
        <div id="global-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          
          {!loading && results.length === 0 && search && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucun résultat pour "{search}"</p>
            </div>
          )}
          
          {!loading && results.map((result, index) => (
            <button
              key={`${result.type}-${result.id}`}
              className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-muted transition-colors ${
                index === selectedIndex ? 'bg-muted' : ''
              }`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={index === selectedIndex}
            >
              {getTypeIcon(result.type)}
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">{result.title}</p>
                <p className="text-xs text-muted-foreground">{result.subtitle}</p>
              </div>
              <span className="text-xs text-muted-foreground">{RESULT_TYPE_LABELS[result.type]}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
