'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { readAppUsuario, CAMBIAR_PASSWORD_PATH, usuarioRequiereCambioPassword } from '@/lib/auth'
import { canAccessPath, safeRedirectPathForRol } from '@/lib/permissions'

type AuthStatus = 'checking' | 'authorized' | 'redirecting'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = React.useState<AuthStatus>('checking')

  React.useEffect(() => {
    const usuario = readAppUsuario()

    if (!usuario) {
      React.startTransition(() => {
        setStatus('redirecting')
      })
      router.replace('/login')
      return
    }

    if (
      usuarioRequiereCambioPassword(usuario) &&
      pathname !== CAMBIAR_PASSWORD_PATH
    ) {
      React.startTransition(() => {
        setStatus('redirecting')
      })
      router.replace(CAMBIAR_PASSWORD_PATH)
      return
    }

    if (!canAccessPath(usuario.rol, pathname)) {
      React.startTransition(() => {
        setStatus('redirecting')
      })
      router.replace(safeRedirectPathForRol(usuario.rol))
      return
    }

    React.startTransition(() => {
      setStatus('authorized')
    })
  }, [router, pathname])

  if (status !== 'authorized') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app text-sm text-muted">
        {status === 'checking' ? 'Cargando…' : 'Redirigiendo…'}
      </div>
    )
  }

  return <>{children}</>
}
