import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { CapacitacionDetalleClient } from './CapacitacionDetalleClient'

export default function CoordinadorCapacitacionDetallePage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando detalle…" />}>
      <CapacitacionDetalleClient />
    </Suspense>
  )
}
