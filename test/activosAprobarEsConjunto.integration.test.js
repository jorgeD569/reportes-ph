/**
 * Integración del handler real POST /activos/:id/aprobar (mock Supabase, sin red).
 * Ejecutar: node --test test/activosAprobarEsConjunto.integration.test.js
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

function createSupabaseMock(capture, anterior) {
  return {
    from(table) {
      if (table === 'activos') {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({ data: { ...anterior }, error: null }),
                }
              },
              not() {
                return {
                  then(resolve, reject) {
                    return Promise.resolve({ data: [], error: null }).then(
                      resolve,
                      reject,
                    )
                  },
                }
              },
            }
          },
          update(payload) {
            capture.updatePayload = payload
            const updated = { ...anterior, ...payload }
            capture.updatedRow = updated
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: async () => ({ data: updated, error: null }),
                    }
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'activo_componentes') {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      limit: async () => ({ data: [], error: null }),
                      maybeSingle: async () => ({ data: null, error: null }),
                    }
                  },
                }
              },
            }
          },
        }
      }
      throw new Error('unexpected table ' + table)
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
      },
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main() {
  await test(
    'POST /activos/:id/aprobar pendiente es_conjunto=false → true en update',
    async () => {
      const capture = {
        updatePayload: null,
        updatedRow: null,
        movimientos: [],
      }
      const anterior = {
        id: 15,
        descripcion: 'codo',
        numero_serie: '1236A1515',
        categoria: 'linea',
        marca: 'TSI',
        estado: 'operativo',
        ubicacion: 'base rincon',
        asignado_a: 'N/A',
        vencimiento: '2026-12-25',
        observaciones: null,
        codigo_interno: null,
        activo: false,
        estado_revision: 'pendiente',
        es_conjunto: false,
      }

      const app = express()
      app.use(express.json())
      registerActivosRelevamientoRoutes({
        app,
        supabase: createSupabaseMock(capture, anterior),
        registrarMovimiento: async (mov) => {
          capture.movimientos.push(mov)
        },
        base64ToBuffer: () => Buffer.alloc(0),
      })

      const { server, port } = await listen(app)
      try {
        const res = await requestJson(port, 'POST', '/activos/15/aprobar', {
          usuario: 'Coordinador Test',
          patch: {
            es_conjunto: true,
          },
        })
        assert.strictEqual(res.status, 200, res.raw)
        assert.strictEqual(res.json.ok, true)
        assert.ok(capture.updatePayload, 'debe enviar update a Supabase')
        assert.strictEqual(capture.updatePayload.activo, true)
        assert.strictEqual(capture.updatePayload.estado_revision, 'aprobado')
        assert.strictEqual(capture.updatePayload.es_conjunto, true)
        assert.ok(
          capture.movimientos.some((m) => m.tipo_movimiento === 'aprobacion'),
        )
        assert.ok(
          capture.movimientos.some((m) => m.tipo_movimiento === 'composicion_tipo'),
        )
      } finally {
        server.close()
      }
    },
  )

  await test(
    'POST /activos/:id/aprobar es_conjunto="true" → 400 ES_CONJUNTO_INVALIDO',
    async () => {
      const capture = { updatePayload: null, movimientos: [] }
      const anterior = {
        id: 15,
        estado_revision: 'pendiente',
        es_conjunto: false,
        estado: 'operativo',
        ubicacion: null,
        asignado_a: null,
      }
      const app = express()
      app.use(express.json())
      registerActivosRelevamientoRoutes({
        app,
        supabase: createSupabaseMock(capture, anterior),
        registrarMovimiento: async (mov) => {
          capture.movimientos.push(mov)
        },
        base64ToBuffer: () => Buffer.alloc(0),
      })
      const { server, port } = await listen(app)
      try {
        const res = await requestJson(port, 'POST', '/activos/15/aprobar', {
          patch: { es_conjunto: 'true' },
        })
        assert.strictEqual(res.status, 400)
        assert.strictEqual(res.json.code, 'ES_CONJUNTO_INVALIDO')
        assert.strictEqual(capture.updatePayload, null)
      } finally {
        server.close()
      }
    },
  )

  await test(
    'POST /activos/:id/aprobar sin es_conjunto → no pisa el valor actual',
    async () => {
      const capture = { updatePayload: null, movimientos: [] }
      const anterior = {
        id: 15,
        estado_revision: 'pendiente',
        es_conjunto: false,
        estado: 'operativo',
        ubicacion: 'base',
        asignado_a: null,
      }
      const app = express()
      app.use(express.json())
      registerActivosRelevamientoRoutes({
        app,
        supabase: createSupabaseMock(capture, anterior),
        registrarMovimiento: async (mov) => {
          capture.movimientos.push(mov)
        },
        base64ToBuffer: () => Buffer.alloc(0),
      })
      const { server, port } = await listen(app)
      try {
        const res = await requestJson(port, 'POST', '/activos/15/aprobar', {
          patch: { descripcion: 'codo actualizado' },
        })
        assert.strictEqual(res.status, 200, res.raw)
        assert.strictEqual(capture.updatePayload.activo, true)
        assert.strictEqual(capture.updatePayload.estado_revision, 'aprobado')
        assert.strictEqual(
          Object.prototype.hasOwnProperty.call(capture.updatePayload, 'es_conjunto'),
          false,
        )
      } finally {
        server.close()
      }
    },
  )

  if (!process.exitCode) {
    console.log('All aprobar es_conjunto integration tests passed')
  }
}

main()
