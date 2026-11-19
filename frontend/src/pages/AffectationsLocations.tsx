import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { userLocationAssignmentService } from '../services/api';
import { PageShell } from '@/components/ui/page-shell';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DocumentCode } from '@/components/ui/document-code';
import { EmptyState } from '@/components/ui/empty-state';
import { FieldError } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/loading';
import { QueryErrorState } from '@/components/ui/query-state';
import { CardSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { formatNumber } from '@/utils/format';
import { formatRole } from '@/utils/roles';

const NO_DEFAULT = '__aucun';

interface AssignmentUser {
  id: number;
  username: string;
  nom_complet: string | null;
  role: string | null;
  actif: boolean;
  locations: { location_id: number; est_defaut: boolean }[];
}

interface AssignmentLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
}

const rowsOf = <T,>(response: unknown): T[] => {
  const rows = Array.isArray(response) ? response : (response as { data?: unknown })?.data;
  return Array.isArray(rows) ? (rows as T[]) : [];
};

/**
 * « de Koffi Blé », « d’Adjoua Yao » : élision devant une voyelle. Le « y »
 * n'en est pas une ici (« de Yao », « de Yéo »).
 */
const deName = (name: string) => (/^[aeiouàâäéèêëîïôöùûüœæ]/i.test(name) ? `d’${name}` : `de ${name}`);

/** Interactions propres dans une ligne : le clic-ligne ne doit pas les doubler. */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="checkbox"], [role="combobox"]';

export default function AffectationsLocations() {
  const [users, setUsers] = useState<AssignmentUser[]>([]);
  const [locations, setLocations] = useState<AssignmentLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);
  const userName = (u: AssignmentUser) => u.nom_complet?.trim() || u.username;

  // La liste porte déjà les affectations de chaque utilisateur : la sélection
  // ne refait pas de requête (l'ancien appel par utilisateur échouait en
  // silence et laissait les cases du précédent).
  const applySelection = useCallback((user: AssignmentUser) => {
    setSelectedUserId(user.id);
    setSelectedLocationIds(user.locations.map((l) => l.location_id));
    setDefaultLocationId(user.locations.find((l) => l.est_defaut)?.location_id ?? null);
    setSaveError(null);
  }, []);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, locationsData] = await Promise.all([
        userLocationAssignmentService.getUsers(),
        userLocationAssignmentService.getLocations(),
      ]);
      const usersList = rowsOf<AssignmentUser>(usersData);
      setUsers(usersList);
      setLocations(rowsOf<AssignmentLocation>(locationsData));
      if (usersList.length > 0) applySelection(usersList[0]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [applySelection]);

  useEffect(() => {
    void fetchInitialData();
  }, [fetchInitialData]);

  /** Choix par l'utilisateur : sous 1024 px le détail est sous la liste — on l'y amène. */
  const chooseUser = (user: AssignmentUser) => {
    applySelection(user);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => {
        detailHeadingRef.current?.scrollIntoView({ block: 'start' });
        detailHeadingRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const onRowClick = (user: AssignmentUser, event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as Element).closest(INTERACTIVE)) return;
    chooseUser(user);
  };

  const toggleLocation = (locationId: number, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedLocationIds, locationId]))
      : selectedLocationIds.filter((id) => id !== locationId);
    setSelectedLocationIds(next);
    setSaveError(null);
    if (!checked && defaultLocationId === locationId) setDefaultLocationId(next[0] ?? null);
    // Premier emplacement coché sans emplacement par défaut : il le devient.
    if (checked && defaultLocationId === null) setDefaultLocationId(locationId);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    if (selectedLocationIds.length === 0) {
      setSaveError('Choisissez au moins un emplacement.');
      return;
    }
    setSaving(true);
    try {
      await userLocationAssignmentService.update(selectedUser.id, {
        location_ids: selectedLocationIds,
        default_location_id: defaultLocationId,
      });
      toast.success(`Affectations de ${userName(selectedUser)} enregistrées`);
      try {
        const refreshed = rowsOf<AssignmentUser>(await userLocationAssignmentService.getUsers());
        setUsers(refreshed);
      } catch {
        /* La liste se mettra à jour au prochain chargement. */
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer les affectations. Réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  const usersCard = (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>Utilisateurs</CardTitle>
        <CardDescription>Choisissez un utilisateur pour modifier ses emplacements</CardDescription>
      </CardHeader>
      <CardContent inset="flush" className="border-t">
        <Table aria-label="Utilisateurs">
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead numeric>Emplacements</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelected = user.id === selectedUserId;
              return (
                <TableRow
                  key={user.id}
                  className={cn('cursor-pointer', isSelected && 'bg-primary-50 hover:bg-primary-50')}
                  onClick={(e) => onRowClick(user, e)}
                >
                  <TableCell>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => chooseUser(user)}
                      className="min-h-6 rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {user.username}
                    </button>
                    <span className="block text-xs text-muted-foreground">
                      {[user.nom_complet, formatRole(user.role)].filter(Boolean).join(' · ')}
                    </span>
                  </TableCell>
                  {/* Pastille pour l'exception seulement : un compte actif est l'état normal. */}
                  <TableCell>
                    {user.actif ? (
                      <span className="text-muted-foreground">Actif</span>
                    ) : (
                      <StatusBadge type="compte" statut="inactif" />
                    )}
                  </TableCell>
                  <TableCell numeric>{formatNumber(user.locations.length)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const detailCard = (
    <Card className="min-w-0 scroll-mt-24 lg:col-span-3">
      <CardHeader>
        <CardTitle
          ref={detailHeadingRef}
          tabIndex={-1}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {selectedUser ? `Emplacements ${deName(userName(selectedUser))}` : 'Emplacements'}
        </CardTitle>
        <CardDescription>
          {selectedUser
            ? `Cochez les emplacements auxquels ${userName(selectedUser)} a accès, puis son emplacement par défaut`
            : 'Choisissez un utilisateur dans la liste'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!selectedUser ? (
          <p className="text-sm text-muted-foreground">Aucun utilisateur choisi</p>
        ) : locations.length === 0 ? (
          <EmptyState
            compact
            title="Aucun emplacement actif"
            description="Créez d’abord un magasin ou un dépôt dans Emplacements"
          />
        ) : (
          <>
            <fieldset className="space-y-2" aria-describedby={saveError ? 'affectations-error' : undefined}>
              <legend className="mb-2 text-sm font-medium">Emplacements autorisés</legend>
              {locations.map((location) => {
                const checked = selectedLocationIds.includes(location.id);
                return (
                  <label
                    key={location.id}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/40',
                      checked && 'border-primary-300 bg-primary-50 hover:bg-primary-50'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={(e) => toggleLocation(location.id, e.target.checked)}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{location.nom}</span>
                      <span className="block text-xs text-muted-foreground">
                        <DocumentCode>{location.code}</DocumentCode>
                        {location.est_principal && ' · Principal'}
                      </span>
                    </span>
                  </label>
                );
              })}
              <FieldError id="affectations">{saveError}</FieldError>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="affectations-defaut">Emplacement par défaut</Label>
              <Select
                value={defaultLocationId == null ? NO_DEFAULT : String(defaultLocationId)}
                onValueChange={(v) => setDefaultLocationId(v === NO_DEFAULT ? null : Number(v))}
                disabled={selectedLocationIds.length === 0}
              >
                <SelectTrigger id="affectations-defaut">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEFAULT}>Aucun</SelectItem>
                  {locations
                    .filter((location) => selectedLocationIds.includes(location.id))
                    .map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.nom}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                L’emplacement proposé en premier à cet utilisateur (caisse, inventaire, demandes)
              </p>
            </div>

            <div className="flex justify-end">
              <Button size="touch" onClick={() => void handleSave()} disabled={saving} className="gap-2">
                {saving && <Spinner />}
                Enregistrer les affectations
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <PageShell
      title="Affectations"
      description="Choisissez les emplacements auxquels chaque utilisateur a accès et celui qui lui est proposé par défaut"
    >
      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6" aria-busy="true">
          <Card className="lg:col-span-2">
            <TableSkeleton rows={6} columns={3} />
          </Card>
          <Card className="lg:col-span-3">
            <CardContent inset="standalone">
              <CardSkeleton lines={6} />
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <Card>
          <QueryErrorState
            error={error}
            title="Impossible de charger les affectations"
            onRetry={() => void fetchInitialData()}
          />
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Aucun utilisateur"
            description="Créez des utilisateurs pour leur affecter des emplacements"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5 lg:gap-6">
          {usersCard}
          {detailCard}
        </div>
      )}
    </PageShell>
  );
}
