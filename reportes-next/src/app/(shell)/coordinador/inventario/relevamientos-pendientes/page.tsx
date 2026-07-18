import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { RelevamientosPendientesClient } from './RelevamientosPendientesClient'

export default function RelevamientosPendientesPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando…" />}>
      <RelevamientosPendientesClient />
    </Suspense>
  )
}
