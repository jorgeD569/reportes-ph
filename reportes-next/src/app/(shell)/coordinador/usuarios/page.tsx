import { Suspense } from 'react'
import { LoadingState } from '@/components/ui/LoadingState'
import { UsuariosClient } from '@/app/(shell)/coordinador/usuarios/UsuariosClient'

export default function CoordinadorUsuariosPage() {
  return (
    <Suspense fallback={<LoadingState label="Cargando…" />}>
      <UsuariosClient />
    </Suspense>
  )
}
