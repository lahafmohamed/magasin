import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { MapPin, Package, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { stockLocationService } from '../services/api';
import { useAuth } from '@/lib/AuthContext';
import { PageShell } from '@/components/ui/page-shell';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DocumentCode } from '@/components/ui/document-code';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequiredMark } from '@/components/ui/required-mark';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/loading';
import { QueryErrorState } from '@/components/ui/query-state';
import { ListSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { DataCard, DataCardRow, ResponsiveTable } from '@/components/ui/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fuzzyScore, formatNumber } from '../utils/format';
import { formatLocationType } from '@/utils/roles';
import { getErrorMessage } from '@/utils/errors';

/** Création d'emplacement : `authorize(['admin', 'manager'])` côté API. */
const MANAGE_ROLES = ['admin', 'manager'];

interface StockLocation {
  id: number;
  code: string;
  nom: string;
  adresse: string | null;
  responsable_id: number | null;
  responsable_username: string | null;
  actif: boolean;
  est_principal: boolean;
  location_type?: 'depot' | 'magasin' | null;
  created_at: string;
}

interface StockLevel {
  id: number;
  produit_id: number;
  quantite: number | string;
  produit_nom: string;
  reference: string;
}

interface FormValues {
  code: string;
  nom: string;
  adresse: string;
  est_principal: boolean;
}

type FormErrors = Partial<Record<'code' | 'nom', string>>;

const EMPTY_FORM: FormValues = { code: '', nom: '', adresse: '', est_principal: false };

/**
 * Nom de l'emplacement, « · Principal » en texte secondaire. Une étoile de
 * 12 px devant « Emplacement principal » répétait ce que dit le mot.
 */
function LocationName({ location }: { location: StockLocation }) {
  return (
    <>
      {location.nom}
      {location.est_principal && <span className="whitespace-nowrap font-normal text-muted-foreground"> · Principal</span>}
    </>
  );
}

export default function StockLocations() {
  const { user } = useAuth();
  const canManage = MANAGE_ROLES.includes(user?.role ?? '');

  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: unknown = await stockLocationService.getAll();
      const rows = (Array.isArray(data) ? data : (data as { data?: unknown })?.data) as StockLocation[] | undefined;
      setLocations(rows ?? []);
    } catch (err) {
      setError(err);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  // --- Stock d'un emplacement, dans un tiroir (VB-LOC-01) ------------------
  const [selected, setSelected] = useState<StockLocation | null>(null);

  // --- Création ---------------------------------------------------------------
  const [showCreate, setShowCreate] = useState(false);

  const openCreate = () => setShowCreate(true);

  const tableNode = (
    <Table aria-label="Emplacements de stock">
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Nom</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((location) => (
          <TableRow key={location.id}>
            <TableCell>
              <DocumentCode>{location.code}</DocumentCode>
            </TableCell>
            <TableCell>
              <span className="font-medium">
                <LocationName location={location} />
              </span>
              {location.adresse && <span className="block text-xs text-muted-foreground">{location.adresse}</span>}
            </TableCell>
            <TableCell>{formatLocationType(location.location_type)}</TableCell>
            {/* Pastille pour l'exception seulement : un emplacement actif est l'état normal. */}
            <TableCell>
              {location.actif ? (
                <span className="text-muted-foreground">Actif</span>
              ) : (
                <StatusBadge type="compte" statut="inactif" />
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" onClick={() => setSelected(location)} aria-label={`Voir le stock de ${location.nom}`}>
                Voir le stock
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const cardsNode = locations.map((location) => (
    <DataCard
      key={location.id}
      title={<LocationName location={location} />}
      badge={location.actif ? undefined : <StatusBadge type="compte" statut="inactif" />}
      onClick={() => setSelected(location)}
      linkLabel={`Voir le stock de ${location.nom}`}
    >
      <DataCardRow label="Code" value={<DocumentCode>{location.code}</DocumentCode>} />
      <DataCardRow label="Type" value={formatLocationType(location.location_type)} />
    </DataCard>
  ));

  return (
    <PageShell
      title="Emplacements"
      description="Magasins et dépôts où le stock est suivi. Ouvrez un emplacement pour voir ce qu’il contient."
      primaryAction={
        canManage ? (
          <Button size="touch" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvel emplacement
          </Button>
        ) : undefined
      }
    >
      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          {loading ? (
            <>
              <div className="hidden md:block" aria-busy="true">
                <TableSkeleton rows={5} columns={5} />
              </div>
              <div className="md:hidden" aria-busy="true">
                <ListSkeleton items={4} />
              </div>
            </>
          ) : error ? (
            <QueryErrorState
              error={error}
              title="Impossible de charger les emplacements"
              onRetry={() => void fetchLocations()}
            />
          ) : locations.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="Aucun emplacement de stock"
              description="Créez vos magasins et dépôts pour suivre le stock de chacun"
              action={
                canManage ? (
                  <Button onClick={openCreate} className="gap-2">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel emplacement
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ResponsiveTable table={tableNode} cards={cardsNode} />
          )}
        </CardContent>
      </Card>

      <LocationStockSheet location={selected} onClose={() => setSelected(null)} />

      {showCreate && (
        <CreateLocationDialog
          existingCodes={locations.map((l) => l.code.toLowerCase())}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void fetchLocations();
          }}
        />
      )}
    </PageShell>
  );
}

// ===========================================================================
// Tiroir : stock d'un emplacement. Remplace le panneau qui s'affichait sans
// bruit sous la liste sur téléphone (VB-LOC-01) ; Radix gère focus et Échap.
// ===========================================================================
function LocationStockSheet({ location, onClose }: { location: StockLocation | null; onClose: () => void }) {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const locationId = location?.id ?? null;

  const load = useCallback(async () => {
    if (locationId === null) return;
    setLoading(true);
    setError(null);
    try {
      const data: unknown = await stockLocationService.getStockLevels(locationId);
      const rows = (Array.isArray(data) ? data : (data as { data?: unknown })?.data) as StockLevel[] | undefined;
      setLevels(rows ?? []);
    } catch (err) {
      setError(err);
      setLevels([]);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    setQuery('');
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return levels;
    return levels
      .map((level) => ({
        level,
        score: Math.max(fuzzyScore(q, level.produit_nom), fuzzyScore(q, level.reference)),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.level);
  }, [levels, query]);

  const totalUnits = levels.reduce((sum, l) => sum + (Number(l.quantite) || 0), 0);

  return (
    <Sheet open={location !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl">
        {location && (
          <>
            <SheetHeader className="border-b p-4 pr-12 sm:p-6 sm:pr-14">
              <SheetTitle>Stock — {location.nom}</SheetTitle>
              <SheetDescription>
                {loading || error
                  ? 'Produits en stock à cet emplacement'
                  : `${formatNumber(levels.length)} ${levels.length > 1 ? 'produits' : 'produit'} en stock, ${formatNumber(totalUnits)} ${totalUnits > 1 ? 'unités' : 'unité'} au total`}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label={`Rechercher un produit à ${location.nom}`}
                  placeholder="Rechercher par nom ou référence…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              {loading ? (
                <TableSkeleton rows={6} columns={3} />
              ) : error ? (
                <QueryErrorState
                  error={error}
                  title="Impossible de charger le stock de cet emplacement"
                  onRetry={() => void load()}
                />
              ) : filtered.length === 0 ? (
                query.trim() ? (
                  <EmptyState
                    compact
                    icon={Search}
                    title={`Aucun produit ne correspond à « ${query.trim()} »`}
                    description="Cherchez par nom ou référence"
                    action={
                      <Button variant="outline" onClick={() => setQuery('')} className="gap-2">
                        <X className="h-4 w-4" aria-hidden="true" /> Effacer la recherche
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    compact
                    icon={Package}
                    title="Aucun stock à cet emplacement"
                    description="Les réceptions et transferts vers cet emplacement apparaîtront ici"
                  />
                )
              ) : (
                <Table aria-label={`Stock — ${location.nom}`} containerClassName="rounded-md border">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead numeric>Quantité</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((level) => (
                      <TableRow key={level.id}>
                        <TableCell>
                          <span className="font-medium">{level.produit_nom}</span>
                          <DocumentCode className="block text-xs text-muted-foreground">{level.reference}</DocumentCode>
                        </TableCell>
                        <TableCell numeric className="font-medium">
                          {formatNumber(Number(level.quantite) || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ===========================================================================
// Création d'un emplacement.
// ===========================================================================
function CreateLocationDialog({
  existingCodes,
  onClose,
  onCreated,
}: {
  existingCodes: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const code = values.code.trim();
    const nom = values.nom.trim();
    if (!code) next.code = 'Saisissez le code de l’emplacement.';
    else if (code.length > 20) next.code = 'Le code ne doit pas dépasser 20 caractères.';
    else if (existingCodes.includes(code.toLowerCase())) next.code = 'Ce code est déjà utilisé par un autre emplacement.';
    if (!nom) next.nom = 'Saisissez le nom de l’emplacement.';
    else if (nom.length > 100) next.nom = 'Le nom ne doit pas dépasser 100 caractères.';
    return next;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`emplacement-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await stockLocationService.create({
        code: values.code.trim(),
        nom: values.nom.trim(),
        adresse: values.adresse.trim(),
        est_principal: values.est_principal,
      });
      toast.success(`Emplacement « ${values.nom.trim()} » créé`);
      onCreated();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de créer l’emplacement. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nouvel emplacement</DialogTitle>
            <DialogDescription>
              Un magasin ou un dépôt où le stock sera suivi. Les champs marqués d’un * sont obligatoires.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="emplacement-code">
              Code
              <RequiredMark />
            </Label>
            <Input
              id="emplacement-code"
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
              placeholder="Ex. : MAG-PLT"
              maxLength={20}
              autoComplete="off"
              required
              {...fieldErrorProps('emplacement-code', errors.code)}
            />
            <FieldError id="emplacement-code">{errors.code}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emplacement-nom">
              Nom
              <RequiredMark />
            </Label>
            <Input
              id="emplacement-nom"
              value={values.nom}
              onChange={(e) => setValues((v) => ({ ...v, nom: e.target.value }))}
              placeholder="Ex. : Magasin Plateau"
              maxLength={100}
              required
              {...fieldErrorProps('emplacement-nom', errors.nom)}
            />
            <FieldError id="emplacement-nom">{errors.nom}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emplacement-adresse">Adresse</Label>
            <Textarea
              id="emplacement-adresse"
              value={values.adresse}
              onChange={(e) => setValues((v) => ({ ...v, adresse: e.target.value }))}
              rows={2}
              className="min-h-[64px]"
            />
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="emplacement-principal"
              checked={values.est_principal}
              onChange={(e) => setValues((v) => ({ ...v, est_principal: e.target.checked }))}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="emplacement-principal">Emplacement principal</Label>
              <p className="text-xs text-muted-foreground">
                Il reçoit le stock quand aucun emplacement n’est précisé. Il remplace l’emplacement principal actuel.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Spinner />}
              Créer l’emplacement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
