import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Propriétés de transition nommées (jamais `transition-all`) + retour tactile
  // à l'appui. `transform` et non `scale` : en Tailwind 3 les utilitaires
  // `scale-*` écrivent dans `transform`, transitionner `scale` n'animerait rien.
  // `[&_svg]:shrink-0` : quand un libellé passe à la ligne (en-tête de page sur
  // téléphone, tuile étroite), l'icône garde sa taille au lieu d'être écrasée.
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,opacity,transform] ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Désactivé : gris neutre. À 50 % d'opacité le bleu devenait un bleu
        // pâle qui se lisait encore comme une action possible.
        default: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted-foreground/20 disabled:text-muted-foreground disabled:opacity-100",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Aplat + texte du palier 50 de la même rampe : les rampes s'inversent en
        // `.dark`, le couple reste ≥ 4,8:1 dans les deux thèmes (le `text-white`
        // d'avant tombait à 1,69:1 et 1,49:1 en sombre — « Clôturer la caisse »
        // devenait illisible).
        success: "bg-success-600 text-success-50 hover:bg-success-700",
        warning: "bg-warning-600 text-warning-50 hover:bg-warning-700",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
        // Cible tactile de 44 px sous 640 px (action principale sur téléphone),
        // taille standard au-delà. Ne pas y ajouter de `h-*` : tailwind-merge
        // retirerait `h-11` mais garderait `sm:h-9`.
        touch: "h-11 px-5 text-base sm:h-9 sm:px-4 sm:text-sm",
        "icon-touch": "h-11 w-11 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
