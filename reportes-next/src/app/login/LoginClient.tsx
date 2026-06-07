'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SIDEBAR_BRAND } from '@/components/shell/SidebarBrand'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { ApiError, post } from '@/lib/api'
import {
  CAMBIAR_PASSWORD_PATH,
  persistAppUsuario,
  redirectPathForRol,
  usuarioRequiereCambioPassword,
  type LoginResponse,
} from '@/lib/auth'
import { normalizeUserError } from '@/lib/user-errors'

export function LoginClient() {
  const router = useRouter()

  const [usuario, setUsuario] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const data = await post<LoginResponse>('/login', { usuario, password })

      if (!data.ok || !data.usuario) {
        setError('No se pudo iniciar sesión. Volvé a intentar.')
        return
      }

      persistAppUsuario({
        ...data.usuario,
        requiere_cambio_password: Boolean(data.usuario.requiere_cambio_password),
      })

      if (usuarioRequiereCambioPassword(data.usuario)) {
        router.push(CAMBIAR_PASSWORD_PATH)
        return
      }

      router.push(redirectPathForRol(data.usuario.rol))
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : normalizeUserError(err) ?? 'Error al iniciar sesión.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
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
          <p className="text-sm font-medium text-sky-200/75">
            {SIDEBAR_BRAND.subtitle}
          </p>
        </div>

        <Card>
          <CardHeader>
            <div>
              <div className="text-lg font-semibold">Ingresar</div>
              <div className="mt-1 text-sm text-muted">
                Accedé con tu usuario y contraseña del sistema Serv. Esp.
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
                  htmlFor="login-usuario"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Usuario
                </label>
                <input
                  id="login-usuario"
                  autoComplete="username"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div>
                <label
                  htmlFor="login-password"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Contraseña
                </label>
                <input
                  id="login-password"
                  autoComplete="current-password"
                  type="password"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-4 focus:ring-black/5 dark:focus:ring-white/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="h-11 w-full rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
