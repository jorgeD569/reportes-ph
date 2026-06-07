'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

const INPUT_BASE =
  'h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10'

export function PasswordInput({
  value,
  onChange,
  disabled,
  readOnly,
  placeholder,
  autoComplete = 'new-password',
  className,
  inputClassName,
  id,
  required,
  trailingActions,
}: {
  value: string
  onChange?: (value: string) => void
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  autoComplete?: string
  className?: string
  inputClassName?: string
  id?: string
  required?: boolean
  /** Espacio reservado para acciones futuras (ej. botón "Generar contraseña"). */
  trailingActions?: React.ReactNode
}) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          className={cn(INPUT_BASE, 'pr-10', inputClassName)}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled && !readOnly}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-app disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      {trailingActions ? (
        <div className="flex shrink-0 items-center gap-2">{trailingActions}</div>
      ) : null}
    </div>
  )
}
