const crypto = require('crypto')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DOCUMENT_TYPES = new Set(['ING', 'ENT', 'ENV', 'REC', 'TRA', 'DEV', 'MAN', 'UTI', 'INC', 'AJU', 'CMP'])
const ACTIONS = new Set([
  'ingreso', 'entrega', 'despacho', 'recepcion', 'transferencia',
  'devolucion', 'consumo', 'instalacion', 'mantenimiento',
  'dano', 'perdida', 'recuperacion', 'ajuste', 'compensacion',
])
const PARTICIPANT_FUNCTIONS = new Set([
  'registro', 'entrego', 'recibio', 'despacho',
  'recibio_para_trasladar', 'transportista_entrego', 'receptor_real',
  'receptor_previsto', 'devolvio', 'recibio_devolucion', 'entrego_custodia', 'recibio_custodia',
])
const FILE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024
const MAX_PHOTOS_PER_LINE = 3
const CLIENT_ORIGINS = new Set(['flutter', 'web', 'backend'])

class PanolValidationError extends Error {
  constructor(message, code = 'PANOL_VALIDATION_ERROR') {
    super(message)
    this.name = 'PanolValidationError'
    this.code = code
    this.httpStatus = 400
  }
}

class PanolAuthorizationError extends Error {
  constructor(message, code = 'PANOL_FORBIDDEN') {
    super(message)
    this.name = 'PanolAuthorizationError'
    this.code = code
    this.httpStatus = 403
  }
}

function requiredUuid(value, field) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!UUID_RE.test(normalized)) {
    throw new PanolValidationError(`${field} debe ser un UUID válido`, 'INVALID_UUID')
  }
  return normalized
}

function optionalUuid(value, field) {
  if (value == null || value === '') return null
  return requiredUuid(value, field)
}

function optionalBigint(value, field) {
  if (value == null || value === '') return null
  const normalized = String(value).trim()
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new PanolValidationError(`${field} debe ser un bigint positivo`, 'INVALID_BIGINT')
  }
  return normalized
}

function positiveQuantity(value, field = 'cantidad') {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0 || number > 2147483647) {
    throw new PanolValidationError(`${field} debe ser un entero positivo`, 'INVALID_QUANTITY')
  }
  return number
}

function signedInteger(value, field) {
  const number = Number(value == null || value === '' ? 0 : value)
  if (!Number.isSafeInteger(number) || number < -2147483648 || number > 2147483647) {
    throw new PanolValidationError(`${field} debe ser un integer válido`, 'INVALID_DELTA')
  }
  return number
}

function cleanText(value, maxLength, field) {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  if (text.length > maxLength) {
    throw new PanolValidationError(`${field} supera ${maxLength} caracteres`, 'TEXT_TOO_LONG')
  }
  return text
}

function validateFileMetadata(raw, kind, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PanolValidationError('Metadata de archivo inválida', 'INVALID_FILE')
  }
  const mime = String(raw.mime_type || '').trim().toLowerCase()
  if (!FILE_MIMES.has(mime)) {
    throw new PanolValidationError('MIME no permitido; use image/jpeg, image/png o image/webp', 'INVALID_MIME')
  }
  const bytes = positiveQuantity(raw.tamano_bytes, 'tamano_bytes')
  const max = kind === 'firma' ? SIGNATURE_MAX_BYTES : PHOTO_MAX_BYTES
  if (bytes > max) {
    throw new PanolValidationError(`El archivo supera el máximo de ${max} bytes`, 'FILE_TOO_LARGE')
  }
  const clientUuid = requiredUuid(raw.client_uuid, 'archivo.client_uuid')
  const hash = String(raw.hash_sha256 || '').trim().toLowerCase()
  if (hash && !/^[0-9a-f]{64}$/.test(hash)) {
    throw new PanolValidationError('hash_sha256 inválido', 'INVALID_HASH')
  }
  const result = {
    client_uuid: clientUuid,
    mime_type: mime,
    tamano_bytes: bytes,
    hash_sha256: hash || null,
    estado_carga: raw.estado_carga === 'cargado' ? 'cargado' : 'pendiente',
  }
  if (options.requireStored) {
    result.ruta = cleanText(raw.ruta, 1000, 'archivo.ruta')
    if (!result.ruta || result.ruta.includes('..') || result.ruta.startsWith('/')) {
      throw new PanolValidationError('ruta privada de archivo inválida', 'INVALID_STORAGE_PATH')
    }
    if (!result.hash_sha256) {
      throw new PanolValidationError('hash_sha256 es obligatorio', 'INVALID_HASH')
    }
  }
  return result
}

function validateParticipants(rawParticipants) {
  if (!Array.isArray(rawParticipants)) {
    throw new PanolValidationError('participantes debe ser un arreglo', 'INVALID_PARTICIPANTS')
  }
  const seen = new Set()
  return rawParticipants.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new PanolValidationError(`participantes[${index}] inválido`, 'INVALID_PARTICIPANT')
    }
    const role = String(raw.funcion || '').trim()
    if (!PARTICIPANT_FUNCTIONS.has(role)) {
      throw new PanolValidationError(`Función de participante inválida: ${role || '(vacía)'}`, 'INVALID_PARTICIPANT_ROLE')
    }
    if (seen.has(role)) throw new PanolValidationError(`Participante duplicado para función ${role}`, 'DUPLICATE_PARTICIPANT_ROLE')
    seen.add(role)
    const userId = optionalUuid(raw.user_id, `participantes[${index}].user_id`)
    const contactId = optionalUuid(raw.contacto_id, `participantes[${index}].contacto_id`)
    if (userId && contactId) {
      throw new PanolValidationError('Un participante no puede tener user_id y contacto_id simultáneamente', 'AMBIGUOUS_PARTICIPANT')
    }
    const name = cleanText(raw.nombre_snapshot, 200, 'nombre_snapshot')
    if (!name) throw new PanolValidationError('nombre_snapshot es obligatorio para cada participante', 'PARTICIPANT_NAME_REQUIRED')
    const participant = {
      ...raw,
      funcion: role,
      user_id: userId,
      contacto_id: contactId,
      nombre_snapshot: name,
      dni_snapshot: cleanText(raw.dni_snapshot, 30, 'dni_snapshot'),
    }
    if (raw.firma != null) {
      participant.firma = validateFileMetadata(raw.firma, 'firma', { requireStored: true })
      const signedAt = cleanText(raw.firmado_en, 80, 'firmado_en')
      if (!signedAt || Number.isNaN(Date.parse(signedAt))) {
        throw new PanolValidationError('firmado_en válido es obligatorio cuando hay firma', 'SIGNED_AT_REQUIRED')
      }
      participant.firmado_en = signedAt
    } else if (raw.firmado_en != null) {
      throw new PanolValidationError('firmado_en exige metadata de firma', 'SIGNATURE_REQUIRED')
    }
    return participant
  })
}

function validateLines(rawLines, authUser) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new PanolValidationError('lineas debe contener al menos un renglón', 'INVALID_LINES')
  }
  return rawLines.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new PanolValidationError(`lineas[${index}] inválida`, 'INVALID_LINE')
    }
    const action = String(raw.accion || '').trim()
    if (!ACTIONS.has(action)) {
      throw new PanolValidationError(`Acción inválida: ${action || '(vacía)'}`, 'INVALID_ACTION')
    }
    const photos = raw.evidencias == null ? [] : raw.evidencias
    if (!Array.isArray(photos) || photos.length > MAX_PHOTOS_PER_LINE) {
      throw new PanolValidationError(`Cada renglón admite hasta ${MAX_PHOTOS_PER_LINE} fotografías`, 'TOO_MANY_PHOTOS')
    }
    const custodyId = optionalUuid(raw.custodia_id, `lineas[${index}].custodia_id`)
    if (['recepcion', 'transferencia', 'devolucion', 'instalacion', 'dano', 'perdida'].includes(action) && !custodyId) {
      throw new PanolValidationError(`${action} exige custodia_id`, 'CUSTODY_REQUIRED')
    }
    const unitId = optionalUuid(raw.unidad_id, `lineas[${index}].unidad_id`)
    const quantity = positiveQuantity(raw.cantidad, `lineas[${index}].cantidad`)
    if (unitId && quantity !== 1) throw new PanolValidationError('Una unidad individual exige cantidad 1', 'SERIALIZED_QUANTITY_INVALID')
    const line = {
      ...raw,
      elemento_id: requiredUuid(raw.elemento_id, `lineas[${index}].elemento_id`),
      unidad_id: unitId,
      ubicacion_id: requiredUuid(raw.ubicacion_id, `lineas[${index}].ubicacion_id`),
      custodia_id: custodyId,
      activo_id: optionalBigint(raw.activo_id, `lineas[${index}].activo_id`),
      cantidad: quantity,
      accion: action,
      evidencias: photos.map((photo, photoIndex) => {
        const evidence = validateFileMetadata(photo, 'foto', { requireStored: true })
        const order = photo.orden == null ? photoIndex + 1 : positiveQuantity(photo.orden, 'evidencia.orden')
        if (order < 1 || order > MAX_PHOTOS_PER_LINE) throw new PanolValidationError('orden de evidencia inválido', 'INVALID_PHOTO_ORDER')
        const capturedAt = cleanText(photo.capturado_en, 80, 'capturado_en')
        if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) throw new PanolValidationError('capturado_en válido es obligatorio', 'CAPTURED_AT_REQUIRED')
        return { ...evidence, orden: order, capturado_en: capturedAt, capturado_por_user_id: authUser.id }
      }),
    }
    if (['ajuste', 'compensacion'].includes(action)) {
      for (const field of ['delta_total', 'delta_disponible', 'delta_custodia', 'delta_transito', 'delta_instalado', 'delta_consumido', 'delta_danado', 'delta_perdido']) {
        line[field] = signedInteger(raw[field], `lineas[${index}].${field}`)
      }
      if (line.delta_total !== line.delta_disponible + line.delta_custodia + line.delta_transito + line.delta_instalado + line.delta_danado + line.delta_perdido) {
        throw new PanolValidationError('Los deltas de ajuste no conservan el saldo físico', 'INVALID_DELTA_BALANCE')
      }
    }
    return line
  })
}

function validateDocumentPayload(raw, authUser, forcedType = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PanolValidationError('El cuerpo debe ser un objeto JSON')
  }
  const type = String(forcedType || raw.tipo || '').trim().toUpperCase()
  if (!DOCUMENT_TYPES.has(type)) {
    throw new PanolValidationError('tipo de documento inválido', 'INVALID_DOCUMENT_TYPE')
  }
  if (['AJU', 'CMP'].includes(type) && !['supervisor', 'coordinador', 'admin'].includes(String(authUser && authUser.rol || '').toLowerCase())) {
    throw new PanolAuthorizationError('Ajustes y compensaciones requieren supervisor, coordinador o admin')
  }
  const sector = cleanText(raw.sector, 30, 'sector')
  if (!sector) throw new PanolValidationError('sector es obligatorio', 'SECTOR_REQUIRED')
  const origin = cleanText(raw.origen_creacion, 30, 'origen_creacion') || 'backend'
  if (!CLIENT_ORIGINS.has(origin)) throw new PanolValidationError('origen_creacion inválido', 'INVALID_ORIGIN')
  const participants = validateParticipants(raw.participantes || [])
  const participantRoles = new Set(participants.map((item) => item.funcion))
  const requiredRoles = {
    ENT: ['entrego', 'recibio'],
    ENV: ['despacho', 'recibio_para_trasladar'],
    REC: ['transportista_entrego', 'receptor_real'],
    TRA: ['entrego_custodia', 'recibio_custodia'],
    DEV: ['devolvio', 'recibio_devolucion'],
  }[type] || []
  for (const role of requiredRoles) {
    if (!participantRoles.has(role)) throw new PanolValidationError(`${type} exige participante ${role}`, 'PARTICIPANT_REQUIRED')
  }
  if (['ENT', 'ENV', 'REC', 'TRA'].includes(type)) {
    for (const role of requiredRoles) {
      const participant = participants.find((item) => item.funcion === role)
      if (!participant || !participant.firma) throw new PanolValidationError(`${type} exige firma separada de ${role}`, 'PARTICIPANT_SIGNATURE_REQUIRED')
    }
  }
  const result = {
    ...raw,
    client_uuid: requiredUuid(raw.client_uuid, 'client_uuid'),
    tipo: type,
    sector,
    registrado_por_user_id: requiredUuid(authUser && authUser.id, 'sesión.usuario.id'),
    origen_creacion: origin,
    participantes: participants,
    lineas: validateLines(raw.lineas, authUser),
  }
  for (const field of ['destino_sugerido_id', 'receptor_previsto_contacto_id', 'receptor_previsto_user_id']) {
    if (raw[field] != null && raw[field] !== '') result[field] = optionalUuid(raw[field], field)
  }
  delete result.registrado_por
  return result
}

function validateAssetAdmissionPayload(raw, authUser) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PanolValidationError('Payload de ingreso inválido', 'INVALID_ASSET_ADMISSION')
  }
  const origin = cleanText(raw.origen_creacion, 30, 'origen_creacion') || 'backend'
  if (!CLIENT_ORIGINS.has(origin)) {
    throw new PanolValidationError('origen_creacion inválido', 'INVALID_ORIGIN')
  }
  const result = {
    client_uuid: requiredUuid(raw.client_uuid, 'client_uuid'),
    activo_id: optionalBigint(raw.activo_id, 'activo_id'),
    ubicacion_id: requiredUuid(raw.ubicacion_id, 'ubicacion_id'),
    registrado_por_user_id: requiredUuid(authUser && authUser.id, 'sesión.usuario.id'),
    origen_creacion: origin,
  }
  if (!result.activo_id) {
    throw new PanolValidationError('activo_id es obligatorio', 'ACTIVO_ID_REQUIRED')
  }
  const effectiveAt = cleanText(raw.fecha_efectiva, 80, 'fecha_efectiva')
  if (effectiveAt && Number.isNaN(Date.parse(effectiveAt))) {
    throw new PanolValidationError('fecha_efectiva inválida', 'INVALID_EFFECTIVE_DATE')
  }
  const source = cleanText(raw.origen_texto, 500, 'origen_texto')
  const notes = cleanText(raw.observaciones, 2000, 'observaciones')
  const device = cleanText(raw.dispositivo_id, 200, 'dispositivo_id')
  if (effectiveAt) result.fecha_efectiva = effectiveAt
  if (source) result.origen_texto = source
  if (notes) result.observaciones = notes
  if (device) result.dispositivo_id = device
  return result
}

function decodeUploadPayload(raw) {
  const kind = String(raw && raw.tipo_archivo || '').trim().toLowerCase()
  if (!['firma', 'foto'].includes(kind)) {
    throw new PanolValidationError('tipo_archivo debe ser firma o foto', 'INVALID_FILE_KIND')
  }
  const metadata = validateFileMetadata(raw, kind)
  const encoded = String(raw.contenido_base64 || '').replace(/^data:[^;]+;base64,/, '')
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new PanolValidationError('contenido_base64 inválido', 'INVALID_BASE64')
  }
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length !== metadata.tamano_bytes) {
    throw new PanolValidationError('tamano_bytes no coincide con el contenido', 'SIZE_MISMATCH')
  }
  const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex')
  if (metadata.hash_sha256 && metadata.hash_sha256 !== calculatedHash) {
    throw new PanolValidationError('hash_sha256 no coincide con el contenido', 'HASH_MISMATCH')
  }
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const isPng = buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature)
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if ((metadata.mime_type === 'image/jpeg' && !isJpeg) || (metadata.mime_type === 'image/png' && !isPng) || (metadata.mime_type === 'image/webp' && !isWebp)) {
    throw new PanolValidationError('El contenido no coincide con el MIME declarado', 'FILE_SIGNATURE_MISMATCH')
  }
  return { kind, metadata: { ...metadata, hash_sha256: calculatedHash }, buffer }
}

function validateLocationFilters(raw = {}) {
  const allowed = new Set(['limit', 'offset', 'activo', 'sector_id', 'q'])
  for (const key of Object.keys(raw || {})) {
    if (!allowed.has(key)) {
      throw new PanolValidationError(`Filtro de ubicaciones no permitido: ${key}`, 'INVALID_LOCATION_FILTER')
    }
  }
  const filters = {
    limit: raw.limit,
    offset: raw.offset,
    activo: true,
  }
  if (raw.sector_id != null && raw.sector_id !== '') {
    filters.sector_id = requiredUuid(raw.sector_id, 'sector_id')
  }
  if (raw.activo != null && raw.activo !== '') {
    const active = String(raw.activo).trim().toLowerCase()
    if (active === 'true' || active === '1') filters.activo = true
    else if (active === 'false' || active === '0') filters.activo = false
    else if (active === 'all' || active === 'todas') delete filters.activo
    else throw new PanolValidationError('activo debe ser true, false o all', 'INVALID_ACTIVE_FILTER')
  }
  if (raw.q != null && raw.q !== '') {
    const search = String(raw.q).trim()
    if (search.length > 200) throw new PanolValidationError('q supera 200 caracteres', 'TEXT_TOO_LONG')
    if (search) filters.q = search
  }
  return filters
}

module.exports = {
  PanolValidationError,
  PanolAuthorizationError,
  validateDocumentPayload,
  validateAssetAdmissionPayload,
  validateFileMetadata,
  decodeUploadPayload,
  requiredUuid,
  optionalBigint,
  MAX_PHOTOS_PER_LINE,
  PHOTO_MAX_BYTES,
  SIGNATURE_MAX_BYTES,
  validateLocationFilters,
}
