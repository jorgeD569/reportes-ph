import { safeRedirectPathForRol } from '@/lib/permissions'

export const SERVE_SP_USUARIO_KEY = 'servesp_usuario'
export const CAMBIAR_PASSWORD_PATH = '/cambiar-password'
export const SESSION_EXPIRED_MESSAGE =
  'Tu sesión expiró o no es válida. Volvé a ingresar.'

export type AppUsuario = {
  id: string
  nombre: string
  usuario: string
  email: string
  rol: string
  requiere_cambio_password?: boolean
  /** Token de sesión firmada (backend). No es la contraseña. */
  session_token?: string
  session_expires_at?: string
}

export type LoginResponse = {
  ok: true
  usuario: AppUsuario
  /** Campos adicionales compatibles (también vienen dentro de usuario). */
  session_token?: string
  session_expires_at?: string
}

export function persistAppUsuario(usuario: AppUsuario) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SERVE_SP_USUARIO_KEY, JSON.stringify(usuario))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readAppUsuario(): AppUsuario | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SERVE_SP_USUARIO_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppUsuario
  } catch {
    return null
  }
}

export function readSessionToken(): string | null {
  const u = readAppUsuario()
  const t = u?.session_token
  if (typeof t === 'string' && t.trim()) return t.trim()
  return null
}

export function clearAppUsuario() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SERVE_SP_USUARIO_KEY)
  } catch {
    /* ignore */
  }
}

export function logoutAppUsuario() {
  clearAppUsuario()
  if (typeof window !== 'undefined') {
    window.location.href = '/login'
  }
}

/** Cierra sesión y redirige al login con mensaje de sesión vencida/inválida. */
export function handleSessionExpired(message?: string) {
  clearAppUsuario()
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/login')) return
  const msg = encodeURIComponent(message || SESSION_EXPIRED_MESSAGE)
  window.location.href = `/login?session=expired&message=${msg}`
}

export function redirectPathForRol(rol: string): string {
  return safeRedirectPathForRol(rol)
}

export function usuarioRequiereCambioPassword(usuario: AppUsuario | null | undefined): boolean {
  return Boolean(usuario?.requiere_cambio_password)
}
