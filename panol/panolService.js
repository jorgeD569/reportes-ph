const { randomUUID } = require('crypto')

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const DEFAULT_SIGNED_URL_TTL = 900

function clampLimit(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function parseOffset(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function throwIfError(result) {
  if (result && result.error) throw result.error
  return result ? result.data : null
}

function createPanolService({ supabase, env = process.env }) {
  if (!supabase || typeof supabase.from !== 'function' || typeof supabase.rpc !== 'function') {
    throw new Error('createPanolService requiere un cliente Supabase service_role')
  }
  const buckets = Object.freeze({
    firma: String(env.PANOL_FIRMAS_BUCKET || 'panol-firmas'),
    foto: String(env.PANOL_EVIDENCIAS_BUCKET || 'panol-evidencias'),
  })
  const signedUrlTtl = Math.max(60, Number(env.PANOL_SIGNED_URL_TTL_SECONDS) || DEFAULT_SIGNED_URL_TTL)

  async function listCatalog(filters = {}) {
    const limit = clampLimit(filters.limit)
    const offset = parseOffset(filters.offset)
    const search = String(filters.q || '').trim()
    let unitElementIds = []
    if (search) {
      const safeUnit = search.replace(/[,%()]/g, ' ').trim()
      if (safeUnit) {
        const unitResult = await supabase.from('panol_unidades').select('elemento_id')
          .or(`numero_serie.ilike.%${safeUnit}%,codigo_individual.ilike.%${safeUnit}%`).limit(MAX_LIMIT)
        if (unitResult.error) throw unitResult.error
        unitElementIds = [...new Set((unitResult.data || []).map((row) => row.elemento_id).filter(Boolean))]
      }
    }
    let query = supabase
      .from('panol_elementos')
      .select('id,nombre,codigo,codigo_barras,clase,categoria_id,consumible_id,stock_minimo,activo,created_at,updated_at', { count: 'exact' })
      .eq('activo', true)
      .order('nombre', { ascending: true })
      .range(offset, offset + limit - 1)
    if (filters.clase) query = query.eq('clase', String(filters.clase).trim())
    if (search) {
      const safe = search.replace(/[,%()]/g, ' ').trim()
      if (safe) {
        const predicates = [`nombre.ilike.%${safe}%`, `codigo.ilike.%${safe}%`, `codigo_barras.ilike.%${safe}%`]
        if (/^[0-9a-f-]{36}$/i.test(safe)) predicates.push(`id.eq.${safe}`)
        if (unitElementIds.length) predicates.push(`id.in.(${unitElementIds.join(',')})`)
        query = query.or(predicates.join(','))
      }
    }
    const result = await query
    if (result.error) throw result.error
    return { items: result.data || [], total: result.count || 0, limit, offset }
  }

  async function getElement(id) {
    const element = throwIfError(await supabase
      .from('panol_elementos')
      .select('*')
      .eq('id', id)
      .maybeSingle())
    if (!element) return null
    const [balances, units, movements, documentLines] = await Promise.all([
      supabase.from('panol_saldos').select('*').eq('elemento_id', id),
      supabase.from('panol_unidades').select('*').eq('elemento_id', id).order('created_at', { ascending: true }),
      supabase.from('panol_movimientos').select('*').eq('elemento_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('panol_documento_lineas').select('*').eq('elemento_id', id).order('created_at', { ascending: false }).limit(100),
    ])
    return {
      elemento: element,
      saldos: throwIfError(balances) || [],
      unidades: throwIfError(units) || [],
      movimientos: throwIfError(movements) || [],
      lineas_documento: throwIfError(documentLines) || [],
    }
  }

  async function listBalances(filters = {}) {
    const limit = clampLimit(filters.limit)
    const offset = parseOffset(filters.offset)
    let query = supabase.from('panol_saldos').select('*', { count: 'exact' })
      .order('updated_at', { ascending: false }).range(offset, offset + limit - 1)
    if (filters.elemento_id) query = query.eq('elemento_id', filters.elemento_id)
    if (filters.ubicacion_id) query = query.eq('ubicacion_id', filters.ubicacion_id)
    const result = await query
    if (result.error) throw result.error
    return { items: result.data || [], total: result.count || 0, limit, offset }
  }

  async function listDocuments(filters = {}) {
    const limit = clampLimit(filters.limit)
    const offset = parseOffset(filters.offset)
    let query = supabase.from('panol_documentos').select('*', { count: 'exact' })
      .order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (filters.tipo) query = query.eq('tipo', String(filters.tipo).trim().toUpperCase())
    if (filters.client_uuid) query = query.eq('client_uuid', filters.client_uuid)
    const result = await query
    if (result.error) throw result.error
    return { items: result.data || [], total: result.count || 0, limit, offset }
  }

  async function listLocations(filters = {}) {
    const limit = clampLimit(filters.limit)
    const offset = parseOffset(filters.offset)
    let query = supabase.from('panol_ubicaciones')
      .select('id,sector_id,etiqueta,contenedor,estanteria,gaveta,activo,sector:panol_sectores(id,codigo,nombre,activo)', { count: 'exact' })
      .order('etiqueta', { ascending: true })
      .range(offset, offset + limit - 1)
    if (typeof filters.activo === 'boolean') query = query.eq('activo', filters.activo)
    if (filters.sector_id) query = query.eq('sector_id', filters.sector_id)
    if (filters.q) query = query.ilike('etiqueta', `%${filters.q}%`)
    const result = await query
    if (result.error) throw result.error
    const items = (result.data || []).map((row) => ({
      id: row.id,
      sector_id: row.sector_id,
      etiqueta: row.etiqueta,
      contenedor: row.contenedor,
      estanteria: row.estanteria,
      gaveta: row.gaveta,
      activo: row.activo,
      sector_codigo: row.sector && row.sector.codigo || null,
      sector_nombre: row.sector && row.sector.nombre || null,
      sector_activo: row.sector ? row.sector.activo : null,
    }))
    return { items, total: result.count || 0, limit, offset }
  }

  async function getDocument(id) {
    const document = throwIfError(await supabase.from('panol_documentos').select('*').eq('id', id).maybeSingle())
    if (!document) return null
    const [lines, participants, relations, checklist, evidences, shipment, custodians] = await Promise.all([
      supabase.from('panol_documento_lineas').select('*').eq('documento_id', id).order('created_at', { ascending: true }),
      supabase.from('panol_documento_participantes').select('*').eq('documento_id', id).order('created_at', { ascending: true }),
      supabase.from('panol_documento_relaciones').select('*').or(`documento_origen_id.eq.${id},documento_destino_id.eq.${id}`),
      supabase.from('panol_documento_checklist').select('*').eq('documento_id', id).order('created_at', { ascending: true }),
      supabase.from('panol_evidencias').select('*').eq('documento_id', id).order('orden', { ascending: true }),
      supabase.from('panol_envios').select('*').eq('documento_env_id', id).maybeSingle(),
      supabase.from('panol_custodias').select('*').eq('documento_origen_id', id).order('created_at', { ascending: true }),
    ])
    return {
      documento: document,
      lineas: throwIfError(lines) || [],
      participantes: throwIfError(participants) || [],
      relaciones: throwIfError(relations) || [],
      checklist: throwIfError(checklist) || [],
      evidencias: throwIfError(evidences) || [],
      envio: throwIfError(shipment),
      custodias: throwIfError(custodians) || [],
    }
  }

  async function listTable(table, filters = {}, allowedFilters = [], defaultOrder = 'created_at') {
    const limit = clampLimit(filters.limit)
    const offset = parseOffset(filters.offset)
    let query = supabase.from(table).select('*', { count: 'exact' })
      .order(defaultOrder, { ascending: false }).range(offset, offset + limit - 1)
    for (const [key, value] of Object.entries(filters)) {
      if (allowedFilters.includes(key) && value != null && value !== '') query = query.eq(key, value)
    }
    const result = await query
    if (result.error) throw result.error
    return { items: result.data || [], total: result.count || 0, limit, offset }
  }

  async function registerDocument(payload) {
    const result = await supabase.rpc('panol_fn_registrar_documento', { p: payload })
    if (result.error) throw result.error
    return result.data
  }

  async function uploadPrivateFile({ kind, metadata, buffer, authUser }) {
    const bucket = buckets[kind]
    const extension = metadata.mime_type === 'image/png' ? 'png' : metadata.mime_type === 'image/webp' ? 'webp' : 'jpg'
    const date = new Date().toISOString().slice(0, 10)
    const path = `${date}/${authUser.id}/${metadata.client_uuid}.${extension}`
    const result = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType: metadata.mime_type,
      upsert: false,
      cacheControl: '3600',
    })
    if (result.error) {
      const message = String(result.error.message || '').toLowerCase()
      if (message.includes('already exists') || message.includes('duplicate')) {
        const signed = await createSignedUrl({ bucket, path })
        return { bucket, ruta: path, ...metadata, estado_carga: 'cargado', idempotent: true, url_firmada: signed.url, url_firmada_expira_en: signed.expires_in }
      }
      throw result.error
    }
    const storedPath = result.data && result.data.path || path
    const signed = await createSignedUrl({ bucket, path: storedPath })
    return { bucket, ruta: storedPath, ...metadata, estado_carga: 'cargado', idempotent: false, url_firmada: signed.url, url_firmada_expira_en: signed.expires_in }
  }

  async function createSignedUrl({ bucket, path }) {
    if (!Object.values(buckets).includes(bucket)) {
      const error = new Error('Bucket de Pañol no permitido')
      error.code = 'PANOL_BUCKET_FORBIDDEN'
      error.httpStatus = 403
      throw error
    }
    const result = await supabase.storage.from(bucket).createSignedUrl(path, signedUrlTtl)
    if (result.error) throw result.error
    return { url: result.data.signedUrl, expires_in: signedUrlTtl }
  }

  async function createSignedUrlForFile(id) {
    const file = throwIfError(await supabase.from('panol_archivos').select('id,bucket,ruta,mime_type,tamano_bytes,hash_sha256').eq('id', id).maybeSingle())
    if (!file) return null
    return { archivo: file, ...(await createSignedUrl({ bucket: file.bucket, path: file.ruta })) }
  }

  return {
    buckets,
    listCatalog,
    getElement,
    listBalances,
    listDocuments,
    listLocations,
    getDocument,
    listCustodies: (filters) => listTable('panol_custodias', filters, ['estado', 'elemento_id', 'responsable_user_id', 'documento_origen_id']),
    listShipments: (filters) => listTable('panol_envios', filters, ['estado', 'documento_env_id', 'receptor_previsto_user_id']),
    registerDocument,
    uploadPrivateFile,
    createSignedUrl,
    createSignedUrlForFile,
    newRequestId: () => randomUUID(),
  }
}

module.exports = { createPanolService, clampLimit, parseOffset }
