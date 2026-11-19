import { cn } from '@/lib/utils';
import { useCompanyBrand } from '@/lib/brand';

const SIZES = {
  /** Menu latéral (28 px). */
  sm: { box: 'h-7 w-7 rounded-md', text: 'text-sm' },
  /** Écrans de connexion et de changement de mot de passe (40 px). */
  lg: { box: 'h-10 w-10 rounded-lg', text: 'text-lg' },
} as const;

/**
 * Marque de l'entreprise : le logo fourni par le client, sinon son monogramme.
 * Un seul dessin pour le menu, la connexion et le changement de mot de passe.
 * Décorative : le nom de l'entreprise est toujours écrit à côté.
 */
export function BrandMark({ size = 'sm', className }: { size?: keyof typeof SIZES; className?: string }) {
  const brand = useCompanyBrand();
  const { box, text } = SIZES[size];
  if (brand.logoUrl) {
    return <img src={brand.logoUrl} alt="" className={cn('shrink-0 object-contain', box, className)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center bg-primary font-semibold text-primary-foreground',
        box,
        text,
        className
      )}
    >
      {brand.initial}
    </span>
  );
}
