import * as React from 'react'
import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { ReportesPhClient } from './ReportesPhClient'

export default function CoordinadorReportesPhPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando reportes…" />}>
      <ReportesPhClient />
    </Suspense>
  )
}

