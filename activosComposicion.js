/**
 * Activos compuestos (manifolds): helpers + rutas.
 * No modifica Partes/PH ni ejecuta SQL.
 */

const {
  normalizeClientUuid,
  normalizeNumeroSerie,
  normalizeEstadoOperativo,
} = require('./activosRelevamiento')
const { isComposicionAuthRequired } = require('./authSession')

/** Valor canónico en DB (`chk_activos_estado`). */
const ESTADO_FUERA_DE_SERVICIO = 'fuera de servicio'
const ESTADO_OPERATIVO = 'operativo'

function optStr(v) {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function isFueraDeServicio(estado) {
  const n = normalizeEstadoOperativo(estado)
  return n === ESTADO_FUERA_DE_SERVICIO
}

function labelConjuntoIdentificacion(conjunto) {
  if (!conjunto) return 'desconocido'
  const serie = optStr(conjunto.numero_serie)
  const desc = optStr(conjunto.descripcion)
  if (serie) return serie
  if (desc) return desc
  return String(conjunto.id)
}

/**
 * Disponibilidad para vincular (separada del estado operativo).
 * @returns {{
 *   disponible: boolean,
 *   motivo?: string,
 *   code?: string,
 *   mensaje?: string,
 *   puede_traspaso?: boolean,
 *   conjunto_origen_id?: string|number,
 *   conjunto_origen_label?: string,
 * }}
 */
function assessDisponibilidadVinculacion({
  componente,
  membershipActiva,
  conjuntoOrigen,
  conjuntoDestinoId,
}) {
  if (!componente) {
    return {
      disponible: false,
      motivo: 'no_encontrado',
      code: 'COMPONENTE_NO_ENCONTRADO',
      mensaje: 'Componente no encontrado',
    }
  }
  if (componente.es_conjunto === true) {
    return {
      disponible: false,
      motivo: 'es_conjunto',
      code: 'CONJUNTO_EN_CONJUNTO',
      mensaje: 'Un conjunto no puede vincularse como activo.',
    }
  }
  if (isFueraDeServicio(componente.estado)) {
    return {
      disponible: false,
      motivo: 'fuera_de_servicio',
      code: 'COMPONENTE_FUERA_DE_SERVICIO',
      mensaje:
        'Este activo está fuera de servicio y no puede vincularse. ' +
        'Primero debe cambiarse su estado.',
    }
  }
  if (membershipActiva) {
    const origenId = membershipActiva.conjunto_id
    const mismoDestino =
      conjuntoDestinoId != null &&
      String(origenId) === String(conjuntoDestinoId)
    if (mismoDestino) {
      return {
        disponible: false,
        motivo: 'ya_en_destino',
        code: 'YA_EN_CONJUNTO',
        mensaje: 'El activo ya está vinculado a este conjunto.',
        conjunto_origen_id: origenId,
        conjunto_origen_label: labelConjuntoIdentificacion(conjuntoOrigen),
      }
    }
    const label = labelConjuntoIdentificacion(conjuntoOrigen) || String(origenId)
    return {
      disponible: false,
      motivo: 'en_otro_conjunto',
      code: 'COMPONENTE_EN_OTRO_CONJUNTO',
      mensaje:
        `Este activo ya pertenece al conjunto ${label}. ` +
        'Para cambiarlo de conjunto debe realizar un traspaso.',
      puede_traspaso: true,
      conjunto_origen_id: origenId,
      conjunto_origen_label: label,
    }
  }
  return { disponible: true }
}

/**
 * Detecta inconsistencia: conjunto operativo con algún componente fuera de servicio.
 */
function findInconsistenciasConjuntoOperativo(conjunto, componentesActuales) {
  if (!conjunto || !isEstadoOperativo(conjunto.estado)) return []
  const out = []
  for (const row of componentesActuales || []) {
    const comp = row.componente || row
    if (!comp) continue
    if (isFueraDeServicio(comp.estado)) {
      out.push({
        componente_id: comp.id,
        numero_serie: comp.numero_serie ?? null,
        descripcion: comp.descripcion ?? null,
        estado: comp.estado,
        mensaje:
          `El conjunto está Operativo pero el activo ` +
          `${comp.numero_serie || comp.id} está Fuera de servicio.`,
      })
    }
  }
  return out
}

function isEstadoOperativo(estado) {
  return normalizeEstadoOperativo(estado) === ESTADO_OPERATIVO
}
function parseEsConjunto(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  const s = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'si', 'sí'].includes(s)) return true
  if (['false', '0', 'no'].includes(s)) return false
  return null
}

function resumenActivo(row) {
  if (!row) return null
  return {
    id: row.id,
    numero_serie: row.numero_serie ?? null,
    descripcion: row.descripcion ?? null,
    categoria: row.categoria ?? null,
    estado: row.estado ?? null,
    ubicacion: row.ubicacion ?? null,
    activo: row.activo ?? null,
    estado_revision: row.estado_revision ?? null,
    es_conjunto: row.es_conjunto === true,
  }
}

function resumenComponente(row) {
  if (!row) return null
  return {
    id: row.id,
    numero_serie: row.numero_serie ?? null,
    descripcion: row.descripcion ?? null,
    categoria: row.categoria ?? null,
    estado: row.estado ?? null,
    ubicacion: row.ubicacion ?? null,
  }
}

/**
 * Pertenencia activa para listado GET /activos (campos reducidos del manifold).
 */
function mapPertenenciaActualListado(rel, manifold) {
  if (!rel) return null
  return {
    relacion_id: rel.id,
    conjunto_id: rel.conjunto_id,
    posicion: rel.posicion ?? null,
    fecha_desde: rel.fecha_desde ?? null,
    manifold: manifold
      ? {
          id: manifold.id,
          numero_serie: manifold.numero_serie ?? null,
          descripcion: manifold.descripcion ?? null,
          ubicacion: manifold.ubicacion ?? null,
        }
      : null,
  }
}

/**
 * Enriquece una lista de activos con es_componente + pertenencia_actual.
 * relacionesActivas: filas activo_componentes con fecha_hasta IS NULL.
 * manifoldsById: Map id→{id, numero_serie, descripcion, ubicacion}
 * No muta el array de entrada.
 */
function enrichActivosConPertenencia(activos, relacionesActivas, manifoldsById) {
  const byComp = new Map()
  for (const r of relacionesActivas || []) {
    byComp.set(String(r.componente_id), r)
  }
  const mans = manifoldsById instanceof Map ? manifoldsById : new Map()

  return (activos || []).map((a) => {
    const rel = byComp.get(String(a.id)) || null
    const manifold = rel ? mans.get(String(rel.conjunto_id)) || null : null
    return {
      ...a,
      es_conjunto: a.es_conjunto === true,
      es_componente: Boolean(rel),
      pertenencia_actual: mapPertenenciaActualListado(rel, manifold),
    }
  })
}

/**
 * Carga en lote pertenencias activas de una lista de ids de activos.
 * 1 query relaciones + 1 query manifolds (si hay). Cero N+1.
 */
async function loadPertenenciasActivasBatch(supabase, activoIds) {
  const ids = [...new Set((activoIds || []).map((x) => String(x)))].filter(Boolean)
  if (ids.length === 0) {
    return { relaciones: [], manifoldsById: new Map() }
  }

  const { data: relaciones, error } = await supabase
    .from('activo_componentes')
    .select('id, conjunto_id, componente_id, posicion, fecha_desde, fecha_hasta')
    .in('componente_id', ids)
    .is('fecha_hasta', null)
  if (error) throw error

  const rels = relaciones || []
  const conjuntoIds = [
    ...new Set(rels.map((r) => String(r.conjunto_id)).filter(Boolean)),
  ]
  const manifoldsById = new Map()
  if (conjuntoIds.length === 0) {
    return { relaciones: rels, manifoldsById }
  }

  const { data: mans, error: errMan } = await supabase
    .from('activos')
    .select('id, numero_serie, descripcion, ubicacion')
    .in('id', conjuntoIds)
  if (errMan) throw errMan
  for (const m of mans || []) {
    manifoldsById.set(String(m.id), m)
  }
  return { relaciones: rels, manifoldsById }
}

/**
 * Ubicación efectiva: si pertenece a un manifold abierto, usa la del manifold.
 * No muta la ubicación persistida del componente.
 */
function ubicacionEfectiva(activo, manifoldActual) {
  if (manifoldActual && manifoldActual.ubicacion != null && String(manifoldActual.ubicacion).trim() !== '') {
    return manifoldActual.ubicacion
  }
  return activo?.ubicacion ?? null
}

/**
 * Valida reglas de negocio antes de agregar un componente.
 * @returns {{ ok: true } | { ok: false, status: number, code?: string, error: string, details?: object }}
 */
function validateAddComponente({
  conjunto,
  componente,
  membershipActiva,
  mismoConjuntoAbierto,
  conjuntoOrigen,
}) {
  if (!conjunto) {
    return { ok: false, status: 404, error: 'Conjunto/manifold no encontrado' }
  }
  if (!componente) {
    return { ok: false, status: 404, error: 'Componente no encontrado' }
  }
  if (String(conjunto.id) === String(componente.id)) {
    return {
      ok: false,
      status: 400,
      code: 'MISMO_ACTIVO',
      error: 'Un activo no puede ser componente de sí mismo',
    }
  }
  if (conjunto.es_conjunto !== true) {
    return {
      ok: false,
      status: 400,
      code: 'NO_ES_CONJUNTO',
      error: 'El activo destino no es un conjunto (es_conjunto=false)',
    }
  }
  if (componente.es_conjunto === true) {
    return {
      ok: false,
      status: 400,
      code: 'CONJUNTO_EN_CONJUNTO',
      error: 'No se puede agregar un conjunto dentro de otro conjunto',
    }
  }
  if (mismoConjuntoAbierto) {
    return {
      ok: true,
      alreadyMember: true,
    }
  }

  // Fuera de servicio: bloqueo obligatorio (también en traspaso se revalida).
  if (isFueraDeServicio(componente.estado)) {
    return {
      ok: false,
      status: 409,
      code: 'COMPONENTE_FUERA_DE_SERVICIO',
      error:
        'Este activo está fuera de servicio y no puede vincularse. ' +
        'Primero debe cambiarse su estado.',
    }
  }

  if (membershipActiva && String(membershipActiva.conjunto_id) !== String(conjunto.id)) {
    const label =
      labelConjuntoIdentificacion(conjuntoOrigen) ||
      String(membershipActiva.conjunto_id)
    return {
      ok: false,
      status: 409,
      code: 'COMPONENTE_EN_OTRO_CONJUNTO',
      error:
        `Este activo ya pertenece al conjunto ${label}. ` +
        'Para cambiarlo de conjunto debe realizar un traspaso.',
      details: {
        conjunto_id_actual: membershipActiva.conjunto_id,
        relacion_id: membershipActiva.id,
        conjunto_origen_label: label,
        puede_traspaso: true,
        conjunto_origen: conjuntoOrigen
          ? {
              id: conjuntoOrigen.id,
              numero_serie: conjuntoOrigen.numero_serie ?? null,
              descripcion: conjuntoOrigen.descripcion ?? null,
              estado: conjuntoOrigen.estado ?? null,
            }
          : null,
      },
    }
  }
  return { ok: true, alreadyMember: false }
}

/**
 * Valida un traspaso entre conjuntos (sin mutar).
 */
function validateTraspaso({
  componente,
  origen,
  destino,
  membershipActiva,
  conjuntoOrigenIdInformado,
}) {
  if (!componente) {
    return { ok: false, status: 404, code: 'COMPONENTE_NO_ENCONTRADO', error: 'Activo no encontrado' }
  }
  if (!origen) {
    return { ok: false, status: 404, code: 'ORIGEN_NO_ENCONTRADO', error: 'Conjunto de origen no encontrado' }
  }
  if (!destino) {
    return { ok: false, status: 404, code: 'DESTINO_NO_ENCONTRADO', error: 'Conjunto de destino no encontrado' }
  }
  if (componente.es_conjunto === true) {
    return {
      ok: false,
      status: 400,
      code: 'CONJUNTO_EN_CONJUNTO',
      error: 'No se puede traspasar un conjunto como si fuera un activo',
    }
  }
  if (origen.es_conjunto !== true || destino.es_conjunto !== true) {
    return {
      ok: false,
      status: 400,
      code: 'NO_ES_CONJUNTO',
      error: 'Origen y destino deben ser conjuntos (es_conjunto=true)',
    }
  }
  if (String(origen.id) === String(destino.id)) {
    return {
      ok: false,
      status: 400,
      code: 'MISMO_CONJUNTO',
      error: 'El conjunto de origen y destino deben ser distintos',
    }
  }
  if (isFueraDeServicio(componente.estado)) {
    return {
      ok: false,
      status: 409,
      code: 'COMPONENTE_FUERA_DE_SERVICIO',
      error:
        'Este activo está fuera de servicio y no puede vincularse. ' +
        'Primero debe cambiarse su estado.',
    }
  }
  if (isFueraDeServicio(destino.estado)) {
    return {
      ok: false,
      status: 409,
      code: 'DESTINO_FUERA_DE_SERVICIO',
      error:
        'El conjunto de destino está fuera de servicio y no puede recibir activos.',
    }
  }
  if (!membershipActiva) {
    return {
      ok: false,
      status: 409,
      code: 'SIN_PERTENENCIA',
      error: 'El activo no pertenece actualmente a ningún conjunto',
    }
  }
  if (String(membershipActiva.conjunto_id) !== String(origen.id)) {
    return {
      ok: false,
      status: 409,
      code: 'ORIGEN_DESACTUALIZADO',
      error:
        'El activo ya no pertenece al conjunto de origen indicado. ' +
        'Actualizá los datos e intentá de nuevo.',
      details: { conjunto_id_actual: membershipActiva.conjunto_id },
    }
  }
  if (
    conjuntoOrigenIdInformado != null &&
    String(conjuntoOrigenIdInformado) !== String(origen.id)
  ) {
    return {
      ok: false,
      status: 409,
      code: 'ORIGEN_DESACTUALIZADO',
      error:
        'El conjunto de origen informado no coincide con la vinculación vigente.',
      details: { conjunto_id_actual: membershipActiva.conjunto_id },
    }
  }
  return { ok: true }
}

function registerActivosComposicionRoutes({
  app,
  supabase,
  registrarMovimiento,
  auth,
  authDisplayName,
}) {
  if (!auth || typeof auth.requireComposicionWrite !== 'function') {
    throw new Error(
      'registerActivosComposicionRoutes: auth.requireComposicionWrite es obligatorio',
    )
  }
  const displayName =
    typeof authDisplayName === 'function'
      ? authDisplayName
      : (u) => (u && (u.nombre || u.usuario)) || 'Sistema'

  const bucketActivos = process.env.BUCKET_ACTIVOS || 'activos'
  const signedTtl = (() => {
    const n = Number(process.env.ADJUNTOS_SIGNED_URL_TTL_SECONDS)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3600
  })()

  /** Misma mecánica que GET /activos/:id/adjuntos (url_firmada, sin exponer path crudo). */
  async function withSignedUrls(adjuntos) {
    const out = []
    for (const adj of adjuntos || []) {
      const row = { ...adj, url_publica: null, url_firmada: null }
      if (adj.storage_path) {
        const { data, error } = await supabase.storage
          .from(bucketActivos)
          .createSignedUrl(adj.storage_path, signedTtl)
        if (!error && data?.signedUrl) {
          row.url_firmada = data.signedUrl
        }
      }
      out.push(row)
    }
    return out
  }

  async function getActivoById(id) {
    const { data, error } = await supabase
      .from('activos')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  async function findMembershipActivaByComponente(componenteId) {
    const { data, error } = await supabase
      .from('activo_componentes')
      .select('*')
      .eq('componente_id', componenteId)
      .is('fecha_hasta', null)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  async function findRelacionByClientUuid(clientUuid) {
    const { data, error } = await supabase
      .from('activo_componentes')
      .select('*')
      .eq('client_uuid', clientUuid)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  async function loadManifoldForMembership(membership) {
    if (!membership) return null
    return getActivoById(membership.conjunto_id)
  }

  async function listComponentesDeConjunto(conjuntoId) {
    const { data, error } = await supabase
      .from('activo_componentes')
      .select('*')
      .eq('conjunto_id', conjuntoId)
      .order('fecha_desde', { ascending: false })
    if (error) throw error
    return data || []
  }

  async function loadActivosByIds(ids) {
    const unique = [...new Set((ids || []).map((x) => String(x)))].filter(Boolean)
    if (unique.length === 0) return new Map()
    const { data, error } = await supabase
      .from('activos')
      .select(
        'id, numero_serie, descripcion, categoria, estado, ubicacion, activo, estado_revision, es_conjunto',
      )
      .in('id', unique)
    if (error) throw error
    const map = new Map()
    for (const row of data || []) map.set(String(row.id), row)
    return map
  }

  async function listAdjuntos(activoId) {
    const { data, error } = await supabase
      .from('activo_adjuntos')
      .select(
        'id, activo_id, tipo, storage_path, mime_type, tamano_bytes, orden, client_uuid, created_at',
      )
      .eq('activo_id', activoId)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return withSignedUrls(data || [])
  }

  async function enrichSeriePayload(activo) {
    const membership = await findMembershipActivaByComponente(activo.id)
    const manifold = await loadManifoldForMembership(membership)
    const ubicacion_efectiva = ubicacionEfectiva(activo, manifold)

    const base = {
      ...activo,
      es_conjunto: activo.es_conjunto === true,
      ubicacion_efectiva,
    }

    if (activo.es_conjunto === true) {
      const relaciones = await listComponentesDeConjunto(activo.id)
      const actuales = relaciones.filter((r) => r.fecha_hasta == null)
      const comps = await loadActivosByIds(actuales.map((r) => r.componente_id))
      return {
        ok: true,
        activo: base,
        composicion: {
          componentes_actuales_count: actuales.length,
          resumen: actuales.map((r) => ({
            relacion_id: r.id,
            posicion: r.posicion,
            fecha_desde: r.fecha_desde,
            componente: resumenComponente(comps.get(String(r.componente_id))),
          })),
        },
        pertenencia: null,
      }
    }

    return {
      ok: true,
      activo: base,
      composicion: null,
      pertenencia: membership
        ? {
            fecha_desde: membership.fecha_desde,
            posicion: membership.posicion,
            observaciones: membership.observaciones,
            manifold: resumenActivo(manifold),
          }
        : null,
    }
  }

  // Expuesto para que index.js pueda enriquecer GET /activos/serie/:n
  app.locals.enrichActivoSerieLookup = enrichSeriePayload

  // ---------- GET /activos/:id/composicion ----------
  app.get('/activos/:id/composicion', async (req, res) => {
    try {
      const activo = await getActivoById(req.params.id)
      if (!activo) {
        return res.status(404).json({ ok: false, error: 'Activo no encontrado' })
      }

      const membership = await findMembershipActivaByComponente(activo.id)
      const manifoldOwn = await loadManifoldForMembership(membership)
      const adjuntos = await listAdjuntos(activo.id)

      const relaciones = await listComponentesDeConjunto(activo.id)
      const ids = relaciones.map((r) => r.componente_id)
      const comps = await loadActivosByIds(ids)

      const mapRel = (r) => {
        const comp = comps.get(String(r.componente_id))
        return {
          id: r.id,
          conjunto_id: r.conjunto_id,
          componente_id: r.componente_id,
          posicion: r.posicion,
          observaciones: r.observaciones,
          fecha_desde: r.fecha_desde,
          fecha_hasta: r.fecha_hasta,
          client_uuid: r.client_uuid,
          componente: resumenComponente(comp),
          ubicacion_efectiva: ubicacionEfectiva(comp, activo.es_conjunto ? activo : null),
        }
      }

      const actuales = relaciones.filter((r) => r.fecha_hasta == null).map(mapRel)
      const historial = relaciones.filter((r) => r.fecha_hasta != null).map(mapRel)
      const inconsistencias_estado = findInconsistenciasConjuntoOperativo(
        activo,
        actuales,
      )

      res.json({
        ok: true,
        activo: {
          ...activo,
          es_conjunto: activo.es_conjunto === true,
          ubicacion_efectiva: ubicacionEfectiva(activo, manifoldOwn),
        },
        componentes_actuales: actuales,
        componentes_historial: historial,
        inconsistencias_estado,
        adjuntos,
      })
    } catch (error) {
      console.error('Error GET composicion:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- GET /activos/:id/pertenencia ----------
  app.get('/activos/:id/pertenencia', async (req, res) => {
    try {
      const activo = await getActivoById(req.params.id)
      if (!activo) {
        return res.status(404).json({ ok: false, error: 'Activo no encontrado' })
      }

      const { data: historialRows, error } = await supabase
        .from('activo_componentes')
        .select('*')
        .eq('componente_id', activo.id)
        .order('fecha_desde', { ascending: false })
      if (error) throw error

      const rows = historialRows || []
      const conjuntos = await loadActivosByIds(rows.map((r) => r.conjunto_id))
      const actual = rows.find((r) => r.fecha_hasta == null) || null
      const manifoldActual = actual
        ? conjuntos.get(String(actual.conjunto_id))
        : null

      res.json({
        ok: true,
        activo: {
          ...activo,
          es_conjunto: activo.es_conjunto === true,
          ubicacion_efectiva: ubicacionEfectiva(activo, manifoldActual),
        },
        pertenencia_actual: actual
          ? {
              relacion_id: actual.id,
              conjunto_id: actual.conjunto_id,
              posicion: actual.posicion,
              observaciones: actual.observaciones,
              fecha_desde: actual.fecha_desde,
              manifold: resumenActivo(manifoldActual),
            }
          : null,
        historial: rows.map((r) => ({
          relacion_id: r.id,
          conjunto_id: r.conjunto_id,
          posicion: r.posicion,
          observaciones: r.observaciones,
          fecha_desde: r.fecha_desde,
          fecha_hasta: r.fecha_hasta,
          manifold: resumenActivo(conjuntos.get(String(r.conjunto_id))),
        })),
      })
    } catch (error) {
      console.error('Error GET pertenencia:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- POST /activos/:id/componentes ----------
  app.post('/activos/:id/componentes', async (req, res) => {
    try {
      const requireAuth = isComposicionAuthRequired()

      const authTrial = await auth.tryAuthenticateRequest(req)
      let authUser = authTrial.user || null
      let usedCompatSinBearer = false

      if (authUser) {
        req.authUser = authUser
      } else if (authTrial.code && authTrial.code !== 'SESSION_REQUIRED') {
        // Token presente pero inválido / usuario inactivo / etc.
        auth.sendAuthFailure(res, authTrial.code, authTrial.httpStatus)
        return
      } else if (requireAuth) {
        auth.sendAuthFailure(res, 'SESSION_REQUIRED')
        return
      }

      const conjuntoId = req.params.id
      const body = req.body || {}
      const componenteId = body.componente_id
      const posicion = optStr(body.posicion)
      const observaciones = optStr(body.observaciones)
      const clientUuid = normalizeClientUuid(body.client_uuid)

      if (componenteId == null || String(componenteId).trim() === '') {
        return res.status(400).json({
          ok: false,
          error: 'componente_id es obligatorio',
        })
      }

      if (clientUuid) {
        const byUuid = await findRelacionByClientUuid(clientUuid)
        if (byUuid) {
          return res.json({
            ok: true,
            idempotent: true,
            relacion: byUuid,
          })
        }
      }

      const conjunto = await getActivoById(conjuntoId)
      const componente = await getActivoById(componenteId)
      const revision = String(componente?.estado_revision || '')
        .trim()
        .toLowerCase()

      let creadoPorUserId = null
      let usuario = 'Sistema'

      if (!authUser) {
        // Compat temporal: solo relevamientos pendientes, sin confiar en body.
        if (revision !== 'pendiente') {
          auth.sendAuthFailure(res, 'SESSION_REQUIRED')
          return
        }
        usedCompatSinBearer = true
        usuario = 'compatibilidad_apk'
        creadoPorUserId = null
        console.info(
          '[composicion] compat temporal sin Bearer (APP_COMPOSICION_REQUIRE_AUTH=false)',
          {
            code: 'COMPOSICION_AUTH_COMPAT',
            conjunto_id: String(conjuntoId),
            componente_id: String(componenteId),
            estado_revision: revision,
          },
        )
      } else {
        // Identidad desde sesión verificada (ignora body.usuario / creado_por).
        creadoPorUserId = authUser.id
        usuario = displayName(authUser)
        const rol = String(authUser.rol || '').toLowerCase()
        const puedeEscribirComposicion =
          rol === 'supervisor' || rol === 'coordinador' || rol === 'admin'
        if (!puedeEscribirComposicion) {
          if (rol !== 'operador' || revision !== 'pendiente') {
            return res.status(403).json({
              ok: false,
              error: 'No tenés permiso para realizar esta operación.',
              code: 'FORBIDDEN_ROLE',
            })
          }
        }
      }

      const membershipActiva = await findMembershipActivaByComponente(componenteId)
      const mismoConjuntoAbierto =
        membershipActiva &&
        String(membershipActiva.conjunto_id) === String(conjuntoId)
      const conjuntoOrigen =
        membershipActiva && !mismoConjuntoAbierto
          ? await getActivoById(membershipActiva.conjunto_id)
          : null

      const validation = validateAddComponente({
        conjunto,
        componente,
        membershipActiva,
        mismoConjuntoAbierto,
        conjuntoOrigen,
      })
      if (!validation.ok) {
        return res.status(validation.status).json({
          ok: false,
          error: validation.error,
          code: validation.code || undefined,
          ...(validation.details || {}),
        })
      }
      if (validation.alreadyMember) {
        return res.json({
          ok: true,
          idempotent: true,
          relacion: membershipActiva,
        })
      }

      const insertRow = {
        conjunto_id: Number(conjuntoId) || conjuntoId,
        componente_id: Number(componenteId) || componenteId,
        posicion,
        observaciones,
        fecha_desde: new Date().toISOString(),
        fecha_hasta: null,
      }
      if (clientUuid) insertRow.client_uuid = clientUuid
      if (creadoPorUserId) insertRow.creado_por_user_id = creadoPorUserId

      const { data, error } = await supabase
        .from('activo_componentes')
        .insert([insertRow])
        .select()
        .single()

      if (error) {
        // Carrera: unique membership / client_uuid
        if (clientUuid) {
          const again = await findRelacionByClientUuid(clientUuid)
          if (again) {
            return res.json({ ok: true, idempotent: true, relacion: again })
          }
        }
        const againMem = await findMembershipActivaByComponente(componenteId)
        if (againMem && String(againMem.conjunto_id) === String(conjuntoId)) {
          return res.json({ ok: true, idempotent: true, relacion: againMem })
        }
        if (againMem) {
          return res.status(409).json({
            ok: false,
            code: 'COMPONENTE_EN_OTRO_CONJUNTO',
            error: 'El componente ya pertenece a otro manifold',
            conjunto_id_actual: againMem.conjunto_id,
            relacion_id: againMem.id,
          })
        }
        throw error
      }

      await registrarMovimiento({
        activo_id: conjunto.id,
        tipo_movimiento: 'composicion_agregar',
        descripcion: `Componente ${componente.numero_serie || componente.id} agregado al manifold`,
        usuario,
        ubicacion_anterior: conjunto.ubicacion,
        ubicacion_nueva: conjunto.ubicacion,
        observaciones:
          observaciones ||
          `componente_id=${componente.id}; posicion=${posicion || ''}`,
      })
      await registrarMovimiento({
        activo_id: componente.id,
        tipo_movimiento: 'composicion_agregar',
        descripcion: `Agregado al manifold ${conjunto.numero_serie || conjunto.id}`,
        usuario,
        ubicacion_anterior: componente.ubicacion,
        ubicacion_nueva: componente.ubicacion,
        observaciones:
          `conjunto_id=${conjunto.id}; ubicacion_efectiva=${conjunto.ubicacion || ''}`,
      })

      res.json({
        ok: true,
        idempotent: false,
        relacion: data,
        ...(usedCompatSinBearer ? { auth_compat: true } : {}),
      })
    } catch (error) {
      console.error('Error POST componentes:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- POST /activos/:id/componentes/:componenteId/retirar ----------
  app.post('/activos/:id/componentes/:componenteId/retirar', async (req, res) => {
    try {
      const authUser = await auth.requireComposicionWrite(req, res)
      if (!authUser) return

      const conjuntoId = req.params.id
      const componenteId = req.params.componenteId
      const body = req.body || {}
      const observaciones = optStr(body.observaciones)
      const nuevaUbicacion = optStr(body.nueva_ubicacion)
      const usuario = displayName(authUser)

      const conjunto = await getActivoById(conjuntoId)
      const componente = await getActivoById(componenteId)
      if (!conjunto || !componente) {
        return res.status(404).json({ ok: false, error: 'Activo no encontrado' })
      }

      const { data: relaciones, error: errRel } = await supabase
        .from('activo_componentes')
        .select('*')
        .eq('conjunto_id', conjuntoId)
        .eq('componente_id', componenteId)
        .order('fecha_desde', { ascending: false })
      if (errRel) throw errRel

      const abierta = (relaciones || []).find((r) => r.fecha_hasta == null) || null
      const ultima = (relaciones || [])[0] || null

      if (!abierta) {
        return res.json({
          ok: true,
          idempotent: true,
          relacion: ultima,
          mensaje: 'La relación ya estaba cerrada',
        })
      }

      const now = new Date().toISOString()
      const { data: cerrada, error: errClose } = await supabase
        .from('activo_componentes')
        .update({
          fecha_hasta: now,
          observaciones: observaciones
            ? [abierta.observaciones, observaciones].filter(Boolean).join(' | ')
            : abierta.observaciones,
        })
        .eq('id', abierta.id)
        .select()
        .single()
      if (errClose) throw errClose

      let componenteActualizado = componente
      if (nuevaUbicacion) {
        const { data: upd, error: errUpd } = await supabase
          .from('activos')
          .update({
            ubicacion: nuevaUbicacion,
            updated_at: now,
          })
          .eq('id', componente.id)
          .select()
          .single()
        if (errUpd) throw errUpd
        componenteActualizado = upd
      }

      await registrarMovimiento({
        activo_id: conjunto.id,
        tipo_movimiento: 'composicion_retirar',
        descripcion: `Componente ${componente.numero_serie || componente.id} retirado del manifold`,
        usuario,
        ubicacion_anterior: conjunto.ubicacion,
        ubicacion_nueva: conjunto.ubicacion,
        observaciones: observaciones || `componente_id=${componente.id}`,
      })
      await registrarMovimiento({
        activo_id: componente.id,
        tipo_movimiento: 'composicion_retirar',
        descripcion: `Retirado del manifold ${conjunto.numero_serie || conjunto.id}`,
        usuario,
        ubicacion_anterior: componente.ubicacion,
        ubicacion_nueva: componenteActualizado.ubicacion,
        observaciones: observaciones || null,
      })

      res.json({
        ok: true,
        idempotent: false,
        relacion: cerrada,
        componente: componenteActualizado,
      })
    } catch (error) {
      console.error('Error retirar componente:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- POST /activos/:destinoId/componentes/:componenteId/traspaso ----------
  // Traspaso atómico (RPC si está aplicada la migración; fallback compensado).
  app.post(
    '/activos/:destinoId/componentes/:componenteId/traspaso',
    async (req, res) => {
      try {
        const authUser = await auth.requireComposicionWrite(req, res)
        if (!authUser) return

        const destinoId = req.params.destinoId
        const componenteId = req.params.componenteId
        const body = req.body || {}
        const origenIdInformado =
          body.conjunto_origen_id != null
            ? body.conjunto_origen_id
            : body.origen_conjunto_id
        const origenFuera =
          body.origen_fuera_de_servicio === true ||
          body.origen_fuera_de_servicio === 'true' ||
          body.origen_fuera_de_servicio === 1
        const observaciones = optStr(body.observaciones)
        const usuario = displayName(authUser)
        const clientUuid = normalizeClientUuid(body.client_uuid)
        const creadoPorUserId = authUser.id
        const origenOperacion = optStr(body.origen_operacion) || 'web'

        const componente = await getActivoById(componenteId)
        const destino = await getActivoById(destinoId)
        const membershipActiva =
          await findMembershipActivaByComponente(componenteId)
        const origen = membershipActiva
          ? await getActivoById(membershipActiva.conjunto_id)
          : origenIdInformado
            ? await getActivoById(origenIdInformado)
            : null

        const validation = validateTraspaso({
          componente,
          origen,
          destino,
          membershipActiva,
          conjuntoOrigenIdInformado: origenIdInformado,
        })
        if (!validation.ok) {
          return res.status(validation.status).json({
            ok: false,
            error: validation.error,
            code: validation.code || undefined,
            ...(validation.details || {}),
          })
        }

        if (clientUuid) {
          const byUuid = await findRelacionByClientUuid(clientUuid)
          if (byUuid) {
            const sameComp =
              String(byUuid.componente_id) === String(componenteId)
            const sameDest =
              String(byUuid.conjunto_id) === String(destinoId)
            const abierta = byUuid.fecha_hasta == null
            if (sameComp && sameDest && abierta) {
              return res.json({
                ok: true,
                idempotent: true,
                relacion: byUuid,
                historial_registrado: true,
              })
            }
            return res.status(409).json({
              ok: false,
              code: 'CLIENT_UUID_INCOMPATIBLE',
              error:
                'El client_uuid ya existe asociado a otra relación incompatible ' +
                '(otro componente, otro destino o relación cerrada).',
              relacion_existente: {
                id: byUuid.id,
                componente_id: byUuid.componente_id,
                conjunto_id: byUuid.conjunto_id,
                fecha_hasta: byUuid.fecha_hasta,
              },
            })
          }
        }

        const estadoOrigenAnterior = origen.estado
        const estadoOrigenNuevo = origenFuera
          ? ESTADO_FUERA_DE_SERVICIO
          : estadoOrigenAnterior

        // Preferir RPC atómica (migración 2026-08-01).
        let rpcUsed = false
        let relacionNueva = null
        let relacionCerrada = null
        let origenActualizado = origen
        let historialEnRpc = false

        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc(
            'traspasar_activo_entre_conjuntos',
            {
              p_componente_id: Number(componenteId) || componenteId,
              p_conjunto_origen_id: Number(origen.id) || origen.id,
              p_conjunto_destino_id: Number(destinoId) || destinoId,
              p_origen_fuera_de_servicio: origenFuera,
              p_observaciones: observaciones,
              p_client_uuid: clientUuid,
              p_creado_por_user_id: creadoPorUserId,
              p_usuario: usuario,
              p_origen_operacion: origenOperacion,
            },
          )
          if (!rpcErr && rpcData) {
            const parsed =
              typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData
            if (parsed && parsed.ok === false) {
              return res.status(parsed.status || 409).json({
                ok: false,
                error: parsed.error || 'No se pudo completar el traspaso',
                code: parsed.code,
                ...(parsed.relacion_existente
                  ? { relacion_existente: parsed.relacion_existente }
                  : {}),
                ...(parsed.conjunto_id_actual != null
                  ? { conjunto_id_actual: parsed.conjunto_id_actual }
                  : {}),
              })
            }
            rpcUsed = true
            relacionNueva = parsed?.relacion_nueva || parsed?.relacion || null
            relacionCerrada = parsed?.relacion_cerrada || null
            if (parsed?.conjunto_origen) origenActualizado = parsed.conjunto_origen
            historialEnRpc = parsed?.historial_registrado === true
          } else if (
            rpcErr &&
            !String(rpcErr.message || '').includes('Could not find the function')
          ) {
            const msg = rpcErr.message || 'Error en traspaso atómico'
            let code = 'TRASPASO_RECHAZADO'
            if (String(msg).includes('TRASPASO_CONFLICTO_UNICIDAD')) {
              code = 'TRASPASO_CONFLICTO_UNICIDAD'
            } else if (String(msg).includes('COMPONENTE_FUERA_DE_SERVICIO')) {
              code = 'COMPONENTE_FUERA_DE_SERVICIO'
            }
            return res.status(409).json({ ok: false, error: msg, code })
          }
        } catch (_) {
          // RPC no disponible: fallback compensado abajo.
        }

        if (!rpcUsed) {
          const now = new Date().toISOString()
          const { data: cerrada, error: errClose } = await supabase
            .from('activo_componentes')
            .update({
              fecha_hasta: now,
              observaciones: observaciones
                ? [membershipActiva.observaciones, observaciones]
                    .filter(Boolean)
                    .join(' | ')
                : membershipActiva.observaciones,
            })
            .eq('id', membershipActiva.id)
            .is('fecha_hasta', null)
            .select()
            .single()
          if (errClose || !cerrada) {
            return res.status(409).json({
              ok: false,
              code: 'ORIGEN_DESACTUALIZADO',
              error:
                'No se pudo desvincular del origen (vinculación cambió). ' +
                'No se aplicaron cambios.',
            })
          }
          relacionCerrada = cerrada

          const insertRow = {
            conjunto_id: Number(destinoId) || destinoId,
            componente_id: Number(componenteId) || componenteId,
            posicion: membershipActiva.posicion || null,
            observaciones:
              observaciones ||
              `Traspaso desde conjunto ${labelConjuntoIdentificacion(origen)}`,
            fecha_desde: now,
            fecha_hasta: null,
          }
          if (clientUuid) insertRow.client_uuid = clientUuid
          if (creadoPorUserId) insertRow.creado_por_user_id = creadoPorUserId

          const { data: nueva, error: errIns } = await supabase
            .from('activo_componentes')
            .insert([insertRow])
            .select()
            .single()

          if (errIns || !nueva) {
            // Compensar: reabrir origen.
            await supabase
              .from('activo_componentes')
              .update({ fecha_hasta: null })
              .eq('id', membershipActiva.id)
            const again = await findMembershipActivaByComponente(componenteId)
            if (again && String(again.conjunto_id) !== String(origen.id)) {
              return res.status(409).json({
                ok: false,
                code: 'COMPONENTE_EN_OTRO_CONJUNTO',
                error:
                  'Conflicto de concurrencia: el activo quedó en otro conjunto. ' +
                  'Revisá la pertenencia antes de reintentar.',
                conjunto_id_actual: again.conjunto_id,
              })
            }
            return res.status(409).json({
              ok: false,
              code: 'TRASPASO_ABORTADO',
              error:
                'No se pudo vincular al destino. Se revirtió la desvinculación del origen.',
            })
          }
          relacionNueva = nueva

          if (origenFuera && !isFueraDeServicio(origen.estado)) {
            const { data: updOrigen, error: errEst } = await supabase
              .from('activos')
              .update({
                estado: ESTADO_FUERA_DE_SERVICIO,
                updated_at: now,
              })
              .eq('id', origen.id)
              .select()
              .single()
            if (errEst) {
              // Compensar membresía: cerrar destino y reabrir origen.
              await supabase
                .from('activo_componentes')
                .update({ fecha_hasta: now })
                .eq('id', nueva.id)
              await supabase
                .from('activo_componentes')
                .update({ fecha_hasta: null })
                .eq('id', membershipActiva.id)
              return res.status(500).json({
                ok: false,
                code: 'TRASPASO_ABORTADO',
                error:
                  'Falló al actualizar el estado del conjunto de origen. ' +
                  'Se revirtieron los cambios de vinculación.',
              })
            }
            origenActualizado = updOrigen
          }
        }

        const labelOrigen = labelConjuntoIdentificacion(origen)
        const labelDestino = labelConjuntoIdentificacion(destino)
        const serieActivo = componente.numero_serie || componente.id

        if (!historialEnRpc) {
          await registrarMovimiento({
            activo_id: componente.id,
            tipo_movimiento: 'composicion_traspaso',
            descripcion: `Traspaso de ${labelOrigen} a ${labelDestino}`,
            usuario,
            estado_anterior: componente.estado,
            estado_nuevo: componente.estado,
            ubicacion_anterior: componente.ubicacion,
            ubicacion_nueva: componente.ubicacion,
            observaciones:
              `origen=${origen.id}; destino=${destino.id}; ` +
              `serie=${serieActivo}; canal=${origenOperacion}` +
              (observaciones ? `; ${observaciones}` : ''),
          })
          await registrarMovimiento({
            activo_id: origen.id,
            tipo_movimiento: 'composicion_traspaso',
            descripcion: `Activo ${serieActivo} salió por traspaso hacia ${labelDestino}`,
            usuario,
            estado_anterior: estadoOrigenAnterior,
            estado_nuevo: origenActualizado?.estado ?? estadoOrigenNuevo,
            ubicacion_anterior: origen.ubicacion,
            ubicacion_nueva: origen.ubicacion,
            observaciones: observaciones || `componente_id=${componente.id}`,
          })
          await registrarMovimiento({
            activo_id: destino.id,
            tipo_movimiento: 'composicion_traspaso',
            descripcion: `Activo ${serieActivo} ingresó por traspaso desde ${labelOrigen}`,
            usuario,
            ubicacion_anterior: destino.ubicacion,
            ubicacion_nueva: destino.ubicacion,
            observaciones: observaciones || `componente_id=${componente.id}`,
          })
        }

        res.json({
          ok: true,
          idempotent: false,
          atomico: rpcUsed,
          historial_registrado: historialEnRpc || !rpcUsed,
          relacion: relacionNueva,
          relacion_cerrada: relacionCerrada,
          componente: resumenActivo(componente),
          conjunto_origen: resumenActivo(origenActualizado),
          conjunto_destino: resumenActivo(destino),
          origen_estado_anterior: estadoOrigenAnterior,
          origen_estado_nuevo: origenActualizado?.estado ?? estadoOrigenNuevo,
        })
      } catch (error) {
        console.error('Error traspaso componente:', error)
        res.status(500).json({ ok: false, error: error.message })
      }
    },
  )

  return {
    enrichSeriePayload,
    validateAddComponente,
    validateTraspaso,
    ubicacionEfectiva,
  }
}

module.exports = {
  registerActivosComposicionRoutes,
  parseEsConjunto,
  validateAddComponente,
  validateTraspaso,
  assessDisponibilidadVinculacion,
  findInconsistenciasConjuntoOperativo,
  isFueraDeServicio,
  labelConjuntoIdentificacion,
  ubicacionEfectiva,
  resumenActivo,
  resumenComponente,
  enrichActivosConPertenencia,
  mapPertenenciaActualListado,
  loadPertenenciasActivasBatch,
  normalizeNumeroSerie,
  normalizeClientUuid,
  ESTADO_FUERA_DE_SERVICIO,
  ESTADO_OPERATIVO,
}
