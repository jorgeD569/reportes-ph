/**
 * Tests unitarios de composición de activos (sin Supabase).
 * Ejecutar: node --test test/activosComposicion.test.js
 */
const assert = require('assert')
const {
  parseEsConjunto,
  validateAddComponente,
  ubicacionEfectiva,
  resumenActivo,
  resumenComponente,
} = require('../activosComposicion')

function test(name, fn) {
  try {
    fn()
    console.log('OK', name)
  } catch (e) {
    console.error('FAIL', name, e.message)
    process.exitCode = 1
  }
}

test('parseEsConjunto', () => {
  assert.strictEqual(parseEsConjunto(true), true)
  assert.strictEqual(parseEsConjunto(false), false)
  assert.strictEqual(parseEsConjunto('true'), true)
  assert.strictEqual(parseEsConjunto('0'), false)
  assert.strictEqual(parseEsConjunto(undefined, false), false)
  assert.strictEqual(parseEsConjunto('maybe', null), null)
})

test('ubicacion efectiva: usa manifold si pertenece', () => {
  const activo = { ubicacion: 'Base propia' }
  const manifold = { ubicacion: 'Manifold Norte' }
  assert.strictEqual(ubicacionEfectiva(activo, manifold), 'Manifold Norte')
  assert.strictEqual(ubicacionEfectiva(activo, null), 'Base propia')
  assert.strictEqual(ubicacionEfectiva(activo, { ubicacion: '' }), 'Base propia')
})

test('agregar componente válido', () => {
  const r = validateAddComponente({
    conjunto: { id: 1, es_conjunto: true },
    componente: { id: 15, es_conjunto: false },
    membershipActiva: null,
    mismoConjuntoAbierto: false,
  })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.alreadyMember, false)
})

test('client_uuid / ya miembro del mismo conjunto → idempotente conceptual', () => {
  const r = validateAddComponente({
    conjunto: { id: 1, es_conjunto: true },
    componente: { id: 15, es_conjunto: false },
    membershipActiva: { id: 9, conjunto_id: 1 },
    mismoConjuntoAbierto: true,
  })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.alreadyMember, true)
})

test('componente en dos manifolds → 409', () => {
  const r = validateAddComponente({
    conjunto: { id: 2, es_conjunto: true },
    componente: { id: 15, es_conjunto: false },
    membershipActiva: { id: 9, conjunto_id: 1 },
    mismoConjuntoAbierto: false,
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.status, 409)
  assert.strictEqual(r.code, 'COMPONENTE_EN_OTRO_CONJUNTO')
})

test('rechazo de conjunto dentro de conjunto', () => {
  const r = validateAddComponente({
    conjunto: { id: 1, es_conjunto: true },
    componente: { id: 2, es_conjunto: true },
    membershipActiva: null,
    mismoConjuntoAbierto: false,
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'CONJUNTO_EN_CONJUNTO')
})

test('destino no es conjunto → 400', () => {
  const r = validateAddComponente({
    conjunto: { id: 1, es_conjunto: false },
    componente: { id: 15, es_conjunto: false },
    membershipActiva: null,
    mismoConjuntoAbierto: false,
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'NO_ES_CONJUNTO')
})

test('retirar conserva historial (modelo): fecha_hasta cierra sin borrar', () => {
  const abierta = {
    id: 10,
    conjunto_id: 1,
    componente_id: 15,
    fecha_desde: '2026-01-01T00:00:00Z',
    fecha_hasta: null,
  }
  const cerrada = { ...abierta, fecha_hasta: '2026-07-19T12:00:00Z' }
  assert.strictEqual(abierta.fecha_hasta, null)
  assert.ok(cerrada.fecha_hasta)
  assert.strictEqual(cerrada.id, abierta.id)
})

test('búsqueda desde componente: payload conceptual', () => {
  const componente = {
    id: 15,
    numero_serie: '1236A1515',
    es_conjunto: false,
    ubicacion: 'Base propia',
  }
  const manifold = {
    id: 20,
    numero_serie: 'MF-001',
    descripcion: 'Manifold A',
    ubicacion: 'Pozo X',
    es_conjunto: true,
  }
  const payload = {
    ok: true,
    activo: {
      ...componente,
      ubicacion_efectiva: ubicacionEfectiva(componente, manifold),
    },
    composicion: null,
    pertenencia: {
      fecha_desde: '2026-07-01T00:00:00Z',
      posicion: 'Salida lateral',
      observaciones: null,
      manifold: resumenActivo(manifold),
    },
  }
  assert.strictEqual(payload.activo.ubicacion_efectiva, 'Pozo X')
  assert.strictEqual(payload.pertenencia.manifold.numero_serie, 'MF-001')
  assert.strictEqual(payload.composicion, null)
})

test('búsqueda desde manifold: resumen y count', () => {
  const manifold = {
    id: 20,
    numero_serie: 'MF-001',
    es_conjunto: true,
    ubicacion: 'Pozo X',
  }
  const comps = [
    resumenComponente({
      id: 15,
      numero_serie: '1236A1515',
      descripcion: 'codo',
      categoria: 'linea',
      estado: 'operativo',
      ubicacion: 'Base propia',
    }),
  ]
  const payload = {
    ok: true,
    activo: { ...manifold, ubicacion_efectiva: manifold.ubicacion },
    composicion: {
      componentes_actuales_count: comps.length,
      resumen: [
        {
          relacion_id: 1,
          posicion: 'Salida lateral',
          fecha_desde: '2026-07-01T00:00:00Z',
          componente: comps[0],
        },
      ],
    },
    pertenencia: null,
  }
  assert.strictEqual(payload.composicion.componentes_actuales_count, 1)
  assert.strictEqual(payload.composicion.resumen[0].componente.id, 15)
})

if (!process.exitCode) {
  console.log('All activosComposicion helper tests passed')
}
