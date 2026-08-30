const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')

const { createPanolRouter } = require('../panol/panolRouter')
const { createPanolService } = require('../panol/panolService')
const { mapPanolError } = require('../panol/panolController')
const { validateDocumentPayload } = require('../panol/panolValidation')

const AUTH_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const ELEMENT_ID = '33333333-3333-4333-8333-333333333333'
const LOCATION_ID = '55555555-5555-4555-8555-555555555555'
const CUSTODY_ID = '66666666-6666-4666-8666-666666666666'

function basePayload(overrides = {}) {
  return {
    client_uuid: CLIENT_ID,
    tipo: 'ING',
    sector: 'CENTRAL',
    registrado_por_user_id: '99999999-9999-4999-8999-999999999999',
    participantes: [],
    lineas: [{ elemento_id: ELEMENT_ID, ubicacion_id: LOCATION_ID, cantidad: 1, accion: 'ingreso', evidencias: [] }],
    ...overrides,
  }
}

function signedParticipant(funcion, suffix) {
  return {
    funcion,
    nombre_snapshot: funcion,
    firmado_en: '2026-08-30T12:00:00.000Z',
    firma: {
      client_uuid: `77777777-7777-4777-8777-77777777777${suffix}`,
      ruta: `2026-08-30/test/firma-${suffix}.png`,
      mime_type: 'image/png',
      tamano_bytes: 10,
      hash_sha256: 'a'.repeat(64),
      estado_carga: 'cargado',
    },
  }
}

function createService(overrides = {}) {
  const empty = async () => ({ items: [], total: 0, limit: 50, offset: 0 })
  return {
    listCatalog: empty,
    getElement: async () => null,
    listBalances: empty,
    listDocuments: empty,
    getDocument: async () => null,
    listCustodies: empty,
    listShipments: empty,
    registerDocument: async (payload) => ({ id: 'doc-1', idempotent: false, payload }),
    uploadPrivateFile: async () => ({ idempotent: false }),
    createSignedUrl: async () => ({ url: 'https://signed.invalid', expires_in: 900 }),
    ...overrides,
  }
}

function createAuth() {
  return {
    async requireRoles(req, res, roles) {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
      if (!token) {
        res.status(401).json({ ok: false, code: 'SESSION_REQUIRED' })
        return null
      }
      const role = token === 'forbidden' ? 'invitado' : token
      if (!roles.includes(role)) {
        res.status(403).json({ ok: false, code: 'FORBIDDEN_ROLE' })
        return null
      }
      return { id: AUTH_ID, rol: role, nombre: 'Operador prueba' }
    },
  }
}

async function withServer(service, run) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/api/panol', createPanolRouter({ auth: createAuth(), service }))
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await run(server.address().port)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function requestJson(port, method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const req = http.request({
      hostname: '127.0.0.1', port, method, path,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null })
      })
    })
    req.on('error', reject)
    if (encoded) req.write(encoded)
    req.end()
  })
}

test('todas las rutas requieren sesión y rechazan rol no permitido', async () => {
  await withServer(createService(), async (port) => {
    const missing = await requestJson(port, 'GET', '/api/panol/catalogo')
    assert.equal(missing.status, 401)
    assert.equal(missing.body.code, 'SESSION_REQUIRED')
    const forbidden = await requestJson(port, 'GET', '/api/panol/catalogo', { token: 'forbidden' })
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.body.code, 'FORBIDDEN_ROLE')
  })
})

test('registro obtiene registrador de sesión y sólo llama la RPC del servicio', async () => {
  let received
  await withServer(createService({
    async registerDocument(payload) {
      received = payload
      return { id: 'doc-1', idempotent: false }
    },
  }), async (port) => {
    const response = await requestJson(port, 'POST', '/api/panol/documentos', { token: 'operador', body: basePayload() })
    assert.equal(response.status, 201)
    assert.equal(received.registrado_por_user_id, AUTH_ID)
    assert.notEqual(received.registrado_por_user_id, basePayload().registrado_por_user_id)
  })
})

test('rechaza más de tres fotos antes de llamar al servicio', async () => {
  let calls = 0
  const photo = (n) => ({
    client_uuid: `44444444-4444-4444-8444-44444444444${n}`,
    mime_type: 'image/jpeg', tamano_bytes: 10,
  })
  await withServer(createService({ registerDocument: async () => { calls += 1 } }), async (port) => {
    const payload = basePayload({ lineas: [{
      elemento_id: ELEMENT_ID, ubicacion_id: LOCATION_ID, cantidad: 1, accion: 'ingreso',
      evidencias: [photo(1), photo(2), photo(3), photo(4)],
    }] })
    const response = await requestJson(port, 'POST', '/api/panol/documentos', { token: 'operador', body: payload })
    assert.equal(response.status, 400)
    assert.equal(response.body.code, 'TOO_MANY_PHOTOS')
    assert.equal(calls, 0)
  })
})

test('reintento idempotente conserva client_uuid y responde 200', async () => {
  const received = []
  await withServer(createService({
    async registerDocument(payload) {
      received.push(payload.client_uuid)
      return { id: 'doc-1', idempotent: received.length > 1 }
    },
  }), async (port) => {
    const first = await requestJson(port, 'POST', '/api/panol/documentos', { token: 'operador', body: basePayload() })
    const retry = await requestJson(port, 'POST', '/api/panol/documentos', { token: 'operador', body: basePayload() })
    assert.equal(first.status, 201)
    assert.equal(retry.status, 200)
    assert.deepEqual(received, [CLIENT_ID, CLIENT_ID])
  })
})

test('aliases fuerzan tipo REC/TRA/DEV sin confiar en tipo del cliente', async () => {
  const types = []
  await withServer(createService({
    async registerDocument(payload) { types.push(payload.tipo); return { id: 'doc', idempotent: false } },
  }), async (port) => {
    const cases = [
      ['recepciones', 'recepcion', [signedParticipant('transportista_entrego', 1), signedParticipant('receptor_real', 2)]],
      ['transferencias', 'transferencia', [signedParticipant('entrego_custodia', 3), signedParticipant('recibio_custodia', 4)]],
      ['devoluciones', 'devolucion', [
        { funcion: 'devolvio', nombre_snapshot: 'Devuelve' },
        { funcion: 'recibio_devolucion', nombre_snapshot: 'Recibe' },
      ]],
    ]
    for (const [path, action, participantes] of cases) {
      const response = await requestJson(port, 'POST', `/api/panol/${path}`, { token: 'supervisor', body: basePayload({
        tipo: 'ING', participantes,
        lineas: [{ elemento_id: ELEMENT_ID, ubicacion_id: LOCATION_ID, custodia_id: CUSTODY_ID, cantidad: 1, accion: action }],
      }) })
      assert.equal(response.status, 201)
    }
    assert.deepEqual(types, ['REC', 'TRA', 'DEV'])
  })
})

test('servicio registra documentos exclusivamente mediante RPC', async () => {
  const calls = []
  const supabase = {
    from() { throw new Error('no debe escribir tablas') },
    async rpc(name, args) { calls.push({ name, args }); return { data: { id: 'doc' }, error: null } },
    storage: {},
  }
  const service = createPanolService({ supabase, env: {} })
  const payload = basePayload()
  assert.deepEqual(await service.registerDocument(payload), { id: 'doc' })
  assert.deepEqual(calls, [{ name: 'panol_fn_registrar_documento', args: { p: payload } }])
})

test('mapea errores SQL a 400, 403, 404, 409 y 500', () => {
  assert.equal(mapPanolError({ code: '22P02', message: 'uuid inválido' }).status, 400)
  assert.equal(mapPanolError({ code: '42501', message: 'permission denied' }).status, 403)
  assert.equal(mapPanolError({ code: '23503', message: 'referencia no existe' }).status, 404)
  assert.equal(mapPanolError({ code: '23505', message: 'duplicate key' }).status, 409)
  assert.equal(mapPanolError(new Error('secreto interno')).status, 500)
})

test('valida bigint, cantidades, participantes, MIME y tamaño', () => {
  assert.throws(() => validateDocumentPayload(basePayload({
    lineas: [{ elemento_id: ELEMENT_ID, ubicacion_id: LOCATION_ID, activo_id: 'abc', cantidad: 1, accion: 'ingreso' }],
  }), { id: AUTH_ID }), /bigint positivo/)
  assert.throws(() => validateDocumentPayload(basePayload({
    lineas: [{ elemento_id: ELEMENT_ID, ubicacion_id: LOCATION_ID, cantidad: 0, accion: 'ingreso' }],
  }), { id: AUTH_ID }), /entero positivo/)
  assert.throws(() => validateDocumentPayload(basePayload({
    participantes: [{ funcion: 'transportista_inventado' }],
  }), { id: AUTH_ID }), /Función de participante inválida/)
  assert.throws(() => validateDocumentPayload(basePayload({
    participantes: [{ funcion: 'entrego', nombre_snapshot: 'Entrega', firma: { client_uuid: CLIENT_ID, mime_type: 'application/pdf', tamano_bytes: 10 } }],
  }), { id: AUTH_ID }), /MIME no permitido/)
})

test('operador no puede registrar ajustes ni compensaciones', async () => {
  let calls = 0
  await withServer(createService({ registerDocument: async () => { calls += 1 } }), async (port) => {
    const response = await requestJson(port, 'POST', '/api/panol/documentos', {
      token: 'operador',
      body: basePayload({ tipo: 'AJU', lineas: [{
        elemento_id: ELEMENT_ID, ubicacion_id: LOCATION_ID,
        cantidad: 1, accion: 'ajuste', delta_total: 1, delta_disponible: 1,
      }] }),
    })
    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'PANOL_FORBIDDEN')
    assert.equal(calls, 0)
  })
})

test('upload valida firma binaria y no devuelve contenido_base64', async () => {
  let uploaded
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  await withServer(createService({
    async uploadPrivateFile(input) {
      uploaded = input
      return { bucket: 'panol-firmas', ruta: 'test.png', ...input.metadata, idempotent: false }
    },
  }), async (port) => {
    const response = await requestJson(port, 'POST', '/api/panol/firmas', {
      token: 'operador',
      body: { client_uuid: CLIENT_ID, mime_type: 'image/png', tamano_bytes: png.length, contenido_base64: png.toString('base64') },
    })
    assert.equal(response.status, 201)
    assert.equal(uploaded.kind, 'firma')
    assert.equal(response.body.archivo.contenido_base64, undefined)
    assert.match(response.body.archivo.hash_sha256, /^[0-9a-f]{64}$/)
  })
})

test('upload admite WebP válido y conserva extensión segura generada', async () => {
  let uploaded
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('VP8 ')])
  await withServer(createService({
    async uploadPrivateFile(input) { uploaded = input; return { ruta: `${input.metadata.client_uuid}.webp`, ...input.metadata, idempotent: false } },
  }), async (port) => {
    const response = await requestJson(port, 'POST', '/api/panol/fotografias', {
      token: 'operador',
      body: { client_uuid: CLIENT_ID, mime_type: 'image/webp', tamano_bytes: webp.length, contenido_base64: webp.toString('base64'), filename: '../../nombre-inseguro.exe' },
    })
    assert.equal(response.status, 201)
    assert.equal(uploaded.metadata.mime_type, 'image/webp')
    assert.equal(response.body.archivo.ruta, `${CLIENT_ID}.webp`)
    assert.equal(response.body.archivo.filename, undefined)
  })
})
