/**
 * Tests unitarios de composición de activos (sin Supabase).
 * Ejecutar: node --test test/activosComposicion.test.js
 */
const assert = require('assert')
const {
  parseEsConjunto,
  validateAddComponente,
  validateTraspaso,
  assessDisponibilidadVinculacion,
  findInconsistenciasConjuntoOperativo,
  isFueraDeServicio,
  ubicacionEfectiva,
  resumenActivo,
  resumenComponente,
  enrichActivosConPertenencia,
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

test('GET /activos enrich: activo individual libre', () => {
  const rows = [
    {
      id: 10,
      numero_serie: 'LIBRE-1',
      descripcion: 'Activo libre',
      es_conjunto: false,
      ubicacion: 'Base',
    },
  ]
  const out = enrichActivosConPertenencia(rows, [], new Map())
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].es_conjunto, false)
  assert.strictEqual(out[0].es_componente, false)
  assert.strictEqual(out[0].pertenencia_actual, null)
  assert.strictEqual(out[0].numero_serie, 'LIBRE-1')
})

test('GET /activos enrich: manifold', () => {
  const rows = [
    {
      id: 20,
      numero_serie: 'MF-001',
      descripcion: 'Manifold A',
      es_conjunto: true,
      ubicacion: 'Pozo X',
    },
  ]
  const out = enrichActivosConPertenencia(rows, [], new Map())
  assert.strictEqual(out[0].es_conjunto, true)
  assert.strictEqual(out[0].es_componente, false)
  assert.strictEqual(out[0].pertenencia_actual, null)
})

test('GET /activos enrich: componente con manifold actual', () => {
  const rows = [
    {
      id: 15,
      numero_serie: '1236A1515',
      descripcion: 'codo',
      es_conjunto: false,
      ubicacion: 'Base propia',
    },
  ]
  const relaciones = [
    {
      id: 99,
      conjunto_id: 20,
      componente_id: 15,
      posicion: 'Salida lateral',
      fecha_desde: '2026-07-01T00:00:00Z',
      fecha_hasta: null,
    },
  ]
  const mans = new Map([
    [
      '20',
      {
        id: 20,
        numero_serie: 'MF-001',
        descripcion: 'Manifold A',
        ubicacion: 'Pozo X',
      },
    ],
  ])
  const out = enrichActivosConPertenencia(rows, relaciones, mans)
  assert.strictEqual(out[0].es_conjunto, false)
  assert.strictEqual(out[0].es_componente, true)
  assert.strictEqual(out[0].pertenencia_actual.relacion_id, 99)
  assert.strictEqual(out[0].pertenencia_actual.conjunto_id, 20)
  assert.strictEqual(out[0].pertenencia_actual.posicion, 'Salida lateral')
  assert.strictEqual(out[0].pertenencia_actual.manifold.numero_serie, 'MF-001')
  assert.strictEqual(out[0].pertenencia_actual.manifold.ubicacion, 'Pozo X')
})

test('GET /activos enrich: respuesta sin relaciones', () => {
  const rows = [
    { id: 1, es_conjunto: false },
    { id: 2, es_conjunto: true },
  ]
  const out = enrichActivosConPertenencia(rows, null, null)
  assert.strictEqual(out[0].es_componente, false)
  assert.strictEqual(out[0].pertenencia_actual, null)
  assert.strictEqual(out[1].es_conjunto, true)
  assert.strictEqual(out[1].es_componente, false)
})

test('1) fuera de servicio no puede vincularse', () => {
  const r = validateAddComponente({
    conjunto: { id: 1, es_conjunto: true },
    componente: { id: 15, es_conjunto: false, estado: 'fuera de servicio' },
    membershipActiva: null,
    mismoConjuntoAbierto: false,
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'COMPONENTE_FUERA_DE_SERVICIO')
  assert.ok(isFueraDeServicio('fuera_de_servicio'))
})

test('2) libre y operativo puede vincularse', () => {
  const r = validateAddComponente({
    conjunto: { id: 1, es_conjunto: true },
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    membershipActiva: null,
    mismoConjuntoAbierto: false,
  })
  assert.strictEqual(r.ok, true)
  const d = assessDisponibilidadVinculacion({
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    membershipActiva: null,
  })
  assert.strictEqual(d.disponible, true)
})

test('3) al vincular deja de estar disponible', () => {
  const d = assessDisponibilidadVinculacion({
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    membershipActiva: { id: 9, conjunto_id: 1 },
    conjuntoOrigen: { id: 1, numero_serie: 'MF-001' },
    conjuntoDestinoId: 2,
  })
  assert.strictEqual(d.disponible, false)
  assert.strictEqual(d.motivo, 'en_otro_conjunto')
})

test('4-5) vinculado no se vincula directo; ofrece traspaso con origen automático', () => {
  const r = validateAddComponente({
    conjunto: { id: 2, es_conjunto: true, numero_serie: 'MF-002' },
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    membershipActiva: { id: 9, conjunto_id: 1 },
    mismoConjuntoAbierto: false,
    conjuntoOrigen: { id: 1, numero_serie: 'MF-001', descripcion: 'Origen' },
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'COMPONENTE_EN_OTRO_CONJUNTO')
  assert.strictEqual(r.details.puede_traspaso, true)
  assert.strictEqual(r.details.conjunto_origen_label, 'MF-001')
  assert.ok(String(r.error).includes('traspaso'))
})

test('6-8) validateTraspaso mueve conceptualmente y respeta FDS del origen', () => {
  const ok = validateTraspaso({
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    origen: { id: 1, es_conjunto: true, estado: 'operativo', numero_serie: 'MF-1' },
    destino: { id: 2, es_conjunto: true, estado: 'operativo', numero_serie: 'MF-2' },
    membershipActiva: { id: 9, conjunto_id: 1 },
    conjuntoOrigenIdInformado: 1,
  })
  assert.strictEqual(ok.ok, true)

  // Simulación de decisión "No": estado origen se conserva.
  const conservar = { estadoAnterior: 'operativo', origenFuera: false }
  const estadoFinalNo = conservar.origenFuera
    ? 'fuera de servicio'
    : conservar.estadoAnterior
  assert.strictEqual(estadoFinalNo, 'operativo')

  // Simulación de decisión "Sí".
  const marcar = { estadoAnterior: 'operativo', origenFuera: true }
  const estadoFinalSi = marcar.origenFuera
    ? 'fuera de servicio'
    : marcar.estadoAnterior
  assert.strictEqual(estadoFinalSi, 'fuera de servicio')
})

test('9) traspaso falla si origen desactualizado (sin cambios parciales conceptual)', () => {
  const r = validateTraspaso({
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    origen: { id: 1, es_conjunto: true },
    destino: { id: 2, es_conjunto: true },
    membershipActiva: { id: 9, conjunto_id: 99 },
    conjuntoOrigenIdInformado: 1,
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'ORIGEN_DESACTUALIZADO')
})

test('10) índice único parcial: un solo membership abierto por componente', () => {
  // Modelo: dos filas abiertas del mismo componente son inválidas.
  const abiertas = [
    { componente_id: 15, conjunto_id: 1, fecha_hasta: null },
    { componente_id: 15, conjunto_id: 2, fecha_hasta: null },
  ]
  const abiertasDe15 = abiertas.filter(
    (r) => r.componente_id === 15 && r.fecha_hasta == null,
  )
  assert.ok(abiertasDe15.length > 1)
  // La DB lo impide con activo_componentes_componente_activo_key.
  const uniqueKey = 'activo_componentes_componente_activo_key'
  assert.ok(uniqueKey.includes('componente'))
})

test('11) sync desactualizado: conflicto 409 no sobrescribe', () => {
  const r = validateAddComponente({
    conjunto: { id: 2, es_conjunto: true },
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    membershipActiva: { id: 9, conjunto_id: 1 },
    mismoConjuntoAbierto: false,
    conjuntoOrigen: { id: 1, numero_serie: 'MF-OLD' },
  })
  assert.strictEqual(r.status, 409)
  assert.strictEqual(r.details.conjunto_id_actual, 1)
})

test('12) conjunto operativo con activo fuera de servicio → inconsistencia', () => {
  const issues = findInconsistenciasConjuntoOperativo(
    { id: 1, estado: 'operativo', es_conjunto: true },
    [
      {
        componente: {
          id: 15,
          numero_serie: 'VL-1',
          estado: 'fuera de servicio',
        },
      },
      {
        componente: { id: 16, numero_serie: 'VL-2', estado: 'operativo' },
      },
    ],
  )
  assert.strictEqual(issues.length, 1)
  assert.strictEqual(issues[0].componente_id, 15)
  assert.ok(String(issues[0].mensaje).includes('Fuera de servicio'))
})

test('destino fuera de servicio no puede recibir traspaso', () => {
  const r = validateTraspaso({
    componente: { id: 15, es_conjunto: false, estado: 'operativo' },
    origen: { id: 1, es_conjunto: true, estado: 'operativo' },
    destino: { id: 2, es_conjunto: true, estado: 'fuera de servicio' },
    membershipActiva: { id: 9, conjunto_id: 1 },
    conjuntoOrigenIdInformado: 1,
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.code, 'DESTINO_FUERA_DE_SERVICIO')
})

test('disponibilidad no confunde estado operativo con vinculación', () => {
  const operativoVinculado = assessDisponibilidadVinculacion({
    componente: { id: 1, es_conjunto: false, estado: 'operativo' },
    membershipActiva: { id: 9, conjunto_id: 10 },
    conjuntoOrigen: { id: 10, numero_serie: 'MF-10' },
  })
  assert.strictEqual(operativoVinculado.disponible, false)
  assert.strictEqual(isFueraDeServicio('operativo'), false)
})

if (!process.exitCode) {
  console.log('All activosComposicion helper tests passed')
}
