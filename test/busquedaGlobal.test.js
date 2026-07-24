/**
 * Tests de búsqueda global (mock Supabase: filtra en DB, rankea en Node).
 * Ejecutar: node --test test/busquedaGlobal.test.js
 */
const assert = require('assert')
const {
  validateBusquedaGlobalQuery,
  searchActivos,
  searchPartesOperativos,
  searchReportesPh,
  buildGroupedResponse,
  rankField,
  escapeIlikePattern,
  containsIlikePattern,
  candidateLimitFor,
  dedupeById,
  executeBusquedaGlobal,
  fetchActivosCandidatos,
  fetchPartesOperativosCandidatos,
  fetchReportesPhCandidatos,
  urlDestinoActivo,
} = require('../busquedaGlobal')

const pendingTests = []

function test(name, fn) {
  pendingTests.push(
    (async () => {
      try {
        await fn()
        console.log('OK', name)
      } catch (e) {
        console.error('FAIL', name, e && e.stack ? e.stack : e)
        process.exitCode = 1
      }
    })(),
  )
}

/**
 * Mock thenable de PostgREST: registra cada consulta y aplica filtros simples en memoria.
 */
function createTrackingSupabase(dataset) {
  const calls = []

  function matches(row, filters) {
    for (const f of filters) {
      if (f.op === 'eq') {
        if (String(row[f.col]) !== String(f.val)) return false
      } else if (f.op === 'ilike') {
        const raw = String(row[f.col] ?? '')
        const pat = String(f.val)
        // patrón %literal% con escape \ % _
        let body = pat
        if (body.startsWith('%')) body = body.slice(1)
        if (body.endsWith('%')) body = body.slice(0, -1)
        const literal = body
          .replace(/\\%/g, '\u0001')
          .replace(/\\_/g, '\u0002')
          .replace(/\\\\/g, '\\')
          .replace(/\u0001/g, '%')
          .replace(/\u0002/g, '_')
        if (!raw.toLowerCase().includes(literal.toLowerCase())) return false
      } else if (f.op === 'in') {
        const set = new Set((f.val || []).map(String))
        if (!set.has(String(row[f.col]))) return false
      } else if (f.op === 'is') {
        if (f.val === null) {
          if (row[f.col] != null) return false
        } else if (row[f.col] !== f.val) return false
      }
    }
    return true
  }

  function createBuilder(table) {
    const state = {
      table,
      selectCols: null,
      filters: [],
      limit: null,
      hasSearchFilter: false,
    }

    const builder = {
      select(cols) {
        state.selectCols = cols
        return builder
      },
      eq(col, val) {
        state.filters.push({ op: 'eq', col, val })
        if (
          !(table === 'activos' && (col === 'activo' || col === 'estado_revision'))
        ) {
          state.hasSearchFilter = true
        }
        return builder
      },
      ilike(col, val) {
        state.filters.push({ op: 'ilike', col, val })
        state.hasSearchFilter = true
        return builder
      },
      in(col, val) {
        state.filters.push({ op: 'in', col, val })
        return builder
      },
      is(col, val) {
        state.filters.push({ op: 'is', col, val })
        return builder
      },
      limit(n) {
        state.limit = n
        const rows = (dataset[table] || []).filter((r) => matches(r, state.filters))
        const limited =
          state.limit != null ? rows.slice(0, state.limit) : rows
        const snapshot = {
          table: state.table,
          filters: [...state.filters],
          limit: state.limit,
          selectCols: state.selectCols,
          hasSearchFilter: state.hasSearchFilter,
          returned: limited.length,
        }
        calls.push(snapshot)
        return Promise.resolve({ data: limited, error: null })
      },
      then(resolve, reject) {
        // Si alguien await sin .limit(), marcar como consulta sin límite controlado
        const snapshot = {
          table: state.table,
          filters: [...state.filters],
          limit: state.limit,
          selectCols: state.selectCols,
          hasSearchFilter: state.hasSearchFilter,
          returned: null,
          missingLimit: true,
        }
        calls.push(snapshot)
        const rows = (dataset[table] || []).filter((r) => matches(r, state.filters))
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  return {
    calls,
    from(table) {
      return createBuilder(table)
    },
  }
}

const activosSample = [
  {
    id: 15,
    numero_serie: '1236A1515',
    codigo_interno: 'K-M01-001',
    descripcion: 'codo 3" fg.1502',
    marca: 'TSI',
    ubicacion: 'base rincon',
    ubicacion_efectiva: 'Pozo X',
    estado: 'operativo',
    es_conjunto: false,
    es_componente: true,
    activo: false,
    estado_revision: 'pendiente',
    pertenencia_actual: {
      relacion_id: 99,
      conjunto_id: 20,
      posicion: 'A1',
      fecha_desde: '2026-07-01',
      manifold: {
        id: 20,
        numero_serie: 'UP-001',
        descripcion: 'Unidad de prueba',
        ubicacion: 'Pozo X',
      },
    },
  },
  {
    id: 12,
    numero_serie: 'K-M001-001',
    codigo_interno: null,
    descripcion: 'linea de 3"',
    marca: 'KOMPASS',
    ubicacion: 'sumidero',
    ubicacion_efectiva: 'sumidero',
    estado: 'fuera de servicio',
    es_conjunto: false,
    es_componente: false,
    activo: true,
    estado_revision: 'aprobado',
    pertenencia_actual: null,
  },
  {
    id: 20,
    numero_serie: 'UP-001',
    descripcion: 'Unidad de prueba',
    marca: null,
    ubicacion: 'Pozo X',
    ubicacion_efectiva: 'Pozo X',
    estado: 'operativo',
    es_conjunto: true,
    es_componente: false,
    activo: true,
    estado_revision: 'aprobado',
    pertenencia_actual: null,
  },
  {
    id: 41,
    numero_serie: 'RECH-001',
    descripcion: 'rechazado',
    marca: 'X',
    ubicacion: 'base',
    ubicacion_efectiva: 'base',
    estado: 'operativo',
    es_conjunto: false,
    es_componente: false,
    activo: false,
    estado_revision: 'rechazado',
    pertenencia_actual: null,
  },
  {
    id: 42,
    numero_serie: 'INACT-001',
    descripcion: 'inactivo aprobado',
    marca: 'X',
    ubicacion: 'deposito',
    ubicacion_efectiva: 'deposito',
    estado: 'baja',
    es_conjunto: false,
    es_componente: false,
    activo: false,
    estado_revision: 'aprobado',
    pertenencia_actual: null,
  },
]

const datasetBase = {
  activos: [
    {
      id: 15,
      numero_serie: '1236A1515',
      codigo_interno: 'K-M01-001',
      descripcion: 'codo 3" fg.1502',
      marca: 'TSI',
      ubicacion: 'base rincon',
      estado: 'operativo',
      categoria: null,
      activo: false,
      estado_revision: 'pendiente',
      es_conjunto: false,
    },
    {
      id: 12,
      numero_serie: 'K-M001-001',
      codigo_interno: null,
      descripcion: 'linea de 3"',
      marca: 'KOMPASS',
      ubicacion: 'sumidero',
      estado: 'fuera de servicio',
      categoria: null,
      activo: true,
      estado_revision: 'aprobado',
      es_conjunto: false,
    },
    {
      id: 20,
      numero_serie: 'UP-001',
      descripcion: 'Unidad de prueba',
      marca: null,
      ubicacion: 'Pozo X',
      estado: 'operativo',
      categoria: null,
      activo: true,
      estado_revision: 'aprobado',
      es_conjunto: true,
    },
    {
      id: 41,
      numero_serie: 'RECH-001',
      descripcion: 'rechazado sample',
      marca: 'X',
      ubicacion: 'base',
      estado: 'operativo',
      activo: false,
      estado_revision: 'rechazado',
      es_conjunto: false,
    },
    {
      id: 42,
      numero_serie: 'INACT-001',
      descripcion: 'inactivo sample',
      marca: 'X',
      ubicacion: 'deposito',
      estado: 'baja',
      activo: false,
      estado_revision: 'aprobado',
      es_conjunto: false,
    },
    {
      id: 99,
      numero_serie: 'IGNORE-OTRO',
      descripcion: 'otro',
      marca: 'TSI',
      ubicacion: 'base',
      estado: 'operativo',
      activo: true,
      estado_revision: 'aprobado',
      es_conjunto: false,
    },
  ],
  activo_componentes: [
    {
      id: 1,
      conjunto_id: 20,
      componente_id: 15,
      posicion: 'A1',
      fecha_desde: '2026-07-01',
      fecha_hasta: null,
    },
  ],
  partes_operativos: [
    {
      id: 'uuid-37',
      numero_parte: 37,
      fecha: '2026-07-10',
      pozo: 'LT2E-1020',
      operadora: 'Tecpetrol',
      yacimiento: 'Fortín',
      estado: 'abierto',
      pdf_path: null,
    },
    {
      id: 'uuid-12',
      numero_parte: 12,
      fecha: '2026-06-01',
      pozo: 'Otro',
      operadora: 'YPF',
      yacimiento: 'X',
      estado: 'cerrado',
      pdf_path: 'partes/a.pdf',
    },
    {
      id: 'uuid-comma',
      numero_parte: 50,
      fecha: '2026-05-01',
      pozo: 'Pozo A, Sector 2',
      operadora: 'Op (Sur)',
      yacimiento: 'Yac%1',
      estado: 'abierto',
      pdf_path: null,
    },
  ],
  partes: [
    {
      id: 'ph-1',
      reporte_numero: 1236,
      fecha: '2026-07-01',
      cliente: 'Cliente',
      pozo: 'P1',
      elemento_ensayar: 'BOP',
      reporte_pdf_path: null,
    },
    {
      id: 'ph-2',
      reporte_numero: 88,
      fecha: '2026-06-01',
      cliente: 'Acme (Norte)',
      pozo: 'Zona, Este',
      elemento_ensayar: 'Prueba%ok',
      reporte_pdf_path: 'ph/x.pdf',
    },
  ],
}

function entitySearchCalls(calls) {
  return calls.filter(
    (c) =>
      c.table === 'activos' ||
      c.table === 'partes_operativos' ||
      c.table === 'partes',
  )
}

function assertNoUnfilteredEntitySelects(calls) {
  for (const c of entitySearchCalls(calls)) {
    // batch de manifolds usa .in('id', ...) — permitido
    const isManifoldBatch = c.filters.some((f) => f.op === 'in' && f.col === 'id')
    if (isManifoldBatch) continue
    assert.strictEqual(
      c.hasSearchFilter,
      true,
      `Select masivo sin filtro de búsqueda en ${c.table}: ${JSON.stringify(c.filters)}`,
    )
    assert.ok(
      c.limit != null && c.limit > 0,
      `Consulta sin limit controlado en ${c.table}`,
    )
    assert.notStrictEqual(c.missingLimit, true)
  }
}

// --- helpers unitarios ---

test('q inválido: vacío / corto', () => {
  assert.strictEqual(validateBusquedaGlobalQuery('').ok, false)
  assert.strictEqual(validateBusquedaGlobalQuery(' ').ok, false)
  assert.strictEqual(validateBusquedaGlobalQuery('a').ok, false)
  assert.strictEqual(validateBusquedaGlobalQuery('a').code, 'Q_TOO_SHORT')
})

test('q numérico de 1 dígito permitido', () => {
  const r = validateBusquedaGlobalQuery('7')
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.q, '7')
})

test('máximo limit=25', () => {
  const r = validateBusquedaGlobalQuery('ab', 999)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.limit, 25)
  assert.strictEqual(candidateLimitFor(25), 75)
  assert.strictEqual(candidateLimitFor(10), 30)
})

test('escape ILIKE: % _ \\', () => {
  assert.strictEqual(escapeIlikePattern('100%'), '100\\%')
  assert.strictEqual(escapeIlikePattern('a_b'), 'a\\_b')
  assert.strictEqual(escapeIlikePattern('a\\b'), 'a\\\\b')
  assert.strictEqual(containsIlikePattern('a,b'), '%a,b%')
  assert.strictEqual(containsIlikePattern('Op (Sur)'), '%Op (Sur)%')
  assert.strictEqual(containsIlikePattern('Yac%1'), '%Yac\\%1%')
})

test('rankField: exacto / prefijo / contiene', () => {
  assert.strictEqual(rankField('1236A1515', '1236a1515'), 0)
  assert.strictEqual(rankField('1236A1515', '1236'), 1)
  assert.strictEqual(rankField('ABC-1236A', '1236'), 2)
  assert.strictEqual(rankField('otro', '1236'), 999)
})

test('deduplicación por id', () => {
  const rows = dedupeById([
    { id: 1, x: 'a' },
    { id: 1, x: 'b' },
    { id: 2, x: 'c' },
  ])
  assert.strictEqual(rows.length, 2)
  assert.strictEqual(rows[0].x, 'a')
})

test('serial exacto (ranking en memoria sobre candidatos)', () => {
  const r = searchActivos(activosSample, '1236A1515', 10)
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].id, 15)
  assert.strictEqual(r[0].titulo, '1236A1515')
  assert.strictEqual(r[0].es_componente, true)
  assert.strictEqual(r[0].estado_revision, 'pendiente')
  assert.strictEqual(r[0].activo, false)
  assert.strictEqual(
    r[0].url_destino,
    '/coordinador/inventario/relevamientos-pendientes?activo=15',
  )
})

test('activo pendiente encontrado + URL', () => {
  const r = searchActivos(activosSample, '1236A1515', 10)
  assert.strictEqual(r[0].estado_revision, 'pendiente')
  assert.strictEqual(
    urlDestinoActivo({ id: 15, estado_revision: 'pendiente' }),
    '/coordinador/inventario/relevamientos-pendientes?activo=15',
  )
})

test('activo aprobado encontrado + URL', () => {
  const r = searchActivos(activosSample, 'UP-001', 10)
  assert.ok(r.some((x) => x.id === 20))
  const row = r.find((x) => x.id === 20)
  assert.strictEqual(row.estado_revision, 'aprobado')
  assert.strictEqual(row.activo, true)
  assert.strictEqual(
    row.url_destino,
    '/coordinador/inventario/activos?activo=20',
  )
})

test('activo rechazado encontrado', () => {
  const r = searchActivos(activosSample, 'RECH-001', 10)
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].estado_revision, 'rechazado')
  assert.strictEqual(
    r[0].url_destino,
    '/coordinador/inventario/activos?activo=41',
  )
})

test('activo=false encontrado', () => {
  const r = searchActivos(activosSample, 'INACT-001', 10)
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].activo, false)
  assert.strictEqual(r[0].estado_revision, 'aprobado')
  assert.strictEqual(r[0].estado, 'baja')
})

test('serial parcial', () => {
  const r = searchActivos(activosSample, '1236', 10)
  assert.ok(r.some((x) => x.id === 15))
})

test('ubicación efectiva de un componente', () => {
  const r = searchActivos(activosSample, '1236A1515', 10)
  assert.strictEqual(r[0].ubicacion_propia, 'base rincon')
  assert.strictEqual(r[0].ubicacion_efectiva, 'Pozo X')
  assert.strictEqual(r[0].pertenencia_actual.conjunto_id, 20)
  assert.strictEqual(r[0].pertenencia_actual.numero_serie, 'UP-001')
})

test('número de parte (ranking)', () => {
  const partes = datasetBase.partes_operativos
  const r = searchPartesOperativos(partes, '37', 10)
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].numero_parte, 37)
})

test('ranking exacto antes que prefijo/contiene', () => {
  const r = searchActivos(
    [
      {
        id: 1,
        numero_serie: 'XX-1236-YY',
        descripcion: 'contiene',
        ubicacion: 'a',
        estado: 'ok',
        es_conjunto: false,
        pertenencia_actual: null,
      },
      {
        id: 2,
        numero_serie: '1236',
        descripcion: 'exacto',
        ubicacion: 'a',
        estado: 'ok',
        es_conjunto: false,
        pertenencia_actual: null,
      },
      {
        id: 3,
        numero_serie: '1236ABC',
        descripcion: 'prefijo',
        ubicacion: 'a',
        estado: 'ok',
        es_conjunto: false,
        pertenencia_actual: null,
      },
    ],
    '1236',
    10,
  )
  assert.strictEqual(r[0].id, 2)
  assert.strictEqual(r[1].id, 3)
  assert.strictEqual(r[2].id, 1)
})

// --- repositorios / executeBusquedaGlobal ---

test('repositorios reciben q y limit (sin select masivo)', async () => {
  const sb = createTrackingSupabase(datasetBase)
  await fetchActivosCandidatos(sb, '1236', 10)
  await fetchPartesOperativosCandidatos(sb, '37', 10)
  await fetchReportesPhCandidatos(sb, '1236', 10)

  assertNoUnfilteredEntitySelects(sb.calls)

  const activoCalls = sb.calls.filter(
    (c) => c.table === 'activos' && c.hasSearchFilter,
  )
  assert.ok(activoCalls.length >= 5, 'debe consultar por cada campo de activo')
  for (const c of activoCalls) {
    assert.strictEqual(c.limit, 30)
    assert.ok(c.filters.some((f) => f.op === 'ilike'))
    const ilike = c.filters.find((f) => f.op === 'ilike')
    assert.strictEqual(ilike.val, containsIlikePattern('1236'))
  }

  const parteEq = sb.calls.find(
    (c) =>
      c.table === 'partes_operativos' &&
      c.filters.some((f) => f.op === 'eq' && f.col === 'numero_parte'),
  )
  assert.ok(parteEq)
  assert.strictEqual(parteEq.limit, 30)

  const phEq = sb.calls.find(
    (c) =>
      c.table === 'partes' &&
      c.filters.some((f) => f.op === 'eq' && f.col === 'reporte_numero'),
  )
  assert.ok(phEq)
})

test('executeBusquedaGlobal: serial exacto pendiente 1236A1515 → activo 15', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: '1236A1515',
    limit: 10,
    buildPublicPdfUrl: (p) => `https://cdn.test/${p}`,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  assert.strictEqual(payload.resultados.activos.length, 1)
  assert.strictEqual(payload.resultados.activos[0].id, 15)
  assert.strictEqual(payload.resultados.activos[0].estado_revision, 'pendiente')
  assert.strictEqual(payload.resultados.activos[0].activo, false)
  assert.strictEqual(
    payload.resultados.activos[0].url_destino,
    '/coordinador/inventario/relevamientos-pendientes?activo=15',
  )
  assert.strictEqual(payload.resultados.activos[0].ubicacion_efectiva, 'Pozo X')
  assert.strictEqual(
    payload.resultados.activos[0].pertenencia_actual.numero_serie,
    'UP-001',
  )

  // Sin filtros activo/estado_revision en búsquedas de candidatos
  const activoSearch = sb.calls.filter(
    (c) =>
      c.table === 'activos' &&
      c.filters.some((f) => f.op === 'ilike'),
  )
  assert.ok(activoSearch.length >= 1)
  for (const c of activoSearch) {
    assert.ok(!c.filters.some((f) => f.col === 'activo'))
    assert.ok(!c.filters.some((f) => f.col === 'estado_revision'))
  }

  const relCall = sb.calls.find((c) => c.table === 'activo_componentes')
  assert.ok(relCall, 'debe cargar pertenencias en batch')
  assert.ok(relCall.filters.some((f) => f.op === 'in' && f.col === 'componente_id'))
})

test('GET /activos y /activos-operador no cambiaron (siguen filtrando aprobado+activo)', () => {
  const fs = require('fs')
  const path = require('path')
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

  const idxActivos = src.indexOf("app.get('/activos'")
  const idxOperador = src.indexOf("app.get('/activos-operador'")
  assert.ok(idxActivos > 0)
  assert.ok(idxOperador > 0)

  const sliceActivos = src.slice(idxActivos, idxActivos + 800)
  assert.ok(sliceActivos.includes(".eq('activo', true)"))
  assert.ok(sliceActivos.includes(".eq('estado_revision', 'aprobado')"))

  const sliceOp = src.slice(idxOperador, idxOperador + 600)
  assert.ok(sliceOp.includes(".eq('activo', true)"))
  assert.ok(sliceOp.includes(".eq('estado_revision', 'aprobado')"))
})

test('executeBusquedaGlobal: parte numérico', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: '37',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  assert.strictEqual(payload.resultados.partes_operativos.length, 1)
  assert.strictEqual(payload.resultados.partes_operativos[0].numero_parte, 37)
  assert.strictEqual(
    payload.resultados.partes_operativos[0].url_destino,
    '/operador/partes-operativos/uuid-37',
  )
})

test('executeBusquedaGlobal: búsqueda por pozo', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: 'lt2e',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  assert.strictEqual(payload.resultados.partes_operativos.length, 1)
  assert.strictEqual(payload.resultados.partes_operativos[0].pozo, 'LT2E-1020')
})

test('executeBusquedaGlobal: reporte PH', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: '1236',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  assert.ok(payload.resultados.reportes_ph.some((r) => r.id === 'ph-1'))
  assert.strictEqual(
    payload.resultados.reportes_ph.find((r) => r.id === 'ph-1').url_destino,
    '/coordinador/reportes-ph/ph-1',
  )
})

test('texto con coma (filtro por campo, sin romper consulta)', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: 'Pozo A, Sector',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  const ilikes = sb.calls.filter((c) =>
    c.filters.some((f) => f.op === 'ilike' && String(f.val).includes('Pozo A, Sector')),
  )
  assert.ok(ilikes.length > 0)
  assert.ok(
    payload.resultados.partes_operativos.some((p) => p.id === 'uuid-comma') ||
      payload.resultados.reportes_ph.some((p) => p.pozo && p.pozo.includes(',')),
  )
})

test('texto con paréntesis', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: 'Op (Sur)',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  assert.ok(
    payload.resultados.partes_operativos.some((p) => p.operadora === 'Op (Sur)'),
  )
})

test('texto con % escapado (no wildcard)', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: 'Yac%1',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  const patternUsed = containsIlikePattern('Yac%1')
  assert.ok(patternUsed.includes('\\%'))
  assert.ok(
    sb.calls.some((c) =>
      c.filters.some((f) => f.op === 'ilike' && f.val === patternUsed),
    ),
  )
  assert.ok(
    payload.resultados.partes_operativos.some((p) => p.yacimiento === 'Yac%1'),
  )
})

test('sin resultados', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: 'zzzz-no-existe',
    limit: 10,
  })
  assertNoUnfilteredEntitySelects(sb.calls)
  assert.strictEqual(payload.total, 0)
  assert.deepStrictEqual(payload.resultados.activos, [])
  assert.deepStrictEqual(payload.resultados.partes_operativos, [])
  assert.deepStrictEqual(payload.resultados.reportes_ph, [])
})

test('deduplicación de candidatos solapados por campo', async () => {
  const sb = createTrackingSupabase({
    ...datasetBase,
    activos: [
      {
        id: 7,
        numero_serie: 'ABC-MATCH',
        codigo_interno: 'MATCH-INT',
        descripcion: 'MATCH desc',
        marca: 'MATCH',
        ubicacion: 'MATCH loco',
        estado: 'operativo',
        activo: true,
        estado_revision: 'aprobado',
        es_conjunto: false,
      },
    ],
    activo_componentes: [],
  })
  const rows = await fetchActivosCandidatos(sb, 'MATCH', 10)
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].id, 7)
})

test('resultados agrupados', async () => {
  const sb = createTrackingSupabase(datasetBase)
  const payload = await executeBusquedaGlobal({
    supabase: sb,
    q: '1236',
    limit: 10,
  })
  assert.strictEqual(payload.ok, true)
  assert.strictEqual(payload.query, '1236')
  assert.ok(Array.isArray(payload.resultados.activos))
  assert.ok(Array.isArray(payload.resultados.partes_operativos))
  assert.ok(Array.isArray(payload.resultados.reportes_ph))
  assert.ok(payload.total >= 1)
})

test('código fuente: sin patrón select completo + filter en memoria en la ruta', async () => {
  const fs = require('fs')
  const path = require('path')
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'busquedaGlobal.js'),
    'utf8',
  )
  // La ruta/orquestación no debe hacer .from(...).select(...).eq(...).eq(...) sin ilike
  // seguido de filter en memoria sobre la tabla completa. Debe usar fetch*Candidatos.
  assert.ok(src.includes('fetchActivosCandidatos'))
  assert.ok(src.includes('fetchPartesOperativosCandidatos'))
  assert.ok(src.includes('fetchReportesPhCandidatos'))
  assert.ok(!src.includes('.from(\'partes_operativos\')\n          .select(\n            \'id, numero_parte'))
  // No debe haber llamadas .or(...) a PostgREST
  assert.ok(!/\.or\s*\(\s*[`'"]/.test(src))
})

;(async () => {
  await Promise.all(pendingTests)
  if (!process.exitCode) {
    console.log('All busquedaGlobal helper tests passed')
  }
})()
