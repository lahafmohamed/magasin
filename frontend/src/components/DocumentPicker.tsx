import { useState, useEffect, useRef, useId } from 'react';
import { Search, X, FileText } from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/utils/format';

export interface DocumentOption {
  id: number;
  numero: string;
  tiers_nom?: string | null;
  montant?: number | string | null;
  date?: string | null;
  statut?: string | null;
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
  /** Signalement d'erreur — à relier au message via `fieldErrorProps`. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function DocumentPicker({
  value,
  fallbackId,
  onChange,
  search,
  placeholder,
  inputId,
  disabled = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: DocumentPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      setHighlighted(-1);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await search(query));
        setHighlighted(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, search]);

  const select = (doc: DocumentOption) => {
    onChange(doc);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? results.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      // Toujours neutraliser Enter tant que la liste est ouverte : évite la
      // soumission prématurée du formulaire parent pendant la recherche.
      e.preventDefault();
      if (highlighted >= 0 && results[highlighted]) select(results[highlighted]);
    }
  };

  if (value || fallbackId) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold font-mono truncate">
            {value ? value.numero : `Document #${fallbackId}`}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 truncate">
            {value?.tiers_nom && <span className="truncate">{value.tiers_nom}</span>}
            {value?.montant != null && <span>· {formatCurrency(value.montant)}</span>}
            {value?.date && <span>· {formatDateShort(value.date)}</span>}
            {!value && <span>Sélection restaurée du brouillon</span>}
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            aria-label="Retirer le document sélectionné"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <FileText className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open && query.length >= 1}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || 'Rechercher un document…'}
          disabled={disabled}
          className="w-full pl-9 pr-9 py-2 text-sm border rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      {open && query.length >= 1 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Recherche…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat pour « {query} »</div>
          )}
          {results.map((doc, i) => (
            <button
              key={doc.id}
              id={`${listboxId}-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => select(doc)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                i === highlighted ? 'bg-accent' : 'hover:bg-accent'
              }`}
            >
              <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium font-mono truncate" title={doc.numero}>{doc.numero}</div>
                {doc.tiers_nom && (
                  <div className="text-xs text-muted-foreground truncate" title={doc.tiers_nom}>{doc.tiers_nom}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                {doc.montant != null && (
                  <div className="text-xs font-semibold">{formatCurrency(doc.montant)}</div>
                )}
                {doc.date && (
                  <div className="text-[10px] text-muted-foreground">{formatDateShort(doc.date)}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
