import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Pastille de statut : fond teinté `-50`, bord `-200`, texte `-700` — lisible
 * ≥ 6,9:1 dans les deux thèmes (les rampes s'inversent en `.dark`). Les anciens
 * aplats pleins à texte blanc tombaient à 3,84:1 (succès) et 3,15:1 (alerte).
 *
 * Une pastille n'est pas interactive : ni survol, ni anneau de focus. Elle rend
 * un `<span>` (et non un `<div>`) pour pouvoir vivre dans un `<p>`, un titre ou
 * une cellule sans casser l'imbrication HTML.
 *
 * Le statut ne repose jamais sur la couleur seule : le libellé est toujours
 * écrit, et `<StatusBadge>` ajoute une icône par famille d'état.
 */
const badgeVariants = cva(
  // `whitespace-nowrap` : les libellés de statut français ("Partiellement
  // livrée") passaient à la ligne dans la pastille.
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        // Bord transparent : les pages qui recolorent la pastille par défaut
        // (`className="bg-success-100 text-success-800"`) ne gardent pas un
        // filet bleu autour d'une pastille verte.
        default: "border-transparent bg-primary-50 text-primary-700",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-danger-200 bg-danger-50 text-danger-700",
        outline: "border-border bg-transparent text-foreground",
        success: "border-success-200 bg-success-50 text-success-700",
        warning: "border-warning-200 bg-warning-50 text-warning-700",
        info: "border-info-200 bg-info-50 text-info-700",
      },
      size: {
        sm: "px-2 py-0.5 text-xs leading-4 [&>svg]:h-3 [&>svg]:w-3",
        md: "px-2.5 py-1 text-sm leading-5 [&>svg]:h-3.5 [&>svg]:w-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Icône de tête, décorative (le libellé porte le sens). */
  icon?: LucideIcon
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, icon: Icon, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  )
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
