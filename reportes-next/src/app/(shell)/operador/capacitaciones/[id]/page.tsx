import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { CapacitacionOperadorDetalleClient } from './CapacitacionOperadorDetalleClient'

export default function OperadorCapacitacionDetallePage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando capacitación…" />}>
      <CapacitacionOperadorDetalleClient />
    </Suspense>
  )
}
