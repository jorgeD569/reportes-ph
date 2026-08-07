/**
 * Pruebas de sesión firmada y autorización de composición.
 * node --test test/authSession.test.js
 */
const assert = require('assert')
const { test, describe } = require('node:test')

process.env.APP_SESSION_SECRET =
  process.env.APP_SESSION_SECRET ||
  'test-secret-minimo-32-caracteres-abcdef123456'

const {
  createSessionToken,
  verifySessionToken,
  authDisplayName,
  createAuthMiddleware,
  ROLES_COMPOSICION_WRITE,
} = require('../authSession')

describe('authSession token', () => {
  test('crea y verifica token con id, rol y exp', () => {
    const secret = process.env.APP_SESSION_SECRET
    const { token, expiresAt, exp } = createSessionToken(
      { id: 'user-1', rol: 'supervisor' },
      secret,
    )
    assert.ok(token.includes('.'))
    assert.ok(expiresAt)
    assert.ok(exp > Math.floor(Date.now() / 1000))
    const payload = verifySessionToken(token, secret)
    assert.equal(payload.sub, 'user-1')
    assert.equal(payload.rol, 'supervisor')
    assert.equal(payload.exp, exp)
  })

  test('token alterado → inválido', () => {
    const secret = process.env.APP_SESSION_SECRET
    const { token } = createSessionToken(
      { id: 'user-1', rol: 'admin' },
      secret,
    )
    const parts = token.split('.')
    const tampered = `${parts[0]}.${parts[1].slice(0, -2)}xx`
    assert.equal(verifySessionToken(tampered, secret), null)
  })

  test('token vencido → inválido', () => {
    const secret = process.env.APP_SESSION_SECRET
    const crypto = require('crypto')
    const payload = {
      sub: 'user-1',
      rol: 'operador',
      exp: Math.floor(Date.now() / 1000) - 10,
    }
    const body = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    const sig = Buffer.from(
      crypto.createHmac('sha256', secret).update(body).digest(),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    assert.equal(verifySessionToken(`${body}.${sig}`, secret), null)
  })

  test('authDisplayName usa nombre de DB, no body', () => {
    assert.equal(
      authDisplayName({ nombre: 'Ana Pérez', usuario: 'ana' }),
      'Ana Pérez',
    )
    assert.equal(authDisplayName({ nombre: '', usuario: 'ana' }), 'ana')
  })

  test('roles de escritura de composición', () => {
    assert.deepEqual([...ROLES_COMPOSICION_WRITE], [
      'supervisor',
      'coordinador',
      'admin',
    ])
  })
})

describe('auth middleware mock', () => {
  test('sin Authorization → 401', async () => {
    const secret = process.env.APP_SESSION_SECRET
    const auth = createAuthMiddleware({
      supabase: {
        from() {
          throw new Error('no debe consultar DB sin token')
        },
      },
      secret,
    })
    const req = { headers: {} }
    let status = null
    let body = null
    const res = {
      status(code) {
        status = code
        return this
      },
      json(payload) {
        body = payload
        return this
      },
    }
    const user = await auth.authenticateRequest(req, res)
    assert.equal(user, null)
    assert.equal(status, 401)
    assert.equal(body.code, 'SESSION_REQUIRED')
  })

  test('usuario inactivo → 401', async () => {
    const secret = process.env.APP_SESSION_SECRET
    const { token } = createSessionToken(
      { id: 'u-inactive', rol: 'supervisor' },
      secret,
    )
    const auth = createAuthMiddleware({
      supabase: {
        from() {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            is() {
              return this
            },
            async maybeSingle() {
              return {
                data: {
                  id: 'u-inactive',
                  nombre: 'Inactivo',
                  usuario: 'ina',
                  email: null,
                  rol: 'supervisor',
                  activo: false,
                },
                error: null,
              }
            },
          }
        },
      },
      secret,
    })
    const req = { headers: { authorization: `Bearer ${token}` } }
    let status = null
    let body = null
    const res = {
      status(code) {
        status = code
        return this
      },
      json(payload) {
        body = payload
        return this
      },
    }
    const user = await auth.authenticateRequest(req, res)
    assert.equal(user, null)
    assert.equal(status, 401)
    assert.equal(body.code, 'SESSION_USER_INACTIVE')
  })

  test('operador en requireComposicionWrite → 403', async () => {
    const secret = process.env.APP_SESSION_SECRET
    const { token } = createSessionToken(
      { id: 'u-op', rol: 'operador' },
      secret,
    )
    const auth = createAuthMiddleware({
      supabase: {
        from() {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            is() {
              return this
            },
            async maybeSingle() {
              return {
                data: {
                  id: 'u-op',
                  nombre: 'Operador',
                  usuario: 'op',
                  email: null,
                  rol: 'operador',
                  activo: true,
                },
                error: null,
              }
            },
          }
        },
      },
      secret,
    })
    const req = { headers: { authorization: `Bearer ${token}` } }
    let status = null
    let body = null
    const res = {
      status(code) {
        status = code
        return this
      },
      json(payload) {
        body = payload
        return this
      },
    }
    const user = await auth.requireComposicionWrite(req, res)
    assert.equal(user, null)
    assert.equal(status, 403)
    assert.equal(body.code, 'FORBIDDEN_ROLE')
  })

  test('supervisor en requireComposicionWrite → ok; ignora rol del token viejo si DB dice supervisor', async () => {
    const secret = process.env.APP_SESSION_SECRET
    // Token dice operador, DB dice supervisor → usa rol de DB
    const { token } = createSessionToken(
      { id: 'u-sup', rol: 'operador' },
      secret,
    )
    const auth = createAuthMiddleware({
      supabase: {
        from() {
          return {
            select() {
              return this
            },
            eq() {
              return this
            },
            is() {
              return this
            },
            async maybeSingle() {
              return {
                data: {
                  id: 'u-sup',
                  nombre: 'Super',
                  usuario: 'sup',
                  email: null,
                  rol: 'supervisor',
                  activo: true,
                },
                error: null,
              }
            },
          }
        },
      },
      secret,
    })
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = {
      status() {
        return this
      },
      json() {
        return this
      },
    }
    const user = await auth.requireComposicionWrite(req, res)
    assert.ok(user)
    assert.equal(user.rol, 'supervisor')
    assert.equal(user.nombre, 'Super')
  })
})
