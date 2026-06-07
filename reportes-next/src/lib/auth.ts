import { safeRedirectPathForRol } from '@/lib/permissions'

export const SERVE_SP_USUARIO_KEY = 'servesp_usuario'
export const CAMBIAR_PASSWORD_PATH = '/cambiar-password'

export type AppUsuario = {
  id: string
  nombre: string
  usuario: string
  email: string
  rol: string
  requiere_cambio_password?: boolean
}

export type LoginResponse = {
  ok: true
  usuario: AppUsuario
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

export function redirectPathForRol(rol: string): string {
  return safeRedirectPathForRol(rol)
}

export function usuarioRequiereCambioPassword(usuario: AppUsuario | null | undefined): boolean {
  return Boolean(usuario?.requiere_cambio_password)
}
