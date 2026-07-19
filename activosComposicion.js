/**
 * Activos compuestos (manifolds): helpers + rutas.
 * No modifica Partes/PH ni ejecuta SQL.
 */

const {
  normalizeClientUuid,
  normalizeNumeroSerie,
} = require('./activosRelevamiento')

function optStr(v) {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
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
  if (membershipActiva && String(membershipActiva.conjunto_id) !== String(conjunto.id)) {
    return {
      ok: false,
      status: 409,
      code: 'COMPONENTE_EN_OTRO_CONJUNTO',
      error: 'El componente ya pertenece a otro manifold',
      details: {
        conjunto_id_actual: membershipActiva.conjunto_id,
        relacion_id: membershipActiva.id,
      },
    }
  }
  return { ok: true, alreadyMember: false }
}

function registerActivosComposicionRoutes({
  app,
  supabase,
  registrarMovimiento,
}) {
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
    return data || []
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

      res.json({
        ok: true,
        activo: {
          ...activo,
          es_conjunto: activo.es_conjunto === true,
          ubicacion_efectiva: ubicacionEfectiva(activo, manifoldOwn),
        },
        componentes_actuales: actuales,
        componentes_historial: historial,
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
      const conjuntoId = req.params.id
      const body = req.body || {}
      const componenteId = body.componente_id
      const posicion = optStr(body.posicion)
      const observaciones = optStr(body.observaciones)
      const clientUuid = normalizeClientUuid(body.client_uuid)
      const creadoPorUserId = normalizeClientUuid(body.creado_por_user_id)
      const usuario = optStr(body.usuario) || 'Administrador'

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
      const membershipActiva = await findMembershipActivaByComponente(componenteId)
      const mismoConjuntoAbierto =
        membershipActiva &&
        String(membershipActiva.conjunto_id) === String(conjuntoId)

      const validation = validateAddComponente({
        conjunto,
        componente,
        membershipActiva,
        mismoConjuntoAbierto,
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

      res.json({ ok: true, idempotent: false, relacion: data })
    } catch (error) {
      console.error('Error POST componentes:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- POST /activos/:id/componentes/:componenteId/retirar ----------
  app.post('/activos/:id/componentes/:componenteId/retirar', async (req, res) => {
    try {
      const conjuntoId = req.params.id
      const componenteId = req.params.componenteId
      const body = req.body || {}
      const observaciones = optStr(body.observaciones)
      const nuevaUbicacion = optStr(body.nueva_ubicacion)
      const usuario = optStr(body.usuario) || 'Administrador'

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

  return {
    enrichSeriePayload,
    validateAddComponente,
    ubicacionEfectiva,
  }
}

module.exports = {
  registerActivosComposicionRoutes,
  parseEsConjunto,
  validateAddComponente,
  ubicacionEfectiva,
  resumenActivo,
  resumenComponente,
  normalizeNumeroSerie,
  normalizeClientUuid,
}
