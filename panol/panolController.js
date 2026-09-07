const {
  PanolValidationError,
  validateDocumentPayload,
  decodeUploadPayload,
  requiredUuid,
  validateLocationFilters,
} = require('./panolValidation')

function mapPanolError(error) {
  if (error instanceof PanolValidationError) {
    return { status: 400, code: error.code, message: error.message }
  }
  if (error && error.httpStatus) {
    return { status: error.httpStatus, code: error.code || 'PANOL_ERROR', message: error.message }
  }
  const code = String(error && error.code || '')
  const message = String(error && (error.message || error.details || error.hint) || 'Error interno de Pañol')
  const lower = message.toLowerCase()
  if (code === '42501' || lower.includes('permission denied')) return { status: 403, code: 'PANOL_FORBIDDEN', message: 'Permiso insuficiente para Pañol' }
  if (code === '23505' || lower.includes('payload distinto') || lower.includes('client_uuid') && lower.includes('distinto')) return { status: 409, code: 'PANOL_CONFLICT', message }
  if (code === '23503' || lower.includes('no existe') || lower.includes('no encontrada') || lower.includes('no encontrado')) return { status: 404, code: 'PANOL_NOT_FOUND', message }
  if (code === '23514' || code === '22P02' || code === '22003' || code === 'P0001') {
    const conflict = lower.includes('insuficiente') || lower.includes('sobredevol') || lower.includes('cerrada') || lower.includes('ya ')
    return { status: conflict ? 409 : 400, code: conflict ? 'PANOL_CONFLICT' : 'PANOL_INVALID_OPERATION', message }
  }
  if (String(error && error.statusCode || '') === '404' || lower.includes('not found')) return { status: 404, code: 'PANOL_FILE_NOT_FOUND', message }
  return { status: 500, code: 'PANOL_INTERNAL_ERROR', message: 'Error interno de Pañol' }
}

function createPanolController({ service }) {
  function sendError(res, error) {
    const mapped = mapPanolError(error)
    if (mapped.status >= 500) console.error('[panol]', error)
    return res.status(mapped.status).json({ ok: false, error: mapped.message, code: mapped.code })
  }

  function list(method) {
    return async (req, res) => {
      try { return res.json({ ok: true, ...(await service[method](req.query || {})) }) }
      catch (error) { return sendError(res, error) }
    }
  }

  async function catalogItem(req, res) {
    try {
      const id = requiredUuid(req.params.id, 'id')
      const data = await service.getElement(id)
      if (!data) return res.status(404).json({ ok: false, code: 'PANOL_NOT_FOUND', error: 'Elemento no encontrado' })
      return res.json({ ok: true, ...data })
    } catch (error) { return sendError(res, error) }
  }

  async function documentDetail(req, res) {
    try {
      const id = requiredUuid(req.params.id, 'id')
      const data = await service.getDocument(id)
      if (!data) return res.status(404).json({ ok: false, code: 'PANOL_NOT_FOUND', error: 'Documento no encontrado' })
      return res.json({ ok: true, ...data })
    } catch (error) { return sendError(res, error) }
  }

  function register(forcedType = null) {
    return async (req, res) => {
      try {
        const payload = validateDocumentPayload(req.body, req.authUser, forcedType)
        const data = await service.registerDocument(payload)
        return res.status(data && data.idempotent ? 200 : 201).json({ ok: true, documento: data })
      } catch (error) { return sendError(res, error) }
    }
  }

  function upload(forcedKind = null) {
    return async (req, res) => {
      try {
        const body = forcedKind ? { ...req.body, tipo_archivo: forcedKind } : req.body
        const decoded = decodeUploadPayload(body)
        const file = await service.uploadPrivateFile({ ...decoded, authUser: req.authUser })
        return res.status(file.idempotent ? 200 : 201).json({ ok: true, archivo: file })
      } catch (error) { return sendError(res, error) }
    }
  }

  async function signedUrl(req, res) {
    try {
      const id = requiredUuid(req.params.id, 'id')
      const result = await service.createSignedUrlForFile(id)
      if (!result) return res.status(404).json({ ok: false, code: 'PANOL_FILE_NOT_FOUND', error: 'Archivo no encontrado' })
      return res.json({ ok: true, ...result })
    } catch (error) { return sendError(res, error) }
  }

  async function listLocations(req, res) {
    try {
      const filters = validateLocationFilters(req.query || {})
      return res.json({ ok: true, ...(await service.listLocations(filters)) })
    } catch (error) { return sendError(res, error) }
  }

  async function listParticipants(req, res) {
    try { return res.json({ ok: true, ...(await service.listParticipants(req.query || {})) }) }
    catch (error) { return sendError(res, error) }
  }

  return {
    listCatalog: list('listCatalog'), catalogItem,
    listBalances: list('listBalances'), listDocuments: list('listDocuments'),
    documentDetail, listCustodies: list('listCustodies'),
    listShipments: list('listShipments'), register, upload, signedUrl,
    listLocations,
    listParticipants,
  }
}

module.exports = { createPanolController, mapPanolError }
