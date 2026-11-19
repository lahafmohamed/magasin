import * as React from 'react';
import { Search, X, FileText, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { plural } from '@/validation/salesForms';

export interface DocumentOption {
  id: number;
  numero: string;
  tiers_nom?: string | null;
  montant?: number | string | null;
  date?: string | null;
  statut?: string | null;
}

/** Poignée exposée par `ref` : mettre le focus sur le sélecteur (erreur de validation). */
export interface DocumentPickerHandle {
  focus: () => void;
}

interface DocumentPickerProps {
  value: DocumentOption | null;
  /** Id restauré d'un brouillon quand le document complet n'a pas été rechargé. */
  fallbackId?: string;
  onChange: (doc: DocumentOption | null) => void;
  search: (query: string) => Promise<DocumentOption[]>;
  placeholder?: string;
  inputId?: string;
  disabled?: boolean;
  /** Nom du bouton qui retire le document choisi (« Changer de facture »). */
  changeLabel?: string;
  /** Nom du champ porté par un titre de section (`id` du titre). */
  'aria-labelledby'?: string;
  /** Signalement d'erreur — à relier au message via `fieldErrorProps`. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Sélecteur de document (facture, devis) : combobox ARIA — flèches, Entrée,
 * Échap, option active et nombre de résultats annoncés. Après un choix, le
 * focus passe sur « Changer de … » ; après ce bouton, il revient dans la
 * recherche.
 */
export const DocumentPicker = React.forwardRef<DocumentPickerHandle, DocumentPickerProps>(function DocumentPicker(
  {
    value,
    fallbackId,
    onChange,
    search,
    placeholder,
    inputId,
    disabled = false,
    changeLabel = 'Changer de document',
    'aria-labelledby': ariaLabelledby,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedby,
  },
  ref
) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<DocumentOption[]>([]);
  const [resultsFor, setResultsFor] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [highlighted, setHighlighted] = React.useState(-1);
  const [announce, setAnnounce] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const changeRef = React.useRef<HTMLButtonElement>(null);
  const focusNext = React.useRef<'change' | 'input' | null>(null);
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const autoId = React.useId();
  const listboxId = `${inputId ?? autoId}-options`;
  const hasValue = !!value || !!fallbackId;

  React.useImperativeHandle(ref, () => ({
    focus: () => (inputRef.current ?? changeRef.current)?.focus(),
  }));

  React.useEffect(() => {
    if (focusNext.current === 'change' && hasValue) changeRef.current?.focus();
    if (focusNext.current === 'input' && !hasValue) inputRef.current?.focus();
    focusNext.current = null;
  }, [hasValue]);

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
        const rows = await searchRef.current(q);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setResults(list);
        setResultsFor(q);
        setError(null);
        setHighlighted(-1);
        setAnnounce(list.length === 0 ? 'Aucun document trouvé' : plural(list.length, 'document trouvé', 'documents trouvés'));
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
  }, [query]);

  const trimmed = query.trim();
  const current = resultsFor === trimmed && trimmed.length > 0;
  const shown = current ? results : [];

  const select = (doc: DocumentOption) => {
    focusNext.current = 'change';
    onChange(doc);
    setQuery('');
    setOpen(false);
    setHighlighted(-1);
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
    if (e.key === 'ArrowDown' && shown.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % shown.length);
    } else if (e.key === 'ArrowUp' && shown.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h <= 0 ? shown.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      // Toujours neutraliser Entrée : pas de soumission prématurée du
      // formulaire parent pendant la recherche.
      e.preventDefault();
      if (!open) return;
      if (highlighted >= 0 && shown[highlighted]) select(shown[highlighted]);
      else if (shown.length === 1) select(shown[0]);
    }
  };

  if (hasValue) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
        {/* Pastille neutre : le bleu est réservé à ce qu'on peut actionner. */}
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        >
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm">{value ? value.numero : `Document n° ${fallbackId}`}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {value?.tiers_nom && <span className="truncate">{value.tiers_nom}</span>}
            {value?.montant != null && <Money value={value.montant} />}
            {value?.date && <span>{formatDate(value.date)}</span>}
            {!value && <span>Choix restauré du brouillon</span>}
          </p>
        </div>
        {!disabled && (
          <button
            ref={changeRef}
            type="button"
            aria-label={changeLabel}
            title={changeLabel}
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
    );
  }

  const listVisible = open && current && shown.length > 0;
  const showEmpty = open && current && !loading && !error && shown.length === 0;
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
          id={inputId}
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
          placeholder={placeholder || 'Rechercher un document…'}
          disabled={disabled}
          className="pl-9 pr-9"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Spinner /> : <FileText className="h-4 w-4" aria-hidden="true" />}
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
          <p className="px-3 py-2.5 text-sm text-muted-foreground">Aucun document ne correspond à « {trimmed} ».</p>
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
          aria-label="Documents trouvés"
          hidden={!listVisible}
          className="max-h-64 overflow-y-auto py-1"
        >
          {listVisible &&
            shown.map((doc, i) => (
              <div
                key={doc.id}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseMove={() => {
                  if (highlighted !== i) setHighlighted(i);
                }}
                onClick={() => select(doc)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 py-2 text-left',
                  i === highlighted && 'bg-accent ring-2 ring-inset ring-ring'
                )}
              >
                <div aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm" title={doc.numero}>
                    {doc.numero}
                  </div>
                  {doc.tiers_nom && (
                    <div className="truncate text-xs text-muted-foreground" title={doc.tiers_nom}>
                      {doc.tiers_nom}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {doc.montant != null && <Money value={doc.montant} className="block text-xs" />}
                  {doc.date && <div className="text-xs text-muted-foreground">{formatDate(doc.date)}</div>}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
});
