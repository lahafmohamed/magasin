import { useState, useEffect, useRef, useId } from 'react';
import { Search, X, Users, Truck, UserCheck } from 'lucide-react';
import { tiersService } from '../services/api';
import { Tiers } from '../types';

interface TiersPickerProps {
  role?: 'client' | 'fournisseur';
  value: Tiers | null;
  onChange: (tiers: Tiers | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Posé sur l'input de recherche, pour qu'un <Label htmlFor> puisse le cibler. */
  id?: string;
}

export function TiersPicker({ role, value, onChange, placeholder, disabled = false, id }: TiersPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Tiers[]>([]);
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
    if (query.length < 1) { setResults([]); setHighlighted(-1); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await tiersService.search(query, role);
        setResults(data);
        setHighlighted(-1);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, role]);

  const select = (tiers: Tiers) => {
    onChange(tiers);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open) return;
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? results.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      // Suppress Enter while the list is open so it can't submit the parent form
      // mid-search; pick the highlighted row if there is one.
      e.preventDefault();
      if (highlighted >= 0 && results[highlighted]) select(results[highlighted]);
    }
  };

  const RoleIcon = role === 'client' ? Users : role === 'fournisseur' ? Truck : UserCheck;

  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
        <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
          {value.raison_sociale.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {value.raison_sociale}{value.prenom ? ` ${value.prenom}` : ''}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-mono">{value.code}</span>
            {value.telephone && <span>· {value.telephone}</span>}
            {value.est_client && value.est_fournisseur && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-medium">
                <UserCheck className="h-2.5 w-2.5" /> Mixte
              </span>
            )}
          </div>
        </div>
        {!disabled && (
          <button type="button" aria-label="Retirer le tiers sélectionné" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <RoleIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && query.length >= 1}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || (role === 'client' ? 'Rechercher un client...' : role === 'fournisseur' ? 'Rechercher un fournisseur...' : 'Rechercher un tiers...')}
          disabled={disabled}
          className="w-full pl-9 pr-9 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
      </div>

      {open && query.length >= 1 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Recherche...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat pour « {query} »</div>
          )}
          {results.map((t, i) => (
            <button
              key={t.id}
              id={`${listboxId}-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => select(t)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${i === highlighted ? 'bg-accent' : 'hover:bg-accent'}`}
            >
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                {t.raison_sociale.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {t.raison_sociale}{t.prenom ? ` ${t.prenom}` : ''}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="font-mono">{t.code}</span>
                  {t.telephone && <span>{t.telephone}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {t.est_client && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">Client</span>
                )}
                {t.est_fournisseur && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300">Fourn.</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
