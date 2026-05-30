'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { routes } from '@/lib/constants/routes'
import { get } from '@/lib/api'
import type { GetReportesPhResponse } from '@/lib/types/reportes'
import type { GetPartesOperativosResponse } from '@/lib/types/partes-operativos'
import type { Activo, Consumible } from '@/lib/types/inventario'
import { vencimientoState } from '@/lib/vencimientos'
import { stockState } from '@/lib/stock'

function KpiCard({
  label,
  value,
  badge,
  href,
}: {
  label: string
  value: string
  badge?: React.ReactNode
  href?: string
}) {
  const content = (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      </div>
      {badge}
    </div>
  )

  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-app)]">
      <CardBody className="p-5">
        {href ? (
          <Link href={href} className="block">
            {content}
          </Link>
        ) : (
          content
        )}
      </CardBody>
    </Card>
  )
}

export default function CoordinadorDashboardPage() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [kpis, setKpis] = React.useState<{
    phPendientes: number
    phCerrados: number
    activosVencidos: number
    activosCriticos: number
    activosProximos: number
    fueraServicio: number
    stockBajo: number
    partesOperativos: number
  } | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)

        const [reportesData, partesOperativosData, activos, consumibles] =
          await Promise.all([
            get<GetReportesPhResponse>('/reportes-ph'),
            get<GetPartesOperativosResponse>('/partes-operativos'),
            get<Activo[]>('/activos'),
            get<Consumible[]>('/consumibles'),
          ])

        const reportes = reportesData.reportes || []
        const partesOperativos = partesOperativosData.partes?.length ?? 0

        const activosVencidos = (activos || []).filter((a) => {
          const { state } = vencimientoState(a.vencimiento)
          return state === 'vencido'
        }).length

        const activosCriticos = (activos || []).filter((a) => {
          const { state } = vencimientoState(a.vencimiento)
          return state === 'critico'
        }).length

        const activosProximos = (activos || []).filter((a) => {
          const { state } = vencimientoState(a.vencimiento)
          return state === 'proximo'
        }).length

        const fueraServicio = (activos || []).filter((a) =>
          a.estado === 'fuera_de_servicio' ||
          a.estado === 'en_reparacion' ||
          a.estado === 'vencido'
        ).length

        const stockBajo = (consumibles || []).filter((c) => {
          const s = stockState(c)
          return s === 'stock_bajo'
        }).length

        if (cancelled) return
        setKpis({
          phPendientes: reportes.filter((r) => !r.reporte_pdf_path).length,
          phCerrados: reportes.filter((r) => !!r.reporte_pdf_path).length,
          activosVencidos,
          activosCriticos,
          activosProximos,
          fueraServicio,
          stockBajo,
          partesOperativos,
        })
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Panel principal de coordinación (UI nueva)."
      />

      {loading ? <LoadingState label="Cargando métricas…" /> : null}
      {error ? (
        <InlineMessage
          kind="error"
          title="No se pudieron cargar los datos del dashboard"
          description={error}
        />
      ) : null}

      {!loading && !error && kpis ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Reportes PH pendientes"
            value={String(kpis.phPendientes)}
            badge={<StatusBadge variant="warning">Pendiente</StatusBadge>}
            href={`${routes.coordinador.reportesPh}?estado=pendiente`}
          />
          <KpiCard
            label="Reportes PH cerrados"
            value={String(kpis.phCerrados)}
            badge={<StatusBadge variant="success">Cerrado</StatusBadge>}
            href={`${routes.coordinador.reportesPh}?estado=cerrado`}
          />
          <KpiCard
            label="Activos vencidos"
            value={String(kpis.activosVencidos)}
            badge={<StatusBadge variant="danger">Vencido</StatusBadge>}
            href={`${routes.coordinador.inventario.activos}?filtro=vencidos`}
          />
          <KpiCard
            label="Vencen en 7 días"
            value={String(kpis.activosCriticos)}
            badge={<StatusBadge variant="warning">Crítico</StatusBadge>}
            href={`${routes.coordinador.inventario.activos}?filtro=criticos`}
          />
          <KpiCard
            label="Vencen en 30 días"
            value={String(kpis.activosProximos)}
            badge={<StatusBadge variant="info">Próximo</StatusBadge>}
            href={`${routes.coordinador.inventario.activos}?filtro=vencimientos`}
          />
          <KpiCard
            label="Fuera de servicio"
            value={String(kpis.fueraServicio)}
            badge={<StatusBadge variant="neutral">Estado</StatusBadge>}
            href={`${routes.coordinador.inventario.activos}?filtro=fuera_servicio`}
          />
          <KpiCard
            label="Consumibles bajo stock"
            value={String(kpis.stockBajo)}
            badge={<StatusBadge variant="accent">Stock bajo</StatusBadge>}
            href={`${routes.coordinador.inventario.consumibles}?filtro=stock_bajo`}
          />
          <KpiCard
            label="Partes operativos"
            value={String(kpis.partesOperativos)}
            badge={<StatusBadge variant="info">Operativos</StatusBadge>}
            href={routes.coordinador.partesOperativos}
          />
        </div>
      ) : null}
    </div>
  )
}

