'use client'

import * as React from 'react'
import { get } from '@/lib/api'
import type { ActivoCategoria } from '@/lib/types/inventario'

type ListResponse = {
  ok: boolean
  categorias?: ActivoCategoria[]
  error?: string
}

type HookOpts = {
  activas?: boolean
  aplicable?: 'activos' | 'conjuntos'
  includeUso?: boolean
}

/**
 * Carga categorías desde GET /activos-categorias (sin hardcode).
 */
export function useActivosCategorias(opts?: HookOpts) {
  const activas = opts?.activas === true
  const aplicable = opts?.aplicable
  const includeUso = opts?.includeUso === true

  const [categorias, setCategorias] = React.useState<ActivoCategoria[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams()
    if (activas) qs.set('activas', '1')
    if (aplicable) qs.set('aplicable', aplicable)
    if (includeUso) qs.set('include_uso', '1')
    const q = qs.toString()

    void (async () => {
      try {
        const data = await get<ListResponse>(
          `/activos-categorias${q ? `?${q}` : ''}`,
        )
        if (cancelled) return
        if (!data.ok) {
          setError(data.error || 'Error al cargar categorías')
          setCategorias([])
        } else {
          setError(null)
          setCategorias(data.categorias || [])
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Error al cargar categorías')
        setCategorias([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activas, aplicable, includeUso, reloadToken])

  const reload = React.useCallback(() => {
    setLoading(true)
    setReloadToken((n) => n + 1)
  }, [])

  return { categorias, loading, error, reload }
}

export function CategoriaSelect({
  value,
  onChange,
  aplicable,
  includeInactiveId,
  className,
  disabled,
  emptyLabel = 'Seleccionar categoría',
}: {
  value: string
  onChange: (categoriaId: string, categoria: ActivoCategoria | null) => void
  aplicable?: 'activos' | 'conjuntos'
  /** Si el registro histórico tiene una categoría inactiva, incluirla en el select. */
  includeInactiveId?: string | null
  className?: string
  disabled?: boolean
  emptyLabel?: string
}) {
  const { categorias, loading, error } = useActivosCategorias({
    activas: true,
    aplicable,
  })
  const [extra, setExtra] = React.useState<ActivoCategoria | null>(null)

  React.useEffect(() => {
    let cancelled = false
    if (!includeInactiveId) {
      queueMicrotask(() => {
        if (!cancelled) setExtra(null)
      })
      return () => {
        cancelled = true
      }
    }
    if (categorias.some((c) => c.id === includeInactiveId)) {
      queueMicrotask(() => {
        if (!cancelled) setExtra(null)
      })
      return () => {
        cancelled = true
      }
    }
    void (async () => {
      try {
        const data = await get<{ ok: boolean; categoria?: ActivoCategoria }>(
          `/activos-categorias/${encodeURIComponent(includeInactiveId)}`,
        )
        if (!cancelled && data.ok && data.categoria) {
          setExtra(data.categoria)
        }
      } catch {
        if (!cancelled) setExtra(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [includeInactiveId, categorias])

  const options = React.useMemo(() => {
    const list = [...categorias]
    if (extra && !list.some((c) => c.id === extra.id)) list.unshift(extra)
    return list
  }, [categorias, extra])

  return (
    <div>
      <select
        className={className}
        value={value}
        disabled={disabled || loading}
        onChange={(e) => {
          const id = e.target.value
          const cat = options.find((c) => c.id === id) || null
          onChange(id, cat)
        }}
      >
        <option value="">{emptyLabel}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.activo === false ? ' (inactiva)' : ''}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
    </div>
  )
}
