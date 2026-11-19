import * as React from 'react';
import { Search, X, Users, Truck, UserCheck, UserPlus, AlertCircle } from 'lucide-react';
import { tiersService } from '../services/api';
import { Tiers } from '../types';
import { TiersRoleBadge } from './TiersRoleBadge';
import { NouveauClientDialog } from './NouveauClientDialog';
import { DocumentCode } from '@/components/ui/document-code';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import { useOptionalAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { plural } from '@/validation/salesForms';

/** Ce que le sélecteur affiche d'un contact — un `Tiers` complet convient. */
export type TiersPickerValue = Pick<
  Tiers,
  'id' | 'code' | 'raison_sociale' | 'prenom' | 'telephone' | 'est_client' | 'est_fournisseur'
>;

/** Poignée exposée par `ref` : mettre le focus sur le sélecteur (erreur de validation). */
export interface TiersPickerHandle {
  focus: () => void;
}

interface TiersPickerProps {
  role?: 'client' | 'fournisseur';
  value: TiersPickerValue | null;
  onChange: (tiers: Tiers | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Posé sur l'input de recherche, pour qu'un <Label htmlFor> puisse le cibler. */
  id?: string;
  /** Nom du champ porté par un titre de section (`id` du titre). */
  'aria-labelledby'?: string;
  /** Signalement d'erreur — à relier au message via `fieldErrorProps`. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /**
   * Propose « Créer le client » dans les résultats (D4). Par défaut : sélecteur
   * de clients, pour l'administrateur, le gérant, le caissier et le personnel
   * du magasin. `false` quand le client est imposé (avoir, bon de livraison).
   */
  allowCreate?: boolean;
}

const CREATE_ROLES = ['admin', 'manager', 'caissier', 'magasin_staff'] as const;

const NOUN = {
  client: { one: 'client trouvé', many: 'clients trouvés', none: 'Aucun client', change: 'Changer de client' },
  fournisseur: {
    one: 'fournisseur trouvé',
    many: 'fournisseurs trouvés',
    none: 'Aucun fournisseur',
    change: 'Changer de fournisseur',
  },
  contact: { one: 'contact trouvé', many: 'contacts trouvés', none: 'Aucun contact', change: 'Changer de contact' },
} as const;

function displayName(t: Pick<Tiers, 'raison_sociale' | 'prenom'>): string {
  return `${t.raison_sociale}${t.prenom ? ` ${t.prenom}` : ''}`;
}

/**
 * Sélecteur de contact (client ou fournisseur) : combobox ARIA — flèches,
 * Entrée, Échap, option active annoncée, nombre de résultats annoncé.
 *
 * - Les options sont des `role="option"` (pas des boutons focusables dans la
 *   liste) ; un clic les choisit sans faire perdre le focus au champ.
 * - Après un choix, le focus passe sur « Changer de client » ; après
 *   « Changer de client », il revient dans la recherche (il tombait sur <body>).
 * - « Créer le client « … » » ouvre la création rapide (D4) et choisit le
 *   client créé.
 */
export const TiersPicker = React.forwardRef<TiersPickerHandle, TiersPickerProps>(function TiersPicker(
  {
    role,
    value,
    onChange,
    placeholder,
    disabled = false,
    id,
    'aria-labelledby': ariaLabelledby,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedby,
    allowCreate,
  },
  ref
) {
  const auth = useOptionalAuth();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<Tiers[]>([]);
  const [resultsFor, setResultsFor] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [highlighted, setHighlighted] = React.useState(-1);
  const [announce, setAnnounce] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const changeRef = React.useRef<HTMLButtonElement>(null);
  const focusNext = React.useRef<'change' | 'input' | null>(null);
  const autoId = React.useId();
  const listboxId = `${id ?? autoId}-options`;

  const noun = NOUN[role ?? 'contact'];
  const canCreate =
    (allowCreate ?? role === 'client') &&
    role === 'client' &&
    !disabled &&
    !!auth?.hasRole(...CREATE_ROLES);

  React.useImperativeHandle(ref, () => ({
    focus: () => (inputRef.current ?? changeRef.current)?.focus(),
  }));

  // Focus après un choix fait DANS le sélecteur (jamais pour une valeur posée
  // par la page, comme le client comptoir présélectionné).
  React.useEffect(() => {
    if (focusNext.current === 'change' && value) changeRef.current?.focus();
    if (focusNext.current === 'input' && !value) inputRef.current?.focus();
    focusNext.current = null;
  }, [value]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setResultsFor(null);
      setHighlighted(-1);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await tiersService.search(q, role);
        if (cancelled) return;
        const list: Tiers[] = Array.isArray(data) ? data : [];
        setResults(list);
        setResultsFor(q);
        setError(null);
        setHighlighted(-1);
        setAnnounce(list.length === 0 ? `${noun.none} trouvé` : plural(list.length, noun.one, noun.many));
      } catch (err) {
        if (cancelled) return;
        const message = getErrorMessage(err, 'La recherche a échoué. Réessayez.');
        setResults([]);
        setResultsFor(q);
        setError(message);
        setAnnounce(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, role, noun]);

  const trimmed = query.trim();
  const current = resultsFor === trimmed && trimmed.length > 0;
  const shownResults = current ? results : [];
  // Dernière option : « Créer le client « … » » (action, pas un contact).
  const optionCount = shownResults.length + (canCreate && current && !error ? 1 : 0);
  const createIndex = canCreate && current && !error ? shownResults.length : -1;

  const select = (tiers: Tiers) => {
    focusNext.current = 'change';
    onChange(tiers);
    setQuery('');
    setOpen(false);
    setHighlighted(-1);
  };

  const startCreate = () => {
    setCreateName(trimmed);
    setOpen(false);
    setCreateOpen(true);
  };

  const choose = (index: number) => {
    if (index === createIndex) startCreate();
    else if (shownResults[index]) select(shownResults[index]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlighted(-1);
      }
      return;
    }
    if (e.key === 'ArrowDown' && optionCount > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % optionCount);
    } else if (e.key === 'ArrowUp' && optionCount > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h <= 0 ? optionCount - 1 : h - 1));
    } else if (e.key === 'Enter') {
      // Jamais de soumission du formulaire parent pendant une recherche ;
      // Entrée choisit l'option surlignée, ou l'unique résultat.
      e.preventDefault();
      if (!open) return;
      if (highlighted >= 0) choose(highlighted);
      else if (shownResults.length === 1) select(shownResults[0]);
      // Aucun contact trouvé : la seule option est « Créer le client ».
      else if (shownResults.length === 0 && createIndex === 0) startCreate();
    }
  };

  const RoleIcon = role === 'client' ? Users : role === 'fournisseur' ? Truck : UserCheck;

  const dialog = canCreate ? (
    <NouveauClientDialog
      open={createOpen}
      onOpenChange={(next) => {
        setCreateOpen(next);
        if (!next) focusNext.current = focusNext.current ?? 'input';
      }}
      initialName={createName}
      onCreated={(client) => select(client)}
    />
  ) : null;

  if (value) {
    return (
      <>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          {/* Initiale neutre, comme l'avatar de la barre du haut : le bleu
              plein se lisait comme un bouton (le bleu reste aux actions). */}
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground"
          >
            {value.raison_sociale.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={displayName(value)}>
              {displayName(value)}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <DocumentCode>{value.code}</DocumentCode>
              {value.telephone && <span>{value.telephone}</span>}
              {value.est_client && value.est_fournisseur && <TiersRoleBadge role="mixte" />}
            </p>
          </div>
          {!disabled && (
            <button
              ref={changeRef}
              type="button"
              aria-label={noun.change}
              title={noun.change}
              onClick={() => {
                focusNext.current = 'input';
                onChange(null);
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {dialog}
      </>
    );
  }

  const listVisible = open && current && optionCount > 0;
  const showEmpty = open && current && !loading && !error && shownResults.length === 0;
  const showPopup = open && trimmed.length > 0 && (listVisible || loading || (current && !!error) || showEmpty);

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setHighlighted(-1);
        }
      }}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={listVisible}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={listVisible && highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
          aria-labelledby={ariaLabelledby}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            placeholder ||
            (role === 'client'
              ? canCreate
                ? 'Rechercher ou créer un client…'
                : 'Rechercher un client (nom, téléphone, code)…'
              : role === 'fournisseur'
                ? 'Rechercher un fournisseur (nom, téléphone, code)…'
                : 'Rechercher un contact…')
          }
          disabled={disabled}
          className="pl-9 pr-9"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Spinner /> : <RoleIcon className="h-4 w-4" aria-hidden="true" />}
        </span>
      </div>

      <p role="status" className="sr-only">
        {announce}
      </p>

      <div
        // Un clic dans la liste ne doit pas retirer le focus du champ.
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          'absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg',
          !showPopup && 'hidden'
        )}
      >
        {showEmpty && (
          <p className="px-3 pb-1 pt-2.5 text-sm text-muted-foreground">
            {noun.none} ne correspond à « {trimmed} ».
          </p>
        )}
        {loading && !listVisible && (
          <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Spinner /> Recherche…
          </p>
        )}
        {current && error && (
          <p className="flex items-start gap-2 px-3 py-2 text-sm text-danger-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <div
          id={listboxId}
          role="listbox"
          aria-label={role === 'fournisseur' ? 'Fournisseurs trouvés' : role === 'client' ? 'Clients trouvés' : 'Contacts trouvés'}
          hidden={!listVisible}
          className="max-h-64 overflow-y-auto py-1"
        >
          {listVisible &&
            shownResults.map((t, i) => (
              <div
                key={t.id}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => {
                  if (highlighted !== i) setHighlighted(i);
                }}
                onClick={() => select(t)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 py-2 text-left',
                  i === highlighted && 'bg-accent ring-2 ring-inset ring-ring'
                )}
              >
                <div
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                >
                  {t.raison_sociale.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={displayName(t)}>
                    {displayName(t)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <DocumentCode>{t.code}</DocumentCode>
                    {t.telephone && <span>{t.telephone}</span>}
                  </div>
                </div>
                {role !== 'client' && (
                  <div className="flex shrink-0 gap-1">
                    {t.est_client && <TiersRoleBadge role="client" />}
                    {t.est_fournisseur && <TiersRoleBadge role="fournisseur" />}
                  </div>
                )}
              </div>
            ))}
          {listVisible && createIndex >= 0 && (
            <div
              id={`${listboxId}-${createIndex}`}
              role="option"
              aria-selected={highlighted === createIndex}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => {
                if (highlighted !== createIndex) setHighlighted(createIndex);
              }}
              onClick={startCreate}
              className={cn(
                'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm font-medium text-primary-700',
                shownResults.length > 0 && 'border-t',
                highlighted === createIndex && 'bg-accent ring-2 ring-inset ring-ring'
              )}
            >
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">Créer le client « {trimmed} »</span>
            </div>
          )}
        </div>
      </div>
      {dialog}
    </div>
  );
});
