/**
 * Integración del handler real POST /activos (mock Supabase, sin red).
 * Ejecutar: node --test test/activosPostFlutterEsConjunto.integration.test.js
 */
const assert = require('assert')
const express = require('express')
const http = require('http')
const { registerActivosRelevamientoRoutes } = require('../activosRelevamiento')

function test(name, fn) {
  return (async () => {
    try {
      await fn()
      console.log('OK', name)
    } catch (e) {
      console.error('FAIL', name, e && e.stack ? e.stack : e)
      process.exitCode = 1
    }
  })()
}

function createSupabaseMock(capture) {
  const emptyListBuilder = {
    select() {
      return this
    },
    eq() {
      return this
    },
    not() {
      return this
    },
    maybeSingle: async () => ({ data: null, error: null }),
    // await supabase.from().select().not(...)
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    },
  }

  return {
    from(table) {
      if (table !== 'activos') {
        throw new Error('unexpected table ' + table)
      }
      return {
        select() {
          return emptyListBuilder
        },
        eq() {
          return emptyListBuilder
        },
        not() {
          return emptyListBuilder
        },
        maybeSingle: async () => ({ data: null, error: null }),
        insert(rows) {
          capture.insertPayload = rows[0]
          const inserted = { id: 501, ...rows[0] }
          return {
            select() {
              return {
                single: async () => ({ data: inserted, error: null }),
              }
            },
          }
        },
      }
    },
  }
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port })
    })
  })
}

function requestJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => {
          raw += c
        })
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(raw)
          } catch (_) {}
          resolve({ status: res.statusCode, json, raw })
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main() {
  await test(
    'POST /activos origen=flutter es_conjunto=true → insert Supabase correcto',
    async () => {
      const capture = { insertPayload: null }
      const app = express()
      app.use(express.json({ limit: '2mb' }))
      registerActivosRelevamientoRoutes({
        app,
        supabase: createSupabaseMock(capture),
        registrarMovimiento: async () => {},
        base64ToBuffer: () => Buffer.from([]),
      })

      const { server, port } = await listen(app)
      try {
        const res = await requestJson(port, 'POST', '/activos', {
          origen: 'flutter',
          es_conjunto: true,
          // Intento malicioso: no deben aplicarse
          activo: true,
          estado_revision: 'aprobado',
          descripcion: 'Manifold prueba integración',
          numero_serie: 'MF-INT-001',
          categoria: 'otro',
          estado: 'operativo',
        })

        assert.strictEqual(res.status, 200, res.raw)
        assert.strictEqual(res.json.ok, true)
        assert.ok(capture.insertPayload, 'no se capturó insert a Supabase')
        assert.strictEqual(capture.insertPayload.activo, false)
        assert.strictEqual(capture.insertPayload.estado_revision, 'pendiente')
        assert.strictEqual(capture.insertPayload.es_conjunto, true)
      } finally {
        await new Promise((r) => server.close(r))
      }
    }
  )

  await test(
    'POST /activos origen=flutter es_conjunto="true" → 400',
    async () => {
      const capture = { insertPayload: null }
      const app = express()
      app.use(express.json({ limit: '2mb' }))
      registerActivosRelevamientoRoutes({
        app,
        supabase: createSupabaseMock(capture),
        registrarMovimiento: async () => {},
        base64ToBuffer: () => Buffer.from([]),
      })
      const { server, port } = await listen(app)
      try {
        const res = await requestJson(port, 'POST', '/activos', {
          origen: 'flutter',
          es_conjunto: 'true',
          descripcion: 'X',
          numero_serie: 'MF-BAD-001',
          categoria: 'otro',
          estado: 'operativo',
        })
        assert.strictEqual(res.status, 400)
        assert.strictEqual(res.json.ok, false)
        assert.strictEqual(res.json.code, 'ES_CONJUNTO_INVALIDO')
        assert.strictEqual(capture.insertPayload, null)
      } finally {
        await new Promise((r) => server.close(r))
      }
    }
  )

  if (!process.exitCode) {
    console.log('All POST /activos Flutter es_conjunto integration tests passed')
  }
}

main()
