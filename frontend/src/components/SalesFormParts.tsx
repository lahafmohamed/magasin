import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentCode } from '@/components/ui/document-code';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errors';
import { toNumber } from '@/utils/format';
import { getValidSalePrice } from '@/utils/salesPrice';
import type { LoadState, SalesLocation } from '@/components/useSalesStock';

/** Produit renvoyé par la recherche floue (`/produits/search/fuzzy`). */
export interface SalesSearchProduct {
  id: number;
  nom: string;
  reference: string;
  code_barre: string | null;
  prix_vente: number | string;
  prix_achat: number | string;
  stock: number | string;
  stock_min: number | string;
  similarity?: number | string | null;
}

/**
 * Option de la recherche produit : nom, référence, prix, stock. Le stock est
 * dit en mots (« Rupture de stock », « Stock bas : 2 »), pas par la couleur
 * seule.
 */
export function SalesProductOption({
  product,
  stock,
  disabledReason,
}: {
  product: SalesSearchProduct;
  /** Stock de l'emplacement ; `null` pour ne pas l'afficher (bon de livraison). */
  stock: number | null;
  disabledReason: string | null;
}) {
  const prix = getValidSalePrice(product.prix_vente);
  const stockMin = toNumber(product.stock_min) ?? 0;
  const approx = (toNumber(product.similarity ?? null) ?? 1) < 0.5;
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={product.nom}>
          {product.nom}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <DocumentCode>{product.reference}</DocumentCode>
          {approx && ' · Résultat approché'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {prix === null ? (
          <p className="max-w-[12rem] text-xs font-medium text-danger-700">{disabledReason}</p>
        ) : (
          <Money value={prix} className="font-medium" />
        )}
        {stock !== null && (
          <p
            className={cn(
              'text-xs',
              stock <= 0
                ? 'font-medium text-danger-700'
                : stock <= stockMin
                  ? 'font-medium text-warning-700'
                  : 'text-muted-foreground'
            )}
          >
            {stock <= 0 ? 'Rupture de stock' : stock <= stockMin ? `Stock bas : ${stock}` : `${stock} en stock`}
          </p>
        )}
      </div>
    </>
  );
}

/** Bandeau d'alerte en ligne (chargement échoué, configuration manquante), avec « Réessayer ». */
export function InlineNotice({
  tone,
  children,
  onRetry,
}: {
  tone: 'danger' | 'warning';
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        tone === 'danger'
          ? 'border-danger-200 bg-danger-50 text-danger-700'
          : 'border-warning-200 bg-warning-50 text-warning-800'
      )}
    >
      <span>{children}</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

/**
 * Emplacement de vente d'un document. Un seul magasin : rien à choisir, rien
 * n'est rendu — le récapitulatif le nomme (la ligne « Emplacement de vente : … »
 * s'intercalait entre la consigne de recherche et son champ). Plusieurs : liste
 * déroulante, que la page place après la recherche de produit. Échec et absence
 * de magasin dits en clair (un échec ne ressemble jamais à « aucun magasin »).
 */
export function SalesLocationField({
  id,
  label,
  locations,
  state,
  error,
  onRetry,
  value,
  onChange,
}: {
  id: string;
  label: string;
  locations: SalesLocation[];
  state: LoadState;
  error: unknown;
  onRetry: () => void;
  value: number | null;
  onChange: (id: number) => void;
}) {
  // Chargement : rien plutôt qu'une ligne qui disparaîtrait aussitôt (un seul magasin).
  if (state === 'loading') return null;
  if (state === 'error') {
    return (
      <InlineNotice tone="danger" onRetry={onRetry}>
        {getErrorMessage(error, 'Impossible de charger les magasins.')}
      </InlineNotice>
    );
  }
  if (locations.length === 0) {
    return (
      <InlineNotice tone="warning">
        Aucun magasin actif : demandez à l’administrateur d’activer un magasin pour vendre.
      </InlineNotice>
    );
  }
  const selected = locations.find((l) => l.id === value) ?? null;
  if (locations.length === 1 && selected) return null;
  return (
    <div className="max-w-sm space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ? String(value) : ''} onValueChange={(v) => onChange(Number.parseInt(v, 10))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choisir un magasin" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((l) => (
            <SelectItem key={l.id} value={String(l.id)}>
              {l.nom} ({l.code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
