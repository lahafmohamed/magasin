import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { userLocationAssignmentService } from '../services/api';

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
  const [saving, setSaving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  useEffect(() => {
    void fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
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
    } catch {
      toast.error('Erreur chargement des affectations');
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
    } catch {
      toast.error('Erreur chargement des affectations utilisateur');
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
      toast.error('Selectionne au moins une location');
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
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur mise a jour affectations');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Affectations Utilisateur-Locations</h1>
        <p className="text-sm text-base-content/70 mt-1">
          Configure les locations accessibles pour chaque utilisateur et la location par defaut.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Utilisateurs</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Role</th>
                    <th>Statut</th>
                    <th>Locations</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className={selectedUserId === user.id ? 'bg-primary/10 cursor-pointer' : 'cursor-pointer'}
                      onClick={() => void selectUser(user.id)}
                    >
                      <td>
                        <div className="font-medium">{user.username}</div>
                        {user.nom_complet && (
                          <div className="text-xs text-base-content/70">{user.nom_complet}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-outline">{user.role}</span>
                      </td>
                      <td>
                        <span className={`badge ${user.actif ? 'badge-success' : 'badge-ghost'}`}>
                          {user.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>{user.locations.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Affectations</h2>
            {!selectedUser ? (
              <div className="alert alert-info">
                <span>Selectionne un utilisateur pour modifier ses affectations.</span>
              </div>
            ) : (
              <>
                <div className="mb-4 text-sm">
                  <span className="font-semibold">Utilisateur:</span> {selectedUser.username}
                </div>

                <div className="space-y-3 mb-6">
                  {locations.map((location) => {
                    const checked = selectedLocationIds.includes(location.id);
                    return (
                      <label key={location.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                        <div>
                          <div className="font-medium">
                            {location.nom} <span className="text-xs text-base-content/70">({location.code})</span>
                          </div>
                          {location.est_principal && (
                            <div className="text-xs text-primary">Location principale systeme</div>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={checked}
                          onChange={(e) => toggleLocation(location.id, e.target.checked)}
                        />
                      </label>
                    );
                  })}
                </div>

                <div className="form-control mb-6">
                  <label className="label">
                    <span className="label-text">Location par defaut</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={defaultLocationId ?? ''}
                    onChange={(e) => setDefaultLocationId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    disabled={selectedLocationIds.length === 0}
                  >
                    <option value="">Aucune</option>
                    {locations
                      .filter((location) => selectedLocationIds.includes(location.id))
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.nom} ({location.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex justify-end">
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <span className="loading loading-spinner"></span> : 'Enregistrer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
