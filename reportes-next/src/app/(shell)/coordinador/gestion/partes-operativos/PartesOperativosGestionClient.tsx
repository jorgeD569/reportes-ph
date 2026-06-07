'use client'

import * as React from 'react'
import Link from 'next/link'
import { GestionInventarioGate } from '@/components/coordinador/inventario/GestionInventarioGate'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { LoadingState } from '@/components/ui/LoadingState'
import { ModernTable, Td, Th } from '@/components/ui/ModernTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { get } from '@/lib/api'
import { routes } from '@/lib/constants/routes'
import {
  COORD_BTN_LINK,
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_INPUT_LG,
} from '@/lib/coordinador/theme'
import { formatFechaSoloDia } from '@/lib/date'
import { parteOperativoPdfUrl, parteOperativoTienePdf } from '@/lib/parte-operativo-list'
import {
  parteOperativoListState,
  parteOperativoListStateLabel,
  parteOperativoListStateVariant,
} from '@/lib/status'
import type { GetPartesOperativosResponse, ParteOperativoListItem } from '@/lib/types/partes-operativos'

export function PartesOperativosGestionClient() {
  return (
    <GestionInventarioGate>
      {({ logout }) => <PartesOperativosGestionAuthed logout={logout} />}
    </GestionInventarioGate>
  )
}

function PartesOperativosGestionAuthed({ logout }: { logout: () => void }) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<ParteOperativoListItem[]>([])
  const [query, setQuery] = React.useState('')

  const load = React.useCallback(async () => {
    const data = await get<GetPartesOperativosResponse>('/partes-operativos')
    setItems(data.partes || [])
  }, [])

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        setLoading(true)
        setError(null)
        await load()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [load])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) => {
      const haystack = [
        p.numero_parte,
        p.pozo,
        p.yacimiento,
        p.operadora,
        p.contratista,
        p.unidad_pesada,
        p.estado,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [items, query])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestión de partes operativos"
        subtitle="Administración interna: edición, reapertura y regeneración de PDF."
        right={
          <>
            <Link
              href={routes.coordinador.inventario.gestion}
              className={COORD_BTN_LINK}
            >
              Volver al panel
            </Link>
            <StatusBadge variant="warning">Acceso restringido</StatusBadge>
            <button
              type="button"
              onClick={logout}
              className={COORD_BTN_LINK}
            >
              Cerrar sesión
            </button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div>
            <div className="text-lg font-semibold">Partes operativos</div>
            <div className="mt-1 text-sm text-muted">
              Buscá por número de parte, pozo, yacimiento, operadora o estado.
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <input
            className={`${COORD_INPUT_LG} mb-4 md:max-w-lg`}
            placeholder="Buscar parte operativo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {loading ? <LoadingState label="Cargando partes…" /> : null}
          {error ? (
            <InlineMessage kind="error" title="Error" description={error} className="mb-4" />
          ) : null}

          <ModernTable>
            <thead>
              <tr>
                <Th>N° Parte</Th>
                <Th>Fecha</Th>
                <Th>Pozo</Th>
                <Th>Operadora</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && filtered.length === 0 ? (
                <tr>
                  <Td colSpan={6}>
                    <EmptyState title="Sin resultados" description="Probá otra búsqueda." />
                  </Td>
                </tr>
              ) : null}
              {!loading && !error
                ? filtered.map((p) => {
                    const st = parteOperativoListState(
                      p as ParteOperativoListItem & Record<string, unknown>
                    )
                    const pdfUrl = parteOperativoPdfUrl(
                      p as ParteOperativoListItem & Record<string, unknown>
                    )
                    const tienePdf = parteOperativoTienePdf(
                      p as ParteOperativoListItem & Record<string, unknown>
                    )

                    return (
                      <tr key={p.id}>
                        <Td className="font-semibold">{p.numero_parte ?? '—'}</Td>
                        <Td>{formatFechaSoloDia(p.fecha || p.created_at)}</Td>
                        <Td>{p.pozo || '—'}</Td>
                        <Td>{p.operadora || '—'}</Td>
                        <Td>
                          <StatusBadge variant={parteOperativoListStateVariant(st)}>
                            {parteOperativoListStateLabel(st)}
                          </StatusBadge>
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link
                              href={routes.coordinador.gestion.parteOperativo(p.id)}
                              className={COORD_BTN_PRIMARY}
                            >
                              Editar
                            </Link>
                            {tienePdf && pdfUrl ? (
                              <a
                                href={pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={COORD_BTN_SECONDARY}
                              >
                                Ver PDF
                              </a>
                            ) : null}
                          </div>
                        </Td>
                      </tr>
                    )
                  })
                : null}
            </tbody>
          </ModernTable>
        </CardBody>
      </Card>
    </div>
  )
}
