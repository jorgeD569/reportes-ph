import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { CapacitacionesCoordinadorClient } from './CapacitacionesCoordinadorClient'

export default function CoordinadorCapacitacionesPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando capacitaciones HSE…" />}>
      <CapacitacionesCoordinadorClient />
    </Suspense>
  )
}
