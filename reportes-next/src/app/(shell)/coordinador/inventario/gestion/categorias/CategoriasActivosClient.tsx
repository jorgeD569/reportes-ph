'use client'

import * as React from 'react'
import Link from 'next/link'
import { GestionInventarioGate } from '@/components/coordinador/inventario/GestionInventarioGate'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get, post, put } from '@/lib/api'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
  COORD_LABEL,
  COORD_SECTION_MUTED,
  COORD_SECTION_TITLE,
} from '@/lib/coordinador/theme'
import { routes } from '@/lib/constants/routes'
import type { ActivoCategoria } from '@/lib/types/inventario'

type ListResponse = { ok: boolean; categorias?: ActivoCategoria[]; error?: string }

export function CategoriasActivosClient() {
  return (
    <GestionInventarioGate>
      {() => <CategoriasActivosAuthed />}
    </GestionInventarioGate>
  )
}

function CategoriasActivosAuthed() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [categorias, setCategorias] = React.useState<ActivoCategoria[]>([])
  const [nombre, setNombre] = React.useState('')
  const [aplicableActivos, setAplicableActivos] = React.useState(true)
  const [aplicableConjuntos, setAplicableConjuntos] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [editNombre, setEditNombre] = React.useState('')
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await get<ListResponse>('/activos-categorias?include_uso=1')
        if (cancelled) return
        if (!data.ok) {
          setError(data.error || 'No se pudieron cargar categorías')
          setCategorias([])
        } else {
          setError(null)
          setCategorias(data.categorias || [])
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Error al cargar categorías')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  function reload() {
    setLoading(true)
    setReloadToken((n) => n + 1)
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = await post<{ ok: boolean; error?: string }>('/activos-categorias', {
        nombre,
        aplicable_a_activos: aplicableActivos,
        aplicable_a_conjuntos: aplicableConjuntos,
      })
      if (!data.ok) throw new Error(data.error || 'No se pudo crear')
      setNombre('')
      setAplicableActivos(true)
      setAplicableConjuntos(false)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  async function onToggleActivo(cat: ActivoCategoria) {
    setError(null)
    try {
      const data = await put<{ ok: boolean; error?: string }>(
        `/activos-categorias/${encodeURIComponent(cat.id)}`,
        { activo: !cat.activo },
      )
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  async function onSaveNombre(cat: ActivoCategoria) {
    setSaving(true)
    setError(null)
    try {
      const data = await put<{ ok: boolean; error?: string }>(
        `/activos-categorias/${encodeURIComponent(cat.id)}`,
        { nombre: editNombre },
      )
      if (!data.ok) throw new Error(data.error || 'No se pudo renombrar')
      setEditId(null)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al renombrar')
    } finally {
      setSaving(false)
    }
  }

  async function onToggleAplicable(
    cat: ActivoCategoria,
    field: 'aplicable_a_activos' | 'aplicable_a_conjuntos',
  ) {
    setError(null)
    try {
      const data = await put<{ ok: boolean; error?: string }>(
        `/activos-categorias/${encodeURIComponent(cat.id)}`,
        { [field]: !cat[field] },
      )
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías de activos"
        subtitle="Catálogo administrable. Flutter y la web sincronizan desde aquí; no hay listas fijas en código."
        right={
          <Link href={routes.coordinador.inventario.gestionInventario} className={COORD_BTN_SECONDARY}>
            Volver a Gestión de activos
          </Link>
        }
      />

      {error ? (
        <InlineMessage kind="error" title="Error" description={error} />
      ) : null}

      <Card>
        <CardHeader>
          <div className={COORD_SECTION_TITLE}>Nueva categoría</div>
          <div className={COORD_SECTION_MUTED}>
            Solo se crea lo que cargues acá. No se inventan nombres automáticamente.
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={COORD_LABEL}>Nombre de la categoría</span>
              <input
                className={`mt-2 ${COORD_INPUT_LG}`}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej.: Cabezal"
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={aplicableActivos}
                onChange={(e) => setAplicableActivos(e.target.checked)}
              />
              Aplicable a activos
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={aplicableConjuntos}
                onChange={(e) => setAplicableConjuntos(e.target.checked)}
              />
              Aplicable a conjuntos
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={COORD_BTN_PRIMARY} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className={COORD_SECTION_TITLE}>Categorías existentes</div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <LoadingState label="Cargando categorías…" />
          ) : categorias.length === 0 ? (
            <EmptyState
              title="Sin categorías"
              description="Creá la primera categoría para poder relevar activos y conjuntos."
            />
          ) : (
            <ul className="divide-y divide-slate-800">
              {categorias.map((cat) => (
                <li
                  key={cat.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    {editId === cat.id ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          className={COORD_INPUT_LG}
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                        />
                        <button
                          type="button"
                          className={COORD_BTN_PRIMARY}
                          disabled={saving}
                          onClick={() => void onSaveNombre(cat)}
                        >
                          Guardar nombre
                        </button>
                        <button
                          type="button"
                          className={COORD_BTN_SECONDARY}
                          onClick={() => setEditId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-white">{cat.nombre}</span>
                        <StatusBadge variant={cat.activo ? 'success' : 'neutral'}>
                          {cat.activo ? 'Activa' : 'Inactiva'}
                        </StatusBadge>
                        {cat.en_uso ? <StatusBadge variant="info">En uso</StatusBadge> : null}
                      </div>
                    )}
                    <div className={COORD_SECTION_MUTED}>
                      ID: {cat.id}
                      {cat.codigo_legacy ? ` · legacy: ${cat.codigo_legacy}` : ''}
                      {typeof cat.usos_activos === 'number'
                        ? ` · usos activos: ${cat.usos_activos}`
                        : ''}
                      {typeof cat.usos_conjuntos === 'number'
                        ? ` · usos conjuntos: ${cat.usos_conjuntos}`
                        : ''}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cat.aplicable_a_activos}
                          onChange={() => void onToggleAplicable(cat, 'aplicable_a_activos')}
                        />
                        Activos
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cat.aplicable_a_conjuntos}
                          onChange={() => void onToggleAplicable(cat, 'aplicable_a_conjuntos')}
                        />
                        Conjuntos
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={COORD_BTN_SECONDARY}
                      onClick={() => {
                        setEditId(cat.id)
                        setEditNombre(cat.nombre)
                      }}
                    >
                      Editar nombre
                    </button>
                    <button
                      type="button"
                      className={COORD_BTN_SECONDARY}
                      onClick={() => void onToggleActivo(cat)}
                    >
                      {cat.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
