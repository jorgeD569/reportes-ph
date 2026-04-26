require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')
const nodemailer = require('nodemailer')
const { chromium } = require('playwright')

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

  const f = new Date(fecha)
  if (isNaN(f)) return fecha

  const dia = String(f.getDate()).padStart(2, '0')
  const mes = String(f.getMonth() + 1).padStart(2, '0')
  const anio = f.getFullYear()

  return `${dia}/${mes}/${anio}`
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

    if (data.reporte_pdf_path) {
    const { data: pdfUrlData } = supabase.storage
    .from(BUCKET_PDF)
    .getPublicUrl(data.reporte_pdf_path)

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
      max-height: 140px;
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
        <td style="width:25%;">${data.resultado_ensayo || ''}</td>
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
    data.tipo_prueba === 'negativa'
      ? `
  <tr>
    <td class="label-cell center">Presión entrampada</td>
    <td class="value-cell">${data.presion_estabilizada || ''}</td>
    <td class="label-cell center">Incremento de presión</td>
    <td class="value-cell">${data.hs_estabilizada || ''}</td>
  </tr>
  <tr>
    <td class="label-cell center">Presión testigo</td>
    <td class="value-cell">${data.presion_final || ''}</td>
    <td class="label-cell center">Hs inicio</td>
    <td class="value-cell">${data.hs_final || ''}</td>
  </tr>
  <tr>
    <td class="label-cell center">Presión final</td>
    <td class="value-cell">${data.caida_presion || ''}</td>
    <td class="label-cell center">Hs final</td>
    <td class="value-cell">${data.porcentaje_caida || ''}</td>
  </tr>
  <tr>
    <td class="label-cell center">% de pérdida</td>
    <td class="value-cell">${data.porcentaje_perdida || ''}</td>
    <td class="label-cell center"></td>
    <td class="value-cell"></td>
  </tr>
      `
      : `
  <tr>
    <td class="label-cell center">Presión estabilizada</td>
    <td class="value-cell">${data.presion_estabilizada || ''}</td>
    <td class="label-cell center">Hs estabilizada</td>
    <td class="value-cell">${data.hs_estabilizada || ''}</td>
  </tr>
  <tr>
    <td class="label-cell center">Presión final</td>
    <td class="value-cell">${data.presion_final || ''}</td>
    <td class="label-cell center">Hs final</td>
    <td class="value-cell">${data.hs_final || ''}</td>
  </tr>
  <tr>
    <td class="label-cell center">Caída de presión</td>
    <td class="value-cell">${data.caida_presion || ''}</td>
    <td class="label-cell center">% de caída</td>
    <td class="value-cell">${data.porcentaje_caida || ''}</td>
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

    const cleanParteId = String(parte_id).toLowerCase()
    const pdfPath = `reporte_${cleanParteId}_${Date.now()}.pdf`

    const { error: pdfErr } = await supabase.storage
      .from(process.env.BUCKET_PDF)
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
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

    const unidades = data.filter(a => a.categoria === 'unidad_ph')
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


// Cierre elegante del browser al apagar el servidor
process.on('SIGINT', async () => {
  if (browserInstance) await browserInstance.close()
  process.exit()
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log('Servidor corriendo en puerto ' + port)
})