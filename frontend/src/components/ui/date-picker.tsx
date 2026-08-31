import * as React from 'react'
import { format, parse } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  id?: string
  name?: string
  className?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  'aria-label'?: string
  /** Signalement d'erreur — à relier au message via `fieldErrorProps`. */
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

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
            aria-required={required || undefined}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedby}
            className={cn(
              'w-full justify-start px-3 text-left font-normal',
              !selectedDate && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedDate
                ? format(selectedDate, 'dd MMMM yyyy', { locale: fr })
                : placeholder}
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
