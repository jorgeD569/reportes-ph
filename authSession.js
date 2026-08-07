/**
 * Sesión firmada mínima (HMAC-SHA256) para autorización por roles.
 * No usa JWT externo: payload.base64url + firma.base64url.
 */

const crypto = require('crypto')

const ROLES_COMPOSICION_WRITE = Object.freeze([
  'supervisor',
  'coordinador',
  'admin',
])

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 días (campo / Flutter offline)

/**
 * Enforcement de Bearer en POST .../componentes.
 * - true / 1 / yes / si → exigir auth
 * - false / 0 / no → compat temporal (solo relevamientos pendientes sin Bearer)
 * - ausente u otro valor → true (seguro por defecto)
 */
function isComposicionAuthRequired() {
  const raw = String(process.env.APP_COMPOSICION_REQUIRE_AUTH ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  if (
    raw === 'true' ||
    raw === '1' ||
    raw === 'yes' ||
    raw === 'si' ||
    raw === 'sí'
  ) {
    return true
  }
  return true
}

function requireSessionSecretFromEnv() {
  const secret = String(process.env.APP_SESSION_SECRET || '').trim()
  if (!secret || secret.length < 32) {
    console.error(
      '[authSession] Falta APP_SESSION_SECRET (mín. 32 caracteres). ' +
        'Definila en .env local y en Render. El servidor no iniciará sin ella.',
    )
    process.exit(1)
  }
  return secret
}

function b64urlEncode(bufOrStr) {
  const buf = Buffer.isBuffer(bufOrStr)
    ? bufOrStr
    : Buffer.from(String(bufOrStr), 'utf8')
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function b64urlDecodeToString(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(b64, 'base64').toString('utf8')
}

function getTtlSeconds() {
  const raw = process.env.APP_SESSION_TTL_SECONDS
  if (raw == null || String(raw).trim() === '') return DEFAULT_TTL_SECONDS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 60) return DEFAULT_TTL_SECONDS
  return Math.floor(n)
}

/**
 * @param {{ id: string, rol: string }} user
 * @param {string} secret
 */
function createSessionToken(user, secret) {
  const nowSec = Math.floor(Date.now() / 1000)
  const exp = nowSec + getTtlSeconds()
  const payload = {
    sub: String(user.id),
    rol: String(user.rol),
    exp,
  }
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = b64urlEncode(
    crypto.createHmac('sha256', secret).update(body).digest(),
  )
  return {
    token: `${body}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    exp,
  }
}

/**
 * @returns {{ sub: string, rol: string, exp: number } | null}
 */
function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (!body || !sig) return null

  const expected = b64urlEncode(
    crypto.createHmac('sha256', secret).update(body).digest(),
  )
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  let payload
  try {
    payload = JSON.parse(b64urlDecodeToString(body))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  const sub = payload.sub != null ? String(payload.sub) : ''
  const rol = payload.rol != null ? String(payload.rol) : ''
  const exp = Number(payload.exp)
  if (!sub || !rol || !Number.isFinite(exp)) return null
  if (exp < Math.floor(Date.now() / 1000)) return null
  return { sub, rol, exp }
}

function extractBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization
  if (typeof h === 'string') {
    const m = /^Bearer\s+(.+)$/i.exec(h.trim())
    if (m) return m[1].trim()
  }
  const alt = req.headers?.['x-session-token']
  if (typeof alt === 'string' && alt.trim()) return alt.trim()
  return null
}

function authDisplayName(user) {
  if (!user) return 'Sistema'
  const nombre = String(user.nombre || '').trim()
  if (nombre) return nombre
  const usuario = String(user.usuario || '').trim()
  if (usuario) return usuario
  return 'Sistema'
}

function createAuthMiddleware({ supabase, secret }) {
  async function resolveAuthFromToken(token) {
    if (!token) return { user: null, code: 'SESSION_REQUIRED' }

    const payload = verifySessionToken(token, secret)
    if (!payload) return { user: null, code: 'SESSION_INVALID' }

    const { data, error } = await supabase
      .from('usuarios_app')
      .select('id, nombre, usuario, email, rol, activo')
      .eq('id', payload.sub)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      console.error('[authSession] Error cargando usuario:', error)
      return { user: null, code: 'SESSION_LOOKUP_FAILED', httpStatus: 500 }
    }

    if (!data) return { user: null, code: 'SESSION_USER_NOT_FOUND' }
    if (!data.activo) return { user: null, code: 'SESSION_USER_INACTIVE' }

    const rol = String(data.rol || '').trim().toLowerCase()
    return {
      user: {
        id: String(data.id),
        nombre: data.nombre,
        usuario: data.usuario,
        email: data.email,
        rol,
        activo: true,
      },
      code: null,
    }
  }

  function sendAuthFailure(res, code, httpStatus) {
    const status = httpStatus || 401
    const messages = {
      SESSION_REQUIRED: 'Sesión requerida. Iniciá sesión nuevamente.',
      SESSION_INVALID: 'Sesión inválida o vencida. Iniciá sesión nuevamente.',
      SESSION_USER_NOT_FOUND: 'Sesión inválida. Iniciá sesión nuevamente.',
      SESSION_USER_INACTIVE: 'Usuario inactivo. Contactá al administrador.',
      SESSION_LOOKUP_FAILED: 'Error al validar sesión',
    }
    res.status(status).json({
      ok: false,
      error: messages[code] || messages.SESSION_INVALID,
      code: code || 'SESSION_INVALID',
    })
  }

  /**
   * Intenta autenticar sin escribir respuesta si falta el token.
   * Si hay token inválido/inactivo, reason.code indica el fallo.
   */
  async function tryAuthenticateRequest(req) {
    const token = extractBearerToken(req)
    if (!token) return { user: null, code: 'SESSION_REQUIRED' }
    return resolveAuthFromToken(token)
  }

  async function authenticateRequest(req, res) {
    const result = await tryAuthenticateRequest(req)
    if (result.user) {
      req.authUser = result.user
      return result.user
    }
    sendAuthFailure(res, result.code, result.httpStatus)
    return null
  }

  async function requireRoles(req, res, allowedRoles) {
    const user = await authenticateRequest(req, res)
    if (!user) return null
    const allowed = (allowedRoles || []).map((r) => String(r).toLowerCase())
    if (!allowed.includes(user.rol)) {
      res.status(403).json({
        ok: false,
        error: 'No tenés permiso para realizar esta operación.',
        code: 'FORBIDDEN_ROLE',
      })
      return null
    }
    return user
  }

  async function requireComposicionWrite(req, res) {
    return requireRoles(req, res, ROLES_COMPOSICION_WRITE)
  }

  return {
    authenticateRequest,
    tryAuthenticateRequest,
    requireRoles,
    requireComposicionWrite,
    sendAuthFailure,
  }
}

module.exports = {
  ROLES_COMPOSICION_WRITE,
  DEFAULT_TTL_SECONDS,
  requireSessionSecretFromEnv,
  createSessionToken,
  verifySessionToken,
  extractBearerToken,
  authDisplayName,
  createAuthMiddleware,
  getTtlSeconds,
  isComposicionAuthRequired,
}
