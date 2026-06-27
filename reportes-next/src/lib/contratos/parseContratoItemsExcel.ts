import * as XLSX from 'xlsx'
import type { ImportContratoItemPayload } from '@/lib/types/contratos'

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function cellValue(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias)
    if (idx >= 0) return idx
  }
  return -1
}

export function parseContratoItemsExcel(buffer: ArrayBuffer): ImportContratoItemPayload[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('El archivo Excel no contiene hojas.')
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (!rows.length) {
    throw new Error('El archivo Excel está vacío.')
  }

  const headerRowIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false
    const headers = row.map(normalizeHeader)
    return (
      findColumnIndex(headers, ['codigo']) >= 0 &&
      findColumnIndex(headers, ['servicio', 'descripcion']) >= 0 &&
      findColumnIndex(headers, ['posicion', 'pos']) >= 0
    )
  })

  if (headerRowIndex < 0) {
    throw new Error(
      'No se encontró la fila de encabezados. Se esperan columnas: codigo, servicio, posicion, linea.'
    )
  }

  const headerRow = rows[headerRowIndex] as unknown[]
  const headers = headerRow.map(normalizeHeader)

  const codigoIdx = findColumnIndex(headers, ['codigo', 'codigo servicio', 'codigo_servicio'])
  const servicioIdx = findColumnIndex(headers, ['servicio', 'descripcion'])
  const posicionIdx = findColumnIndex(headers, ['posicion', 'pos'])
  const lineaIdx = findColumnIndex(headers, ['linea'])

  if (codigoIdx < 0 || servicioIdx < 0 || posicionIdx < 0) {
    throw new Error('Faltan columnas obligatorias: codigo, servicio y posicion.')
  }

  const parsed: ImportContratoItemPayload[] = []
  let orden = 1

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i]
    if (!Array.isArray(row)) continue

    const codigo = cellValue(row[codigoIdx])
    const descripcion = cellValue(row[servicioIdx])
    const posicion = cellValue(row[posicionIdx])
    const linea = lineaIdx >= 0 ? cellValue(row[lineaIdx]) : ''

    if (!codigo && !descripcion && !posicion) continue
    if (!codigo || !posicion || !descripcion) {
      throw new Error(`Fila ${i + 1}: codigo, servicio y posicion son obligatorios.`)
    }

    parsed.push({
      codigo,
      descripcion,
      posicion,
      linea: linea || null,
      tipo_item: 'SERVICIO',
      unidad_medida: null,
      orden,
    })
    orden += 1
  }

  if (!parsed.length) {
    throw new Error('No se encontraron filas válidas para importar.')
  }

  return parsed
}
