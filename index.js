  require('dotenv').config()
  const express = require('express')
  const cors = require('cors')
  const crypto = require('crypto')
  const { createClient } = require('@supabase/supabase-js')
  const bcrypt = require('bcryptjs')
  const nodemailer = require('nodemailer')
  const { chromium } = require('playwright')

  const BCRYPT_ROUNDS = 10
  const MIN_PASSWORD_LENGTH = 8

  function generateTemporaryPassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = crypto.randomBytes(length)
    let result = ''
    for (let i = 0; i < length; i += 1) {
      result += chars[bytes[i] % chars.length]
    }
    return result
  }

  async function hashPassword(password) {
    return bcrypt.hash(String(password), BCRYPT_ROUNDS)
  }

  async function verifyUsuarioPassword(userId, password, storedHash) {
    if (storedHash) {
      try {
        const passwordOk = await bcrypt.compare(String(password), String(storedHash))
        if (passwordOk) return true
      } catch (compareError) {
        console.warn('bcrypt.compare falló, probando compatibilidad texto plano:', compareError.message)
      }
    }

    if (password === storedHash) {
      const passwordHash = await hashPassword(password)
      const { error } = await supabase
        .from('usuarios_app')
        .update({
          password_hash: passwordHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        console.error('Error migrando password_hash a bcrypt:', error)
      }

      return true
    }

    return false
  }

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ limit: '50mb', extended: true }))

  const path = require('path')

  app.use(express.static(path.join(__dirname, 'FRONTEND')))

  // Healthcheck para que no tire "Cannot GET /"
  app.get('/', (req, res) => {
    res.status(200).send('OK - Reportes diarios API')
  })

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  app.post('/login', async (req, res) => {
    try {
      const { usuario, password } = req.body

      const { data, error } = await supabase
        .from('usuarios_app')
        .select('id, nombre, usuario, email, rol, activo, password_hash, requiere_cambio_password')
        .eq('usuario', usuario)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) {
        console.error('Error en login:', error)
        return res.status(500).json({
          ok: false,
          error: 'Error interno en login',
        })
      }

      if (!data) {
        return res.status(401).json({
          ok: false,
          error: 'Usuario o contraseña incorrectos',
        })
      }

      if (!data.activo) {
        return res.status(403).json({
          ok: false,
          error: 'Usuario inactivo',
        })
      }

      const passwordOk = await verifyUsuarioPassword(
        data.id,
        password,
        data.password_hash
      )

      if (!passwordOk) {
        return res.status(401).json({
          ok: false,
          error: 'Usuario o contraseña incorrectos',
        })
      }

      res.json({
        ok: true,
        usuario: {
          id: data.id,
          nombre: data.nombre,
          usuario: data.usuario,
          email: data.email,
          rol: data.rol,
          requiere_cambio_password: Boolean(data.requiere_cambio_password),
        },
      })
    } catch (err) {
      console.error('Error interno en login:', err)
      res.status(500).json({
        ok: false,
        error: 'Error interno en login',
      })
    }
  })

  // SMTP (puede fallar: no debe romper el motor)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    requireTLS: true,
    tls: {
      minVersion: 'TLSv1.2',
    },
  })

  // Instancia global de Playwright
  let browserInstance = null

  async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
      browserInstance = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    }
    return browserInstance
  }

  function base64ToBuffer(base64) {
    const cleaned = base64.replace(/^data:image\/\w+;base64,/, '')
    return Buffer.from(cleaned, 'base64')
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
      const [year, month, day] = fecha.slice(0, 10).split('-')
      return `${day}/${month}/${year}`
    }
    return fecha
  }

  function limpiarNombreArchivo(texto, maxLength = 120) {
    if (texto == null || texto === '') return 'SIN DATO'
    let s = String(texto)
      .replace(/,/g, ' ')
      .replace(/\./g, ' ')
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
    if (!s) return 'SIN DATO'
    if (s.length > maxLength) s = s.slice(0, maxLength).trim()
    return s
  }

  function formatearFechaNombreArchivo(fecha) {
    if (!fecha) return 'SIN FECHA'
    const str = String(fecha).trim()
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`
    const latam = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    if (latam) {
      const day = latam[1].padStart(2, '0')
      const month = latam[2].padStart(2, '0')
      return `${day}-${month}-${latam[3]}`
    }
    return limpiarNombreArchivo(str, 20)
  }

  function buildReportePhPdfFileName(parte) {
    const pozo = limpiarNombreArchivo(parte?.pozo, 40)
    const fecha = formatearFechaNombreArchivo(parte?.fecha)
    const elemento = limpiarNombreArchivo(parte?.elemento_ensayar, 100)
    const prefix = `REPORTE DE PH - ${pozo} - ${fecha} - `
    const maxTotal = 200
    const suffix = '.pdf'
    const maxElemento = Math.max(10, maxTotal - prefix.length - suffix.length)
    const elementoFinal =
      elemento.length > maxElemento ? elemento.slice(0, maxElemento).trim() : elemento
    return `${prefix}${elementoFinal}${suffix}`
  }

  async function storagePdfPathExists(bucket, fileName) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('', { search: fileName, limit: 20 })

    if (error) {
      console.warn('No se pudo verificar existencia de PDF en Storage:', error.message)
      return false
    }

    return (data || []).some((item) => item.name === fileName)
  }

  function buildParteOperativoPdfFileName(parte) {
    const fecha = formatearFechaNombreArchivo(parte?.fecha)
    const pozo = limpiarNombreArchivo(parte?.pozo, 80)
    const prefix = `PARTE OPERATIVO - ${fecha} - `
    const maxTotal = 200
    const suffix = '.pdf'
    const maxPozo = Math.max(10, maxTotal - prefix.length - suffix.length)
    const pozoFinal = pozo.length > maxPozo ? pozo.slice(0, maxPozo).trim() : pozo
    return `${prefix}${pozoFinal}${suffix}`
  }

  async function resolveUniqueParteOperativoPdfPath(parte) {
    const bucket = process.env.BUCKET_PDF
    const baseName = buildParteOperativoPdfFileName(parte)

    if (!(await storagePdfPathExists(bucket, baseName))) {
      return baseName
    }

    if (parte?.numero_parte != null && String(parte.numero_parte).trim() !== '') {
      const withNumero = baseName.replace(/\.pdf$/i, ` - PARTE ${parte.numero_parte}.pdf`)
      if (!(await storagePdfPathExists(bucket, withNumero))) {
        return withNumero
      }
    }

    const stamp = Date.now().toString().slice(-8)
    return baseName.replace(/\.pdf$/i, ` - ${stamp}.pdf`)
  }

  async function resolveUniqueReportePhPdfPath(parte) {
    const bucket = process.env.BUCKET_PDF
    const baseName = buildReportePhPdfFileName(parte)

    if (!(await storagePdfPathExists(bucket, baseName))) {
      return baseName
    }

    if (parte?.reporte_numero != null && String(parte.reporte_numero).trim() !== '') {
      const withNumero = baseName.replace(/\.pdf$/i, ` - REPORTE N° ${parte.reporte_numero}.pdf`)
      if (!(await storagePdfPathExists(bucket, withNumero))) {
        return withNumero
      }
    }

    const stamp = Date.now().toString().slice(-8)
    return baseName.replace(/\.pdf$/i, ` - ${stamp}.pdf`)
  }

  function formatFechaPdf(fecha) {
    if (!fecha) return ''
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
      const [year, month, day] = fecha.slice(0, 10).split('-')
      return `${day}/${month}/${year}`
    }
    return String(fecha)
  }

  function getFechaLocalArgentina() {
    const hoy = new Date()
    const year = hoy.getFullYear()
    const month = String(hoy.getMonth() + 1).padStart(2, '0')
    const day = String(hoy.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function resolveParteOperativoPdfPath(parte) {
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

  function buildParteOperativoPdfUrl(pdfPath) {
    const bucket = process.env.BUCKET_PDF
    if (!pdfPath || !bucket) return null
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(pdfPath)
    return publicUrlData?.publicUrl || null
  }

async function registrarMovimiento({
  activo_id,
  tipo_movimiento,
  descripcion,
  usuario = 'Sistema',

  estado_anterior = null,
  estado_nuevo = null,

  ubicacion_anterior = null,
  ubicacion_nueva = null,

  asignado_anterior = null,
  asignado_nuevo = null,

  observaciones = null
}) {

  const { error } = await supabase
    .from('movimientos_inventario')
    .insert([{
      activo_id,
      tipo_movimiento,
      descripcion,
      usuario,

      estado_anterior,
      estado_nuevo,

      ubicacion_anterior,
      ubicacion_nueva,

      asignado_anterior,
      asignado_nuevo,

      observaciones
    }])

  if (error) {
    console.error('Error registrando movimiento:', error)
  }
}

  /**
   * POST /subir-wika
   */
  app.post('/subir-wika', async (req, res) => {
    try {
      const { parte_id, image_base64 } = req.body

      if (!parte_id) return res.status(400).json({ error: 'Falta parte_id' })
      if (!image_base64) return res.status(400).json({ error: 'Falta image_base64' })

      const buffer = base64ToBuffer(image_base64)
      const cleanParteId = String(parte_id).toLowerCase()
      const filePath = `wika_${cleanParteId}_${Date.now()}.png`

      const { error: upErr } = await supabase.storage
        .from(process.env.BUCKET_WIKA)
        .upload(filePath, buffer, {
          contentType: 'image/png',
          upsert: true,
        })

      if (upErr) throw upErr

      const { error: dbErr } = await supabase
        .from('partes')
        .update({ wika_image_path: filePath })
        .eq('id', parte_id)

      if (dbErr) throw dbErr

      const { data: publicUrlData } = supabase.storage
        .from(process.env.BUCKET_WIKA)
        .getPublicUrl(filePath)

      return res.json({
        ok: true,
        path: filePath,
        url: publicUrlData.publicUrl,
      })
    } catch (err) {
      console.error('Error en /subir-wika:', err)
      return res.status(500).json({ error: err.message })
    }
  })

  /**
   * POST /guardar-parte
   */
  app.post('/guardar-parte', async (req, res) => {
    try {
      const {
        foto_1_base64,
        foto_2_base64,
        ...resto
      } = req.body

      const datos = {
        ...resto,
        supervisor_email: 'jorge.dabrowski@kompasssrl.com.ar',
      }

      // 1. Guardar parte
      const { data: parte, error } = await supabase
        .from('partes')
        .insert([datos])
        .select()
        .single()

      if (error) throw error

      console.log('DEBUG PH GUARDADO partes:', {
        id: parte.id,
        tipo_prueba: parte.tipo_prueba,
        resultado_ensayo: parte.resultado_ensayo,
        presion_entrampada: parte.presion_entrampada,
        presion_testigo_inicial: parte.presion_testigo_inicial,
        hs_inicial_negativa: parte.hs_inicial_negativa,
        presion_testigo_final: parte.presion_testigo_final,
        hs_final_negativa: parte.hs_final_negativa,
        incremento: parte.incremento,
        porcentaje_perdida: parte.porcentaje_perdida,
        presion_estabilizada: parte.presion_estabilizada,
        hs_estabilizada: parte.hs_estabilizada,
        presion_final: parte.presion_final,
        hs_final: parte.hs_final,
        caida_presion: parte.caida_presion,
        porcentaje_caida: parte.porcentaje_caida,
      })

           // Vincular automáticamente Reporte PH con Parte Operativo
           const numeroPartePhRaw =
           parte?.reporte_numero ?? resto?.reporte_numero ?? datos?.reporte_numero
   
         console.log('Numero parte PH recibido:', numeroPartePhRaw)
   
         if (numeroPartePhRaw !== null && numeroPartePhRaw !== undefined && String(numeroPartePhRaw).trim() !== '') {
           const numeroParteStr = String(numeroPartePhRaw).trim()
           const numeroParteNum = Number(numeroParteStr)
           const valoresBusqueda = []
   
           if (!Number.isNaN(numeroParteNum)) {
             valoresBusqueda.push(numeroParteNum)
           }
           if (!valoresBusqueda.includes(numeroParteStr)) {
             valoresBusqueda.push(numeroParteStr)
           }
   
           let parteOperativo = null
   
           for (const valorBusqueda of valoresBusqueda) {
             console.log('Buscando parte operativo:', valorBusqueda, typeof valorBusqueda)
   
             const { data: encontrado, error: errorParteOperativo } = await supabase
               .from('partes_operativos')
               .select('id, numero_parte')
               .eq('numero_parte', valorBusqueda)
               .maybeSingle()
   
             if (errorParteOperativo) {
               console.log('Error buscando parte operativo:', errorParteOperativo.message)
               continue
             }
   
             if (encontrado) {
               parteOperativo = encontrado
               break
             }
           }
   
           if (parteOperativo) {
             console.log('Parte operativo encontrado:', parteOperativo)
   
             const numeroParteVinculo = parteOperativo.numero_parte ?? numeroParteNum ?? numeroParteStr
   
             const { error: errorVinculoPh } = await supabase
               .from('partes_operativos_ph')
               .insert([{
                 parte_operativo_id: parteOperativo.id,
                 reporte_ph_id: parte.id,
                 numero_parte: numeroParteVinculo,
                 tipo_prueba: parte.tipo_prueba,
                 valvula: parte.elemento_ensayar,                                 
                 presion_entrampada: parte.presion_entrampada,
                 presion_estabilizada: parte.presion_estabilizada,
                 hs_estabilizada: parte.hs_estabilizada,
                 presion_final: parte.presion_final,
                 hs_final: parte.hs_final,
                 resultado_ensayo: parte.resultado_ensayo,
                 estado: 'activo',
               }])
   
             if (errorVinculoPh) {
               console.log('Error insertando vinculo PH:', errorVinculoPh.message)
             } else {
               console.log('PH vinculada correctamente:', {
                 reporte_ph_id: parte.id,
                 parte_operativo_id: parteOperativo.id,
                 numero_parte: numeroParteVinculo,
               })
             }
           } else {
             console.log('Error buscando parte operativo: no existe parte con numero_parte', numeroParteStr)
           }
         }

      const updates = {}

      // 2. Subir foto 1
      if (foto_1_base64) {
        const buffer = Buffer.from(foto_1_base64, 'base64')
        const fileName = `foto1_${parte.id}_${Date.now()}.jpg`
        const path = fileName

        const { error: uploadError } = await supabase.storage
          .from('fotos') // podés cambiar a "fotos" si querés otro bucket
          .upload(path, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          })

        if (uploadError) {
          console.error('Error subiendo foto 1:', uploadError)
        } else {
          updates.foto_1_path = path
        }
      }

      // 3. Subir foto 2
      if (foto_2_base64) {
        const buffer = Buffer.from(foto_2_base64, 'base64')
        const fileName = `foto2_${parte.id}_${Date.now()}.jpg`
        const path = `fotos/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('fotos')
          .upload(path, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          })

        if (uploadError) {
          console.error('Error subiendo foto 2:', uploadError)
        } else {
          updates.foto_2_path = path
        }
      }

      // 4. Actualizar parte con paths
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('partes')
          .update(updates)
          .eq('id', parte.id)
      }

      return res.json({
        ok: true,
        message: 'Parte guardado con fotos correctamente',
        parte_id: parte.id,
      })
    } catch (err) {
      console.error('Error en /guardar-parte:', err)
      return res.status(500).json({ error: err.message })
    }
  })

  /**
   * GET /reportes-ph
   * Lista partes para la pantalla del supervisor
   */
  app.get('/reportes-ph', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('partes')
        .select(
          'id, reporte_numero, fecha, cliente, pozo, elemento_ensayar, wika_image_path, reporte_pdf_path, created_at'
        )
        .order('created_at', { ascending: false })

      if (error) throw error

      const reportes = (data || []).map((item) => ({
        ...item,
        estado: item.reporte_pdf_path
          ? 'PDF generado'
          : item.wika_image_path
          ? 'Con gráfico cargado'
          : 'Pendiente de gráfico',
      }))

      return res.json({ ok: true, reportes })
    } catch (err) {
      console.error('Error en /reportes-ph:', err)
      return res.status(500).json({ error: err.message })
    }
  })

  /**
   * GET /reportes-ph/:id
   * Trae el detalle de un parte
   */
  app.get('/reportes-ph/:id', async (req, res) => {
    try {
      const { id } = req.params

      const { data, error } = await supabase
        .from('partes')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      return res.json({ ok: true, parte: data })
    } catch (err) {
      console.error('Error en /reportes-ph/:id:', err)
      return res.status(500).json({ error: err.message })
    }
  })

  /**
   * DELETE /reportes-ph/:id
   * Elimina un reporte PH y sus vínculos en partes_operativos_ph.
   */
  async function deleteReportePhCascade(reporteId) {
    const { data: parte, error: errorParte } = await supabase
      .from('partes')
      .select('id, reporte_numero')
      .eq('id', reporteId)
      .maybeSingle()

    if (errorParte) throw errorParte
    if (!parte) {
      return { ok: false, status: 404, error: 'Reporte PH no encontrado' }
    }

    const { error: errorLinks } = await supabase
      .from('partes_operativos_ph')
      .delete()
      .eq('reporte_ph_id', reporteId)

    if (errorLinks) throw errorLinks

    const { error: errorDelete } = await supabase
      .from('partes')
      .delete()
      .eq('id', reporteId)

    if (errorDelete) throw errorDelete

    return { ok: true, parte }
  }

  app.delete('/reportes-ph/:id', async (req, res) => {
    try {
      const { id } = req.params
      const result = await deleteReportePhCascade(id)

      if (!result.ok) {
        return res.status(result.status || 400).json({
          ok: false,
          error: result.error,
        })
      }

      res.status(200).json({
        ok: true,
        message: 'Reporte PH eliminado correctamente',
        id: result.parte.id,
        reporte_numero: result.parte.reporte_numero ?? null,
      })
    } catch (error) {
      console.error('Error eliminando reporte PH:', error)
      res.status(500).json({
        ok: false,
        error: error.message || 'Error al eliminar reporte PH',
      })
    }
  })

  /**
   * POST /generar-reporte
   */
  app.post('/generar-reporte', async (req, res) => {
    let context = null
    let page = null

    try {
      const { parte_id } = req.body
      if (!parte_id) return res.status(400).json({ error: 'Falta parte_id' })

      const { data, error } = await supabase
        .from('partes')
        .select('*')
        .eq('id', parte_id)
        .single()

      if (error) throw error

      console.log('DEBUG PH PDF DATA:', {
        id: data.id,
        tipo_prueba: data.tipo_prueba,
        fecha: data.fecha,
        resultado_ensayo: data.resultado_ensayo,
        presion_entrampada: data.presion_entrampada,
        presion_testigo_inicial: data.presion_testigo_inicial,
        hs_inicial_negativa: data.hs_inicial_negativa,
        presion_testigo_final: data.presion_testigo_final,
        hs_final_negativa: data.hs_final_negativa,
        incremento: data.incremento,
        porcentaje_perdida: data.porcentaje_perdida,
        presion_estabilizada: data.presion_estabilizada,
        hs_estabilizada: data.hs_estabilizada,
        presion_final: data.presion_final,
        hs_final: data.hs_final,
        caida_presion: data.caida_presion,
        porcentaje_caida: data.porcentaje_caida,
        reporte_pdf_path: data.reporte_pdf_path,
      })

      if (data.reporte_pdf_path) {
      const { data: pdfUrlData } = supabase.storage
      .from(process.env.BUCKET_PDF)
      .getPublicUrl(data.reporte_pdf_path)

    console.log(
      'DEBUG PH PDF: devolviendo PDF cacheado (no regenera HTML). Borrá reporte_pdf_path en Supabase para forzar nuevo PDF.',
      data.reporte_pdf_path
    )

    return res.json({
      message: 'PDF ya generado previamente',
      reporte_pdf_path: data.reporte_pdf_path,
      reporte_pdf_url: pdfUrlData?.publicUrl || ''
    })
  }

      console.log(`Generando reporte para parte_id: ${parte_id}`)

      if (!data.wika_image_path) {
        return res.status(400).json({
          error: 'Este parte no tiene wika_image_path. Primero subí el gráfico con /subir-wika',
        })
      }

      const { data: wikaUrlData } = supabase.storage
    .from(process.env.BUCKET_WIKA)
    .getPublicUrl(data.wika_image_path)

  const wikaImageUrl = wikaUrlData?.publicUrl || ''

  let foto1Url = ''
  let foto2Url = ''

  if (data.foto_1_path) {
    const { data: foto1UrlData } = supabase.storage
      .from('fotos')
      .getPublicUrl(data.foto_1_path)

    foto1Url = foto1UrlData?.publicUrl || ''
  }

  if (data.foto_2_path) {
    const { data: foto2UrlData } = supabase.storage
      .from('fotos')
      .getPublicUrl(data.foto_2_path)

    foto2Url = foto2UrlData?.publicUrl || ''
  }

      const esPruebaNegativa =
        String(data.tipo_prueba || '').trim().toLowerCase() === 'negativa'

      console.log('DEBUG PH PDF RENDER:', {
        parte_id,
        esPruebaNegativa,
        tipo_prueba: data.tipo_prueba,
      })

      function pickPdfValor(registro, ...campos) {
        for (const campo of campos) {
          const valor = registro[campo]
          if (valor !== null && valor !== undefined && String(valor).trim() !== '') {
            return String(valor).trim()
          }
        }
        return ''
      }

      // Registros viejos guardaron negativa en columnas positivas; fallback solo para PDF.
      const pdfNegativa = esPruebaNegativa
        ? {
            presion_entrampada: pickPdfValor(
              data,
              'presion_entrampada',
              'presion_estabilizada'
            ),
            incremento: pickPdfValor(data, 'incremento', 'hs_estabilizada'),
            presion_testigo_inicial: pickPdfValor(
              data,
              'presion_testigo_inicial',
              'presion_final'
            ),
            hs_inicial_negativa: pickPdfValor(
              data,
              'hs_inicial_negativa',
              'hs_final'
            ),
            presion_testigo_final: pickPdfValor(
              data,
              'presion_testigo_final',
              'caida_presion'
            ),
            hs_final_negativa: pickPdfValor(
              data,
              'hs_final_negativa',
              'porcentaje_caida'
            ),
            porcentaje_perdida: pickPdfValor(data, 'porcentaje_perdida'),
          }
        : null

      const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <style>
      @page {
        size: A4;
        margin: 14mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        font-size: 15px;
        line-height: 1.4;
        margin: 0;
        padding: 0;
      }

      .page {
        width: 100%;
      }

      .page:last-child {
        page-break-after: auto;
      }

      .doc-top {
        text-align: right;
        font-size: 11px;
        margin-bottom: 8px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      .main-header td {
        border: 1px solid #000;
        vertical-align: middle;
        padding: 0;
        height: 28px;
      }

      .main-title {
        font-size: 24px;
        font-weight: bold;
        text-align: center;
        letter-spacing: 0.3px;
        padding: 0 12px;
      }

      .logo-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 4px;
      }

      .logo-box img {
        width: 100%;
        max-width: 100%;
        max-height: 220px;
        object-fit: contain;
        display: block;
      }

      .small-box {
        font-size: 12px;
        height: 30px;
      }

      .section-title {
        border: 1px solid #000;
        background: #d9d9d9;
        font-weight: bold;
        text-transform: uppercase;
        padding: 4px 6px;
        font-size: 15px;
        margin-top: 10px;
        margin-bottom: 0;
      }

      .form-table td,
      .form-table th {
        border: 1px solid #000;
        padding: 6px 8px;
        vertical-align: middle;
        height: 34px;
        font-size: 15px;
      }

      .label-cell {
        background: #e6e6e6;
        font-weight: bold;
        width: 24%;
        white-space: nowrap;
        font-size: 15px;
      }

      .value-cell {
        background: #fff;
      }

      .center {
        text-align: center;
      }

      .detail-box {
        border: 1px solid #000;
        min-height: 130px;
        padding: 8px;
        white-space: pre-wrap;
      }

      .result-row {
        margin-top: 8px;
        border: 1px solid #000;
        border-top: none;
      }

      .result-table td {
        border: 1px solid #000;
        padding: 6px;
        height: 32px;
      }

      .criteria {
        margin-top: 8px;
        font-size: 13px;
      }

      .criteria strong {
        text-decoration: underline;
      }

      .signatures {
        margin-top: 10px;
        width: 100%;
        border-collapse: collapse;
      }

      .signatures td {
        border: 1px solid #000;
        height: 70px;
        vertical-align: bottom;
        text-align: center;
        padding-bottom: 6px;
        font-size: 10px;
      }

      .wika-box {
    border: 1px solid #000;
    padding: 8px;
    margin-top: 10px;
    min-height: 420px;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .wika-box img {
    width: 100%;
    max-height: 400px;
    object-fit: contain;
    display: block;
  }

  .photo-section {
    margin-top: 10px;
  }

  .photo-grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 10px 0;
    table-layout: fixed;
  }

  .photo-grid td {
    width: 50%;
    vertical-align: top;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .photo-box {
    border: 1px solid #000;
    padding: 10px;
    min-height: 420px;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .photo-title {
    font-weight: bold;
    text-align: center;
    margin-bottom: 10px;
    font-size: 13px;
    text-transform: uppercase;
  }

  .photo-box img {
    width: 100%;
    height: 470px;
    object-fit: contain;
    display: block;
    page-break-inside: avoid;
    break-inside: avoid;
  }

      .obs-box {
        border: 1px solid #000;
        min-height: 90px;
        padding: 8px;
        white-space: pre-wrap;
      }

      .muted-empty {
        color: #555;
        text-align: center;
        margin-top: 40px;
        font-style: italic;
      }

      .mb-8 {
        margin-bottom: 8px;
      }

      .mb-10 {
        margin-bottom: 10px;
      }

      .mt-10 {
        margin-top: 10px;
      }
    </style>
  </head>
  <body>

    <div class="page">
      <div class="doc-top">Documento: YPF-Público</div>

      <table class="main-header">
        <tr>
          <td rowspan="3" style="width:35%;">
            <div class="logo-box">
              <img src="https://ydydsdekktvvrafwajwi.supabase.co/storage/v1/object/public/logos/logo.png" alt="Logo Kompass" />
            </div>
          </td>
          <td rowspan="3" class="main-title" style="width:48%;">REPORTE DE ENSAYO DE HERMETICIDAD</td>
          <td class="small-box" style="width:20%; padding: 6px;"><strong>COD:</strong></td>
        </tr>
        <tr>
          <td class="small-box" style="padding: 6px;"><strong>Revisión:</strong></td>
        </tr>
        <tr>
          <td class="small-box" style="padding: 6px;"><strong>Fecha de Revisión:</strong></td>
        </tr>
      </table>

      <div class="section-title">Información proporcionada</div>
  <table class="form-table">
    <tr>
      <td class="label-cell center">Reporte N°</td>
      <td class="value-cell">${data.reporte_numero || ''}</td>
      <td class="label-cell center">Fecha</td>
      <td class="value-cell">${formatearFecha(data.fecha)}</td>
    </tr>
    <tr>
      <td class="label-cell center">Cliente</td>
      <td class="value-cell" colspan="3">${data.cliente || ''}</td>
    </tr>
    <tr>
      <td class="label-cell center">Equipo</td>
      <td class="value-cell">${data.equipo || ''}</td>
      <td class="label-cell center">Ubicación</td>
      <td class="value-cell">${data.yacimiento || ''}</td>
    </tr>
    <tr>
      <td class="label-cell center">Pozo</td>
      <td class="value-cell" colspan="3">${data.pozo || ''}</td>
    </tr>
    <tr>
      <td class="label-cell center">Presión de ensayo</td>
      <td class="value-cell">${data.presion_ensayo || ''}</td>
      <td class="label-cell center">Tiempo de ensayo</td>
      <td class="value-cell">${data.tiempo_ensayo || ''}</td>
    </tr>
    <tr>
      <td class="label-cell center">Fluido utilizado</td>
      <td class="value-cell" colspan="3">${data.fluido_utilizado || ''}</td>
    </tr>
  </table>

      <div class="section-title">Información relevada</div>
      <table class="form-table">
        <tr>
          <td class="label-cell center">Elemento a ensayar</td>
          <td class="value-cell">${data.elemento_ensayar || ''}</td>
          <td class="label-cell center">Marca</td>
          <td class="value-cell">${data.marca || ''}</td>
        </tr>
        <tr>
          <td class="label-cell center">Modelo</td>
          <td class="value-cell">${data.modelo || ''}</td>
          <td class="label-cell center">N° de Serie</td>
          <td class="value-cell">${data.numero_serie_elemento || ''}</td>
        </tr>
        <tr>
          <td class="label-cell center">N° de Parte</td>
          <td class="value-cell">${data.numero_parte || ''}</td>
          <td class="label-cell center">Otros</td>
          <td class="value-cell">${data.otros || ''}</td>
        </tr>
      </table>

      <div class="section-title">Información del equipamiento utilizado</div>
  <table class="form-table">
    <tr>
      <td class="label-cell center">Equipamiento</td>
      <td class="label-cell center">Número de serie</td>
      <td class="label-cell center">MBO N° 01 / Vencimiento</td>
    </tr>
    <tr>
      <td class="value-cell center">${data.equipo || ''}</td>
      <td class="value-cell center">${data.numero_serie_equipamiento || ''}</td>
      <td class="value-cell center">${formatearFecha(data.vencimiento)}</td>
    </tr>
    <tr>
      <td class="value-cell center">${data.sensor_wika || 'SENSOR WIKA'}</td>
      <td class="value-cell center">${data.numero_serie_wika || ''}</td>
      <td class="value-cell center">${formatearFecha(data.vencimiento_wika)}</td>
    </tr>
  </table>

      <div class="section-title">Detalle del ensayo</div>
      <div class="detail-box">${data.detalle_ensayo || ''}</div>

      <table class="result-table mt-10" style="width:100%; border-collapse: collapse;">
        <tr>
          <td style="width:22%;"><strong>Precinto N°:</strong></td>
          <td style="width:28%;">${data.numero_precinto || data.numero_presinto || ''}</td>
          <td style="width:25%;"><strong>Resultado del ensayo</strong></td>
          <td style="width:25%;">${data.resultado_ensayo ?? ''}</td>
        </tr>
      </table>

      <div class="criteria">
        <strong>Criterio de aceptación:</strong> ${data.criterio_aceptacion || '5% de la Pmax/300 psi'}
      </div>

      <div class="section-title">Personal involucrado</div>
      <table class="form-table">
        <tr>
          <td class="label-cell center">Supervisor operativo</td>
          <td class="value-cell">${data.supervisor_operativo || ''}</td>
        </tr>
        <tr>
          <td class="label-cell center">Operador Líder</td>
          <td class="value-cell">${data.operador_lider || ''}</td>
        </tr>
        <tr>
          <td class="label-cell center">Operador</td>
          <td class="value-cell">${data.operador || ''}</td>
        </tr>
        <tr>
          <td class="label-cell center">Ayudante</td>
          <td class="value-cell">${data.ayudante || ''}</td>
        </tr>
      </table>

      <table class="signatures">
        <tr>
          <td>FIRMA Y ACLARACIÓN</td>
          <td>FIRMA Y ACLARACIÓN - CLIENTE</td>
        </tr>
      </table>
    </div>

    <div class="page">
      <div class="doc-top">Documento: YPF-Público</div>



      <div class="section-title">Datos del ensayo</div>
  <table class="form-table">
    ${
      esPruebaNegativa
        ? `
    <tr>
      <td class="label-cell center">Presión entrampada</td>
      <td class="value-cell">${pdfNegativa.presion_entrampada}</td>
      <td class="label-cell center">Incremento de presión</td>
      <td class="value-cell">${pdfNegativa.incremento}</td>
    </tr>
    <tr>
      <td class="label-cell center">Presión testigo</td>
      <td class="value-cell">${pdfNegativa.presion_testigo_inicial}</td>
      <td class="label-cell center">Hs inicio</td>
      <td class="value-cell">${pdfNegativa.hs_inicial_negativa}</td>
    </tr>
    <tr>
      <td class="label-cell center">Presión final</td>
      <td class="value-cell">${pdfNegativa.presion_testigo_final}</td>
      <td class="label-cell center">Hs final</td>
      <td class="value-cell">${pdfNegativa.hs_final_negativa}</td>
    </tr>
    <tr>
      <td class="label-cell center">% de pérdida</td>
      <td class="value-cell">${pdfNegativa.porcentaje_perdida}</td>
      <td class="label-cell center"></td>
      <td class="value-cell"></td>
    </tr>
        `
        : `
    <tr>
      <td class="label-cell center">Presión estabilizada</td>
      <td class="value-cell">${data.presion_estabilizada ?? ''}</td>
      <td class="label-cell center">Hs estabilizada</td>
      <td class="value-cell">${data.hs_estabilizada ?? ''}</td>
    </tr>
    <tr>
      <td class="label-cell center">Presión final</td>
      <td class="value-cell">${data.presion_final ?? ''}</td>
      <td class="label-cell center">Hs final</td>
      <td class="value-cell">${data.hs_final ?? ''}</td>
    </tr>
    <tr>
      <td class="label-cell center">Caída de presión</td>
      <td class="value-cell">${data.caida_presion ?? ''}</td>
      <td class="label-cell center">% de caída</td>
      <td class="value-cell">${data.porcentaje_caida ?? ''}</td>
    </tr>
        `
    }
  </table>

      <div class="section-title">Observaciones</div>
      <div class="obs-box">${data.observaciones || ''}</div>

      <div class="section-title">Registro WIKA</div>
      <div class="wika-box">
        ${
          wikaImageUrl
            ? `<img src="${wikaImageUrl}" alt="Gráfico WIKA" />`
            : `<div class="muted-empty">Sin gráfico WIKA cargado</div>`
        }
      </div>

      <div class="photo-section">
    <div class="section-title">Registro fotográfico</div>
    <table class="photo-grid">
      <tr>
        <td>
          <div class="photo-box">
            <div class="photo-title">Foto 1</div>
            ${
              foto1Url
                ? `<img src="${foto1Url}" alt="Foto 1 del ensayo" />`
                : `<div class="muted-empty">Sin foto 1 cargada</div>`
            }
          </div>
        </td>

        <td>
          <div class="photo-box">
            <div class="photo-title">Foto 2</div>
            ${
              foto2Url
                ? `<img src="${foto2Url}" alt="Foto 2 del ensayo" />`
                : `<div class="muted-empty">Sin foto 2 cargada</div>`
            }
          </div>
        </td>
      </tr>
    </table>
  </div>

  </body>
  </html>
  `
      const browser = await getBrowser()
      context = await browser.newContext()
      page = await context.newPage()

      await page.setContent(html, { waitUntil: 'load' })

      await page
        .waitForFunction(() => {
          return Array.from(document.images).every(
            (img) => img.complete
          )
        }, { timeout: 8000 })
        .catch((e) =>
          console.warn('Warning: timeout esperando imagen (posible imagen lenta o rota)', e)
        )

      const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '18mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    }
  })

      const pdfPath = await resolveUniqueReportePhPdfPath(data)

      console.log('DEBUG PH PDF PATH:', {
        parte_id,
        reporte_numero: data.reporte_numero,
        pozo: data.pozo,
        fecha: data.fecha,
        elemento_ensayar: data.elemento_ensayar,
        pdfPath,
      })

      const { error: pdfErr } = await supabase.storage
        .from(process.env.BUCKET_PDF)
        .upload(pdfPath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (pdfErr) throw pdfErr

      const { error: dbPdfErr } = await supabase
        .from('partes')
        .update({ reporte_pdf_path: pdfPath })
        .eq('id', parte_id)

      if (dbPdfErr) throw dbPdfErr

      const { data: pdfUrlData } = supabase.storage
        .from(process.env.BUCKET_PDF)
        .getPublicUrl(pdfPath)

      const publicUrl = pdfUrlData.publicUrl

      const mail = { attempted: false, ok: false, error: null }

      const canMail =
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.MAIL_FROM &&
        data.supervisor_email

      if (canMail) {
        mail.attempted = true
        try {
          await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: data.supervisor_email,
            subject: 'Reporte generado',
            html: `<p>Tu reporte está listo:</p><a href="${publicUrl}">${publicUrl}</a>`,
          })
          mail.ok = true
        } catch (e) {
          mail.ok = false
          mail.error = e?.message || String(e)
          console.error('SMTP SEND FAIL:', mail.error)
        }
      }

      return res.json({ ok: true, url: publicUrl, mail })
    } catch (err) {
      console.error('Error en /generar-reporte:', err)
      return res.status(500).json({ error: err.message })
    } finally {
      if (page) await page.close().catch(() => {})
      if (context) await context.close().catch(() => {})
    }
  })

  app.get('/activos-operador', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activos')
      .select('*')
      .eq('activo', true)

    if (error) throw error

    const unidades = data.filter(a => a.categoria === 'unidad')
    const wikas = data.filter(a => a.categoria === 'wika')

    res.json({
      ok: true,
      unidades,
      wikas
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({
      ok: false,
      error: 'Error al obtener activos'
    })
  }
})

app.get('/activos', async (req, res) => {
  try {
    const { categoria } = req.query

    let query = supabase
      .from('activos')
      .select('*')
      .eq('activo', true)
      .order('descripcion', { ascending: true })

    if (categoria) {
      query = query.eq('categoria', categoria)
    }

    const { data, error } = await query

    if (error) throw error

    res.json(data)
  } catch (error) {
    console.error('Error obteniendo activos:', error)
    res.status(500).json({ error: 'Error obteniendo activos' })
  }
})

/**
 * GET /activos/serie/:numeroSerie
 * Busca un activo por número de serie (comparación insensible a mayúsculas y espacios).
 */
app.get('/activos/serie/:numeroSerie', async (req, res) => {
  try {
    const serie = decodeURIComponent(req.params.numeroSerie || '').trim().toLowerCase()

    if (!serie) {
      return res.status(400).json({
        ok: false,
        error: 'Número de serie requerido',
      })
    }

    const { data, error } = await supabase
      .from('activos')
      .select('id, descripcion, numero_serie, categoria, marca, ubicacion, estado, asignado_a')
      .eq('activo', true)
      .not('numero_serie', 'is', null)

    if (error) throw error

    const activo = (data || []).find(
      (row) => String(row.numero_serie || '').trim().toLowerCase() === serie
    )

    if (!activo) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró un activo con ese número de serie',
      })
    }

    return res.json({ ok: true, activo })
  } catch (error) {
    console.error('Error buscando activo por serie:', error)
    res.status(500).json({
      ok: false,
      error: error.message || 'Error buscando activo por número de serie',
    })
  }
})

// =========================
// ACTIVOS - CREAR
// =========================
app.post('/activos', async (req, res) => {

  try {

    const { data, error } = await supabase
      .from('activos')
      .insert([req.body])
      .select()
      .single()

    if (error) throw error

    // REGISTRAR MOVIMIENTO
    await registrarMovimiento({
      activo_id: data.id,

      tipo_movimiento: 'creacion',

      descripcion: 'Activo creado',

      usuario: 'Administrador',

      estado_nuevo: data.estado,
      ubicacion_nueva: data.ubicacion,
      asignado_nuevo: data.asignado_a,

      observaciones: data.observaciones
    })

    res.json({
      ok: true,
      activo: data
    })

  } catch (error) {

    console.error('Error creando activo:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// =========================
// ACTIVOS - EDITAR
// =========================
const ACTIVO_UPDATE_FIELDS = [
  'descripcion',
  'categoria',
  'numero_serie',
  'marca',
  'estado',
  'ubicacion',
  'asignado_a',
  'vencimiento',
  'certificado_url',
  'observaciones',
  'proveedor',
  'dias_aviso',
  'activo',
]

function pickActivoUpdateFields(body) {
  const payload = {}
  for (const key of ACTIVO_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      payload[key] = body[key]
    }
  }
  return payload
}

app.put('/activos/:id', async (req, res) => {

  try {

    const { id } = req.params

    const {
      usuario: usuarioMovimiento,
      tipo_movimiento: tipoMovimientoCustom,
      descripcion_movimiento: descripcionMovimientoCustom,
      observaciones_movimiento: observacionesMovimientoCustom,
      ...rawBody
    } = req.body || {}

    const updatePayload = pickActivoUpdateFields(rawBody)

    // ACTIVO ANTES DEL CAMBIO
    const { data: activoAnterior, error: errorAnterior } = await supabase
      .from('activos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorAnterior) throw errorAnterior

    // ACTUALIZAR
    const { data, error } = await supabase
      .from('activos')
      .update({
        ...updatePayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const vencimientoCambio =
      String(activoAnterior.vencimiento ?? '') !== String(data.vencimiento ?? '')
    const certificadoCambio =
      String(activoAnterior.certificado_url ?? '') !== String(data.certificado_url ?? '')

    const tipoMovimiento =
      tipoMovimientoCustom ||
      (vencimientoCambio || certificadoCambio
        ? 'actualización de certificación'
        : 'edicion')

    const descripcionMovimiento =
      descripcionMovimientoCustom ||
      (tipoMovimiento === 'actualización de certificación'
        ? 'Actualización de certificación'
        : 'Activo editado')

    const observacionesMovimiento =
      observacionesMovimientoCustom ||
      (tipoMovimiento === 'actualización de certificación'
        ? 'Se actualizó vencimiento/certificado del activo'
        : data.observaciones)

    // REGISTRAR MOVIMIENTO
    await registrarMovimiento({
      activo_id: data.id,

      tipo_movimiento: tipoMovimiento,

      descripcion: descripcionMovimiento,

      usuario: usuarioMovimiento || 'Administrador',

      estado_anterior: activoAnterior.estado,
      estado_nuevo: data.estado,

      ubicacion_anterior: activoAnterior.ubicacion,
      ubicacion_nueva: data.ubicacion,

      asignado_anterior: activoAnterior.asignado_a,
      asignado_nuevo: data.asignado_a,

      observaciones: observacionesMovimiento
    })

    res.json({
      ok: true,
      activo: data
    })

  } catch (error) {

    console.error('Error editando activo:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// =========================
// ACTIVOS - HISTORIAL
// =========================
app.get('/activos/:id/movimientos', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('movimientos_inventario')
      .select('*')
      .eq('activo_id', id)
      .order('fecha', { ascending: false })

    if (error) throw error

    res.json({
      ok: true,
      movimientos: data
    })

  } catch (error) {
    console.error('Error obteniendo historial:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})
// =========================
// CONSUMIBLES - GET
// =========================
app.get('/consumibles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('consumibles')
      .select('*')
      .eq('activo', true)
      .order('descripcion', { ascending: true })

    if (error) throw error

    res.json(data)
  } catch (error) {
    console.error('Error obteniendo consumibles:', error)
    res.status(500).json({ error: 'Error obteniendo consumibles' })
  }
})

// =========================
// CONSUMIBLES - CREAR
// =========================
app.post('/consumibles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('consumibles')
      .insert([req.body])
      .select()
      .single()

    if (error) throw error

    res.json({ ok: true, consumible: data })
  } catch (error) {
    console.error('Error creando consumible:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// =========================
// CONSUMIBLES - EDITAR
// =========================
app.put('/consumibles/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('consumibles')
      .update({
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json({ ok: true, consumible: data })
  } catch (error) {
    console.error('Error editando consumible:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})

// =========================
// CONSUMIBLES - MOVIMIENTO DE STOCK
// =========================
app.post('/consumibles/:id/movimiento', async (req, res) => {
  try {
    const { id } = req.params
    const {
      tipo_movimiento,
      cantidad_movimiento,
      usuario = 'Administrador',
      observaciones = null
    } = req.body

    if (!tipo_movimiento) {
      return res.status(400).json({
        ok: false,
        error: 'Falta tipo_movimiento'
      })
    }

    if (!['ingreso', 'egreso', 'ajuste'].includes(tipo_movimiento)) {
      return res.status(400).json({
        ok: false,
        error: 'Tipo de movimiento inválido'
      })
    }

    const cantidadNum = Number(cantidad_movimiento)

    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'La cantidad debe ser mayor a 0'
      })
    }

    const { data: consumible, error: errorConsumible } = await supabase
      .from('consumibles')
      .select('*')
      .eq('id', id)
      .single()

    if (errorConsumible) throw errorConsumible

    const cantidadAnterior = Number(consumible.cantidad || 0)

    let cantidadNueva = cantidadAnterior

    if (tipo_movimiento === 'ingreso') {
      cantidadNueva = cantidadAnterior + cantidadNum
    }

    if (tipo_movimiento === 'egreso') {
      cantidadNueva = cantidadAnterior - cantidadNum

      if (cantidadNueva < 0) {
        return res.status(400).json({
          ok: false,
          error: 'No hay stock suficiente para realizar el egreso'
        })
      }
    }

    if (tipo_movimiento === 'ajuste') {
      cantidadNueva = cantidadNum
    }

    const { data: actualizado, error: errorUpdate } = await supabase
      .from('consumibles')
      .update({
        cantidad: cantidadNueva,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (errorUpdate) throw errorUpdate

    const { error: errorMovimiento } = await supabase
      .from('movimientos_consumibles')
      .insert([{
        consumible_id: id,
        tipo_movimiento,
        cantidad_anterior: cantidadAnterior,
        cantidad_movimiento: cantidadNum,
        cantidad_nueva: cantidadNueva,
        usuario,
        observaciones
      }])

    if (errorMovimiento) throw errorMovimiento

    res.json({
      ok: true,
      consumible: actualizado
    })

  } catch (error) {
    console.error('Error registrando movimiento de consumible:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

    // =========================
// CONSUMIBLES - HISTORIAL
// =========================
app.get('/consumibles/:id/movimientos', async (req, res) => {
  try {

    const { id } = req.params

    const { data, error } = await supabase
      .from('movimientos_consumibles')
      .select('*')
      .eq('consumible_id', id)
      .order('fecha', { ascending: false })

    if (error) throw error

    res.json({
      ok: true,
      movimientos: data
    })

  } catch (error) {

    console.error('Error obteniendo historial consumible:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// =========================
// PARTES OPERATIVOS
// =========================

// LISTAR PARTES
app.get('/partes-operativos', async (req, res) => {
  try {

    const { data, error } = await supabase
      .from('partes_operativos')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const partes = (data || []).map((parte) => {
      const pdf_path = resolveParteOperativoPdfPath(parte)
      const pdf_url = buildParteOperativoPdfUrl(pdf_path)

      if (String(parte.numero_parte) === '14') {
        console.log('DEBUG GET PARTES OPERATIVOS ROW', {
          id: parte.id,
          numero_parte: parte.numero_parte,
          estado: parte.estado,
          pdf_path: parte.pdf_path,
          reporte_pdf_path: parte.reporte_pdf_path,
          parte_pdf_path: parte.parte_pdf_path,
          resolved_pdf_path: pdf_path,
          pdf_url,
        })
      }

      return {
        ...parte,
        unidad: parte.unidad_pesada ?? null,
        pdf_path,
        pdf_url,
      }
    })

    partes.sort((a, b) => {
      const fa = a.fecha || a.created_at || ''
      const fb = b.fecha || b.created_at || ''
      return String(fb).localeCompare(String(fa))
    })

    res.json({
      ok: true,
      partes,
    })

  } catch (error) {

    console.error('Error obteniendo partes operativos:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// CREAR PARTE
app.post('/partes-operativos', async (req, res) => {
  try {

    const {
      pozo,
      fecha,
      yacimiento = null,
      operadora = null,
      contratista = 'KOMPASS',
      unidad_pesada = null,
      salida_desde = null,
      km = null,
      supervisor_operativo = null,
      operador_1 = null,
      operador_2 = null,
      operador_3 = null
    } = req.body

    const fechaParte =
      typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())
        ? fecha.trim()
        : getFechaLocalArgentina()

    if (!pozo) {
      return res.status(400).json({
        ok: false,
        error: 'Falta completar el pozo'
      })
    }

    const { data, error } = await supabase
      .from('partes_operativos')
      .insert([{
        pozo,
        fecha: fechaParte,
        yacimiento,
        operadora,
        contratista,
        unidad_pesada,
        salida_desde,
        km,
        supervisor_operativo,
        operador_1,
        operador_2,
        operador_3,
        estado: 'abierto'
      }])
      .select()
      .single()

    if (error) throw error

    res.json({
      ok: true,
      parte: data
    })

  } catch (error) {

    console.error('Error creando parte operativo:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

async function loadParteOperativoRelaciones(parteId) {
  const { data: servicios, error: errorServicios } = await supabase
    .from('partes_operativos_servicios')
    .select('*')
    .eq('parte_id', parteId)
    .order('pos', { ascending: true })

  if (errorServicios) throw errorServicios

  const { data: pruebasPhLinks, error: errorPruebasPh } = await supabase
    .from('partes_operativos_ph')
    .select('*')
    .eq('parte_operativo_id', parteId)
    .order('created_at', { ascending: true })

  if (errorPruebasPh) throw errorPruebasPh

  const reportePhIds = (pruebasPhLinks || [])
    .map((row) => row.reporte_ph_id)
    .filter(Boolean)

  let partesPhById = {}

  if (reportePhIds.length > 0) {
    const { data: partesPhRows, error: errorPartesPhRows } = await supabase
      .from('partes')
      .select('id, reporte_numero, tipo_prueba, elemento_ensayar, resultado_ensayo, reporte_pdf_path')
      .in('id', reportePhIds)

    if (errorPartesPhRows) throw errorPartesPhRows

    partesPhById = Object.fromEntries((partesPhRows || []).map((p) => [p.id, p]))
  }

  const pruebas_ph = (pruebasPhLinks || []).map((link) => {
    const ph = partesPhById[link.reporte_ph_id] || {}
    return {
      ...link,
      reporte_numero: ph.reporte_numero ?? link.numero_parte ?? null,
      tipo_prueba: ph.tipo_prueba ?? link.tipo_prueba ?? null,
      elemento_ensayar: ph.elemento_ensayar ?? link.valvula ?? null,
      resultado_ensayo: ph.resultado_ensayo ?? link.resultado_ensayo ?? null,
      reporte_pdf_path: ph.reporte_pdf_path ?? null,
    }
  })

  return { servicios: servicios || [], pruebas_ph }
}

async function loadHistorialParteOperativo(parteId) {
  const { data, error } = await supabase
    .from('historial_partes_operativos')
    .select('*')
    .eq('parte_id', parteId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('Historial de partes operativos no disponible:', error.message)
    return []
  }
  return data || []
}

function normalizarMotivo(motivo) {
  return typeof motivo === 'string' ? motivo.trim() : ''
}

function formatSupabaseError(error) {
  if (!error) return 'Error desconocido'
  if (typeof error === 'string') return error
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ')
}

async function insertarHistorialParteOperativo(historialPayload, contextLabel = 'HISTORIAL') {
  console.log(`INSERT HISTORIAL PAYLOAD (${contextLabel}):`, historialPayload)

  const { data, error: historialError } = await supabase
    .from('historial_partes_operativos')
    .insert([historialPayload])
    .select('id')
    .single()

  if (historialError) {
    console.error('ERROR INSERT HISTORIAL:', historialError)
    const err = new Error(`Error insertando historial: ${formatSupabaseError(historialError)}`)
    err.historialError = historialError
    throw err
  }

  console.log(`INSERT HISTORIAL OK (${contextLabel}):`, data?.id)
  return data
}

async function registrarHistorialParteOperativo({
  parte_id,
  usuario,
  accion,
  motivo,
  estado_anterior = null,
  estado_nuevo = null,
  datos_modificados = null,
  contextLabel = 'HISTORIAL',
}) {
  const motivoLimpio = normalizarMotivo(motivo)
  if (!motivoLimpio) {
    throw new Error('El motivo es obligatorio para registrar el historial')
  }

  const historialPayload = {
    parte_id,
    usuario: usuario ? String(usuario).trim() : null,
    accion,
    motivo: motivoLimpio,
    estado_anterior,
    estado_nuevo,
    datos_modificados,
  }

  return insertarHistorialParteOperativo(historialPayload, contextLabel)
}

function diffParteOperativoCampos(parteAnterior, patch) {
  const cambios = {}
  for (const [key, nuevo] of Object.entries(patch)) {
    const anterior = parteAnterior[key]
    const a = anterior == null || anterior === '' ? '' : String(anterior)
    const n = nuevo == null || nuevo === '' ? '' : String(nuevo)
    if (a !== n) {
      cambios[key] = { anterior: parteAnterior[key] ?? null, nuevo: nuevo ?? null }
    }
  }
  return Object.keys(cambios).length > 0 ? cambios : null
}

// OBTENER PARTE POR ID
app.get('/partes-operativos/:id', async (req, res) => {
  try {

    const { id } = req.params

    const { data, error } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    const { servicios, pruebas_ph } = await loadParteOperativoRelaciones(id)
    const historial = await loadHistorialParteOperativo(id)
    const pdf_path = resolveParteOperativoPdfPath(data)
    const pdf_url = buildParteOperativoPdfUrl(pdf_path)

    res.json({
      ok: true,
      parte: { ...data, pdf_path, pdf_url },
      servicios,
      pruebas_ph,
      historial,
    })

  } catch (error) {

    console.error('Error obteniendo parte operativo:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// ACTUALIZAR PARTE
app.put('/partes-operativos/:id', async (req, res) => {
  try {

    const { id } = req.params

    const { data: parteActual, error: errorParte } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorParte) throw errorParte

    if (parteActual.estado === 'cerrado') {
      return res.status(400).json({
        ok: false,
        error: 'El parte ya está cerrado y no se puede editar'
      })
    }

    const { data, error } = await supabase
      .from('partes_operativos')
      .update({
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json({
      ok: true,
      parte: data
    })

  } catch (error) {

    console.error('Error actualizando parte operativo:', error)

    res.status(500).json({
      ok: false,
      error: error.message
    })
  }
})

// ACTUALIZAR PARTE (administración — permite editar partes cerrados)
app.put('/partes-operativos/:id/admin', async (req, res) => {
  try {
    const { id } = req.params
    const body = req.body || {}

    console.log('ADMIN UPDATE BODY:', req.body)
    console.log('ADMIN UPDATE PARTE ID:', req.params.id)

    const motivo = normalizarMotivo(body.motivo)
    const usuario = body.usuario ? String(body.usuario).trim() : null

    const { data: parteActual, error: errorParte } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorParte) throw errorParte

    const allowed = [
      'fecha',
      'pozo',
      'yacimiento',
      'operadora',
      'contratista',
      'unidad_pesada',
      'salida_desde',
      'km',
      'supervisor_operativo',
      'operador_1',
      'operador_2',
      'operador_3',
      'observaciones',
      'estado',
    ]

    const patch = {}
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        patch[key] = body[key]
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' })
    }

    if (patch.estado != null) {
      const estado = String(patch.estado).trim().toLowerCase()
      if (estado !== 'abierto' && estado !== 'cerrado') {
        return res.status(400).json({ ok: false, error: 'Estado inválido' })
      }
      patch.estado = estado
    }

    const estabaCerrado = parteActual.estado === 'cerrado'
    if (estabaCerrado && !motivo) {
      return res.status(400).json({
        ok: false,
        error: 'El motivo es obligatorio para modificar un parte cerrado',
      })
    }

    const datosModificados = diffParteOperativoCampos(parteActual, patch)
    const estadoAnterior = parteActual.estado ?? null
    const estadoNuevo = patch.estado ?? parteActual.estado ?? null

    const { data, error } = await supabase
      .from('partes_operativos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const debeAuditar = Boolean(datosModificados) || (estabaCerrado && motivo)

    console.log('ADMIN UPDATE AUDITORIA:', {
      debeAuditar,
      datosModificados,
      estabaCerrado,
      motivo,
      estadoAnterior,
      estadoNuevo,
    })

    if (debeAuditar) {
      await registrarHistorialParteOperativo({
        parte_id: id,
        usuario,
        accion: 'MODIFICACION_ADMINISTRATIVA',
        motivo: motivo || 'Actualización administrativa (parte abierto)',
        estado_anterior: estadoAnterior,
        estado_nuevo: estadoNuevo,
        datos_modificados: datosModificados,
        contextLabel: 'ADMIN',
      })
    }

    const pdf_path = resolveParteOperativoPdfPath(data)
    const pdf_url = buildParteOperativoPdfUrl(pdf_path)

    res.json({ ok: true, parte: { ...data, pdf_path, pdf_url } })
  } catch (error) {
    console.error('Error actualizando parte operativo (admin):', error)
    res.status(500).json({
      ok: false,
      error: error.message,
      historialError: error.historialError ? formatSupabaseError(error.historialError) : undefined,
    })
  }
})

// REABRIR PARTE CERRADO
app.post('/partes-operativos/:id/reabrir', async (req, res) => {
  try {
    const { id } = req.params

    console.log('REABRIR BODY:', req.body)
    console.log('REABRIR PARTE ID:', req.params.id)

    const motivo = normalizarMotivo(req.body?.motivo)
    const usuario = req.body?.usuario ? String(req.body.usuario).trim() : null

    if (!motivo) {
      return res.status(400).json({
        ok: false,
        error: 'El motivo es obligatorio para reabrir el parte',
      })
    }

    const { data: parte, error: errorParte } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorParte) throw errorParte

    if (parte.estado !== 'cerrado') {
      return res.status(400).json({
        ok: false,
        error: 'El parte no está cerrado',
      })
    }

    const { data, error } = await supabase
      .from('partes_operativos')
      .update({
        estado: 'abierto',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await registrarHistorialParteOperativo({
      parte_id: id,
      usuario,
      accion: 'PARTE_REABIERTO',
      motivo,
      estado_anterior: 'cerrado',
      estado_nuevo: 'abierto',
      datos_modificados: { pdf_path_anterior: resolveParteOperativoPdfPath(parte) },
      contextLabel: 'REABRIR',
    })

    res.json({ ok: true, parte: data })
  } catch (error) {
    console.error('Error reabriendo parte operativo:', error)
    res.status(500).json({
      ok: false,
      error: error.message,
      historialError: error.historialError ? formatSupabaseError(error.historialError) : undefined,
    })
  }
})

// GUARDAR SERVICIOS
app.post('/partes-operativos/:id/servicios', async (req, res) => {
  try {

    const { id } = req.params
    const { servicios, admin, motivo, usuario } = req.body
    const esAdmin = admin === true
    const motivoLimpio = normalizarMotivo(motivo)

    if (!Array.isArray(servicios)) {
      return res.status(400).json({
        ok: false,
        error: 'No se recibieron servicios para guardar'
      })
    }

    if (!esAdmin && servicios.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No se recibieron servicios para guardar'
      })
    }

    const { data: parte, error: errorParte } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorParte) throw errorParte

    if (!esAdmin && parte.estado === 'cerrado') {
      return res.status(400).json({
        ok: false,
        error: 'El parte ya está cerrado'
      })
    }

    if (esAdmin && parte.estado === 'cerrado' && !motivoLimpio) {
      return res.status(400).json({
        ok: false,
        error: 'El motivo es obligatorio para modificar servicios de un parte cerrado',
      })
    }

    const { data: serviciosAnteriores } = await supabase
      .from('partes_operativos_servicios')
      .select('*')
      .eq('parte_id', id)

    await supabase
      .from('partes_operativos_servicios')
      .delete()
      .eq('parte_id', id)

    if (servicios.length === 0) {
      return res.json({ ok: true, servicios: [] })
    }

    const payload = servicios.map((servicio) => ({
      parte_id: id,
      linea: servicio.codigo_servicio,
      pos: servicio.pos,
      codigo_servicio: servicio.codigo_servicio,
      descripcion: servicio.descripcion,
      cantidad: servicio.cantidad,
      observaciones: servicio.observaciones || null
    }))

    const { data, error } = await supabase
      .from('partes_operativos_servicios')
      .insert(payload)
      .select()

    if (error) throw error

    const serviciosCambiaron =
      JSON.stringify(serviciosAnteriores || []) !== JSON.stringify(data || [])

    if (esAdmin && motivoLimpio && serviciosCambiaron) {
      console.log('SERVICIOS ADMIN AUDITORIA:', {
        parteId: id,
        motivo: motivoLimpio,
        usuario,
        serviciosCambiaron,
      })

      await registrarHistorialParteOperativo({
        parte_id: id,
        usuario: usuario ? String(usuario).trim() : null,
        accion: 'MODIFICACION_ADMINISTRATIVA',
        motivo: motivoLimpio,
        estado_anterior: parte.estado ?? null,
        estado_nuevo: parte.estado ?? null,
        datos_modificados: {
          servicios: {
            anterior: serviciosAnteriores || [],
            nuevo: data || [],
          },
        },
        contextLabel: 'SERVICIOS_ADMIN',
      })
    }

    res.json({
      ok: true,
      servicios: data
    })

  } catch (error) {

    console.error('Error guardando servicios:', error)

    res.status(500).json({
      ok: false,
      error: error.message,
      historialError: error.historialError ? formatSupabaseError(error.historialError) : undefined,
    })
  }
})

// CERRAR PARTE
app.post('/partes-operativos/:id/cerrar', async (req, res) => {

  let context = null
  let page = null

  try {

    const { id } = req.params

    const { data: parte, error: errorParte } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorParte) throw errorParte

    const regenerar = req.body?.regenerar === true
    const motivo = normalizarMotivo(req.body?.motivo)
    const usuario = req.body?.usuario ? String(req.body.usuario).trim() : null

    console.log('CERRAR BODY:', req.body)
    console.log('CERRAR PARTE ID:', req.params.id)
    console.log('CERRAR REGENERAR:', regenerar)

    if (regenerar && !motivo) {
      return res.status(400).json({
        ok: false,
        error: 'El motivo es obligatorio para regenerar el PDF',
      })
    }

    if (parte.estado === 'cerrado' && !regenerar) {
      return res.status(400).json({
        ok: false,
        error: 'El parte ya está cerrado'
      })
    }

    const { data: servicios, error: errorServicios } = await supabase
      .from('partes_operativos_servicios')
      .select('*')
      .eq('parte_id', id)

    if (errorServicios) throw errorServicios

    const { data: pruebasPh, error: errorPruebasPh } = await supabase
    .from('partes_operativos_ph')
    .select('*')
    .eq('parte_operativo_id', id)
    .order('created_at', { ascending: true })
  
  if (errorPruebasPh) throw errorPruebasPh

    const reportePhIds = (pruebasPh || [])
      .map((row) => row.reporte_ph_id)
      .filter(Boolean)

    let partesPhById = {}

    if (reportePhIds.length > 0) {
      const { data: partesPhRows, error: errorPartesPhRows } = await supabase
        .from('partes')
        .select('*')
        .in('id', reportePhIds)

      if (errorPartesPhRows) throw errorPartesPhRows

      partesPhById = Object.fromEntries(
        (partesPhRows || []).map((p) => [p.id, p])
      )
    }

    const logoKompassUrl =
      'https://ydydsdekktvvrafwajwi.supabase.co/storage/v1/object/public/logos/logo.png'

    const htmlServicios = (servicios || [])
      .map(
        (s) => `
        <tr>
          <td class="center">${s.codigo_servicio || ''}</td>
          <td class="center">${s.pos || ''}</td>
          <td>${s.descripcion || ''}</td>
          <td class="center">${s.cantidad ?? 0}</td>
        </tr>
      `
      )
      .join('')

    const htmlPruebasPh = (pruebasPh || [])
      .map((link) => {
        const ph = partesPhById[link.reporte_ph_id] || link
        const esNegativa =
          String(ph.tipo_prueba || link.tipo_prueba || '')
            .trim()
            .toLowerCase() === 'negativa'

        const presEntrampada = ph.presion_entrampada || ''
        const presEstabilizada = esNegativa
          ? ph.presion_testigo_inicial || ''
          : ph.presion_estabilizada || ''
        const hsEstab = esNegativa
          ? ph.hs_inicial_negativa || ''
          : ph.hs_estabilizada || ''
        const presFinal = esNegativa
          ? ph.presion_testigo_final || ''
          : ph.presion_final || ''
        const hsFinal = esNegativa
          ? ph.hs_final_negativa || ''
          : ph.hs_final || ''
        const resultado = ph.resultado_ensayo || ''
        const valvula = link.valvula || ph.elemento_ensayar || ''

        const resultadoNormalizado = String(resultado || '').trim().toUpperCase()
        const estadoClass =
          resultadoNormalizado === 'POSITIVO'
            ? 'estado-positivo'
            : resultadoNormalizado === 'NEGATIVO'
              ? 'estado-negativo'
              : ''

        return `
        <tr>
          <td>${valvula}</td>
          <td class="center">${presEntrampada}</td>
          <td class="center">${presEstabilizada}</td>
          <td class="center">${hsEstab}</td>
          <td class="center">${presFinal}</td>
          <td class="center">${hsFinal}</td>
          <td class="${estadoClass}">${resultado}</td>
        </tr>
      `
      })
      .join('')

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <style>
          @page { size: A4; margin: 8mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9px;
            line-height: 1.25;
            color: #000;
            margin: 0;
            padding: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #000;
            padding: 2px 4px;
            vertical-align: middle;
            font-size: 9px;
          }
          th {
            background: #e6e6e6;
            font-weight: 700;
            text-align: center;
          }
          .center { text-align: center; }
          .header-table td { padding: 0; vertical-align: middle; }
          .logo-cell { width: 26%; text-align: center; padding: 2px; }
          .logo-cell img {
            max-width: 115%;
            max-height: 70px;
            object-fit: contain;
            display: block;
            margin: 0 auto;
          }
          .title-cell {
            width: 52%;
            text-align: center;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.5px;
            padding: 6px 4px;
          }
          .meta-cell { width: 28%; padding: 0; }
          .meta-inner th { width: 42%; font-size: 8px; padding: 2px 3px; }
          .meta-inner td { font-size: 9px; font-weight: 700; text-align: center; }
          .section-bar {
            margin-top: 5px;
            border: 1px solid #000;
            background: #d9d9d9;
            font-weight: 800;
            font-size: 9px;
            text-transform: uppercase;
            text-align: center;
            padding: 3px 4px;
          }
          .info-table .lbl {
            background: #f2f2f2;
            font-weight: 700;
            font-size: 8px;
            text-transform: uppercase;
          }
          .info-table td.val { font-size: 9px; }
          .data-table thead th, .ph-table thead th { font-size: 8px; padding: 3px 2px; }
          .data-table tbody td, .ph-table tbody td { font-size: 9px; }
          .estado-positivo {
            background: #92d050;
            color: #000;
            font-weight: 700;
            text-align: center;
          }
          .estado-negativo {
            background: #c00000;
            color: #fff;
            font-weight: 700;
            text-align: center;
          }
          .obs-box {
            border: 1px solid #000;
            min-height: 72px;
            padding: 5px 6px;
            white-space: pre-wrap;
            font-size: 9px;
          }
          .firmas-table { margin-top: 8px; }
          .firmas-table td {
            height: 48px;
            vertical-align: bottom;
            text-align: center;
            font-size: 8px;
            font-weight: 700;
            padding-bottom: 4px;
          }
          .firma-linea {
            display: block;
            border-top: 1px solid #000;
            margin: 0 8px 18px;
          }

          .firma-img {
            max-width: 130px;
            max-height: 40px;
            object-fit: contain;
            display: block;
            margin: 0 auto 2px;
          }
        </style>  
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td class="logo-cell" rowspan="2">
              <img src="${logoKompassUrl}" alt="Kompass" />
            </td>
            <td class="title-cell" rowspan="2">PARTE DE OPERACIONES</td>
            <td class="meta-cell">
              <table class="meta-inner">
                <tr>
                  <th>N° PARTE</th>
                  <td>${parte.numero_parte ?? ''}</td>
                </tr>
                <tr>
                  <th>FECHA</th>
                  <td>${formatFechaPdf(parte.fecha || parte.created_at || '')}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <div class="section-bar">Información general</div>
        <table class="info-table">
          <tr>
            <td class="lbl center">Pozo</td>
            <td class="val">${parte.pozo || ''}</td>
            <td class="lbl center">Yacimiento</td>
            <td class="val">${parte.yacimiento || ''}</td>
            <td class="lbl center">Operadora</td>
            <td class="val">${parte.operadora || ''}</td>
            <td class="lbl center">Contratista</td>
            <td class="val">${parte.contratista || 'KOMPASS'}</td>
          </tr>
          <tr>
            <td class="lbl center">Unidad pesada</td>
            <td class="val">${parte.unidad_pesada || ''}</td>
            <td class="lbl center">Salida desde</td>
            <td class="val">${parte.salida_desde || ''}</td>
            <td class="lbl center">Km a pozo</td>
            <td class="val" colspan="3">${parte.km || ''}</td>
          </tr>
          <tr>
            <td class="lbl center">Operador 1</td>
            <td class="val">${parte.operador_1 || ''}</td>
            <td class="lbl center">Operador 2</td>
            <td class="val">${parte.operador_2 || ''}</td>
            <td class="lbl center">Operador 3</td>
            <td class="val">${parte.operador_3 || ''}</td>
            <td class="lbl center"></td>
            <td class="val"></td>
          </tr>
        </table>

        <div class="section-bar">Servicios realizados</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:8%">Línea</th>
              <th style="width:6%">Pos.</th>
              <th>Descripción</th>
              <th style="width:10%">Cant.</th>
            </tr>
          </thead>
          <tbody>
            ${htmlServicios || '<tr><td colspan="4" class="center">—</td></tr>'}
          </tbody>
        </table>

        <div class="section-bar">Pruebas hidráulicas</div>
        <table class="ph-table">
          <thead>
            <tr>
              <th style="width:22%">Válvula</th>
              <th style="width:12%">Presión entrampada</th>
              <th style="width:12%">Estabiliza</th>
              <th style="width:10%">Hs estab.</th>
              <th style="width:12%">Pres. final</th>
              <th style="width:10%">Hs final</th>
              <th style="width:12%">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${htmlPruebasPh || '<tr><td colspan="7" class="center">—</td></tr>'}
          </tbody>
        </table>

        <div class="section-bar">Observaciones</div>
        <div class="obs-box">${parte.observaciones || ''}</div>

        <table class="firmas-table">
  <tr>
    <td>
      <img src="https://ydydsdekktvvrafwajwi.supabase.co/storage/v1/object/public/firmas/firma-adalberto.png" class="firma-img" />
      <span class="firma-linea"></span>
      Supervisor Kompass
    </td>

    <td>
      <span class="firma-linea"></span>
      Supervisor YPF
    </td>

    <td>
      <span class="firma-linea"></span>
      Operador
    </td>
  </tr>
</table>
      </body>
      </html>
    `

    const browser = await getBrowser()

    context = await browser.newContext()

    page = await context.newPage()

    await page.setContent(html, {
      waitUntil: 'load'
    })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '8mm',
        right: '8mm',
        bottom: '8mm',
        left: '8mm',
      },
    })

    const pdfPathExistente = resolveParteOperativoPdfPath(parte)
    const pdfPath =
      regenerar && pdfPathExistente
        ? pdfPathExistente
        : await resolveUniqueParteOperativoPdfPath(parte)

    console.log('DEBUG PARTE OPERATIVO PDF PATH:', {
      parte_id: id,
      numero_parte: parte.numero_parte,
      fecha: parte.fecha,
      pozo: parte.pozo,
      regenerar,
      pdfPathExistente,
      pdfPath,
    })

    const { error: pdfError } = await supabase.storage
      .from(process.env.BUCKET_PDF)
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: Boolean(regenerar && pdfPathExistente && pdfPath === pdfPathExistente),
      })

    if (pdfError) throw pdfError

    const updatePayload = {
      finalizado_at: new Date().toISOString(),
      pdf_path: pdfPath,
    }
    if (!regenerar || parte.estado !== 'cerrado') {
      updatePayload.estado = 'cerrado'
    }

    const { error: errorUpdate } = await supabase
      .from('partes_operativos')
      .update(updatePayload)
      .eq('id', id)

    if (errorUpdate) throw errorUpdate

    if (regenerar) {
      await registrarHistorialParteOperativo({
        parte_id: id,
        usuario,
        accion: 'PDF_REGENERADO',
        motivo,
        estado_anterior: 'cerrado',
        estado_nuevo: 'cerrado',
        datos_modificados: {
          pdf_path: pdfPath,
          pdf_path_anterior: pdfPathExistente || null,
        },
        contextLabel: 'PDF_REGENERADO',
      })
    }

    const { data: parteActualizado, error: errorRefetch } = await supabase
      .from('partes_operativos')
      .select('*')
      .eq('id', id)
      .single()

    if (errorRefetch) {
      console.warn('DEBUG CERRAR PARTE: no se pudo re-leer el parte', errorRefetch)
    } else if (String(parteActualizado?.numero_parte) === '14') {
      console.log('DEBUG CERRAR PARTE AFTER UPDATE', parteActualizado)
    }

    const pdf_url = buildParteOperativoPdfUrl(pdfPath)

    res.json({
      ok: true,
      pdf_url,
      pdf_path: pdfPath,
      estado: 'cerrado',
    })

  } catch (error) {

    console.error('Error cerrando parte operativo:', error)

    res.status(500).json({
      ok: false,
      error: error.message,
      historialError: error.historialError ? formatSupabaseError(error.historialError) : undefined,
    })

  } finally {

    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})

  }
})

/**
 * Elimina un parte operativo y sus relaciones (orden FK: PH → servicios → historial → parte).
 * Supabase JS no expone transacciones multi-tabla; si un paso falla, se aborta antes del DELETE principal.
 */
async function deleteParteOperativoCascade(parteId) {
  const { data: parte, error: errorParte } = await supabase
    .from('partes_operativos')
    .select('id, numero_parte')
    .eq('id', parteId)
    .maybeSingle()

  if (errorParte) throw errorParte
  if (!parte) {
    return { ok: false, status: 404, error: 'Parte operativo no encontrado' }
  }

  const { error: errorPh } = await supabase
    .from('partes_operativos_ph')
    .delete()
    .eq('parte_operativo_id', parteId)

  if (errorPh) throw errorPh

  const { error: errorServicios } = await supabase
    .from('partes_operativos_servicios')
    .delete()
    .eq('parte_id', parteId)

  if (errorServicios) throw errorServicios

  const { error: errorHistorial } = await supabase
    .from('historial_partes_operativos')
    .delete()
    .eq('parte_id', parteId)

  if (errorHistorial) throw errorHistorial

  const { error: errorDelete } = await supabase
    .from('partes_operativos')
    .delete()
    .eq('id', parteId)

  if (errorDelete) throw errorDelete

  return { ok: true, parte }
}

app.delete('/partes-operativos/:id', async (req, res) => {
  try {
    const { id } = req.params
    console.log('DELETE parte operativo', id)
    const result = await deleteParteOperativoCascade(id)

    if (!result.ok) {
      return res.status(result.status || 400).json({
        ok: false,
        error: result.error,
      })
    }

    res.status(200).json({
      ok: true,
      message: 'Parte operativo eliminado correctamente',
      id: result.parte.id,
      numero_parte: result.parte.numero_parte ?? null,
    })
  } catch (error) {
    console.error('Error eliminando parte operativo:', error)
    res.status(500).json({
      ok: false,
      error: error.message || 'Error al eliminar parte operativo',
    })
  }
})

  // =========================
  // USUARIOS APP
  // =========================
  const USUARIOS_APP_ROLES = ['operador', 'supervisor', 'coordinador', 'admin']
  const USUARIOS_APP_SELECT =
    'id, nombre, usuario, email, rol, activo, requiere_cambio_password, created_at, updated_at'

  function sanitizeUsuarioApp(row) {
    if (!row) return null
    const { password_hash, ...safe } = row
    return safe
  }

  function isValidUsuariosAppRol(rol) {
    return USUARIOS_APP_ROLES.includes(String(rol || '').trim().toLowerCase())
  }

  function isDuplicateKeyError(error) {
    return (
      error?.code === '23505' ||
      String(error?.message || '').toLowerCase().includes('duplicate')
    )
  }

  function normalizeUsuarioAppEmail(email) {
    if (email == null || String(email).trim() === '') return null
    return String(email).trim()
  }

  function isValidUsuarioAppEmail(email) {
    if (email == null) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))
  }

  async function isUsuarioAppLoginTaken(usuario, excludeId = null) {
    let query = supabase
      .from('usuarios_app')
      .select('id')
      .eq('usuario', String(usuario).trim())
      .is('deleted_at', null)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return Boolean(data)
  }

  app.get('/usuarios-app', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('usuarios_app')
        .select(USUARIOS_APP_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (error) throw error

      res.json({
        ok: true,
        usuarios: (data || []).map(sanitizeUsuarioApp),
      })
    } catch (err) {
      console.error('Error listando usuarios_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al obtener usuarios',
      })
    }
  })

  app.post('/usuarios-app', async (req, res) => {
    try {
      const { nombre, usuario, email, rol, activo } = req.body || {}

      if (!String(nombre || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'El nombre es obligatorio',
        })
      }

      if (!String(usuario || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'El usuario es obligatorio',
        })
      }

      const normalizedEmail = normalizeUsuarioAppEmail(email)
      if (!isValidUsuarioAppEmail(normalizedEmail)) {
        return res.status(400).json({
          ok: false,
          error: 'El formato del email no es válido',
        })
      }

      if (!isValidUsuariosAppRol(rol)) {
        return res.status(400).json({
          ok: false,
          error: 'Rol inválido',
        })
      }

      const usuarioTrimmed = String(usuario).trim()
      if (await isUsuarioAppLoginTaken(usuarioTrimmed)) {
        return res.status(409).json({
          ok: false,
          error: 'Ya existe un usuario con ese nombre de usuario',
        })
      }

      const now = new Date().toISOString()
      const passwordTemporal = generateTemporaryPassword()
      const passwordHash = await hashPassword(passwordTemporal)
      const payload = {
        nombre: String(nombre).trim(),
        usuario: usuarioTrimmed,
        email: normalizedEmail,
        password_hash: passwordHash,
        rol: String(rol).trim().toLowerCase(),
        activo: activo !== false,
        requiere_cambio_password: true,
        created_at: now,
        updated_at: now,
      }

      const { data, error } = await supabase
        .from('usuarios_app')
        .insert([payload])
        .select(USUARIOS_APP_SELECT)
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe un usuario con ese nombre de usuario o email',
          })
        }
        throw error
      }

      res.status(201).json({
        ok: true,
        usuario: sanitizeUsuarioApp(data),
        password_temporal: passwordTemporal,
      })
    } catch (err) {
      console.error('Error creando usuario_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al crear usuario',
      })
    }
  })

  app.post('/usuarios-app/cambiar-password', async (req, res) => {
    try {
      const { userId, passwordActual, passwordNueva } = req.body || {}

      if (!String(userId || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'El usuario es obligatorio',
        })
      }

      if (!String(passwordActual || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'La contraseña actual es obligatoria',
        })
      }

      if (!String(passwordNueva || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'La nueva contraseña es obligatoria',
        })
      }

      if (String(passwordNueva).length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          ok: false,
          error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
        })
      }

      const { data, error } = await supabase
        .from('usuarios_app')
        .select('id, nombre, usuario, email, rol, activo, password_hash, requiere_cambio_password')
        .eq('id', userId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        return res.status(404).json({
          ok: false,
          error: 'Usuario no encontrado',
        })
      }

      if (!data.activo) {
        return res.status(403).json({
          ok: false,
          error: 'Usuario inactivo',
        })
      }

      const passwordOk = await verifyUsuarioPassword(
        data.id,
        passwordActual,
        data.password_hash
      )

      if (!passwordOk) {
        return res.status(401).json({
          ok: false,
          error: 'La contraseña actual es incorrecta',
        })
      }

      const now = new Date().toISOString()
      const passwordHash = await hashPassword(passwordNueva)
      const { data: updated, error: updateError } = await supabase
        .from('usuarios_app')
        .update({
          password_hash: passwordHash,
          requiere_cambio_password: false,
          updated_at: now,
        })
        .eq('id', userId)
        .is('deleted_at', null)
        .select(USUARIOS_APP_SELECT)
        .single()

      if (updateError) throw updateError

      res.json({
        ok: true,
        usuario: {
          id: updated.id,
          nombre: updated.nombre,
          usuario: updated.usuario,
          email: updated.email,
          rol: updated.rol,
          requiere_cambio_password: false,
        },
      })
    } catch (err) {
      console.error('Error cambiando password usuario_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al cambiar la contraseña',
      })
    }
  })

  app.post('/usuarios-app/restablecer-password', async (req, res) => {
    try {
      const { id } = req.body || {}

      if (!String(id || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'El id es obligatorio',
        })
      }

      const passwordTemporal = generateTemporaryPassword()
      const passwordHash = await hashPassword(passwordTemporal)
      const now = new Date().toISOString()

      const { data, error } = await supabase
        .from('usuarios_app')
        .update({
          password_hash: passwordHash,
          requiere_cambio_password: true,
          updated_at: now,
        })
        .eq('id', id)
        .is('deleted_at', null)
        .select(USUARIOS_APP_SELECT)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            ok: false,
            error: 'Usuario no encontrado',
          })
        }
        throw error
      }

      res.json({
        ok: true,
        password_temporal: passwordTemporal,
        usuario: sanitizeUsuarioApp(data),
      })
    } catch (err) {
      console.error('Error restableciendo password usuario_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al restablecer la contraseña',
      })
    }
  })

  app.post('/usuarios-app/eliminar', async (req, res) => {
    try {
      const { ids } = req.body || {}

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Debe indicar al menos un id de usuario',
        })
      }

      const idList = [...new Set(ids.map((item) => String(item || '').trim()).filter(Boolean))]

      if (!idList.length) {
        return res.status(400).json({
          ok: false,
          error: 'Debe indicar al menos un id de usuario',
        })
      }

      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('usuarios_app')
        .update({ deleted_at: now, updated_at: now })
        .in('id', idList)
        .neq('usuario', 'admin')
        .is('deleted_at', null)
        .select('id')

      if (error) throw error

      res.json({
        ok: true,
        eliminados: (data || []).length,
      })
    } catch (err) {
      console.error('Error eliminando usuarios_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al eliminar usuarios',
      })
    }
  })

  app.put('/usuarios-app/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { nombre, usuario, email, password, rol, activo } = req.body || {}

      if (!String(nombre || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'El nombre es obligatorio',
        })
      }

      if (!String(usuario || '').trim()) {
        return res.status(400).json({
          ok: false,
          error: 'El usuario es obligatorio',
        })
      }

      const normalizedEmail = normalizeUsuarioAppEmail(email)
      if (!isValidUsuarioAppEmail(normalizedEmail)) {
        return res.status(400).json({
          ok: false,
          error: 'El formato del email no es válido',
        })
      }

      if (!isValidUsuariosAppRol(rol)) {
        return res.status(400).json({
          ok: false,
          error: 'Rol inválido',
        })
      }

      const usuarioTrimmed = String(usuario).trim()
      if (await isUsuarioAppLoginTaken(usuarioTrimmed, id)) {
        return res.status(409).json({
          ok: false,
          error: 'Ya existe un usuario con ese nombre de usuario',
        })
      }

      const updatePayload = {
        nombre: String(nombre).trim(),
        usuario: usuarioTrimmed,
        email: normalizedEmail,
        rol: String(rol).trim().toLowerCase(),
        activo: activo !== false,
        updated_at: new Date().toISOString(),
      }

      if (password != null && String(password).trim() !== '') {
        updatePayload.password_hash = await hashPassword(password)
        updatePayload.requiere_cambio_password = false
      }

      const { data, error } = await supabase
        .from('usuarios_app')
        .update(updatePayload)
        .eq('id', id)
        .is('deleted_at', null)
        .select(USUARIOS_APP_SELECT)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            ok: false,
            error: 'Usuario no encontrado',
          })
        }
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe un usuario con ese nombre de usuario o email',
          })
        }
        throw error
      }

      res.json({
        ok: true,
        usuario: sanitizeUsuarioApp(data),
      })
    } catch (err) {
      console.error('Error actualizando usuario_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al actualizar usuario',
      })
    }
  })

  app.delete('/usuarios-app/:id', async (req, res) => {
    try {
      const { id } = req.params

      const { data, error } = await supabase
        .from('usuarios_app')
        .update({
          activo: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle()

      if (error) throw error

      if (!data) {
        return res.status(404).json({
          ok: false,
          error: 'Usuario no encontrado',
        })
      }

      res.json({ ok: true })
    } catch (err) {
      console.error('Error desactivando usuario_app:', err)
      res.status(500).json({
        ok: false,
        error: 'Error al desactivar usuario',
      })
    }
  })

  // =========================
  // OPERADORAS, CONTRATOS E ÍTEMS
  // =========================

  function normalizeOperadoraNombre(nombre) {
    return String(nombre || '').trim().toLowerCase()
  }

  async function clearContratoDefaultForOperadora(operadoraId, excludeContratoId = null) {
    let query = supabase
      .from('contratos')
      .update({
        es_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq('operadora_id', operadoraId)
      .eq('es_default', true)

    if (excludeContratoId) {
      query = query.neq('id', excludeContratoId)
    }

    const { error } = await query
    if (error) throw error
  }

  const CONTRATO_ITEMS_TABLE = 'contrato_items'

  app.get('/operadoras', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('operadoras')
        .select('*')
        .order('nombre', { ascending: true })

      if (error) throw error

      res.json({ ok: true, operadoras: data || [] })
    } catch (err) {
      console.error('Error listando operadoras:', err)
      res.status(500).json({ ok: false, error: 'Error al obtener operadoras' })
    }
  })

  app.post('/operadoras', async (req, res) => {
    try {
      const { nombre, activa } = req.body || {}
      const nombreTrimmed = String(nombre || '').trim()

      if (!nombreTrimmed) {
        return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' })
      }

      const now = new Date().toISOString()
      const payload = {
        nombre: nombreTrimmed,
        nombre_normalizado: normalizeOperadoraNombre(nombreTrimmed),
        activa: activa !== false,
        created_at: now,
        updated_at: now,
      }

      const { data, error } = await supabase
        .from('operadoras')
        .insert([payload])
        .select('*')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe una operadora con ese nombre',
          })
        }
        throw error
      }

      res.status(201).json({ ok: true, operadora: data })
    } catch (err) {
      console.error('Error creando operadora:', err)
      res.status(500).json({ ok: false, error: 'Error al crear operadora' })
    }
  })

  app.put('/operadoras/:id', async (req, res) => {
    try {
      const { id } = req.params
      const { nombre, activa } = req.body || {}
      const updates = { updated_at: new Date().toISOString() }

      if (nombre !== undefined) {
        const nombreTrimmed = String(nombre || '').trim()
        if (!nombreTrimmed) {
          return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' })
        }
        updates.nombre = nombreTrimmed
        updates.nombre_normalizado = normalizeOperadoraNombre(nombreTrimmed)
      }

      if (activa !== undefined) {
        updates.activa = Boolean(activa)
      }

      const { data, error } = await supabase
        .from('operadoras')
        .update(updates)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe una operadora con ese nombre',
          })
        }
        throw error
      }

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Operadora no encontrada' })
      }

      res.json({ ok: true, operadora: data })
    } catch (err) {
      console.error('Error actualizando operadora:', err)
      res.status(500).json({ ok: false, error: 'Error al actualizar operadora' })
    }
  })

  app.patch('/operadoras/:id/estado', async (req, res) => {
    try {
      const { id } = req.params
      const { activa } = req.body || {}

      if (activa === undefined) {
        return res.status(400).json({ ok: false, error: 'Falta activa' })
      }

      const { data, error } = await supabase
        .from('operadoras')
        .update({
          activa: Boolean(activa),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Operadora no encontrada' })
      }

      res.json({ ok: true, operadora: data })
    } catch (err) {
      console.error('Error actualizando estado de operadora:', err)
      res.status(500).json({ ok: false, error: 'Error al actualizar estado de operadora' })
    }
  })

  app.get('/operadoras/:id/contratos', async (req, res) => {
    try {
      const { id } = req.params

      const { data, error } = await supabase
        .from('contratos')
        .select('*')
        .eq('operadora_id', id)
        .order('nombre', { ascending: true })

      if (error) throw error

      const contratoRows = data || []
      const contratoIds = contratoRows.map((row) => row.id)
      const itemsCountByContrato = {}

      if (contratoIds.length > 0) {
        const { data: itemRows, error: itemsError } = await supabase
          .from(CONTRATO_ITEMS_TABLE)
          .select('contrato_id')
          .in('contrato_id', contratoIds)

        if (itemsError) throw itemsError

        for (const row of itemRows || []) {
          itemsCountByContrato[row.contrato_id] =
            (itemsCountByContrato[row.contrato_id] || 0) + 1
        }
      }

      const contratos = contratoRows.map((row) => ({
        ...row,
        items_count: itemsCountByContrato[row.id] || 0,
      }))

      res.json({ ok: true, contratos })
    } catch (err) {
      console.error('Error listando contratos:', err)
      res.status(500).json({ ok: false, error: 'Error al obtener contratos' })
    }
  })

  app.post('/contratos', async (req, res) => {
    try {
      const {
        operadora_id,
        codigo,
        nombre,
        fecha_inicio,
        fecha_fin,
        activo,
        es_default,
      } = req.body || {}

      if (!String(operadora_id || '').trim()) {
        return res.status(400).json({ ok: false, error: 'Falta operadora_id' })
      }

      const nombreTrimmed = String(nombre || '').trim()
      if (!nombreTrimmed) {
        return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' })
      }

      const now = new Date().toISOString()
      const activoValue = activo !== false
      const esDefaultValue = Boolean(es_default) && activoValue

      if (esDefaultValue) {
        await clearContratoDefaultForOperadora(operadora_id)
      }

      const payload = {
        operadora_id,
        codigo: codigo != null && String(codigo).trim() ? String(codigo).trim() : null,
        nombre: nombreTrimmed,
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null,
        activo: activoValue,
        es_default: esDefaultValue,
        updated_at: now,
        created_at: now,
      }

      const { data, error } = await supabase
        .from('contratos')
        .insert([payload])
        .select('*')
        .single()

      if (error) throw error

      res.status(201).json({ ok: true, contrato: data })
    } catch (err) {
      console.error('Error creando contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al crear contrato' })
    }
  })

  app.put('/contratos/:id', async (req, res) => {
    try {
      const { id } = req.params
      const {
        codigo,
        nombre,
        fecha_inicio,
        fecha_fin,
        activo,
        es_default,
      } = req.body || {}

      const { data: existing, error: existingError } = await supabase
        .from('contratos')
        .select('id, operadora_id, activo, es_default')
        .eq('id', id)
        .maybeSingle()

      if (existingError) throw existingError

      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Contrato no encontrado' })
      }

      const updates = { updated_at: new Date().toISOString() }

      if (codigo !== undefined) {
        updates.codigo =
          codigo != null && String(codigo).trim() ? String(codigo).trim() : null
      }

      if (nombre !== undefined) {
        const nombreTrimmed = String(nombre || '').trim()
        if (!nombreTrimmed) {
          return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' })
        }
        updates.nombre = nombreTrimmed
      }

      if (fecha_inicio !== undefined) {
        updates.fecha_inicio = fecha_inicio || null
      }

      if (fecha_fin !== undefined) {
        updates.fecha_fin = fecha_fin || null
      }

      if (activo !== undefined) {
        updates.activo = Boolean(activo)
        if (!updates.activo) {
          updates.es_default = false
        }
      }

      const nextActivo = updates.activo !== undefined ? updates.activo : existing.activo

      if (es_default !== undefined) {
        if (es_default && !nextActivo) {
          return res.status(400).json({
            ok: false,
            error: 'Solo un contrato activo puede ser default',
          })
        }
        updates.es_default = Boolean(es_default) && nextActivo
      }

      if (updates.es_default === true) {
        await clearContratoDefaultForOperadora(existing.operadora_id, id)
      }

      const { data, error } = await supabase
        .from('contratos')
        .update(updates)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      res.json({ ok: true, contrato: data })
    } catch (err) {
      console.error('Error actualizando contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al actualizar contrato' })
    }
  })

  app.patch('/contratos/:id/estado', async (req, res) => {
    try {
      const { id } = req.params
      const { activo } = req.body || {}

      if (activo === undefined) {
        return res.status(400).json({ ok: false, error: 'Falta activo' })
      }

      const updates = {
        activo: Boolean(activo),
        updated_at: new Date().toISOString(),
      }

      if (!updates.activo) {
        updates.es_default = false
      }

      const { data, error } = await supabase
        .from('contratos')
        .update(updates)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Contrato no encontrado' })
      }

      res.json({ ok: true, contrato: data })
    } catch (err) {
      console.error('Error actualizando estado de contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al actualizar estado de contrato' })
    }
  })

  app.patch('/contratos/:id/default', async (req, res) => {
    try {
      const { id } = req.params

      const { data: existing, error: existingError } = await supabase
        .from('contratos')
        .select('id, operadora_id, activo')
        .eq('id', id)
        .maybeSingle()

      if (existingError) throw existingError

      if (!existing) {
        return res.status(404).json({ ok: false, error: 'Contrato no encontrado' })
      }

      if (!existing.activo) {
        return res.status(400).json({
          ok: false,
          error: 'Solo un contrato activo puede ser default',
        })
      }

      await clearContratoDefaultForOperadora(existing.operadora_id, id)

      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('contratos')
        .update({ es_default: true, updated_at: now })
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      res.json({ ok: true, contrato: data })
    } catch (err) {
      console.error('Error marcando contrato default:', err)
      res.status(500).json({ ok: false, error: 'Error al marcar contrato default' })
    }
  })

  app.get('/contratos/:id/items', async (req, res) => {
    try {
      const { id } = req.params

      const { data, error } = await supabase
        .from(CONTRATO_ITEMS_TABLE)
        .select('*')
        .eq('contrato_id', id)
        .order('orden', { ascending: true, nullsFirst: false })
        .order('codigo', { ascending: true })
        .order('posicion', { ascending: true })

      if (error) throw error

      res.json({ ok: true, items: data || [] })
    } catch (err) {
      console.error('Error listando ítems de contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al obtener ítems del contrato' })
    }
  })

  app.post('/contratos/:id/items/importar', async (req, res) => {
    try {
      const { id: contratoId } = req.params
      const { items } = req.body || {}

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'No hay ítems para importar',
        })
      }

      const { data: contrato, error: contratoError } = await supabase
        .from('contratos')
        .select('id')
        .eq('id', contratoId)
        .maybeSingle()

      if (contratoError) throw contratoError

      if (!contrato) {
        return res.status(404).json({ ok: false, error: 'Contrato no encontrado' })
      }

      const { data: existingRows, error: existingError } = await supabase
        .from(CONTRATO_ITEMS_TABLE)
        .select('id, codigo, posicion')
        .eq('contrato_id', contratoId)

      if (existingError) throw existingError

      const existingMap = new Map()
      for (const row of existingRows || []) {
        existingMap.set(`${row.codigo}|${row.posicion}`, row.id)
      }

      const now = new Date().toISOString()
      let insertados = 0
      let actualizados = 0

      for (const item of items) {
        const codigo = String(item.codigo || '').trim()
        const posicion = String(item.posicion || '').trim()
        const descripcion = String(item.descripcion || '').trim()

        if (!codigo || !posicion || !descripcion) {
          return res.status(400).json({
            ok: false,
            error: 'Cada ítem debe incluir codigo, posicion y descripcion',
          })
        }

        const payload = {
          codigo,
          posicion,
          descripcion,
          linea:
            item.linea != null && String(item.linea).trim()
              ? String(item.linea).trim()
              : null,
          tipo_item: item.tipo_item ? String(item.tipo_item).trim() : 'SERVICIO',
          unidad_medida: null,
          orden: item.orden != null && item.orden !== '' ? Number(item.orden) : null,
          activo: true,
          updated_at: now,
        }

        const key = `${codigo}|${posicion}`
        const existingId = existingMap.get(key)

        if (existingId) {
          const { error: updateError } = await supabase
            .from(CONTRATO_ITEMS_TABLE)
            .update(payload)
            .eq('id', existingId)

          if (updateError) throw updateError
          actualizados += 1
        } else {
          const { error: insertError } = await supabase
            .from(CONTRATO_ITEMS_TABLE)
            .insert([
              {
                ...payload,
                contrato_id: contratoId,
                created_at: now,
              },
            ])

          if (insertError) throw insertError
          insertados += 1
        }
      }

      res.json({
        ok: true,
        insertados,
        actualizados,
        total: insertados + actualizados,
      })
    } catch (err) {
      console.error('Error importando ítems de contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al importar ítems del contrato' })
    }
  })

  app.post('/contrato-items', async (req, res) => {
    try {
      const {
        contrato_id,
        codigo,
        posicion,
        linea,
        descripcion,
        tipo_item,
        unidad_medida,
        orden,
        activo,
      } = req.body || {}

      if (!String(contrato_id || '').trim()) {
        return res.status(400).json({ ok: false, error: 'Falta contrato_id' })
      }

      const codigoTrimmed = String(codigo || '').trim()
      const posicionTrimmed = String(posicion || '').trim()
      const descripcionTrimmed = String(descripcion || '').trim()

      if (!codigoTrimmed) {
        return res.status(400).json({ ok: false, error: 'El código es obligatorio' })
      }

      if (!posicionTrimmed) {
        return res.status(400).json({ ok: false, error: 'La posición es obligatoria' })
      }

      if (!descripcionTrimmed) {
        return res.status(400).json({ ok: false, error: 'La descripción es obligatoria' })
      }

      const now = new Date().toISOString()
      const payload = {
        contrato_id,
        codigo: codigoTrimmed,
        posicion: posicionTrimmed,
        linea: linea != null && String(linea).trim() ? String(linea).trim() : null,
        descripcion: descripcionTrimmed,
        tipo_item: tipo_item ? String(tipo_item).trim() : 'SERVICIO',
        unidad_medida:
          unidad_medida != null && String(unidad_medida).trim()
            ? String(unidad_medida).trim()
            : null,
        orden: orden != null && orden !== '' ? Number(orden) : null,
        activo: activo !== false,
        created_at: now,
        updated_at: now,
      }

      const { data, error } = await supabase
        .from(CONTRATO_ITEMS_TABLE)
        .insert([payload])
        .select('*')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe un ítem con ese código y posición en el contrato',
          })
        }
        throw error
      }

      res.status(201).json({ ok: true, item: data })
    } catch (err) {
      console.error('Error creando ítem de contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al crear ítem del contrato' })
    }
  })

  app.put('/contrato-items/:id', async (req, res) => {
    try {
      const { id } = req.params
      const {
        codigo,
        posicion,
        linea,
        descripcion,
        tipo_item,
        unidad_medida,
        orden,
        activo,
      } = req.body || {}

      const updates = { updated_at: new Date().toISOString() }

      if (codigo !== undefined) {
        const codigoTrimmed = String(codigo || '').trim()
        if (!codigoTrimmed) {
          return res.status(400).json({ ok: false, error: 'El código es obligatorio' })
        }
        updates.codigo = codigoTrimmed
      }

      if (posicion !== undefined) {
        const posicionTrimmed = String(posicion || '').trim()
        if (!posicionTrimmed) {
          return res.status(400).json({ ok: false, error: 'La posición es obligatoria' })
        }
        updates.posicion = posicionTrimmed
      }

      if (linea !== undefined) {
        updates.linea =
          linea != null && String(linea).trim() ? String(linea).trim() : null
      }

      if (descripcion !== undefined) {
        const descripcionTrimmed = String(descripcion || '').trim()
        if (!descripcionTrimmed) {
          return res.status(400).json({ ok: false, error: 'La descripción es obligatoria' })
        }
        updates.descripcion = descripcionTrimmed
      }

      if (tipo_item !== undefined) {
        updates.tipo_item = String(tipo_item || 'SERVICIO').trim() || 'SERVICIO'
      }

      if (unidad_medida !== undefined) {
        updates.unidad_medida =
          unidad_medida != null && String(unidad_medida).trim()
            ? String(unidad_medida).trim()
            : null
      }

      if (orden !== undefined) {
        updates.orden = orden != null && orden !== '' ? Number(orden) : null
      }

      if (activo !== undefined) {
        updates.activo = Boolean(activo)
      }

      const { data, error } = await supabase
        .from(CONTRATO_ITEMS_TABLE)
        .update(updates)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({
            ok: false,
            error: 'Ya existe un ítem con ese código y posición en el contrato',
          })
        }
        throw error
      }

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Ítem no encontrado' })
      }

      res.json({ ok: true, item: data })
    } catch (err) {
      console.error('Error actualizando ítem de contrato:', err)
      res.status(500).json({ ok: false, error: 'Error al actualizar ítem del contrato' })
    }
  })

  app.patch('/contrato-items/:id/estado', async (req, res) => {
    try {
      const { id } = req.params
      const { activo } = req.body || {}

      if (activo === undefined) {
        return res.status(400).json({ ok: false, error: 'Falta activo' })
      }

      const { data, error } = await supabase
        .from(CONTRATO_ITEMS_TABLE)
        .update({
          activo: Boolean(activo),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (error) throw error

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Ítem no encontrado' })
      }

      res.json({ ok: true, item: data })
    } catch (err) {
      console.error('Error actualizando estado de ítem:', err)
      res.status(500).json({ ok: false, error: 'Error al actualizar estado del ítem' })
    }
  })

  // Cierre elegante del browser al apagar el servidor
  process.on('SIGINT', async () => {
    if (browserInstance) await browserInstance.close()
    process.exit()
  })

  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log('Servidor corriendo en puerto ' + port)
  })