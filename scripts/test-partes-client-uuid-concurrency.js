/**
 * Prueba de concurrencia del POST /partes-operativos con client_uuid.
 *
 * Uso (backend local con migración client_uuid aplicada):
 *   node scripts/test-partes-client-uuid-concurrency.js
 *
 * Variables opcionales:
 *   API_BASE_URL=http://localhost:3000
 *   CLIENT_UUID=<uuid>   (default: genera uno nuevo)
 */
const http = require('http')
const https = require('https')
const { randomUUID } = require('crypto')

const base = (process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const clientUuid = process.env.CLIENT_UUID || randomUUID()

function postJson(path, body) {
  const url = new URL(path, base)
  const lib = url.protocol === 'https:' ? https : http
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 30000,
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') })
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function main() {
  const body = {
    client_uuid: clientUuid,
    pozo: 'TEST-UUID-CONCURRENCY',
    fecha: '2026-07-18',
    yacimiento: 'TEST',
    operadora: 'TEST',
    contratista: 'KOMPASS',
  }

  console.log('API:', base)
  console.log('client_uuid:', clientUuid)
  console.log('Disparando 3 POST simultáneos...')

  const results = await Promise.all([
    postJson('/partes-operativos', body),
    postJson('/partes-operativos', body),
    postJson('/partes-operativos', body),
  ])

  for (const [i, r] of results.entries()) {
    console.log(
      `#${i + 1} status=${r.status} ok=${r.body.ok} idempotent=${r.body.idempotent} numero=${r.body.parte?.numero_parte} id=${r.body.parte?.id}`
    )
  }

  const ids = new Set(results.map((r) => r.body.parte?.id).filter(Boolean))
  const numeros = new Set(
    results.map((r) => r.body.parte?.numero_parte).filter((n) => n != null)
  )

  if (ids.size !== 1 || numeros.size !== 1) {
    console.error('FAIL: se crearon múltiples partes', { ids: [...ids], numeros: [...numeros] })
    process.exit(1)
  }

  const idempotentCount = results.filter((r) => r.body.idempotent === true).length
  console.log(`OK: un solo parte (${[...numeros][0]}). Respuestas idempotent=${idempotentCount}/3`)
  console.log('NOTA: limpiá el parte de prueba TEST-UUID-CONCURRENCY si quedó en la DB.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
