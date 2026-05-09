import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { ConsumiblesClient } from '@/app/(shell)/coordinador/inventario/consumibles/ConsumiblesClient'

export default function CoordinadorConsumiblesPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando…" />}>
      <ConsumiblesClient />
    </Suspense>
  )
}

