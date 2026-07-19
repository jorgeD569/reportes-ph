/**
 * Relevamiento offline de activos: helpers + registro de rutas.
 * No modifica el motor de Partes/PH.
 */

const CATEGORIA_MAP = {
  unidad: 'unidad',
  wika: 'wika',
  linea: 'linea',
  herramienta: 'herramienta',
  seguridad: 'seguridad',
  otro: 'otro',
  'unidad ph': 'unidad',
  'sensor wika': 'wika',
  'línea / accesorio': 'linea',
  'linea / accesorio': 'linea',
  'línea': 'linea',
  'linea': 'linea',
  piletas: 'otro',
}

const ESTADOS_OPERATIVOS = new Set([
  'operativo',
  'fuera de servicio',
  'en reparacion',
  'vencido',
  'baja',
])

const ADJUNTO_TIPOS = new Set([
  'foto_general',
  'foto_placa',
  'certificado',
  'otro',
])

/** MIME permitidos (JPG/JPEG/PNG/PDF). */
const ADJUNTO_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

const ADJUNTO_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg', // alias no estándar que a veces envían clientes
  'image/png',
  'application/pdf',
])

/** Límites razonables de tamaño (bytes). */
const ADJUNTO_MAX_BYTES_IMAGE = 5 * 1024 * 1024 // 5 MB
const ADJUNTO_MAX_BYTES_PDF = 10 * 1024 * 1024 // 10 MB

/** TTL de URL firmada (segundos). Override: ADJUNTOS_SIGNED_URL_TTL_SECONDS */
const DEFAULT_SIGNED_URL_TTL = 3600

function normalizeClientUuid(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed
    )
  ) {
    return null
  }
  return trimmed.toLowerCase()
}

/** Normaliza número de serie: trim + UPPER (buscar, validar y guardar). */
function normalizeNumeroSerie(value) {
  if (value == null) return null
  const t = String(value).trim().toUpperCase()
  return t === '' ? null : t
}

function isUniqueViolation(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || error.details || '').toLowerCase()
  return (
    code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('client_uuid') ||
    msg.includes('numero_serie')
  )
}

function normalizeCategoria(raw) {
  if (raw == null) return null
  const key = String(raw).trim().toLowerCase()
  if (!key) return null
  if (CATEGORIA_MAP[key]) return CATEGORIA_MAP[key]
  if (['unidad', 'wika', 'linea', 'herramienta', 'seguridad', 'otro'].includes(key)) {
    return key
  }
  return null
}

function normalizeEstadoOperativo(raw) {
  if (raw == null || String(raw).trim() === '') return 'operativo'
  let s = String(raw).trim().toLowerCase().replace(/_/g, ' ')
  s = s.replace(/\s+/g, ' ')
  if (
    s === 'fuera de servicio' ||
    s === 'en reparacion' ||
    s === 'operativo' ||
    s === 'vencido' ||
    s === 'baja'
  ) {
    return s
  }
  if (ESTADOS_OPERATIVOS.has(s)) return s
  return null
}

function optStr(v) {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

/**
 * es_conjunto desde payload: solo boolean estricto.
 * Ausente → false. "true"/1/texto → inválido.
 */
function resolveEsConjuntoPayload(body) {
  const b = body || {}
  if (
    !Object.prototype.hasOwnProperty.call(b, 'es_conjunto') ||
    b.es_conjunto === undefined
  ) {
    return { ok: true, value: false }
  }
  if (typeof b.es_conjunto === 'boolean') {
    return { ok: true, value: b.es_conjunto }
  }
  return {
    ok: false,
    error: 'es_conjunto inválido: debe ser boolean true o false',
  }
}

/**
 * Flags forzados en altas desde Flutter (no confiar en el cliente).
 */
function flutterCreateFlags() {
  return {
    activo: false,
    estado_revision: 'pendiente',
  }
}

/**
 * Resuelve extensión y MIME canónico a partir de mime_type declarado.
 * No acepta nombres de archivo del cliente.
 * @returns {{ ok: true, ext: string, mime: string } | { ok: false, error: string }}
 */
function resolveAdjuntoMime(mimeRaw) {
  const raw = String(mimeRaw || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()

  if (!raw || !ADJUNTO_ALLOWED_MIMES.has(raw)) {
    return {
      ok: false,
      error:
        'Tipo de archivo no permitido. Solo JPG, JPEG, PNG o PDF.',
    }
  }

  if (raw === 'image/jpeg' || raw === 'image/jpg') {
    return { ok: true, ext: 'jpg', mime: 'image/jpeg' }
  }
  if (raw === 'image/png') {
    return { ok: true, ext: 'png', mime: 'image/png' }
  }
  if (raw === 'application/pdf') {
    return { ok: true, ext: 'pdf', mime: 'application/pdf' }
  }
  return {
    ok: false,
    error: 'Tipo de archivo no permitido. Solo JPG, JPEG, PNG o PDF.',
  }
}

function maxBytesForMime(mime) {
  return mime === 'application/pdf'
    ? ADJUNTO_MAX_BYTES_PDF
    : ADJUNTO_MAX_BYTES_IMAGE
}

function registerActivosRelevamientoRoutes({
  app,
  supabase,
  registrarMovimiento,
  base64ToBuffer,
}) {
  const bucketActivos = process.env.BUCKET_ACTIVOS || 'activos'
  const signedTtl = Math.max(
    60,
    Number(process.env.ADJUNTOS_SIGNED_URL_TTL_SECONDS) || DEFAULT_SIGNED_URL_TTL
  )

  async function findActivoByClientUuid(clientUuid) {
    const { data, error } = await supabase
      .from('activos')
      .select('*')
      .eq('client_uuid', clientUuid)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

  async function findActivoByNumeroSerie(numeroSerie) {
    const serie = normalizeNumeroSerie(numeroSerie)
    if (!serie) return null
    const { data, error } = await supabase
      .from('activos')
      .select('*')
      .not('numero_serie', 'is', null)
    if (error) throw error
    return (
      (data || []).find(
        (row) => normalizeNumeroSerie(row.numero_serie) === serie
      ) || null
    )
  }

  async function findAdjuntoByClientUuid(clientUuid) {
    const { data, error } = await supabase
      .from('activo_adjuntos')
      .select('*')
      .eq('client_uuid', clientUuid)
      .maybeSingle()
    if (error) throw error
    return data || null
  }

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

  // ---------- GET /activos-pendientes ----------
  app.get('/activos-pendientes', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('activos')
        .select('*')
        .eq('estado_revision', 'pendiente')
        .order('created_at', { ascending: false })

      if (error) throw error
      res.json({ ok: true, activos: data || [] })
    } catch (error) {
      console.error('Error listando activos pendientes:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- POST /activos ----------
  app.post('/activos', async (req, res) => {
    try {
      const body = req.body || {}
      const origen = String(body.origen || '').trim().toLowerCase()
      const esFlutter =
        origen === 'flutter' || origen === 'app' || origen === 'relevamiento'

      const descripcion = optStr(body.descripcion)
      const numeroSerie = normalizeNumeroSerie(body.numero_serie)
      const categoria = normalizeCategoria(body.categoria)
      const clientUuid = normalizeClientUuid(body.client_uuid)
      const creadoPorUserId = normalizeClientUuid(body.creado_por_user_id)
      const usuarioMov =
        optStr(body.usuario) ||
        optStr(body.usuario_nombre) ||
        (esFlutter ? 'Operador app' : 'Administrador')

      if (!descripcion) {
        return res
          .status(400)
          .json({ ok: false, error: 'La descripción es obligatoria' })
      }
      if (!numeroSerie) {
        return res
          .status(400)
          .json({ ok: false, error: 'El número de serie es obligatorio' })
      }
      if (!categoria) {
        return res.status(400).json({
          ok: false,
          error:
            'Categoría inválida. Use: unidad, wika, linea, herramienta, seguridad, otro',
        })
      }

      const estado = normalizeEstadoOperativo(body.estado)
      if (!estado) {
        return res.status(400).json({
          ok: false,
          error:
            'Estado inválido. Use: operativo, fuera de servicio, en reparacion, vencido, baja',
        })
      }

      // es_conjunto: mismo criterio web y Flutter (solo boolean estricto).
      const resultadoEsConjunto = resolveEsConjuntoPayload(body)
      if (!resultadoEsConjunto.ok) {
        return res.status(400).json({
          ok: false,
          error: resultadoEsConjunto.error,
          code: 'ES_CONJUNTO_INVALIDO',
        })
      }
      const esConjunto = resultadoEsConjunto.value

      if (clientUuid) {
        const existente = await findActivoByClientUuid(clientUuid)
        if (existente) {
          return res.json({ ok: true, activo: existente, idempotent: true })
        }
      }

      const porSerie = await findActivoByNumeroSerie(numeroSerie)
      if (porSerie) {
        if (clientUuid && porSerie.client_uuid === clientUuid) {
          return res.json({ ok: true, activo: porSerie, idempotent: true })
        }
        return res.status(409).json({
          ok: false,
          error: 'Ya existe un activo con ese número de serie',
          code: 'NUMERO_SERIE_DUPLICADO',
          activo_existente: {
            id: porSerie.id,
            numero_serie: porSerie.numero_serie,
            descripcion: porSerie.descripcion,
            activo: porSerie.activo,
            estado_revision: porSerie.estado_revision,
          },
        })
      }

      const flutterFlags = esFlutter ? flutterCreateFlags() : null

      const insertPayload = {
        descripcion,
        numero_serie: numeroSerie,
        categoria,
        estado,
        marca: optStr(body.marca),
        ubicacion: optStr(body.ubicacion),
        asignado_a: optStr(body.asignado_a),
        vencimiento: optStr(body.vencimiento),
        observaciones: optStr(body.observaciones),
        codigo_interno: optStr(body.codigo_interno),
        dias_aviso:
          body.dias_aviso == null || body.dias_aviso === ''
            ? 30
            : Number(body.dias_aviso) || 30,
        // Flutter: siempre pendiente/inactivo aunque envíe activo/estado_revision.
        activo: esFlutter
          ? flutterFlags.activo
          : body.activo === false
            ? false
            : true,
        estado_revision: esFlutter
          ? flutterFlags.estado_revision
          : 'aprobado',
        es_conjunto: esConjunto,
      }

      if (clientUuid) insertPayload.client_uuid = clientUuid
      if (creadoPorUserId) insertPayload.creado_por_user_id = creadoPorUserId
      if (!esFlutter && optStr(body.certificado_url)) {
        insertPayload.certificado_url = optStr(body.certificado_url)
      }

      const { data, error } = await supabase
        .from('activos')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        if (clientUuid && isUniqueViolation(error)) {
          const existente = await findActivoByClientUuid(clientUuid)
          if (existente) {
            return res.json({ ok: true, activo: existente, idempotent: true })
          }
        }
        if (isUniqueViolation(error)) {
          const porSerie2 = await findActivoByNumeroSerie(numeroSerie)
          if (porSerie2) {
            return res.status(409).json({
              ok: false,
              error: 'Ya existe un activo con ese número de serie',
              code: 'NUMERO_SERIE_DUPLICADO',
              activo_existente: {
                id: porSerie2.id,
                numero_serie: porSerie2.numero_serie,
                descripcion: porSerie2.descripcion,
                activo: porSerie2.activo,
                estado_revision: porSerie2.estado_revision,
              },
            })
          }
        }
        throw error
      }

      await registrarMovimiento({
        activo_id: data.id,
        tipo_movimiento: esFlutter ? 'relevamiento' : 'creacion',
        descripcion: esFlutter
          ? 'Relevamiento desde app offline (pendiente de revisión)'
          : 'Activo creado',
        usuario: usuarioMov,
        estado_nuevo: data.estado,
        ubicacion_nueva: data.ubicacion,
        asignado_nuevo: data.asignado_a,
        observaciones: data.observaciones,
      })

      res.json({ ok: true, activo: data, idempotent: false })
    } catch (error) {
      console.error('Error creando activo:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- Aprobar / Rechazar ----------
  // Sin tokens: cualquiera que conozca la URL de la API puede invocar estos
  // endpoints. La UI de operador no los expone; eso no es protección de API.
  app.post('/activos/:id/aprobar', async (req, res) => {
    try {
      const { id } = req.params
      const usuario = optStr(req.body?.usuario) || 'Coordinador'
      const patch =
        req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : {}

      const { data: anterior, error: errAnt } = await supabase
        .from('activos')
        .select('*')
        .eq('id', id)
        .single()
      if (errAnt) throw errAnt

      if (anterior.estado_revision !== 'pendiente') {
        return res.status(400).json({
          ok: false,
          error: 'Solo se pueden aprobar relevamientos con estado_revision=pendiente',
        })
      }

      const updatePayload = {
        activo: true,
        estado_revision: 'aprobado',
        updated_at: new Date().toISOString(),
      }

      const allow = [
        'descripcion',
        'categoria',
        'numero_serie',
        'marca',
        'estado',
        'ubicacion',
        'asignado_a',
        'vencimiento',
        'observaciones',
        'codigo_interno',
        'dias_aviso',
      ]
      for (const key of allow) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          if (key === 'categoria') {
            const cat = normalizeCategoria(patch[key])
            if (!cat) {
              return res
                .status(400)
                .json({ ok: false, error: 'Categoría inválida en patch' })
            }
            updatePayload.categoria = cat
          } else if (key === 'estado') {
            const est = normalizeEstadoOperativo(patch[key])
            if (!est) {
              return res
                .status(400)
                .json({ ok: false, error: 'Estado inválido en patch' })
            }
            updatePayload.estado = est
          } else if (key === 'numero_serie') {
            const serie = normalizeNumeroSerie(patch[key])
            if (!serie) {
              return res
                .status(400)
                .json({ ok: false, error: 'Número de serie inválido en patch' })
            }
            updatePayload.numero_serie = serie
          } else if (key === 'dias_aviso') {
            updatePayload.dias_aviso = Number(patch[key]) || 30
          } else {
            updatePayload[key] = optStr(patch[key])
          }
        }
      }

      if (updatePayload.numero_serie) {
        const other = await findActivoByNumeroSerie(updatePayload.numero_serie)
        if (other && String(other.id) !== String(id)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe otro activo con ese número de serie',
            code: 'NUMERO_SERIE_DUPLICADO',
          })
        }
      }

      const { data, error } = await supabase
        .from('activos')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      await registrarMovimiento({
        activo_id: data.id,
        tipo_movimiento: 'aprobacion',
        descripcion: 'Relevamiento aprobado y habilitado',
        usuario,
        estado_anterior: anterior.estado,
        estado_nuevo: data.estado,
        ubicacion_anterior: anterior.ubicacion,
        ubicacion_nueva: data.ubicacion,
        asignado_anterior: anterior.asignado_a,
        asignado_nuevo: data.asignado_a,
        observaciones: `estado_revision: pendiente → aprobado`,
      })

      res.json({ ok: true, activo: data })
    } catch (error) {
      console.error('Error aprobando activo:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  app.post('/activos/:id/rechazar', async (req, res) => {
    try {
      const { id } = req.params
      const usuario = optStr(req.body?.usuario) || 'Coordinador'
      const motivo = optStr(req.body?.motivo) || 'Relevamiento rechazado'

      const { data: anterior, error: errAnt } = await supabase
        .from('activos')
        .select('*')
        .eq('id', id)
        .single()
      if (errAnt) throw errAnt

      if (anterior.estado_revision !== 'pendiente') {
        return res.status(400).json({
          ok: false,
          error: 'Solo se pueden rechazar relevamientos con estado_revision=pendiente',
        })
      }

      const { data, error } = await supabase
        .from('activos')
        .update({
          activo: false,
          estado_revision: 'rechazado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      await registrarMovimiento({
        activo_id: data.id,
        tipo_movimiento: 'rechazo',
        descripcion: 'Relevamiento rechazado',
        usuario,
        estado_anterior: anterior.estado,
        estado_nuevo: data.estado,
        observaciones: motivo,
      })

      res.json({ ok: true, activo: data })
    } catch (error) {
      console.error('Error rechazando activo:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  // ---------- Adjuntos (bucket PRIVADO; solo vía Express) ----------
  app.get('/activos/:id/adjuntos', async (req, res) => {
    try {
      const { id } = req.params
      const { data, error } = await supabase
        .from('activo_adjuntos')
        .select(
          'id, activo_id, tipo, storage_path, mime_type, tamano_bytes, orden, client_uuid, creado_por_user_id, created_at'
        )
        .eq('activo_id', id)
        .order('orden', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error

      const adjuntos = await withSignedUrls(data || [])
      res.json({
        ok: true,
        adjuntos,
        url_firmada_ttl_seconds: signedTtl,
      })
    } catch (error) {
      console.error('Error listando adjuntos:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  app.post('/activos/:id/adjuntos', async (req, res) => {
    try {
      const { id } = req.params
      const body = req.body || {}
      const tipo = String(body.tipo || '').trim().toLowerCase()
      const clientUuid = normalizeClientUuid(body.client_uuid)
      const creadoPorUserId = normalizeClientUuid(body.creado_por_user_id)
      const fileBase64 = body.file_base64 || body.image_base64

      // Ignorar cualquier filename del cliente (body.filename / originalname / etc.)
      if (body.filename || body.file_name || body.originalname || body.path) {
        // no usar; rutas se construyen solo con activo_id + tipo + client_uuid
      }

      if (!ADJUNTO_TIPOS.has(tipo)) {
        return res.status(400).json({
          ok: false,
          error: 'tipo inválido. Use: foto_general, foto_placa, certificado, otro',
        })
      }
      if (!fileBase64) {
        return res.status(400).json({ ok: false, error: 'Falta file_base64' })
      }
      if (!clientUuid) {
        return res
          .status(400)
          .json({ ok: false, error: 'client_uuid de adjunto obligatorio' })
      }

      const mimeResolved = resolveAdjuntoMime(body.mime_type)
      if (!mimeResolved.ok) {
        return res.status(400).json({ ok: false, error: mimeResolved.error })
      }

      const existenteAdj = await findAdjuntoByClientUuid(clientUuid)
      if (existenteAdj) {
        const [withUrl] = await withSignedUrls([existenteAdj])
        return res.json({ ok: true, adjunto: withUrl, idempotent: true })
      }

      const { data: activo, error: errActivo } = await supabase
        .from('activos')
        .select('id')
        .eq('id', id)
        .single()
      if (errActivo) throw errActivo

      const buffer = base64ToBuffer(fileBase64)
      const maxBytes = maxBytesForMime(mimeResolved.mime)
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ ok: false, error: 'Archivo vacío' })
      }
      if (buffer.length > maxBytes) {
        const mb = Math.round(maxBytes / (1024 * 1024))
        return res.status(400).json({
          ok: false,
          error: `Archivo demasiado grande. Máximo ${mb} MB para ${mimeResolved.ext.toUpperCase()}.`,
          code: 'ADJUNTO_TOO_LARGE',
          max_bytes: maxBytes,
        })
      }

      // Ruta determinista: no usa nombre libre del cliente
      const storagePath = `${activo.id}/${tipo}/${clientUuid}.${mimeResolved.ext}`

      const { error: upErr } = await supabase.storage
        .from(bucketActivos)
        .upload(storagePath, buffer, {
          contentType: mimeResolved.mime,
          upsert: true,
        })
      if (upErr) throw upErr

      const insertRow = {
        activo_id: activo.id,
        tipo,
        storage_path: storagePath,
        url_publica: null, // bucket privado: nunca URL pública permanente
        mime_type: mimeResolved.mime,
        tamano_bytes: buffer.length,
        orden: Number(body.orden) || 0,
        client_uuid: clientUuid,
      }
      if (creadoPorUserId) insertRow.creado_por_user_id = creadoPorUserId

      const { data, error } = await supabase
        .from('activo_adjuntos')
        .insert([insertRow])
        .select()
        .single()

      if (error) {
        if (isUniqueViolation(error)) {
          const again = await findAdjuntoByClientUuid(clientUuid)
          if (again) {
            const [withUrl] = await withSignedUrls([again])
            return res.json({ ok: true, adjunto: withUrl, idempotent: true })
          }
        }
        throw error
      }

      const [withUrl] = await withSignedUrls([data])
      res.json({ ok: true, adjunto: withUrl, idempotent: false })
    } catch (error) {
      console.error('Error subiendo adjunto de activo:', error)
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  return {
    findActivoByNumeroSerie,
    normalizeCategoria,
    normalizeEstadoOperativo,
    normalizeClientUuid,
    normalizeNumeroSerie,
  }
}

module.exports = {
  registerActivosRelevamientoRoutes,
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
  ADJUNTO_MIME_BY_EXT,
  CATEGORIA_MAP,
}
