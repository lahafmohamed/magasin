import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * État « sélectionné » unique de l'interface (puces de filtre, période, mode de
 * paiement) : fond teinté `primary-50`, texte `primary-700` (≥ 9,4:1) et coche.
 * Plus d'aplat bleu plein : il faisait deux boutons primaires par écran (le CTA
 * de l'en-tête + la puce active). La coche porte l'état sans la couleur.
 */
export const chipVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0',
  {
    variants: {
      selected: {
        true: 'border-primary-200 bg-primary-50 text-primary-700',
        false: 'border-input bg-background text-foreground hover:bg-accent',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-3.5 text-sm',
        // 44 px sous 640 px (doigt), 36 px au-delà.
        touch: 'h-11 px-4 text-sm sm:h-9 sm:px-3.5',
      },
      shape: {
        pill: 'rounded-full',
        tile: 'rounded-md',
      },
    },
    defaultVariants: { selected: false, size: 'sm', shape: 'pill' },
  }
);

export interface ToggleChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>,
    Omit<VariantProps<typeof chipVariants>, 'selected'> {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  icon?: LucideIcon;
}

/**
 * Puce bascule (`aria-pressed`) — filtre que l'on active / désactive.
 *
 *   <ToggleChip pressed={statut === 'payee'} onPressedChange={() => setStatut('payee')}>Payée</ToggleChip>
 */
export const ToggleChip = React.forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ pressed, onPressedChange, icon: Icon, size, shape, className, children, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onPressedChange?.(!pressed);
      }}
      className={cn(chipVariants({ selected: pressed, size, shape }), className)}
      {...props}
    >
      {pressed ? <Check aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  )
);
ToggleChip.displayName = 'ToggleChip';

export interface ChoiceOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface ChoiceGroupProps<T extends string> extends VariantProps<typeof chipVariants> {
  /** Nom du groupe (« Mode de paiement ») — annoncé, visible sauf `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  value: T | null | undefined;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<ChoiceOption<T>>;
  /** `wrap` (défaut) : puces en ligne ; `grid-2` / `grid-3` : grille de tuiles. */
  layout?: 'wrap' | 'grid-2' | 'grid-3';
  className?: string;
  /** Pour relier une erreur de validation (`fieldErrorProps`). */
  'aria-describedby'?: string;
}

/**
 * Choix unique exposé comme un groupe radio (WCAG 4.1.2) : `role="radiogroup"`,
 * chaque option `role="radio"` + `aria-checked`, tabulation itinérante, flèches
 * pour changer de choix. Le mode de paiement et la décision d'une demande
 * n'étaient signalés que par la couleur du bouton.
 *
 *   <ChoiceGroup label="Mode de paiement" value={mode} onValueChange={setMode}
 *     options={PAYMENT_METHOD_OPTIONS.map((o) => ({ ...o, icon: METHODES_PAIEMENT[o.value].Icon }))}
 *     layout="grid-2" shape="tile" size="touch" />
 */
export function ChoiceGroup<T extends string>({
  label,
  hideLabel = false,
  value,
  onValueChange,
  options,
  layout = 'wrap',
  size = 'md',
  shape = 'pill',
  className,
  'aria-describedby': ariaDescribedby,
}: ChoiceGroupProps<T>) {
  const labelId = React.useId();
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : enabled[0];

  const move = (from: number, delta: number) => {
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className={className}>
      <p id={labelId} className={hideLabel ? 'sr-only' : 'mb-2 text-sm font-medium'}>
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={ariaDescribedby}
        className={cn(
          layout === 'wrap' && 'flex flex-wrap gap-2',
          layout === 'grid-2' && 'grid grid-cols-2 gap-2',
          layout === 'grid-3' && 'grid grid-cols-2 gap-2 sm:grid-cols-3'
        )}
      >
        {options.map((o, i) => {
          const selected = i === selectedIndex;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.disabled}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => onValueChange(o.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(i, -1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  move(enabled[0], 0);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  move(enabled[enabled.length - 1], 0);
                }
              }}
              className={cn(
                chipVariants({ selected, size, shape }),
                layout !== 'wrap' && 'w-full justify-start'
              )}
            >
              {Icon && <Icon aria-hidden="true" />}
              <span className="min-w-0 truncate">{o.label}</span>
              {selected && <Check aria-hidden="true" className="ms-auto" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
