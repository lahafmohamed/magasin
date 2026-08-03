import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { userLocationAssignmentService } from '../services/api';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/loading';
import { PageHeader } from '@/components/ui/page-header';
import { QueryState } from '@/components/ui/query-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AssignmentUser {
  id: number;
  username: string;
  nom_complet: string | null;
  role: 'admin' | 'manager' | 'caissier';
  actif: boolean;
  locations: { location_id: number; est_defaut: boolean }[];
}

interface AssignmentLocation {
  id: number;
  code: string;
  nom: string;
  est_principal: boolean;
}

export default function AffectationsLocations() {
  const [users, setUsers] = useState<AssignmentUser[]>([]);
  const [locations, setLocations] = useState<AssignmentLocation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  useEffect(() => {
    void fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, locationsData] = await Promise.all([
        userLocationAssignmentService.getUsers(),
        userLocationAssignmentService.getLocations(),
      ]);

      const usersList: AssignmentUser[] = usersData.data || usersData;
      const locationsList: AssignmentLocation[] = locationsData.data || locationsData;

      setUsers(usersList);
      setLocations(locationsList);

      if (usersList.length > 0) {
        await selectUser(usersList[0].id, usersList);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const selectUser = async (userId: number, usersSource?: AssignmentUser[]) => {
    setSelectedUserId(userId);

    try {
      const detail = await userLocationAssignmentService.getByUserId(userId);
      const user = (detail.data || detail) as AssignmentUser;

      const locationIds = user.locations.map((entry) => entry.location_id);
      const defaultId = user.locations.find((entry) => entry.est_defaut)?.location_id || null;

      setSelectedLocationIds(locationIds);
      setDefaultLocationId(defaultId);

      if (usersSource) {
        setUsers(usersSource);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur chargement des affectations utilisateur'));
    }
  };

  const toggleLocation = (locationId: number, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedLocationIds, locationId]))
      : selectedLocationIds.filter((id) => id !== locationId);

    setSelectedLocationIds(next);

    if (!checked && defaultLocationId === locationId) {
      setDefaultLocationId(next[0] || null);
    }
  };

  const handleSave = async () => {
    if (!selectedUserId) return;

    if (selectedLocationIds.length === 0) {
      toast.error('Sélectionnez au moins un emplacement');
      return;
    }

    setSaving(true);
    try {
      await userLocationAssignmentService.update(selectedUserId, {
        location_ids: selectedLocationIds,
        default_location_id: defaultLocationId,
      });

      toast.success('Affectations mises a jour');

      const usersData = await userLocationAssignmentService.getUsers();
      const usersList: AssignmentUser[] = usersData.data || usersData;
      setUsers(usersList);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erreur mise a jour affectations'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <PageHeader
        className="mb-6"
        title="Affectations des utilisateurs"
        description="Configurez les emplacements accessibles à chaque utilisateur et son emplacement par défaut."
      />

      <QueryState
        loading={loading}
        error={error}
        isEmpty={users.length === 0}
        onRetry={() => void fetchInitialData()}
        skeleton={<TableSkeleton rows={6} columns={4} />}
        emptyIcon={Users}
        emptyTitle="Aucun utilisateur"
        emptyDescription="Créez des utilisateurs pour leur affecter des emplacements."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-md border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold mb-3">Utilisateurs</h2>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Emplacements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow
                        key={user.id}
                        className={`cursor-pointer ${selectedUserId === user.id ? 'bg-primary/10' : ''}`}
                        onClick={() => void selectUser(user.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{user.username}</div>
                          {user.nom_complet && (
                            <div className="text-xs text-muted-foreground">{user.nom_complet}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                            {user.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            user.actif ? 'bg-success-100 text-success-700' : 'bg-muted text-muted-foreground'
                          }`}>
                            {user.actif ? 'Actif' : 'Inactif'}
                          </span>
                        </TableCell>
                        <TableCell className="num">{user.locations.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-card shadow-sm">
            <div className="p-5">
              <h2 className="text-lg font-semibold mb-3">Affectations</h2>
              {!selectedUser ? (
                <div className="rounded-md border border-info-200 bg-info-50 p-3 text-sm text-info-700">
                  Sélectionnez un utilisateur pour modifier ses affectations.
                </div>
              ) : (
                <>
                  <div className="mb-4 text-sm">
                    <span className="font-semibold">Utilisateur:</span> {selectedUser.username}
                  </div>

                  <div className="space-y-2 mb-6">
                    {locations.map((location) => {
                      const checked = selectedLocationIds.includes(location.id);
                      return (
                        <label key={location.id} className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/30 cursor-pointer">
                          <div>
                            <div className="font-medium">
                              {location.nom} <span className="text-xs text-muted-foreground">({location.code})</span>
                            </div>
                            {location.est_principal && (
                              <div className="text-xs text-primary">Emplacement principal du système</div>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                            checked={checked}
                            onChange={(e) => toggleLocation(location.id, e.target.checked)}
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div className="space-y-1.5 mb-6">
                    <Label htmlFor="default-location">Emplacement par défaut</Label>
                    <Select
                      value={defaultLocationId == null ? '__none' : String(defaultLocationId)}
                      onValueChange={(v) => setDefaultLocationId(v === '__none' ? null : parseInt(v, 10))}
                      disabled={selectedLocationIds.length === 0}
                    >
                      <SelectTrigger id="default-location" className="h-9 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Aucune</SelectItem>
                        {locations
                          .filter((location) => selectedLocationIds.includes(location.id))
                          .map((location) => (
                            <SelectItem key={location.id} value={String(location.id)}>
                              {location.nom} ({location.code})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? (
                        <>
                          <Spinner />
                          Enregistrement…
                        </>
                      ) : (
                        'Enregistrer'
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </QueryState>
    </div>
  );
}
