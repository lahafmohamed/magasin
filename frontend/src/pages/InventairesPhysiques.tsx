import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  inventaireService,
  produitService,
  stockLocationService,
  type Inventaire,
} from '@/services/api';
import { useAuth } from '@/lib/AuthContext';
import { useSearchParamsPatch } from '@/hooks/useUrlState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RequiredMark } from '@/components/ui/required-mark';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { Spinner } from '@/components/ui/loading';
import { Money } from '@/components/ui/money';
import { QueryErrorState } from '@/components/ui/query-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import StatusBadge, { getStatusLabel, getStatusOptions } from '@/components/StatusBadge';
import { DocumentListPage, useDocumentList, type DocumentColumn } from '@/components/DocumentListPage';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatDateNumeric, formatNumber } from '@/utils/format';

interface StockLocation {
  id: number;
  nom: string;
  location_type?: string;
  actif?: boolean;
}

const STATUS_CHIPS = [{ value: 'all', label: 'Tous' }, ...getStatusOptions('inventaire')];
const TOUTES = 'toutes';

/** « 412 / 900 » — produits comptés sur produits de la feuille. */
const progression = (i: Inventaire) => `${formatNumber(i.nb_comptees)} / ${formatNumber(i.nb_lignes)}`;

// ---------------------------------------------------------------------------
// Ouverture d'un inventaire
// ---------------------------------------------------------------------------

function NouvelInventaireDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: { id: number; numero: string; nb_lignes: number }) => void;
}) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [locationId, setLocationId] = useState('');
  const [categorie, setCategorie] = useState(TOUTES);
  const [aveugle, setAveugle] = useState(true);
  const [notes, setNotes] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [locs, cats] = await Promise.all([
        stockLocationService.getAll() as Promise<StockLocation[] | { data?: StockLocation[] }>,
        // Les catégories ne servent qu'à restreindre la feuille : sans elles,
        // l'inventaire complet reste possible.
        produitService.getStockByCategory().catch(() => [] as unknown[]),
      ]);
      const rows = Array.isArray(locs) ? locs : (locs?.data ?? []);
      const actifs = rows.filter((l) => l.actif !== false);
      setLocations(actifs);
      if (actifs.length === 1) setLocationId(String(actifs[0].id));
      setCategories(
        (Array.isArray(cats) ? cats : [])
          .map((c) => (c as { categorie?: unknown }).categorie)
          .filter((c): c is string => typeof c === 'string' && c !== '' && c !== 'Sans catégorie')
          .sort((a, b) => a.localeCompare(b, 'fr'))
      );
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const reset = () => {
    setLocationId('');
    setCategorie(TOUTES);
    setAveugle(true);
    setNotes('');
    setLocationError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId) {
      setLocationError('Choisissez l’emplacement à compter.');
      document.getElementById('inventaire-emplacement')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const created = await inventaireService.create({
        location_id: Number(locationId),
        categorie: categorie === TOUTES ? undefined : categorie,
        comptage_aveugle: aveugle,
        notes: notes.trim() || undefined,
      });
      toast.success(`Inventaire ${created.numero} ouvert`);
      reset();
      onCreated(created);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’ouvrir l’inventaire. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvel inventaire</DialogTitle>
          <DialogDescription>
            La feuille reprend les produits en stock à cet emplacement. Le stock ne change qu’à la validation
            de l’inventaire.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <QueryErrorState
            error={loadError}
            title="Impossible de charger les emplacements"
            onRetry={() => void load()}
            className="py-6"
          />
        ) : (
          <form id="inventaire-form" onSubmit={submit} noValidate className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="inventaire-emplacement">
                Emplacement à compter <RequiredMark />
              </Label>
              <Select
                value={locationId || undefined}
                onValueChange={(v) => {
                  setLocationId(v);
                  setLocationError(null);
                }}
                disabled={loading}
              >
                <SelectTrigger
                  id="inventaire-emplacement"
                  className="h-11 sm:h-9"
                  {...fieldErrorProps('inventaire-emplacement', locationError)}
                >
                  <SelectValue placeholder={loading ? 'Chargement…' : 'Choisir un emplacement'} />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>
                      {loc.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="inventaire-emplacement">{locationError}</FieldError>
            </div>

            {categories.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="inventaire-categorie">Catégorie</Label>
                <Select value={categorie} onValueChange={setCategorie}>
                  <SelectTrigger id="inventaire-categorie" className="h-11 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TOUTES}>Toutes les catégories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choisissez une catégorie pour un inventaire tournant, rayon par rayon
                </p>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Checkbox
                id="inventaire-aveugle"
                checked={aveugle}
                onChange={(e) => setAveugle(e.target.checked)}
                className="mt-0.5"
                aria-describedby="inventaire-aveugle-aide"
              />
              <div className="space-y-0.5">
                <Label htmlFor="inventaire-aveugle">Comptage à l’aveugle</Label>
                <p id="inventaire-aveugle-aide" className="text-xs text-muted-foreground">
                  Les personnes qui comptent ne voient pas le stock attendu : elles comptent ce qui est en rayon
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inventaire-notes">Notes</Label>
              <Input
                id="inventaire-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                placeholder="Ex. : inventaire de fin d’année"
                className="h-11 sm:h-9"
              />
            </div>
          </form>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="inventaire-form"
            size="touch"
            disabled={submitting || !!loadError}
            className="gap-2"
          >
            {submitting ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            Ouvrir l’inventaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventairesPhysiques() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const updateParams = useSearchParamsPatch();

  // Mêmes rôles que l'API : ouvrir un inventaire revient au gérant et à l'administrateur.
  const canCreate = hasRole('admin', 'manager');
  const createOpen = canCreate && searchParams.get('nouveau') === '1';

  const list = useDocumentList<Inventaire>({
    defaultSortKey: 'created_at',
    fetchList: (search, statut, page, limit) => inventaireService.getAll(search, statut, page, limit),
    loadErrorMessage: 'Impossible de charger les inventaires.',
  });

  const columns: DocumentColumn<Inventaire>[] = [
    {
      header: 'N° d’inventaire',
      primary: true,
      render: (i) => i.numero,
    },
    {
      header: 'Emplacement',
      render: (i) => (
        <span>
          {i.location_nom}
          {i.categorie && <span className="text-muted-foreground"> · {i.categorie}</span>}
        </span>
      ),
    },
    {
      header: 'Statut',
      card: 'badge',
      render: (i) => <StatusBadge type="inventaire" statut={i.statut} />,
    },
    {
      header: 'Ouvert le',
      cellClassName: 'whitespace-nowrap',
      render: (i) => formatDate(i.created_at),
    },
    {
      header: 'Produits comptés',
      align: 'right',
      numeric: true,
      render: (i) => progression(i),
    },
    ...(canCreate
      ? ([
          {
            header: 'Écarts',
            align: 'right',
            numeric: true,
            render: (i) =>
              i.nb_ecarts === undefined ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                formatNumber(i.nb_ecarts)
              ),
          },
          {
            header: 'Valeur de l’écart',
            align: 'right',
            numeric: true,
            render: (i) =>
              i.nb_comptees > 0 ? <Money value={i.valeur_ecart} signed /> : <span className="text-muted-foreground">—</span>,
          },
        ] satisfies DocumentColumn<Inventaire>[])
      : []),
  ];

  const createButton = canCreate ? (
    <Button size="touch" className="gap-2" onClick={() => updateParams((p) => p.set('nouveau', '1'))}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Nouvel inventaire
    </Button>
  ) : null;

  return (
    <>
      <DocumentListPage<Inventaire>
        list={list}
        title="Inventaire physique"
        subtitle="Comptez le stock d’un emplacement, puis ajustez les écarts en une seule fois"
        createButton={createButton}
        searchPlaceholder="Numéro ou emplacement… ( / )"
        searchLabel="Rechercher un inventaire"
        statusChips={STATUS_CHIPS}
        shortcuts={{ newRoute: '/inventaire-physique?nouveau=1', newDescription: 'Nouvel inventaire' }}
        csv={{
          filenamePrefix: 'inventaires',
          headers: ['N° d’inventaire', 'Emplacement', 'Catégorie', 'Statut', 'Ouvert le', 'Produits comptés', 'Produits'],
          row: (i) => [
            i.numero,
            i.location_nom,
            i.categorie ?? '',
            getStatusLabel('inventaire', i.statut),
            formatDateNumeric(i.created_at),
            i.nb_comptees,
            i.nb_lignes,
          ],
          fetchAll: async (search, statut) => {
            const res = await inventaireService.getAll(search, statut, 1, 100);
            return res?.data ?? [];
          },
        }}
        columns={columns}
        detailPath={(i) => `/inventaire-physique/${i.id}`}
        selectable={false}
        itemNoun={{ one: 'inventaire', many: 'inventaires' }}
        emptyState={{
          icon: ClipboardCheck,
          title: 'Aucun inventaire pour le moment',
          description: canCreate
            ? 'Ouvrez un inventaire pour compter un emplacement : les écarts sont ajustés à la validation'
            : 'Les inventaires ouverts par le gérant apparaîtront ici, prêts à être comptés',
          filteredTitle: list.committedSearch
            ? `Aucun inventaire ne correspond à « ${list.committedSearch} »`
            : 'Aucun inventaire ne correspond à ces filtres',
          filteredDescription: 'Vérifiez le numéro ou l’emplacement, ou choisissez un autre statut',
          createAction: createButton,
        }}
      />

      <NouvelInventaireDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) updateParams((p) => p.delete('nouveau'));
        }}
        onCreated={(created) => navigate(`/inventaire-physique/${created.id}`)}
      />
    </>
  );
}
