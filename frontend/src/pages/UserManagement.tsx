import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LogOut, MapPin, MoreHorizontal, Pencil, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminUserService, stockLocationService } from '../services/api';
import { iconForPath } from '@/config/routeAccess';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable, DataCard, DataCardRow } from '@/components/ui/responsive-table';
import { QueryState } from '@/components/ui/query-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { SortableHeader, toggleSort, type SortState } from '@/components/ui/sortable-header';
import { Tag } from '@/components/ui/tag';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/StatusBadge';
import { getErrorMessage } from '@/utils/errors';
import { formatLocationType, formatRole } from '@/utils/roles';
import { formatNumber } from '@/utils/format';

interface User {
  id: number;
  username: string;
  email: string | null;
  nom_complet: string | null;
  role: string;
  role_id: number;
  actif: boolean;
  locations: { id: number; nom: string; type: string }[] | null;
  created_at: string;
}

interface Role {
  id: number;
  nom: string;
  description: string;
  is_system: boolean;
}

interface Location {
  id: number;
  nom: string;
  location_type: string;
}

type SortKey = 'user' | 'role' | 'statut';
type FormErrors = Partial<Record<'username' | 'email' | 'password' | 'role_id', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RULE = '8 caractères minimum, dont une lettre et un chiffre';

const BLANK_FORM = {
  username: '',
  email: '',
  nom_complet: '',
  password: '',
  role_id: '',
  actif: true,
  location_ids: [] as number[],
};

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const data = (value as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

const displayName = (u: User) => u.nom_complet || u.username;

export default function UserManagement() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState(BLANK_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes, locationsRes] = await Promise.all([
        adminUserService.getAll(1, 100),
        adminUserService.getRoles(),
        stockLocationService.getAll(),
      ]);
      setUsers(asArray<User>(usersRes));
      setRoles(asArray<Role>(rolesRes));
      setLocations(asArray<Location>(locationsRes));
    } catch (err) {
      // Échec affiché comme tel (« Réessayer »), jamais comme « Aucun utilisateur ».
      setError(err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /**
   * Coupe toutes les sessions actives d'un compte. Utile quand un poste reste
   * connecté, quand un salarié quitte la société, ou après un mot de passe
   * compromis : désactiver le compte n'expulse pas les jetons déjà émis.
   */
  const handleRevokeSessions = async (user: User) => {
    if (
      !(await confirm({
        title: `Déconnecter ${displayName(user)} de tous ses appareils ?`,
        description:
          'Toutes les sessions ouvertes de ce compte sont fermées immédiatement. La personne devra se reconnecter.',
        confirmLabel: 'Déconnecter de tous les appareils',
        destructive: true,
      }))
    )
      return;
    setRevoking(user.id);
    try {
      await adminUserService.revokeAllSessions(user.id);
      toast.success(`${displayName(user)} a été déconnecté de tous ses appareils`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible de déconnecter cet utilisateur. Réessayez.'));
    } finally {
      setRevoking(null);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData(BLANK_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormErrors({});
    setFormData({
      username: user.username,
      email: user.email || '',
      nom_complet: user.nom_complet || '',
      password: '',
      role_id: user.role_id?.toString() || '',
      actif: user.actif,
      location_ids: user.locations ? user.locations.map((l) => l.id) : [],
    });
    setShowForm(true);
  };

  const toggleLocation = (id: number) => {
    setFormData((prev) => ({
      ...prev,
      location_ids: prev.location_ids.includes(id)
        ? prev.location_ids.filter((locId) => locId !== id)
        : [...prev.location_ids, id],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const username = formData.username.trim();
    const email = formData.email.trim();
    const roleId = Number.parseInt(formData.role_id, 10);
    const errors: FormErrors = {};
    if (!username) errors.username = 'Saisissez un identifiant.';
    else if (username.length < 3) errors.username = 'L’identifiant doit contenir au moins 3 caractères.';
    if (email && !EMAIL_RE.test(email)) errors.email = 'Saisissez une adresse e-mail valide (ex. : nom@entreprise.ci).';
    if (!editingUser && !formData.password) errors.password = 'Saisissez un mot de passe.';
    else if (
      formData.password &&
      (formData.password.length < 8 || !/[A-Za-z]/.test(formData.password) || !/\d/.test(formData.password))
    ) {
      errors.password = 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.';
    }
    if (!Number.isInteger(roleId) || roleId <= 0) errors.role_id = 'Choisissez un rôle.';

    setFormErrors(errors);
    const first = (['username', 'email', 'password', 'role_id'] as const).find((k) => errors[k]);
    if (first) {
      const ids = { username: 'user-username', email: 'user-email', password: 'user-password', role_id: 'user-role' };
      requestAnimationFrame(() => document.getElementById(ids[first])?.focus());
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        ...formData,
        username,
        email,
        nom_complet: formData.nom_complet.trim(),
        role_id: roleId,
      };
      if (editingUser) {
        if (!payload.password) delete payload.password;
        await adminUserService.update(editingUser.id, payload);
        toast.success('Utilisateur modifié');
      } else {
        await adminUserService.create(payload);
        toast.success('Utilisateur créé');
      }
      setShowForm(false);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer l’utilisateur. Réessayez.'));
    } finally {
      setSubmitting(false);
    }
  };

  const query = searchTerm.trim().toLowerCase();
  const sortedUsers = useMemo(() => {
    const filtered = users.filter(
      (u) => u.username.toLowerCase().includes(query) || (u.nom_complet ?? '').toLowerCase().includes(query)
    );
    if (!sort) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'statut') return ((a.actif ? 1 : 0) - (b.actif ? 1 : 0)) * dir;
      const av = sort.key === 'role' ? formatRole(a.role) : displayName(a);
      const bv = sort.key === 'role' ? formatRole(b.role) : displayName(b);
      return String(av).localeCompare(String(bv), 'fr') * dir;
    });
  }, [users, query, sort]);

  const handleSort = (key: SortKey) => setSort((s) => toggleSort(s, key));

  const locationTags = (u: User) =>
    u.locations && u.locations.length > 0 ? (
      <span className="flex flex-wrap gap-1">
        {u.locations.map((loc) => (
          <Tag key={loc.id} icon={MapPin}>
            {loc.nom}
          </Tag>
        ))}
      </span>
    ) : (
      <span className="text-muted-foreground">Aucun emplacement</span>
    );

  const rowActions = (u: User, touch: boolean) => (
    <>
      {/* Bureau : un bouton icône discret (une colonne de « Modifier » encadrés
          pesait plus que les noms) ; carte mobile : le bouton écrit reste. */}
      {touch ? (
        <Button
          variant="outline"
          size="touch"
          className="gap-2"
          onClick={() => handleOpenEdit(u)}
          aria-label={`Modifier l’utilisateur ${displayName(u)}`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" /> Modifier
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleOpenEdit(u)}
          aria-label={`Modifier l’utilisateur ${displayName(u)}`}
          title="Modifier"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={touch ? 'outline' : 'ghost'}
            size={touch ? 'icon-touch' : 'icon'}
            aria-label={`Plus d’actions pour ${displayName(u)}`}
            title="Plus d’actions"
            disabled={revoking === u.id}
          >
            {revoking === u.id ? <Spinner /> : <MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem className={touch ? 'min-h-11 gap-2' : 'gap-2'} onSelect={() => void handleRevokeSessions(u)}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Déconnecter de tous les appareils
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const status = loading || error ? '' : `${formatNumber(sortedUsers.length)} ${sortedUsers.length > 1 ? 'utilisateurs' : 'utilisateur'}`;

  return (
    <PageShell
      title="Utilisateurs"
      description="Comptes de connexion, rôles et emplacements autorisés"
      primaryAction={
        <Button size="touch" onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel utilisateur
        </Button>
      }
      toolbar={
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            enterKeyHint="search"
            aria-label="Rechercher un utilisateur"
            placeholder="Nom ou identifiant…"
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      }
    >
      <p role="status" className="sr-only">
        {status}
      </p>

      <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent inset="flush">
          <QueryState
            loading={loading}
            error={error}
            onRetry={() => void fetchData()}
            errorTitle="Impossible de charger les utilisateurs"
            skeleton={<ListSkeleton items={5} />}
            isEmpty={sortedUsers.length === 0}
            emptyIcon={iconForPath('/admin/users')}
            emptyTitle={query ? `Aucun utilisateur ne correspond à «\u00A0${searchTerm.trim()}\u00A0»` : 'Aucun utilisateur'}
            emptyDescription={query ? 'Cherchez par nom ou identifiant' : 'Créez un compte pour chaque personne qui utilise le programme'}
            emptyAction={
              query ? (
                <Button variant="outline" className="gap-1.5" onClick={() => setSearchTerm('')}>
                  <X className="h-4 w-4" aria-hidden="true" /> Effacer la recherche
                </Button>
              ) : undefined
            }
          >
            <ResponsiveTable
              table={
                <Table aria-label="Liste des utilisateurs">
                  <TableHeader>
                    <TableRow>
                      <SortableHeader columnKey="user" sort={sort} onSort={handleSort}>
                        Utilisateur
                      </SortableHeader>
                      <SortableHeader columnKey="role" sort={sort} onSort={handleSort}>
                        Rôle
                      </SortableHeader>
                      <TableHead>Emplacements</TableHead>
                      <SortableHeader columnKey="statut" sort={sort} onSort={handleSort}>
                        Statut
                      </SortableHeader>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium">{user.nom_complet || '—'}</div>
                          <div className="text-xs text-muted-foreground">@{user.username}</div>
                        </TableCell>
                        <TableCell>
                          <Tag>{formatRole(user.role)}</Tag>
                        </TableCell>
                        <TableCell>{locationTags(user)}</TableCell>
                        {/* Pastille pour l'exception seulement : un compte actif est l'état normal. */}
                        <TableCell>{!user.actif && <StatusBadge type="compte" statut="inactif" />}</TableCell>
                        <TableCell className="w-px whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">{rowActions(user, false)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={sortedUsers.map((user) => (
                <DataCard
                  key={user.id}
                  title={displayName(user)}
                  badge={user.actif ? undefined : <StatusBadge type="compte" statut="inactif" />}
                  actions={rowActions(user, true)}
                >
                  <DataCardRow label="Identifiant" value={`@${user.username}`} />
                  <DataCardRow label="Rôle" value={formatRole(user.role)} />
                  <DataCardRow
                    label="Emplacements"
                    value={user.locations && user.locations.length > 0 ? user.locations.map((l) => l.nom).join(', ') : 'Aucun emplacement'}
                  />
                </DataCard>
              ))}
            />
          </QueryState>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? `Modifier l’utilisateur ${displayName(editingUser)}` : 'Nouvel utilisateur'}</DialogTitle>
            <DialogDescription>Les champs marqués d’un * sont obligatoires</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-nom">Nom complet</Label>
                <Input
                  id="user-nom"
                  autoComplete="name"
                  value={formData.nom_complet}
                  onChange={(e) => setFormData({ ...formData, nom_complet: e.target.value })}
                  placeholder="Ex. : Awa Koné"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-username">
                  Identifiant <RequiredMark />
                </Label>
                <Input
                  id="user-username"
                  autoComplete="off"
                  value={formData.username}
                  onChange={(e) => {
                    setFormData({ ...formData, username: e.target.value });
                    setFormErrors((p) => ({ ...p, username: undefined }));
                  }}
                  disabled={!!editingUser}
                  aria-invalid={!editingUser && formErrors.username ? true : undefined}
                  aria-describedby={
                    editingUser ? 'user-username-help' : formErrors.username ? 'user-username-error' : undefined
                  }
                />
                {editingUser && (
                  <p id="user-username-help" className="text-xs text-muted-foreground">
                    L’identifiant ne se modifie pas
                  </p>
                )}
                <FieldError id="user-username">{formErrors.username}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-email">Adresse e-mail</Label>
                <Input
                  id="user-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setFormErrors((p) => ({ ...p, email: undefined }));
                  }}
                  {...fieldErrorProps('user-email', formErrors.email)}
                />
                <FieldError id="user-email">{formErrors.email}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-password">
                  Mot de passe {editingUser ? <span className="font-normal text-muted-foreground">(facultatif)</span> : <RequiredMark />}
                </Label>
                <PasswordInput
                  id="user-password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setFormErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder={editingUser ? 'Laissez vide pour garder le mot de passe actuel' : PASSWORD_RULE}
                  aria-invalid={formErrors.password ? true : undefined}
                  aria-describedby={formErrors.password ? 'user-password-help user-password-error' : 'user-password-help'}
                />
                <p id="user-password-help" className="text-xs text-muted-foreground">
                  {editingUser ? `Laissez vide pour garder le mot de passe actuel. ${PASSWORD_RULE}.` : `${PASSWORD_RULE}.`}
                </p>
                <FieldError id="user-password">{formErrors.password}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-role">
                  Rôle <RequiredMark />
                </Label>
                <Select
                  name="role"
                  value={formData.role_id}
                  onValueChange={(v) => {
                    setFormData({ ...formData, role_id: v });
                    setFormErrors((p) => ({ ...p, role_id: undefined }));
                  }}
                >
                  <SelectTrigger id="user-role" className="w-full" {...fieldErrorProps('user-role', formErrors.role_id)}>
                    <SelectValue placeholder="Choisir un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {formatRole(r.nom)}
                        {r.description ? ` — ${r.description}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="user-role">{formErrors.role_id}</FieldError>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium">Statut du compte</span>
                <label htmlFor="user-actif" className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id="user-actif"
                    checked={formData.actif}
                    onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                    aria-describedby="user-actif-help"
                  />
                  Compte actif
                </label>
                <p id="user-actif-help" className="text-xs text-muted-foreground">
                  Un compte désactivé ne peut plus se connecter
                </p>
              </div>
            </div>

            <fieldset className="space-y-3 border-t pt-4">
              <legend className="float-left mb-1 w-full text-sm font-semibold">Emplacements autorisés</legend>
              <p className="clear-both text-xs text-muted-foreground">
                Les magasins et dépôts dont cette personne utilise la caisse et le stock
              </p>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun emplacement n’est encore créé</p>
              ) : (
                <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
                  {locations.map((loc) => {
                    const checked = formData.location_ids.includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        htmlFor={`user-loc-${loc.id}`}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                          checked ? 'border-primary-200 bg-primary-50' : 'bg-background hover:bg-accent'
                        }`}
                      >
                        <Checkbox
                          id={`user-loc-${loc.id}`}
                          checked={checked}
                          onChange={() => toggleLocation(loc.id)}
                          className="mt-0.5"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium">{loc.nom}</span>
                          <span className="text-xs text-muted-foreground">{formatLocationType(loc.location_type)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting && <Spinner />}
                {submitting ? 'Enregistrement…' : editingUser ? 'Enregistrer les modifications' : 'Créer l’utilisateur'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
