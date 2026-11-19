import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  parseDecimalInput,
  parseIntegerInput,
  toDisplayNumber,
  toEditableNumber,
} from '@/validation/salesForms';

export interface NumericFieldProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue'> {
  /** Valeur du formulaire ; `NaN` = saisie vide ou invalide. */
  value: number | null | undefined;
  /** Reçoit le nombre saisi, ou `NaN` quand le champ est vide ou invalide. */
  onValueChange: (value: number) => void;
  /** `integer` : quantité (clavier numérique) ; `decimal` : montant, taux. */
  mode?: 'integer' | 'decimal';
  /** Unité affichée dans le champ (« FCFA », « % »), décorative. */
  suffix?: string;
  /** Classes du conteneur (largeur de colonne). */
  containerClassName?: string;
}

/**
 * Champ numérique des lignes de document.
 *
 * - `type="text"` + `inputMode` : le clavier mobile s'ouvre en mode chiffres,
 *   sans les pièges de `type="number"` (molette qui change la valeur, virgule
 *   refusée selon la langue du navigateur).
 * - Pendant la saisie, le texte tapé est conservé tel quel (« 1500, » reste
 *   éditable) ; hors focus, le nombre est groupé à la française
 *   (« 1 250 000 »).
 */
export const NumericField = React.forwardRef<HTMLInputElement, NumericFieldProps>(
  (
    { value, onValueChange, mode = 'decimal', suffix, className, containerClassName, onFocus, onBlur, ...props },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);
    const [text, setText] = React.useState(() => toEditableNumber(value));

    // Valeur changée de l'extérieur (bouton +/−, brouillon restauré) : on
    // resynchronise le texte, sauf pendant la frappe.
    React.useEffect(() => {
      if (!focused) setText(toEditableNumber(value));
    }, [value, focused]);

    const parse = mode === 'integer' ? parseIntegerInput : parseDecimalInput;
    const shown = focused ? text : toDisplayNumber(value, mode === 'integer' ? 0 : 2);

    return (
      <div className={cn('relative', containerClassName)}>
        <Input
          ref={ref}
          type="text"
          inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={shown}
          onChange={(e) => {
            setText(e.target.value);
            onValueChange(parse(e.target.value));
          }}
          onFocus={(e) => {
            setText(toEditableNumber(value));
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn('text-right tabular-nums', suffix && 'pr-12', className)}
          {...props}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-xs text-muted-foreground"
          >
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
NumericField.displayName = 'NumericField';
