import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export interface StatTile {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Tailwind text-color class for the value, e.g. 'text-success' / 'text-warning'. */
  tone?: string;
}

/**
 * Compact row of summary tiles shown above a list. Responsive grid: stacks on
 * mobile, spreads on desktop. Keep to 2–5 tiles for readability.
 */
export function StatsBar({ tiles, loading }: { tiles: StatTile[]; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Card key={t.label}>
            <CardContent className="flex items-center gap-3 p-4">
              {Icon && (
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{t.label}</p>
                <p className={cn('text-lg font-bold tracking-tight', t.tone)}>
                  {loading ? '—' : t.value}
                </p>
                {t.hint && <p className="truncate text-xs text-muted-foreground">{t.hint}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
