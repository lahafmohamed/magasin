import { cn } from '@/lib/utils';

/**
 * Marque « champ obligatoire » à placer DANS le libellé : astérisque visible
 * (masquée aux lecteurs d'écran) + « (obligatoire) » lu à voix haute. Associer
 * une légende par formulaire : « Les champs marqués d’un * sont obligatoires. »
 *
 *   <Label htmlFor="echeance">Échéance <RequiredMark /></Label>
 *
 * Préférer aussi l'attribut `required` sur le champ natif quand il existe
 * (jamais `aria-required` sur un bouton, comme le déclencheur de DatePicker).
 */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <>
      <span aria-hidden="true" className={cn('whitespace-nowrap text-danger-600', className)}>
        {'\u00A0*'}
      </span>
      <span className="sr-only"> (obligatoire)</span>
    </>
  );
}
