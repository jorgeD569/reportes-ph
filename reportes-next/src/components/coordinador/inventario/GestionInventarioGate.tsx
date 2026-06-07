'use client'

/**
 * Protección local solo para pantallas que lo soliciten (p. ej. Gestión de inventario).
 *
 * TODO: Integrar Supabase Auth (signInWithPassword / sesión servidor) y validación de rol
 *       para coordinadores con permiso explícito de “gestión de inventario”.
 * TODO: Eliminar credenciales hardcodeadas cuando exista auth real; el cliente no debe validar rol solo.
 */

import * as React from 'react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import {
  COORD_BTN_PRIMARY_LG,
  COORD_INPUT_LG,
  COORD_LABEL,
} from '@/lib/coordinador/theme'

/** Clave de sesión frontend (solo sessionStorage): indica ingreso válido hasta cerrar pestaña/navegador. */
export const GESTION_INVENTARIO_SESSION_KEY = 'kompass::gestion_inventario::dev_session'

const TEMP_DEV_CREDENTIALS = {
  usuario: 'admin',
  contraseña: 'admin123',
}

export function readGestionInventarioSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(GESTION_INVENTARIO_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function persistGestionInventarioSession() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(GESTION_INVENTARIO_SESSION_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearGestionInventarioSession() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(GESTION_INVENTARIO_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

type GestionInventarioGateProps = {
  /** Contenido protegido: recibe logout para cerrar sesión (solo memoria/sessionStorage). */
  children: (ctx: { logout: () => void }) => React.ReactNode
}

/**
 * Credenciales hardcodeadas SOLO desarrollo — reemplazo futuro Supabase Auth.
 * No usar NEXT_PUBLIC_* para secretos ni contraseñas.
 */
export function GestionInventarioGate({ children }: GestionInventarioGateProps) {
  const [hydrated, setHydrated] = React.useState(false)
  const [authorized, setAuthorized] = React.useState(false)

  const [usuario, setUsuario] = React.useState('')
  const [contraseña, setContraseña] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Hidratar flags solo en cliente: evita mismatch SSR y satisface linter (no setState síncrono “duro”).
    React.startTransition(() => {
      setHydrated(true)
      setAuthorized(readGestionInventarioSession())
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (
      usuario === TEMP_DEV_CREDENTIALS.usuario &&
      contraseña === TEMP_DEV_CREDENTIALS.contraseña
    ) {
      persistGestionInventarioSession()
      setAuthorized(true)
      setContraseña('')
      return
    }
    setError('Usuario o contraseña incorrectos.')
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-sky-200/70">
        Cargando…
      </div>
    )
  }

  function logout() {
    clearGestionInventarioSession()
    setAuthorized(false)
    setUsuario('')
    setContraseña('')
    setError(null)
  }

  if (!authorized) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4 py-10">
        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Gestión del sistema</div>
              <div className="mt-1 text-sm text-muted">
                Acceso restringido. Ingresá con las credenciales de desarrollo; en producción se
                reemplazará por Supabase Auth y roles.
              </div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error ? (
                <InlineMessage kind="error" title={error} className="w-full" />
              ) : null}
              <div>
                <label className={COORD_LABEL}>
                  Usuario
                </label>
                <input
                  autoComplete="username"
                  className={`mt-2 ${COORD_INPUT_LG}`}
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={COORD_LABEL}>
                  Contraseña
                </label>
                <input
                  autoComplete="current-password"
                  type="password"
                  className={`mt-2 ${COORD_INPUT_LG}`}
                  value={contraseña}
                  onChange={(e) => setContraseña(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className={COORD_BTN_PRIMARY_LG + ' w-full'}
              >
                Ingresar
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    )
  }

  return <>{children({ logout })}</>
}
