'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { logoutAppUsuario, readAppUsuario } from '@/lib/auth'
import { canAccessGestion, safeRedirectPathForRol } from '@/lib/permissions'

type GestionInventarioGateProps = {
  children: (ctx: { logout: () => void }) => React.ReactNode
}

type GateStatus = 'checking' | 'authorized' | 'redirecting'

/**
 * Protección de pantallas de gestión administrativa.
 * Usa la sesión global (`servesp_usuario`) y roles admin / coordinador.
 */
export function GestionInventarioGate({ children }: GestionInventarioGateProps) {
  const router = useRouter()
  const [status, setStatus] = React.useState<GateStatus>('checking')

  React.useEffect(() => {
    const usuario = readAppUsuario()

    if (!usuario) {
      React.startTransition(() => {
        setStatus('redirecting')
      })
      router.replace('/login')
      return
    }

    if (!canAccessGestion(usuario.rol)) {
      React.startTransition(() => {
        setStatus('redirecting')
      })
      router.replace(safeRedirectPathForRol(usuario.rol))
      return
    }

    React.startTransition(() => {
      setStatus('authorized')
    })
  }, [router])

  if (status !== 'authorized') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-300">
        {status === 'checking' ? 'Cargando…' : 'Redirigiendo…'}
      </div>
    )
  }

  return <>{children({ logout: logoutAppUsuario })}</>
}
