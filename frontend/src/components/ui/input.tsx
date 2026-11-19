import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Champ de saisie.
 * - 36 px de haut à toutes les largeurs, comme Button, SelectTrigger et
 *   DatePicker (les rangées de filtres étaient décalées de 4 px).
 * - Texte 16 px sous 640 px (iOS zoome sur un champ < 16 px), 14 px au-delà —
 *   classe `field-text` (index.css), qu'un `text-*` passé par la page remplace.
 * - Bord `border-input` ≥ 3:1 ; état invalide lu sur `aria-invalid` (posé par
 *   `fieldErrorProps`), sans classe conditionnelle côté page.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "field-text flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger-600 aria-[invalid=true]:focus-visible:ring-danger-600",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
