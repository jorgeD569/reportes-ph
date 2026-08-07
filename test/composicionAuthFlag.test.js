/**
 * Auth de composición: flag APP_COMPOSICION_REQUIRE_AUTH + middleware.
 * node --test test/composicionAuthFlag.test.js
 */
const assert = require('assert')
const { test, describe, beforeEach, afterEach } = require('node:test')
const express = require('express')
const http = require('http')

process.env.APP_SESSION_SECRET =
  process.env.APP_SESSION_SECRET ||
  'test-secret-minimo-32-caracteres-abcdef123456'

const {
  createSessionToken,
  createAuthMiddleware,
  isComposicionAuthRequired,
  DEFAULT_TTL_SECONDS,
  authDisplayName,
} = require('../authSession')
const { registerActivosComposicionRoutes } = require('../activosComposicion')

const SECRET = process.env.APP_SESSION_SECRET

describe('isComposicionAuthRequired', () => {
  const prev = process.env.APP_COMPOSICION_REQUIRE_AUTH
  afterEach(() => {
    if (prev === undefined) delete process.env.APP_COMPOSICION_REQUIRE_AUTH
    else process.env.APP_COMPOSICION_REQUIRE_AUTH = prev
  })

  test('ausente → true (seguro por defecto)', () => {
    delete process.env.APP_COMPOSICION_REQUIRE_AUTH
    assert.equal(isComposicionAuthRequired(), true)
  })

  test('false → false', () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'false'
    assert.equal(isComposicionAuthRequired(), false)
  })

  test('true → true', () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'true'
    assert.equal(isComposicionAuthRequired(), true)
  })
})

test('DEFAULT_TTL_SECONDS es 30 días', () => {
  assert.equal(DEFAULT_TTL_SECONDS, 60 * 60 * 24 * 30)
})

function mockRes() {
  const out = { statusCode: 200, body: null }
  const res = {
    status(code) {
      out.statusCode = code
      return this
    },
    json(payload) {
      out.body = payload
      return this
    },
  }
  return { res, out }
}

function makeUsersDb(usersById) {
  return {
    from(table) {
      if (table !== 'usuarios_app') throw new Error(`unexpected table ${table}`)
      let id = null
      return {
        select() {
          return this
        },
        eq(_col, val) {
          id = String(val)
          return this
        },
        is() {
          return this
        },
        async maybeSingle() {
          return { data: usersById[id] || null, error: null }
        },
      }
    },
  }
}

describe('POST componentes con flag', () => {
  let server
  let baseUrl
  let lastCompatLog = null
  let originalInfo

  const users = {
    'u-op': {
      id: 'u-op',
      nombre: 'Operador Uno',
      usuario: 'op1',
      email: null,
      rol: 'operador',
      activo: true,
    },
    'u-sup': {
      id: 'u-sup',
      nombre: 'Super Uno',
      usuario: 'sup1',
      email: null,
      rol: 'supervisor',
      activo: true,
    },
    'u-ina': {
      id: 'u-ina',
      nombre: 'Inactivo',
      usuario: 'ina',
      email: null,
      rol: 'supervisor',
      activo: false,
    },
  }

  const activos = {
    10: {
      id: 10,
      es_conjunto: true,
      estado: 'operativo',
      estado_revision: 'aprobado',
      numero_serie: 'MF-1',
      ubicacion: 'A',
    },
    20: {
      id: 20,
      es_conjunto: false,
      estado: 'operativo',
      estado_revision: 'pendiente',
      numero_serie: 'ACT-P',
      ubicacion: 'B',
    },
    21: {
      id: 21,
      es_conjunto: false,
      estado: 'operativo',
      estado_revision: 'aprobado',
      numero_serie: 'ACT-A',
      ubicacion: 'C',
    },
  }

  let inserts = []
  let memberships = []

  function makeSupabase() {
    return {
      from(table) {
        if (table === 'usuarios_app') {
          return makeUsersDb(users).from(table)
        }
        if (table === 'activos') {
          return {
            select() {
              return this
            },
            eq(_c, id) {
              this._id = id
              return this
            },
            async maybeSingle() {
              return { data: activos[this._id] || activos[Number(this._id)] || null, error: null }
            },
          }
        }
        if (table === 'activo_componentes') {
          const api = {
            _filters: {},
            _insertRows: null,
            select() {
              return this
            },
            eq(col, val) {
              this._filters[col] = val
              return this
            },
            is(col, val) {
              this._filters[col] = val
              return this
            },
            async maybeSingle() {
              const f = this._filters || {}
              if (f.client_uuid) {
                const hit = memberships.find((m) => m.client_uuid === f.client_uuid)
                return { data: hit || null, error: null }
              }
              if (f.componente_id != null && f.fecha_hasta === null) {
                const hit = memberships.find(
                  (m) =>
                    String(m.componente_id) === String(f.componente_id) &&
                    m.fecha_hasta == null,
                )
                return { data: hit || null, error: null }
              }
              return { data: null, error: null }
            },
            insert(rows) {
              this._insertRows = rows
              return this
            },
            single() {
              const row = {
                id: 900 + inserts.length,
                ...(this._insertRows[0] || {}),
              }
              inserts.push(row)
              memberships.push({ ...row, fecha_hasta: row.fecha_hasta ?? null })
              return Promise.resolve({ data: row, error: null })
            },
            order() {
              return Promise.resolve({ data: [], error: null })
            },
          }
          return api
        }
        throw new Error(`unexpected table ${table}`)
      },
    }
  }

  async function listen(app) {
    server = http.createServer(app)
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}`
  }

  async function req(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
  }

  beforeEach(async () => {
    inserts = []
    memberships = []
    lastCompatLog = null
    originalInfo = console.info
    console.info = (...args) => {
      if (String(args[0] || '').includes('compat temporal')) {
        lastCompatLog = args
      }
    }

    const supabase = makeSupabase()
    const auth = createAuthMiddleware({ supabase, secret: SECRET })
    const app = express()
    app.use(express.json())
    registerActivosComposicionRoutes({
      app,
      supabase,
      registrarMovimiento: async () => {},
      auth,
      authDisplayName,
    })
    // Minimal stubs for routes that register might need on other methods — ok.
    await listen(app)
  })

  afterEach(async () => {
    console.info = originalInfo
    if (server) await new Promise((r) => server.close(r))
    delete process.env.APP_COMPOSICION_REQUIRE_AUTH
  })

  test('false + sin token + pendiente → permitido (compat)', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'false'
    const r = await req('POST', '/activos/10/componentes', {
      body: {
        componente_id: 20,
        client_uuid: '11111111-1111-4111-8111-111111111111',
        usuario: 'HACKER',
        creado_por_user_id: 'fake-uuid',
      },
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.ok, true)
    assert.equal(r.json.auth_compat, true)
    assert.ok(lastCompatLog)
    assert.equal(inserts[0].creado_por_user_id, null)
  })

  test('false + retirar sin token → 401', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'false'
    const r = await req('POST', '/activos/10/componentes/20/retirar', {
      body: { nueva_ubicacion: 'X' },
    })
    assert.equal(r.status, 401)
  })

  test('false + traspaso sin token → 401', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'false'
    const r = await req('POST', '/activos/10/componentes/20/traspaso', {
      body: { conjunto_origen_id: 10 },
    })
    assert.equal(r.status, 401)
  })

  test('true + componentes sin token → 401', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'true'
    const r = await req('POST', '/activos/10/componentes', {
      body: { componente_id: 20 },
    })
    assert.equal(r.status, 401)
    assert.equal(r.json.code, 'SESSION_REQUIRED')
  })

  test('true + operador + pendiente → permitido', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'true'
    const { token } = createSessionToken({ id: 'u-op', rol: 'operador' }, SECRET)
    const r = await req('POST', '/activos/10/componentes', {
      token,
      body: {
        componente_id: 20,
        client_uuid: '22222222-2222-4222-8222-222222222222',
        usuario: 'IGNORED',
      },
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.ok, true)
    assert.equal(r.json.auth_compat, undefined)
    assert.equal(inserts[0].creado_por_user_id, 'u-op')
  })

  test('true + operador + aprobado → 403', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'true'
    const { token } = createSessionToken({ id: 'u-op', rol: 'operador' }, SECRET)
    const r = await req('POST', '/activos/10/componentes', {
      token,
      body: { componente_id: 21 },
    })
    assert.equal(r.status, 403)
    assert.equal(r.json.code, 'FORBIDDEN_ROLE')
  })

  test('token alterado → 401', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'false'
    const { token } = createSessionToken({ id: 'u-op', rol: 'operador' }, SECRET)
    const bad = `${token.slice(0, -4)}xxxx`
    const r = await req('POST', '/activos/10/componentes', {
      token: bad,
      body: { componente_id: 20 },
    })
    assert.equal(r.status, 401)
  })

  test('usuario inactivo → 401', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'true'
    const { token } = createSessionToken({ id: 'u-ina', rol: 'supervisor' }, SECRET)
    const r = await req('POST', '/activos/10/componentes', {
      token,
      body: { componente_id: 20 },
    })
    assert.equal(r.status, 401)
    assert.equal(r.json.code, 'SESSION_USER_INACTIVE')
  })

  test('false + sin token + aprobado → 401 (no compat)', async () => {
    process.env.APP_COMPOSICION_REQUIRE_AUTH = 'false'
    const r = await req('POST', '/activos/10/componentes', {
      body: { componente_id: 21 },
    })
    assert.equal(r.status, 401)
  })
})
