'use client'

import * as React from 'react'
import Link from 'next/link'
import { ActivoTipoBadge } from '@/components/coordinador/inventario/ActivoTipoBadge'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_CARD,
  COORD_SECTION_TITLE,
  COORD_TEXT,
  COORD_TEXT_MUTED,
} from '@/lib/coordinador/theme'
import { cn } from '@/lib/cn'
import { formatFechaAR } from '@/lib/date'
import {
  isExactMatchQuery,
  pathFromHref,
} from '@/lib/busqueda-global/query'
import {
  labelEstadoOperativo,
  labelEstadoRevisionBusqueda,
  variantEstadoRevisionBusqueda,
} from '@/lib/inventario/labels'
import { canAccessPath } from '@/lib/permissions'
import type {
  BusquedaGlobalActivo,
  BusquedaGlobalParteOperativo,
  BusquedaGlobalReportePh,
  GetBusquedaGlobalResponse,
} from '@/lib/types/busqueda-global'

function display(v: string | null | undefined): string {
  const t = String(v ?? '').trim()
  return t === '' ? '—' : t
}

function DestinoLink({
  href,
  rol,
  className,
  children,
}: {
  href: string
  rol: string | null
  className?: string
  children: React.ReactNode
}) {
  const path = pathFromHref(href)
  const allowed = rol ? canAccessPath(rol, path) : false
  if (!allowed) return null
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function ResultCard({
  exact,
  children,
}: {
  exact?: boolean
  children: React.ReactNode
}) {
  return (
    <article
      className={cn(
        COORD_CARD,
        'p-4 sm:p-5',
        exact && 'ring-1 ring-sky-400/40',
      )}
    >
      {children}
    </article>
  )
}

function ActivoCard({
  a,
  query,
  rol,
}: {
  a: BusquedaGlobalActivo
  query: string
  rol: string | null
}) {
  const exact = isExactMatchQuery(query, a.titulo)
  const conjuntoHref = a.pertenencia_actual
    ? `/coordinador/inventario/activos?activo=${encodeURIComponent(String(a.pertenencia_actual.conjunto_id))}`
    : null

  return (
    <ResultCard exact={exact}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn('text-lg font-semibold text-sky-300')}>{a.titulo}</h3>
            {exact ? (
              <StatusBadge variant="info">Coincidencia exacta</StatusBadge>
            ) : null}
            <ActivoTipoBadge
              esConjunto={a.es_conjunto}
              esComponente={a.es_componente}
            />
          </div>
          <p className={cn('text-sm', COORD_TEXT)}>{display(a.subtitulo)}</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              variant={variantEstadoRevisionBusqueda({
                estado_revision: a.estado_revision,
                activo: a.activo,
              })}
            >
              {labelEstadoRevisionBusqueda({
                estado_revision: a.estado_revision,
                activo: a.activo,
              })}
            </StatusBadge>
            {a.estado ? (
              <StatusBadge variant="neutral">
                {labelEstadoOperativo(a.estado)}
              </StatusBadge>
            ) : null}
          </div>
          <p className={cn('text-sm', COORD_TEXT_MUTED)}>
            Ubicación efectiva: {display(a.ubicacion_efectiva)}
          </p>
          {a.pertenencia_actual?.numero_serie ? (
            <p className={cn('text-sm', COORD_TEXT_MUTED)}>
              Dentro de:{' '}
              {conjuntoHref &&
              rol &&
              canAccessPath(rol, pathFromHref(conjuntoHref)) ? (
                <Link
                  href={conjuntoHref}
                  className="font-semibold text-sky-300 underline-offset-2 hover:underline"
                >
                  {a.pertenencia_actual.numero_serie}
                </Link>
              ) : (
                <span className="font-semibold text-sky-300">
                  {a.pertenencia_actual.numero_serie}
                </span>
              )}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <DestinoLink href={a.url_destino} rol={rol} className={COORD_BTN_PRIMARY}>
            Ver detalle
          </DestinoLink>
        </div>
      </div>
    </ResultCard>
  )
}

function ParteCard({
  p,
  query,
  rol,
}: {
  p: BusquedaGlobalParteOperativo
  query: string
  rol: string | null
}) {
  const exact = isExactMatchQuery(query, p.numero_parte)
  const title =
    p.numero_parte != null && String(p.numero_parte).trim() !== ''
      ? `Parte N.º ${p.numero_parte}`
      : p.titulo
  const fecha =
    formatFechaAR(p.fecha) !== '-' ? formatFechaAR(p.fecha) : 'Sin fecha'
  const estadoLabel = String(p.estado || '').toLowerCase()
  const primaryLabel =
    estadoLabel.includes('borrador') || estadoLabel.includes('curso')
      ? 'Continuar'
      : 'Ver parte'

  return (
    <ResultCard exact={exact}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('text-lg font-semibold', COORD_TEXT)}>{title}</h3>
          {exact ? (
            <StatusBadge variant="info">Coincidencia exacta</StatusBadge>
          ) : null}
          {p.estado ? <StatusBadge variant="neutral">{p.estado}</StatusBadge> : null}
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={COORD_TEXT_MUTED}>Fecha</dt>
            <dd className={COORD_TEXT}>{fecha}</dd>
          </div>
          <div>
            <dt className={COORD_TEXT_MUTED}>Pozo</dt>
            <dd className={COORD_TEXT}>{display(p.pozo)}</dd>
          </div>
          <div>
            <dt className={COORD_TEXT_MUTED}>Operadora</dt>
            <dd className={COORD_TEXT}>{display(p.operadora)}</dd>
          </div>
          <div>
            <dt className={COORD_TEXT_MUTED}>Yacimiento</dt>
            <dd className={COORD_TEXT}>{display(p.yacimiento)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <DestinoLink href={p.url_destino} rol={rol} className={COORD_BTN_PRIMARY}>
            {primaryLabel}
          </DestinoLink>
          {p.pdf_url ? (
            <a
              href={p.pdf_url}
              target="_blank"
              rel="noreferrer"
              className={COORD_BTN_SECONDARY}
            >
              Ver PDF
            </a>
          ) : null}
        </div>
      </div>
    </ResultCard>
  )
}

function PhCard({
  r,
  query,
  rol,
}: {
  r: BusquedaGlobalReportePh
  query: string
  rol: string | null
}) {
  const exact = isExactMatchQuery(query, r.reporte_numero)
  const title =
    r.reporte_numero != null && String(r.reporte_numero).trim() !== ''
      ? `Reporte PH N.º ${r.reporte_numero}`
      : r.titulo
  const fecha =
    formatFechaAR(r.fecha) !== '-' ? formatFechaAR(r.fecha) : 'Sin fecha'

  return (
    <ResultCard exact={exact}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('text-lg font-semibold', COORD_TEXT)}>{title}</h3>
          {exact ? (
            <StatusBadge variant="info">Coincidencia exacta</StatusBadge>
          ) : null}
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={COORD_TEXT_MUTED}>Fecha</dt>
            <dd className={COORD_TEXT}>{fecha}</dd>
          </div>
          <div>
            <dt className={COORD_TEXT_MUTED}>Cliente</dt>
            <dd className={COORD_TEXT}>{display(r.cliente)}</dd>
          </div>
          <div>
            <dt className={COORD_TEXT_MUTED}>Pozo</dt>
            <dd className={COORD_TEXT}>{display(r.pozo)}</dd>
          </div>
          <div>
            <dt className={COORD_TEXT_MUTED}>Elemento ensayado</dt>
            <dd className={COORD_TEXT}>{display(r.elemento_ensayar)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <DestinoLink href={r.url_destino} rol={rol} className={COORD_BTN_PRIMARY}>
            Ver detalle
          </DestinoLink>
          {r.pdf_url ? (
            <a
              href={r.pdf_url}
              target="_blank"
              rel="noreferrer"
              className={COORD_BTN_SECONDARY}
            >
              Ver PDF
            </a>
          ) : null}
        </div>
      </div>
    </ResultCard>
  )
}

function GroupSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count <= 0) return null
  return (
    <section className="space-y-3">
      <h2 className={COORD_SECTION_TITLE}>
        {title}{' '}
        <span className={cn('font-normal', COORD_TEXT_MUTED)}>({count})</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function ResultadosBusquedaGlobal({
  query,
  loading,
  error,
  data,
  rol,
  onRetry,
  onClear,
}: {
  query: string
  loading: boolean
  error: string | null
  data: GetBusquedaGlobalResponse | null
  rol: string | null
  onRetry: () => void
  onClear: () => void
}) {
  const activos = data?.resultados.activos ?? []
  const partes = data?.resultados.partes_operativos ?? []
  const ph = data?.resultados.reportes_ph ?? []
  const total = data?.total ?? activos.length + partes.length + ph.length

  if (loading && !data) {
    return (
      <p className={cn('py-8 text-sm', COORD_TEXT_MUTED)} role="status">
        Buscando…
      </p>
    )
  }

  if (error) {
    return (
      <div className="space-y-3 py-4">
        <InlineMessage kind="error" title="No se pudo buscar" description={error} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={COORD_BTN_PRIMARY} onClick={onRetry}>
            Reintentar
          </button>
          <button type="button" className={COORD_BTN_SECONDARY} onClick={onClear}>
            Limpiar búsqueda
          </button>
        </div>
      </div>
    )
  }

  if (data && total === 0) {
    return (
      <div className="space-y-3 py-6">
        <p className={cn('text-sm', COORD_TEXT)}>
          No encontramos resultados para “{query}”
        </p>
        <button type="button" className={COORD_BTN_SECONDARY} onClick={onClear}>
          Limpiar búsqueda
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className={cn('text-sm', COORD_TEXT_MUTED)}>Resultados para “{query}”</p>
        <p className={cn('mt-1 text-base font-semibold', COORD_TEXT)}>
          {total} {total === 1 ? 'resultado encontrado' : 'resultados encontrados'}
        </p>
        {loading ? (
          <p className={cn('mt-1 text-xs', COORD_TEXT_MUTED)} role="status">
            Actualizando…
          </p>
        ) : null}
      </div>

      <GroupSection title="ACTIVOS" count={activos.length}>
        {activos.map((a) => (
          <ActivoCard key={`a-${a.id}`} a={a} query={query} rol={rol} />
        ))}
      </GroupSection>

      <GroupSection title="PARTES OPERATIVOS" count={partes.length}>
        {partes.map((p) => (
          <ParteCard key={`p-${p.id}`} p={p} query={query} rol={rol} />
        ))}
      </GroupSection>

      <GroupSection title="REPORTES PH" count={ph.length}>
        {ph.map((r) => (
          <PhCard key={`ph-${r.id}`} r={r} query={query} rol={rol} />
        ))}
      </GroupSection>
    </div>
  )
}
