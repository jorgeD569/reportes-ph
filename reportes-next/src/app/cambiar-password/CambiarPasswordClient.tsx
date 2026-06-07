'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SIDEBAR_BRAND } from '@/components/shell/SidebarBrand'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { ApiError, post } from '@/lib/api'
import {
  persistAppUsuario,
  readAppUsuario,
  redirectPathForRol,
  usuarioRequiereCambioPassword,
} from '@/lib/auth'
import { MIN_PASSWORD_LENGTH } from '@/lib/constants/password'
import type { CambiarPasswordBody, CambiarPasswordResponse } from '@/lib/types/usuarios'
import { normalizeUserError } from '@/lib/user-errors'

const INPUT_CLASS =
  'mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10'

export function CambiarPasswordClient() {
  const router = useRouter()
  const [checking, setChecking] = React.useState(true)
  const [usuarioNombre, setUsuarioNombre] = React.useState('')
  const [userId, setUserId] = React.useState('')
  const [passwordActual, setPasswordActual] = React.useState('')
  const [passwordNueva, setPasswordNueva] = React.useState('')
  const [passwordConfirm, setPasswordConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    const usuario = readAppUsuario()

    if (!usuario) {
      router.replace('/login')
      return
    }

    if (!usuarioRequiereCambioPassword(usuario)) {
      router.replace(redirectPathForRol(usuario.rol))
      return
    }

    setUserId(usuario.id)
    setUsuarioNombre(usuario.nombre || usuario.usuario)
    setChecking(false)
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (passwordNueva.length < MIN_PASSWORD_LENGTH) {
      setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }

    if (passwordNueva !== passwordConfirm) {
      setError('La confirmación de contraseña no coincide.')
      return
    }

    setSubmitting(true)

    try {
      const body: CambiarPasswordBody = {
        userId,
        passwordActual,
        passwordNueva,
      }
      const data = await post<CambiarPasswordResponse>('/usuarios-app/cambiar-password', body)

      if (!data.ok || !data.usuario) {
        setError('No se pudo actualizar la contraseña.')
        return
      }

      persistAppUsuario({
        id: data.usuario.id,
        nombre: data.usuario.nombre,
        usuario: data.usuario.usuario,
        email: data.usuario.email ?? '',
        rol: data.usuario.rol,
        requiere_cambio_password: false,
      })

      router.replace(redirectPathForRol(data.usuario.rol))
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : normalizeUserError(err) ?? 'Error al cambiar la contraseña.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center text-sm text-muted">
        Cargando…
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div
          className="rounded-2xl border border-white/10 px-5 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
          style={{
            background:
              'linear-gradient(145deg, #0c2c40 0%, #0f1f2d 48%, #13283a 100%)',
          }}
        >
          <div className="text-lg font-bold tracking-[0.06em] text-white">
            {SIDEBAR_BRAND.title}
          </div>
          <div
            className="my-2 h-px w-full bg-gradient-to-r from-sky-400/40 via-white/20 to-transparent"
            aria-hidden
          />
          <p className="text-sm font-medium text-sky-200/75">{SIDEBAR_BRAND.subtitle}</p>
        </div>

        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Cambio de contraseña obligatorio</div>
              <div className="mt-1 text-sm text-muted">
                {usuarioNombre
                  ? `${usuarioNombre}, debés definir una nueva contraseña para continuar.`
                  : 'Debés definir una nueva contraseña para continuar.'}
              </div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error ? (
                <InlineMessage kind="error" title={error} className="w-full" />
              ) : null}

              <div>
                <label
                  htmlFor="password-actual"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Contraseña actual
                </label>
                <input
                  id="password-actual"
                  type="password"
                  autoComplete="current-password"
                  className={INPUT_CLASS}
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="password-nueva"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Nueva contraseña
                </label>
                <input
                  id="password-nueva"
                  type="password"
                  autoComplete="new-password"
                  className={INPUT_CLASS}
                  value={passwordNueva}
                  onChange={(e) => setPasswordNueva(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="password-confirm"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Confirmar contraseña
                </label>
                <input
                  id="password-confirm"
                  type="password"
                  autoComplete="new-password"
                  className={INPUT_CLASS}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="h-11 w-full rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
