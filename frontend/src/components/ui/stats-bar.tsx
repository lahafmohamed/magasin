import { GRID_COLS, StatTile as StatTileCard } from '@/components/ui/stat-tile';
import { cn } from '@/lib/utils';

/**
 * Tuile de `StatsBar` (API historique). Pour une nouvelle rangée d'indicateurs,
 * composer directement `<StatGrid>` + `<StatTile>` (ui/stat-tile) : valeurs
 * numériques mises en forme, ton appliqué seulement si ≠ 0, état « Indisponible ».
 */
export interface StatTile {
  label: string;
  /** Valeur déjà mise en forme (`formatCurrency(x)`, `String(n)`). */
  value: string | number;
  hint?: string;
  /** `lg` : le chiffre qui répond à la page (« Reste à payer »). */
  size?: 'md' | 'lg';
  /**
   * Classe de couleur de la valeur, palier explicite uniquement :
   * `'text-warning-700'`, `'text-danger-700'`. Jamais `text-success` /
   * `text-warning` nus (contraste insuffisant, règle ESLint) ni `text-primary`
   * (le bleu de marque se lit comme un lien).
   */
  tone?: string;
}

/** Alias explicite, pour éviter la confusion avec le composant `StatTile`. */
export type StatsBarTile = StatTile;

/**
 * Synthèse au-dessus d'une liste : **un seul bandeau** à cellules séparées par
 * un filet (libellé, puis chiffre et indication sur une même ligne ; jamais
 * d'icône). Trois ou quatre cartes de 110 px pour un nombre chacune prenaient
 * plus de place que les lignes qu'elles résument. Grille dimensionnée sur le
 * nombre de cellules ; les filets suivent le passage à la ligne (bord bas +
 * bord de fin sur chaque cellule, rognés par le cadre).
 *
 * `unavailable` : la requête de statistiques a échoué — chaque tuile affiche
 * « Indisponible » plutôt que « — » ou 0.
 */
export function StatsBar({
  tiles,
  loading,
  unavailable,
}: {
  tiles: StatTile[];
  loading?: boolean;
  unavailable?: boolean;
}) {
  if (tiles.length === 0) return null;
  const cols = GRID_COLS[Math.min(Math.max(tiles.length, 1), 6)];
  // Deux colonnes sur téléphone : une dernière cellule impaire prend la rangée
  // entière plutôt que de laisser une case vide bordée d'un filet.
  const oddLast = tiles.length >= 3 && tiles.length % 2 === 1;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div
        className={cn(
          '-mb-px -me-px grid',
          cols,
          oddLast && 'min-[360px]:[&>:last-child]:col-span-2 sm:[&>:last-child]:col-span-1'
        )}
      >
        {tiles.map((t) => (
          <StatTileCard
            key={t.label}
            bare
            className="border-b border-e"
            label={t.label}
            value={t.value}
            hint={t.hint}
            size={t.size}
            loading={loading}
            unavailable={unavailable}
            valueClassName={t.tone}
          />
        ))}
      </div>
    </div>
  );
}
