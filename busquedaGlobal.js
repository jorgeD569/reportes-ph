/**
 * Búsqueda global: activos, partes operativos y reportes PH.
 * Solo lectura. Supabase filtra candidatos; Node rankea y arma la respuesta.
 */

const {
  enrichActivosConPertenencia,
  loadPertenenciasActivasBatch,
  ubicacionEfectiva,
} = require('./activosComposicion')

const ACTIVO_SELECT =
  'id, descripcion, numero_serie, codigo_interno, marca, ubicacion, estado, categoria, activo, estado_revision, es_conjunto'

const PARTE_SELECT =
  'id, numero_parte, fecha, pozo, operadora, yacimiento, estado, pdf_path'

const PH_SELECT =
  'id, reporte_numero, fecha, cliente, pozo, elemento_ensayar, reporte_pdf_path'

const ACTIVO_ILIKE_FIELDS = [
  'numero_serie',
  'codigo_interno',
  'descripcion',
  'ubicacion',
  'marca',
]

const PARTE_ILIKE_FIELDS = ['pozo', 'operadora', 'yacimiento']
const PH_ILIKE_FIELDS = ['cliente', 'pozo', 'elemento_ensayar']

function normalizeQueryText(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function isNumericQuery(q) {
  const t = String(q || '').trim()
  return /^\d+$/.test(t)
}

/**
 * Escapa metacaracteres LIKE/ILIKE de Postgres (% _ \) para buscar texto literal.
 * No usa or() de PostgREST; cada campo se filtra en su propia consulta.
 */
function escapeIlikePattern(raw) {
  return String(raw ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

function containsIlikePattern(q) {
  return `%${escapeIlikePattern(String(q).trim())}%`
}

function candidateLimitFor(limit) {
  const n = Math.floor(Number(limit))
  const safe = Number.isFinite(n) && n > 0 ? n : 10
  return Math.min(safe, 25) * 3
}

/**
 * Valida q / limit.
 * @returns {{ ok: true, q: string, limit: number } | { ok: false, status: number, error: string, code?: string }}
 */
function validateBusquedaGlobalQuery(rawQ, rawLimit) {
  if (rawQ === undefined || rawQ === null) {
    return {
      ok: false,
      status: 400,
      code: 'Q_REQUIRED',
      error: 'El parámetro q es obligatorio',
    }
  }
  const q = String(rawQ).trim()
  if (!q) {
    return {
      ok: false,
      status: 400,
      code: 'Q_REQUIRED',
      error: 'El parámetro q es obligatorio',
    }
  }
  if (q.length < 2 && !isNumericQuery(q)) {
    return {
      ok: false,
      status: 400,
      code: 'Q_TOO_SHORT',
      error: 'La búsqueda requiere al menos 2 caracteres (salvo números)',
    }
  }
  if (q.length > 100) {
    return {
      ok: false,
      status: 400,
      code: 'Q_TOO_LONG',
      error: 'La búsqueda supera el máximo de 100 caracteres',
    }
  }
  let limit = Number(rawLimit)
  if (!Number.isFinite(limit) || limit <= 0) limit = 10
  if (limit > 25) limit = 25
  return { ok: true, q, limit: Math.floor(limit) }
}

/**
 * 0 = exacto, 1 = empieza con, 2 = contiene, 999 = no match
 */
function rankField(value, qNorm) {
  const v = normalizeQueryText(value)
  if (!v || !qNorm) return 999
  if (v === qNorm) return 0
  if (v.startsWith(qNorm)) return 1
  if (v.includes(qNorm)) return 2
  return 999
}

function bestRank(fields, qNorm) {
  let best = 999
  for (const f of fields) {
    const r = rankField(f, qNorm)
    if (r < best) best = r
  }
  return best
}

function sortByRankThenTitle(items) {
  return [...items].sort((a, b) => {
    if (a._rank !== b._rank) return a._rank - b._rank
    const ta = String(a.titulo || '').toLowerCase()
    const tb = String(b.titulo || '').toLowerCase()
    return ta.localeCompare(tb, 'es', { sensitivity: 'base' })
  })
}

function stripRank(item) {
  const { _rank, ...rest } = item
  return rest
}

function dedupeById(rows) {
  const map = new Map()
  for (const row of rows || []) {
    if (!row || row.id == null) continue
    const key = String(row.id)
    if (!map.has(key)) map.set(key, row)
  }
  return [...map.values()]
}

/** pendiente | aprobado | rechazado | null */
function normalizeEstadoRevision(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'pendiente' || s === 'aprobado' || s === 'rechazado') return s
  return s || null
}

/**
 * Pendientes van a la cola de revisión; el resto al inventario.
 */
function urlDestinoActivo(activo) {
  const id = encodeURIComponent(String(activo?.id ?? ''))
  const rev = normalizeEstadoRevision(activo?.estado_revision)
  if (rev === 'pendiente') {
    return `/coordinador/inventario/relevamientos-pendientes?activo=${id}`
  }
  return `/coordinador/inventario/activos?activo=${id}`
}

function assertFilteredQuery(res, context) {
  if (res && res.error) throw res.error
  return res?.data || []
}

/**
 * Consultas filtradas por campo (sin or() de PostgREST, sin descarga completa).
 * Cada builder debe terminar en .limit(candidateLimit).
 */
async function fetchActivosCandidatos(supabase, q, limit) {
  const candidateLimit = candidateLimitFor(limit)
  const pattern = containsIlikePattern(q)
  // Sin filtro activo/estado_revision: la búsqueda global encuentra cualquier serial.
  const base = () => supabase.from('activos').select(ACTIVO_SELECT)

  const results = await Promise.all(
    ACTIVO_ILIKE_FIELDS.map((field) =>
      base().ilike(field, pattern).limit(candidateLimit),
    ),
  )

  const merged = []
  for (let i = 0; i < results.length; i++) {
    merged.push(
      ...assertFilteredQuery(results[i], `activos.${ACTIVO_ILIKE_FIELDS[i]}`),
    )
  }
  return dedupeById(merged)
}

async function fetchPartesOperativosCandidatos(supabase, q, limit) {
  const candidateLimit = candidateLimitFor(limit)
  const pattern = containsIlikePattern(q)
  const qTrim = String(q).trim()
  const queries = []

  if (isNumericQuery(qTrim)) {
    queries.push(
      supabase
        .from('partes_operativos')
        .select(PARTE_SELECT)
        .eq('numero_parte', Number(qTrim))
        .limit(candidateLimit),
    )
  }

  for (const field of PARTE_ILIKE_FIELDS) {
    queries.push(
      supabase
        .from('partes_operativos')
        .select(PARTE_SELECT)
        .ilike(field, pattern)
        .limit(candidateLimit),
    )
  }

  const results = await Promise.all(queries)
  const merged = []
  for (const res of results) {
    merged.push(...assertFilteredQuery(res, 'partes_operativos'))
  }
  return dedupeById(merged)
}

async function fetchReportesPhCandidatos(supabase, q, limit) {
  const candidateLimit = candidateLimitFor(limit)
  const pattern = containsIlikePattern(q)
  const qTrim = String(q).trim()
  const queries = []

  if (isNumericQuery(qTrim)) {
    queries.push(
      supabase
        .from('partes')
        .select(PH_SELECT)
        .eq('reporte_numero', Number(qTrim))
        .limit(candidateLimit),
    )
  }

  for (const field of PH_ILIKE_FIELDS) {
    queries.push(
      supabase
        .from('partes')
        .select(PH_SELECT)
        .ilike(field, pattern)
        .limit(candidateLimit),
    )
  }

  const results = await Promise.all(queries)
  const merged = []
  for (const res of results) {
    merged.push(...assertFilteredQuery(res, 'partes(ph)'))
  }
  return dedupeById(merged)
}

/**
 * Rankea candidatos ya filtrados por Supabase (no descarga tablas).
 */
function searchActivos(activosEnriched, qRaw, limit) {
  const qNorm = normalizeQueryText(qRaw)
  const qSerieExact = String(qRaw || '')
    .trim()
    .toUpperCase()
  const out = []

  for (const a of activosEnriched || []) {
    const serie = String(a.numero_serie || '').trim()
    const serieU = serie.toUpperCase()
    const fields = [
      a.numero_serie,
      a.codigo_interno,
      a.descripcion,
      a.ubicacion,
      a.ubicacion_efectiva,
      a.marca,
    ]
    let rank = bestRank(fields, qNorm)
    if (serieU && serieU === qSerieExact) rank = -1
    if (rank >= 999) continue

    const membership = a.pertenencia_actual || null
    const manifold = membership?.manifold || null
    const ubicacionPropia = a.ubicacion ?? null
    const ubicacionEf =
      a.ubicacion_efectiva ??
      ubicacionEfectiva(a, manifold) ??
      ubicacionPropia

    const pertenenciaOut = membership
      ? {
          conjunto_id: membership.conjunto_id,
          numero_serie: manifold?.numero_serie ?? null,
          descripcion: manifold?.descripcion ?? null,
          ubicacion: manifold?.ubicacion ?? null,
        }
      : null

    const estadoRevision = normalizeEstadoRevision(a.estado_revision)
    out.push({
      _rank: rank,
      tipo: 'activo',
      id: a.id,
      titulo: serie || String(a.id),
      subtitulo: a.descripcion || '',
      es_conjunto: a.es_conjunto === true,
      es_componente: a.es_componente === true || Boolean(membership),
      activo: a.activo === true,
      estado_revision: estadoRevision,
      estado: a.estado ?? null,
      ubicacion_propia: ubicacionPropia,
      ubicacion_efectiva: ubicacionEf,
      pertenencia_actual: pertenenciaOut,
      url_destino: urlDestinoActivo({
        id: a.id,
        estado_revision: estadoRevision,
      }),
    })
  }

  return sortByRankThenTitle(out).slice(0, limit).map(stripRank)
}

function searchPartesOperativos(partes, qRaw, limit, buildPdfUrl) {
  const qNorm = normalizeQueryText(qRaw)
  const qTrim = String(qRaw || '').trim()
  const out = []

  for (const p of partes || []) {
    const numero = p.numero_parte
    const fields = [
      numero != null ? String(numero) : '',
      p.pozo,
      p.operadora,
      p.yacimiento,
    ]
    let rank = bestRank(fields, qNorm)
    if (numero != null && String(numero) === qTrim) rank = -1
    if (rank >= 999) continue

    const pdfPath =
      typeof p.pdf_path === 'string' && p.pdf_path.trim()
        ? p.pdf_path.trim()
        : null
    const pdf_url =
      p.pdf_url ||
      (pdfPath && typeof buildPdfUrl === 'function' ? buildPdfUrl(pdfPath) : null)

    out.push({
      _rank: rank,
      tipo: 'parte_operativo',
      id: p.id,
      numero_parte: numero,
      titulo: `Parte ${numero != null ? numero : p.id}`,
      fecha: p.fecha ? String(p.fecha).slice(0, 10) : null,
      pozo: p.pozo ?? null,
      operadora: p.operadora ?? null,
      yacimiento: p.yacimiento ?? null,
      estado: p.estado ?? null,
      pdf_url: pdf_url || null,
      url_destino: `/operador/partes-operativos/${encodeURIComponent(String(p.id))}`,
    })
  }

  return sortByRankThenTitle(out).slice(0, limit).map(stripRank)
}

function searchReportesPh(reportes, qRaw, limit, buildPdfUrl) {
  const qNorm = normalizeQueryText(qRaw)
  const qTrim = String(qRaw || '').trim()
  const out = []

  for (const r of reportes || []) {
    const num = r.reporte_numero
    const fields = [
      num != null ? String(num) : '',
      r.cliente,
      r.pozo,
      r.elemento_ensayar,
    ]
    let rank = bestRank(fields, qNorm)
    if (num != null && String(num) === qTrim) rank = -1
    if (rank >= 999) continue

    const pdfPath =
      typeof r.reporte_pdf_path === 'string' && r.reporte_pdf_path.trim()
        ? r.reporte_pdf_path.trim()
        : null
    const pdf_url =
      pdfPath && typeof buildPdfUrl === 'function' ? buildPdfUrl(pdfPath) : null

    out.push({
      _rank: rank,
      tipo: 'reporte_ph',
      id: r.id,
      reporte_numero: num ?? null,
      titulo: num != null ? `Reporte PH ${num}` : `Reporte PH ${r.id}`,
      fecha: r.fecha ? String(r.fecha).slice(0, 10) : null,
      cliente: r.cliente ?? null,
      pozo: r.pozo ?? null,
      elemento_ensayar: r.elemento_ensayar ?? null,
      pdf_url: pdf_url || null,
      url_destino: `/coordinador/reportes-ph/${encodeURIComponent(String(r.id))}`,
    })
  }

  return sortByRankThenTitle(out).slice(0, limit).map(stripRank)
}

function buildGroupedResponse(query, grupos) {
  const activos = grupos.activos || []
  const partes = grupos.partes_operativos || []
  const ph = grupos.reportes_ph || []
  return {
    ok: true,
    query,
    total: activos.length + partes.length + ph.length,
    resultados: {
      activos,
      partes_operativos: partes,
      reportes_ph: ph,
    },
  }
}

function resolvePartePdfPath(parte) {
  if (!parte) return null
  const candidates = [
    parte.pdf_path,
    parte.reporte_pdf_path,
    parte.parte_pdf_path,
    parte.parte_operativo_pdf_path,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Orquestación completa (usada por la ruta y por tests con mock Supabase).
 */
async function executeBusquedaGlobal({
  supabase,
  q,
  limit,
  buildPublicPdfUrl,
}) {
  const [activosRows, partesRows, phRows] = await Promise.all([
    fetchActivosCandidatos(supabase, q, limit),
    fetchPartesOperativosCandidatos(supabase, q, limit),
    fetchReportesPhCandidatos(supabase, q, limit),
  ])

  const { relaciones, manifoldsById } = await loadPertenenciasActivasBatch(
    supabase,
    activosRows.map((a) => a.id),
  )
  const enriched = enrichActivosConPertenencia(
    activosRows,
    relaciones,
    manifoldsById,
  ).map((a) => ({
    ...a,
    ubicacion_efectiva: ubicacionEfectiva(
      a,
      a.pertenencia_actual?.manifold || null,
    ),
  }))

  const buildPdf = (path) =>
    typeof buildPublicPdfUrl === 'function' ? buildPublicPdfUrl(path) : null

  const partesMapped = (partesRows || []).map((p) => {
    const pdf_path = resolvePartePdfPath(p)
    return {
      ...p,
      pdf_path,
      pdf_url: buildPdf(pdf_path),
    }
  })

  return buildGroupedResponse(q, {
    activos: searchActivos(enriched, q, limit),
    partes_operativos: searchPartesOperativos(
      partesMapped,
      q,
      limit,
      buildPdf,
    ),
    reportes_ph: searchReportesPh(phRows || [], q, limit, buildPdf),
  })
}

function registerBusquedaGlobalRoutes({ app, supabase, buildPublicPdfUrl }) {
  app.get('/busqueda-global', async (req, res) => {
    try {
      const validated = validateBusquedaGlobalQuery(req.query.q, req.query.limit)
      if (!validated.ok) {
        return res.status(validated.status).json({
          ok: false,
          code: validated.code,
          error: validated.error,
        })
      }
      const { q, limit } = validated
      const payload = await executeBusquedaGlobal({
        supabase,
        q,
        limit,
        buildPublicPdfUrl,
      })
      return res.json(payload)
    } catch (error) {
      console.error('Error GET /busqueda-global:', error)
      return res.status(500).json({
        ok: false,
        error: error.message || 'Error en búsqueda global',
      })
    }
  })
}

module.exports = {
  registerBusquedaGlobalRoutes,
  executeBusquedaGlobal,
  validateBusquedaGlobalQuery,
  normalizeQueryText,
  isNumericQuery,
  escapeIlikePattern,
  containsIlikePattern,
  candidateLimitFor,
  dedupeById,
  rankField,
  bestRank,
  searchActivos,
  searchPartesOperativos,
  searchReportesPh,
  buildGroupedResponse,
  resolvePartePdfPath,
  fetchActivosCandidatos,
  fetchPartesOperativosCandidatos,
  fetchReportesPhCandidatos,
  urlDestinoActivo,
  normalizeEstadoRevision,
  ACTIVO_ILIKE_FIELDS,
  PARTE_ILIKE_FIELDS,
  PH_ILIKE_FIELDS,
}
