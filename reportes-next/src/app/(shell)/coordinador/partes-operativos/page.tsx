import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { PartesOperativosClient } from './PartesOperativosClient'

export default function CoordinadorPartesOperativosPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando partes operativos…" />}>
      <PartesOperativosClient />
    </Suspense>
  )
}
