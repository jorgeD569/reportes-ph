import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { CapacitacionesOperadorClient } from './CapacitacionesOperadorClient'

export default function OperadorCapacitacionesPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando capacitaciones…" />}>
      <CapacitacionesOperadorClient />
    </Suspense>
  )
}
