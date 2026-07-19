/**
 * Tests unitarios de helpers de relevamiento (sin Supabase).
 * Ejecutar: node test/activosRelevamiento.test.js
 */
const assert = require('assert')
const {
  normalizeCategoria,
  normalizeEstadoOperativo,
  normalizeClientUuid,
  normalizeNumeroSerie,
  resolveAdjuntoMime,
  maxBytesForMime,
  resolveEsConjuntoPayload,
  flutterCreateFlags,
  ADJUNTO_MAX_BYTES_IMAGE,
  ADJUNTO_MAX_BYTES_PDF,
} = require('../activosRelevamiento')

function test(name, fn) {
  try {
    fn()
    console.log('OK', name)
  } catch (e) {
    console.error('FAIL', name, e.message)
    process.exitCode = 1
  }
}

test('normaliza categorías UI → enum', () => {
  assert.strictEqual(normalizeCategoria('Unidad PH'), 'unidad')
  assert.strictEqual(normalizeCategoria('Sensor WIKA'), 'wika')
  assert.strictEqual(normalizeCategoria('unidad'), 'unidad')
  assert.strictEqual(normalizeCategoria('Piletas'), 'otro')
  assert.strictEqual(normalizeCategoria('xyz'), null)
})

test('normaliza estados con espacios', () => {
  assert.strictEqual(normalizeEstadoOperativo('operativo'), 'operativo')
  assert.strictEqual(normalizeEstadoOperativo('fuera_de_servicio'), 'fuera de servicio')
  assert.strictEqual(normalizeEstadoOperativo('en_reparacion'), 'en reparacion')
  assert.strictEqual(normalizeEstadoOperativo(''), 'operativo')
  assert.strictEqual(normalizeEstadoOperativo('invalido'), null)
  assert.strictEqual(normalizeEstadoOperativo('pendiente'), null)
  assert.strictEqual(normalizeEstadoOperativo('vencido'), 'vencido')
  assert.strictEqual(normalizeEstadoOperativo('baja'), 'baja')
})

test('client_uuid valida formato', () => {
  assert.strictEqual(
    normalizeClientUuid('4971b4ee-12f4-4070-be4a-65e565303e59'),
    '4971b4ee-12f4-4070-be4a-65e565303e59'
  )
  assert.strictEqual(normalizeClientUuid('no-uuid'), null)
  assert.strictEqual(normalizeClientUuid(null), null)
})

test('idempotencia conceptual: mismo uuid se normaliza igual', () => {
  const a = normalizeClientUuid('4971B4EE-12F4-4070-BE4A-65E565303E59')
  const b = normalizeClientUuid('4971b4ee-12f4-4070-be4a-65e565303e59')
  assert.strictEqual(a, b)
})

test('numero_serie: trim().toUpperCase()', () => {
  assert.strictEqual(normalizeNumeroSerie('  ab-12  '), 'AB-12')
  assert.strictEqual(normalizeNumeroSerie('xyz'), 'XYZ')
  assert.strictEqual(normalizeNumeroSerie('   '), null)
  assert.strictEqual(normalizeNumeroSerie(null), null)
  assert.strictEqual(normalizeNumeroSerie('abc'), normalizeNumeroSerie(' ABC '))
})

test('adjunto MIME: solo jpg/jpeg/png/pdf', () => {
  assert.strictEqual(resolveAdjuntoMime('image/jpeg').ok, true)
  assert.strictEqual(resolveAdjuntoMime('image/jpeg').ext, 'jpg')
  assert.strictEqual(resolveAdjuntoMime('image/png').ext, 'png')
  assert.strictEqual(resolveAdjuntoMime('application/pdf').ext, 'pdf')
  assert.strictEqual(resolveAdjuntoMime('image/webp').ok, false)
  assert.strictEqual(resolveAdjuntoMime('application/octet-stream').ok, false)
  assert.strictEqual(resolveAdjuntoMime('').ok, false)
})

test('límites de tamaño por tipo', () => {
  assert.strictEqual(maxBytesForMime('image/jpeg'), ADJUNTO_MAX_BYTES_IMAGE)
  assert.strictEqual(maxBytesForMime('image/png'), ADJUNTO_MAX_BYTES_IMAGE)
  assert.strictEqual(maxBytesForMime('application/pdf'), ADJUNTO_MAX_BYTES_PDF)
  assert.ok(ADJUNTO_MAX_BYTES_IMAGE === 5 * 1024 * 1024)
  assert.ok(ADJUNTO_MAX_BYTES_PDF === 10 * 1024 * 1024)
})

test('Flutter sin es_conjunto → false', () => {
  const r = resolveEsConjuntoPayload({ origen: 'flutter' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.value, false)
})

test('Flutter con es_conjunto=false → false', () => {
  const r = resolveEsConjuntoPayload({ origen: 'flutter', es_conjunto: false })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.value, false)
})

test('Flutter con es_conjunto=true → true (manifold pendiente)', () => {
  const r = resolveEsConjuntoPayload({ origen: 'flutter', es_conjunto: true })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.value, true)
})

test('es_conjunto inválido ("true", 1, texto) → error 400 conceptual', () => {
  for (const bad of ['true', 1, 'yes', 'manifold', 'false']) {
    const r = resolveEsConjuntoPayload({ es_conjunto: bad })
    assert.strictEqual(r.ok, false, `expected fail for ${JSON.stringify(bad)}`)
  }
})

test('Flutter fuerza activo=false y estado_revision=pendiente', () => {
  const flags = flutterCreateFlags()
  assert.strictEqual(flags.activo, false)
  assert.strictEqual(flags.estado_revision, 'pendiente')
  // Simula payload malicioso: flags no dependen del body
  const payloadSim = {
    ...flutterCreateFlags(),
    es_conjunto: resolveEsConjuntoPayload({ es_conjunto: true }).value,
    // valores que Flutter pudiera enviar y deben ignorarse para estos campos:
    _ignored_activo: true,
    _ignored_revision: 'aprobado',
  }
  assert.strictEqual(payloadSim.activo, false)
  assert.strictEqual(payloadSim.estado_revision, 'pendiente')
  assert.strictEqual(payloadSim.es_conjunto, true)
})

if (!process.exitCode) {
  console.log('All activosRelevamiento helper tests passed')
}
