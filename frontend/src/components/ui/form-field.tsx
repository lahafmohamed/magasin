import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

let fieldSeq = 0;
function useFieldId(provided?: string) {
  const [generated] = React.useState(() => `field-${++fieldSeq}`);
  return provided ?? generated;
}

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  className?: string;
  /** Rendu de l'input ; reçoit l'id et les attributs aria à appliquer. */
  children: (field: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

/**
 * Champ de formulaire standard : label visible, indicateur requis,
 * texte d'aide persistant, et erreur inline avec role="alert".
 * Câble automatiquement id / aria-invalid / aria-describedby.
 */
export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  const id = useFieldId(htmlFor);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
