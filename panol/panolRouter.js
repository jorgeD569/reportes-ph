const express = require('express')
const { createPanolService } = require('./panolService')
const { createPanolController } = require('./panolController')
const { PANOL_PERMISSIONS } = require('./panolPermissions')

function createPanolRouter({ supabase, auth, service: injectedService }) {
  if (!auth || typeof auth.requireRoles !== 'function') {
    throw new Error('createPanolRouter requiere auth.requireRoles')
  }
  const router = express.Router()
  const service = injectedService || createPanolService({ supabase })
  const controller = createPanolController({ service })

  function permit(permission) {
    const roles = PANOL_PERMISSIONS[permission]
    return async (req, res, next) => {
      try {
        if (req.authUser) {
          if (!roles.includes(String(req.authUser.rol || '').toLowerCase())) {
            return res.status(403).json({ ok: false, code: 'FORBIDDEN_ROLE', error: 'No tenés permiso para realizar esta operación.' })
          }
          return next()
        }
        const user = await auth.requireRoles(req, res, roles)
        if (!user) return
        req.authUser = user
        next()
      } catch (error) {
        console.error('[panol] Error autenticando solicitud:', error)
        if (!res.headersSent) {
          res.status(500).json({ ok: false, code: 'PANOL_AUTH_ERROR', error: 'Error al validar la sesión' })
        }
      }
    }
  }

  router.use(permit('read'))

  router.get('/catalogo', controller.listCatalog)
  router.get('/catalogo/:id', controller.catalogItem)
  router.get('/catalogo/:id/ficha', controller.catalogItem)
  router.get('/catalogo/:id/historial', controller.catalogItem)
  router.get('/saldos', controller.listBalances)
  router.get('/stock', controller.listBalances)
  router.get('/documentos', controller.listDocuments)
  router.get('/documentos/:id', controller.documentDetail)
  router.get('/custodias', controller.listCustodies)
  router.get('/envios', controller.listShipments)
  router.get('/ubicaciones', controller.listLocations)
  router.get('/participantes', controller.listParticipants)
  router.get('/archivos/:id/url-firmada', controller.signedUrl)

  router.post('/documentos', permit('operate'), controller.register())
  router.post('/ingresos-activos', permit('operate'), controller.registerAssetAdmission)
  router.post('/recepciones', permit('operate'), controller.register('REC'))
  router.post('/transferencias', permit('operate'), controller.register('TRA'))
  router.post('/devoluciones', permit('operate'), controller.register('DEV'))
  router.post('/archivos', permit('files'), controller.upload())
  router.post('/firmas', permit('files'), controller.upload('firma'))
  router.post('/fotografias', permit('files'), controller.upload('foto'))

  return router
}

module.exports = { createPanolRouter }
