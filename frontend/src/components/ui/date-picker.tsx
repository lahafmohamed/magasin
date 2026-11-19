import * as React from 'react'
import { format, parse } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatDate } from '@/utils/format'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  id?: string
  name?: string
  className?: string
  placeholder?: string
  disabled?: boolean
  /**
   * Masque « Effacer la date ». Ne pose PAS `aria-required` : l'attribut est
   * interdit sur un `<button>` (axe critique). Marquer l'obligation dans le
   * libellé (`<RequiredMark />`).
   */
  required?: boolean
  'aria-label'?: string
  /** Signalement d'erreur — à relier au message via `fieldErrorProps`. */
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Sélecteur de date (déclencheur bouton + calendrier). Affiche « 22 oct. 2026 »
 * (`formatDate`, le format unique de l'interface) et renvoie `yyyy-MM-dd`.
 *
 * Avec un `<Label htmlFor>`, le nom du bouton est le libellé : la date choisie
 * n'était donc jamais annoncée. Elle l'est maintenant via `aria-describedby`.
 */
const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value = '',
      onChange,
      id,
      name,
      className,
      placeholder = 'Choisir une date',
      disabled,
      required,
      'aria-label': ariaLabel,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedby,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false)
    const autoId = React.useId()
    const valueId = `${id ?? autoId}-valeur`
    const parsedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
    const selectedDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            id={id}
            name={name}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            // La valeur n'est ajoutée en description que si le bouton a un nom
            // venu d'ailleurs (aria-label, ou <Label htmlFor={id}>) ; sinon son
            // nom EST la valeur, et elle serait lue deux fois.
            aria-describedby={
              [ariaLabel || id ? valueId : null, ariaDescribedby].filter(Boolean).join(' ') || undefined
            }
            className={cn(
              'w-full justify-start px-3 py-1 text-left text-base font-normal active:scale-100 sm:text-sm',
              'aria-[invalid=true]:border-danger-600 aria-[invalid=true]:focus-visible:ring-danger-600',
              !selectedDate && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span id={valueId} className="truncate">
              {selectedDate ? formatDate(selectedDate) : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, 'yyyy-MM-dd'))
                setOpen(false)
              }
            }}
            locale={fr}
            labels={{
              labelPrevious: () => 'Mois précédent',
              labelNext: () => 'Mois suivant',
            }}
            initialFocus
          />
          {selectedDate && !required && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Effacer la date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    )
  },
)
DatePicker.displayName = 'DatePicker'

export { DatePicker }
