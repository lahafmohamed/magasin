import { useState, useEffect } from 'react';
import { Check, Loader2, Plus, Package, Warehouse } from 'lucide-react';
import { stockLocationService } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fuzzyScore } from '../utils/format';

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
  const [error, setError] = useState<unknown>(null);
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
    setLoading(true);
    setError(null);
    try {
      const data = await stockLocationService.getAll();
      setLocations(data.data || data);
    } catch (err) {
      setError(err);
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

  const filteredStockLevels = searchQuery.trim()
    ? stockLevels
        .map((level) => {
          const nomScore = fuzzyScore(searchQuery, level.produit_nom);
          const refScore = fuzzyScore(searchQuery, level.reference);
          return { level, score: Math.max(nomScore, refScore) };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((row) => row.level)
    : stockLevels;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await stockLocationService.create(formData);
      toast.success('Emplacement créé');
      setShowCreateForm(false);
      setFormData({ code: '', nom: '', adresse: '', est_principal: false });
      fetchLocations();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de la création de l'emplacement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <PageHeader
        className="mb-6"
        title="Emplacements de stock"
        icon={Warehouse}
        actions={
          <Button onClick={() => setShowCreateForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nouvel emplacement
          </Button>
        }
      />

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvel emplacement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="loc-code">Code *</Label>
              <Input id="loc-code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-nom">Nom *</Label>
              <Input id="loc-nom" value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-adresse">Adresse</Label>
              <Textarea id="loc-adresse" value={formData.adresse} onChange={(e) => setFormData({ ...formData, adresse: e.target.value })} />
            </div>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium">Emplacement principal</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                checked={formData.est_principal}
                onChange={(e) => setFormData({ ...formData, est_principal: e.target.checked })}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreateForm(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Création…
                  </>
                ) : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <QueryState
        loading={loading}
        error={error}
        isEmpty={locations.length === 0}
        onRetry={fetchLocations}
        skeleton={<TableSkeleton rows={6} columns={5} />}
        emptyIcon={Warehouse}
        emptyTitle="Aucun emplacement de stock"
        emptyDescription="Créez un emplacement pour suivre le stock par site."
        emptyAction={
          <Button onClick={() => setShowCreateForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nouvel emplacement
          </Button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-md border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold mb-3">Emplacements</h2>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((location) => (
                      <TableRow key={location.id} className={selectedLocation?.id === location.id ? 'bg-primary/10' : ''}>
                        <TableCell className="font-medium num">{location.code}</TableCell>
                        <TableCell>{location.nom}</TableCell>
                        <TableCell>
                          {location.est_principal && <Check className="h-4 w-4 text-primary" aria-label="Principal" />}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            location.actif ? 'bg-success-100 text-success-700' : 'bg-muted text-muted-foreground'
                          }`}>
                            {location.actif ? 'Actif' : 'Inactif'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => handleSelectLocation(location)}>
                            Voir stock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {selectedLocation && (
            <div className="rounded-md border bg-card shadow-sm">
              <div className="p-5">
                <h2 className="text-lg font-semibold mb-3">Stock — {selectedLocation.nom}</h2>
                <div className="mb-4">
                  <Input
                    placeholder="Rechercher un produit"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {filteredStockLevels.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title={searchQuery.trim() ? 'Aucun produit trouvé' : 'Aucun stock dans cet emplacement'}
                  />
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Référence</TableHead>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Quantité</TableHead>
                          <TableHead className="text-right">Disponible</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStockLevels.map((level) => (
                          <TableRow key={level.id}>
                            <TableCell className="num">{level.reference}</TableCell>
                            <TableCell>{level.produit_nom}</TableCell>
                            <TableCell className="text-right num">{level.quantite}</TableCell>
                            <TableCell className="text-right font-medium num">{level.quantite_disponible}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </QueryState>
    </div>
  );
}
