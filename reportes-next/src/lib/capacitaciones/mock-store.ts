/**
 * Persistencia local para el MVP de Capacitaciones HSE.
 *
 * TODO(SUPABASE): reemplazar por tablas `capacitaciones`, `capacitaciones_bloques`,
 * `capacitaciones_asignaciones` y `capacitaciones_progreso_bloques`.
 */

import { getFechaLocalHoy } from '@/lib/date'
import {
  bloquesFromLegacyContenido,
  createBloque,
  normalizeBloquesOrden,
} from '@/lib/capacitaciones/bloques'
import type {
  BloqueProgreso,
  Capacitacion,
  CapacitacionAsignacion,
  CapacitacionEstadoAsignacion,
  CreateCapacitacionInput,
  FinalizarCapacitacionInput,
} from '@/lib/types/capacitaciones'
import { MOCK_OPERADORES } from '@/lib/capacitaciones/constants'

const STORAGE_KEY = 'kompass_capacitaciones_mvp_v2'

type Store = {
  capacitaciones: Capacitacion[]
  asignaciones: CapacitacionAsignacion[]
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function isoNow() {
  return new Date().toISOString()
}

function addDaysIso(isoDate: string, days: number): string {
  const base = isoDate.slice(0, 10)
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function migrateCapacitacion(raw: Capacitacion): Capacitacion {
  const bloques =
    raw.bloques && raw.bloques.length > 0
      ? normalizeBloquesOrden(raw.bloques)
      : bloquesFromLegacyContenido(raw.contenido ?? '')
  return { ...raw, bloques }
}

function migrateAsignacion(raw: CapacitacionAsignacion): CapacitacionAsignacion {
  return {
    ...raw,
    progreso_bloques: raw.progreso_bloques ?? {},
  }
}

function readStore(): Store {
  if (typeof window === 'undefined') {
    return { capacitaciones: [], asignaciones: [] }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = localStorage.getItem('kompass_capacitaciones_mvp_v1')
      if (legacy) {
        const parsed = JSON.parse(legacy) as Store
        const migrated: Store = {
          capacitaciones: (parsed.capacitaciones ?? []).map(migrateCapacitacion),
          asignaciones: (parsed.asignaciones ?? []).map(migrateAsignacion),
        }
        writeStore(migrated)
        return migrated
      }
      return seedStore()
    }
    const parsed = JSON.parse(raw) as Store
    return {
      capacitaciones: (parsed.capacitaciones ?? []).map(migrateCapacitacion),
      asignaciones: (parsed.asignaciones ?? []).map(migrateAsignacion),
    }
  } catch {
    return seedStore()
  }
}

function writeStore(store: Store) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function seedStore(): Store {
  const created = isoNow()
  const texto = createBloque('texto', 0)
  texto.titulo = 'Normas generales'
  texto.contenido =
    '1. Uso obligatorio de EPP.\n2. Procedimiento de parada de emergencia.\n3. Comunicación con supervisor antes de iniciar tareas.\n4. Reporte inmediato de incidentes.'

  const video = createBloque('video_url', 1)
  video.titulo = 'Video inducción'
  video.url = 'https://www.youtube.com/embed/dQw4w9WgXcQ'
  video.obligatorio = true

  const declaracion = createBloque('declaracion', 2)
  declaracion.titulo = 'Declaración jurada'

  const firma = createBloque('firma', 3)
  firma.titulo = 'Firma del operador'

  const cap1: Capacitacion = {
    id: 'cap-seed-1',
    titulo: 'Inducción HSE en pozo',
    descripcion: 'Normas básicas de seguridad para operaciones en yacimiento.',
    contenido: texto.contenido ?? '',
    bloques: [texto, video, declaracion, firma],
    version: '1.0',
    requiere_evaluacion: false,
    puntaje_minimo: null,
    dias_vigencia: 365,
    activa: true,
    created_at: created,
  }

  const cap2Texto = createBloque('texto', 0)
  cap2Texto.contenido =
    'Revisar arnés, punto de anclaje certificado y plan de rescate. No iniciar sin autorización del coordinador.'

  const cap2Eval = createBloque('evaluacion', 1)
  cap2Eval.titulo = 'Evaluación final'
  cap2Eval.puntaje_minimo = 80
  if (cap2Eval.evaluacion_preguntas?.[0]) {
    cap2Eval.evaluacion_preguntas[0].enunciado =
      '¿Qué elemento es obligatorio antes de trabajar en altura?'
    cap2Eval.evaluacion_preguntas[0].opciones = [
      'Arnés certificado',
      'Guantes de látex',
      'Casco sin barboquejo',
    ]
    cap2Eval.evaluacion_preguntas[0].respuesta_correcta_index = 0
  }

  const cap2: Capacitacion = {
    id: 'cap-seed-2',
    titulo: 'Trabajo en altura',
    descripcion: 'Capacitación para tareas con riesgo de caída.',
    contenido: cap2Texto.contenido ?? '',
    bloques: [cap2Texto, cap2Eval],
    version: '2.1',
    requiere_evaluacion: true,
    puntaje_minimo: 80,
    dias_vigencia: 180,
    activa: true,
    created_at: created,
  }

  const hoy = getFechaLocalHoy()
  const asignaciones: CapacitacionAsignacion[] = [
    {
      id: 'asig-seed-1',
      capacitacion_id: cap1.id,
      operador_id: 'operador-demo',
      operador_nombre: 'Juan Pérez',
      estado: 'pendiente',
      fecha_asignacion: hoy,
      fecha_vencimiento: addDaysIso(hoy, cap1.dias_vigencia),
      fecha_realizacion: null,
      firma_data_url: null,
      declaro_leido: false,
      progreso_bloques: {},
    },
  ]
  const store: Store = { capacitaciones: [cap1, cap2], asignaciones }
  writeStore(store)
  return store
}

function resolveEstado(asignacion: CapacitacionAsignacion): CapacitacionEstadoAsignacion {
  if (asignacion.estado === 'realizada') return 'realizada'
  if (asignacion.fecha_vencimiento) {
    const hoy = getFechaLocalHoy()
    if (asignacion.fecha_vencimiento < hoy) return 'vencida'
  }
  return asignacion.estado === 'vencida' ? 'vencida' : 'pendiente'
}

function withEstadoResuelto(asignacion: CapacitacionAsignacion): CapacitacionAsignacion {
  return { ...asignacion, estado: resolveEstado(asignacion) }
}

export function mockListCapacitaciones(): Capacitacion[] {
  const store = readStore()
  return [...store.capacitaciones].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export function mockGetCapacitacion(id: string): Capacitacion | null {
  return readStore().capacitaciones.find((c) => c.id === id) ?? null
}

export function mockCreateCapacitacion(input: CreateCapacitacionInput): Capacitacion {
  const store = readStore()
  const bloques = normalizeBloquesOrden(input.bloques)
  const cap: Capacitacion = {
    id: newId('cap'),
    titulo: input.titulo,
    descripcion: input.descripcion,
    contenido: input.contenido,
    bloques,
    version: input.version,
    requiere_evaluacion: input.requiere_evaluacion,
    puntaje_minimo: input.puntaje_minimo,
    dias_vigencia: input.dias_vigencia,
    activa: input.activa,
    created_at: isoNow(),
  }
  store.capacitaciones.unshift(cap)
  writeStore(store)
  return cap
}

export function mockListAsignacionesByCapacitacion(
  capacitacionId: string
): CapacitacionAsignacion[] {
  return readStore()
    .asignaciones.filter((a) => a.capacitacion_id === capacitacionId)
    .map(withEstadoResuelto)
}

export function mockListAsignacionesOperador(operadorId: string): CapacitacionAsignacion[] {
  return readStore()
    .asignaciones.filter((a) => a.operador_id === operadorId)
    .map(withEstadoResuelto)
}

export function mockGetAsignacionOperador(
  operadorId: string,
  capacitacionId: string
): CapacitacionAsignacion | null {
  const found =
    readStore().asignaciones.find(
      (a) => a.operador_id === operadorId && a.capacitacion_id === capacitacionId
    ) ?? null
  return found ? withEstadoResuelto(found) : null
}

export function mockAssignCapacitacion(
  capacitacionId: string,
  operadorIds: string[]
): CapacitacionAsignacion[] {
  const store = readStore()
  const cap = store.capacitaciones.find((c) => c.id === capacitacionId)
  if (!cap) throw new Error('Capacitación no encontrada')

  const hoy = getFechaLocalHoy()
  const vencimiento = addDaysIso(hoy, cap.dias_vigencia)
  const created: CapacitacionAsignacion[] = []

  for (const operadorId of operadorIds) {
    const exists = store.asignaciones.some(
      (a) => a.capacitacion_id === capacitacionId && a.operador_id === operadorId
    )
    if (exists) continue

    const operador = MOCK_OPERADORES.find((o) => o.id === operadorId)
    const asignacion: CapacitacionAsignacion = {
      id: newId('asig'),
      capacitacion_id: capacitacionId,
      operador_id: operadorId,
      operador_nombre: operador?.nombre ?? operadorId,
      estado: 'pendiente',
      fecha_asignacion: hoy,
      fecha_vencimiento: vencimiento,
      fecha_realizacion: null,
      firma_data_url: null,
      declaro_leido: false,
      progreso_bloques: {},
    }
    store.asignaciones.push(asignacion)
    created.push(asignacion)
  }

  writeStore(store)
  return created.map(withEstadoResuelto)
}

export function mockFinalizarCapacitacion(
  asignacionId: string,
  input: FinalizarCapacitacionInput
): CapacitacionAsignacion {
  const store = readStore()
  const idx = store.asignaciones.findIndex((a) => a.id === asignacionId)
  if (idx < 0) throw new Error('Asignación no encontrada')

  const progreso: Record<string, BloqueProgreso> = { ...input.progreso_bloques }

  const updated: CapacitacionAsignacion = {
    ...store.asignaciones[idx],
    estado: 'realizada',
    fecha_realizacion: isoNow(),
    firma_data_url: input.firma_data_url,
    declaro_leido: input.declaro_leido,
    progreso_bloques: progreso,
  }
  store.asignaciones[idx] = updated
  writeStore(store)
  return withEstadoResuelto(updated)
}
