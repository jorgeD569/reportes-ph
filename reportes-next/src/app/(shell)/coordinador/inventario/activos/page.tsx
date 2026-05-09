import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { ActivosClient } from '@/app/(shell)/coordinador/inventario/activos/ActivosClient'

export default function CoordinadorActivosPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando…" />}>
      <ActivosClient />
    </Suspense>
  )
}

