import type {
  CapacitacionBloque,
  CapacitacionBloqueEvaluacionPregunta,
  CapacitacionBloqueTipo,
  BloqueProgreso,
} from '@/lib/types/capacitaciones'

export const BLOQUE_TIPO_LABELS: Record<CapacitacionBloqueTipo, string> = {
  texto: 'Texto',
  video_url: 'Video (URL)',
  pdf_url: 'PDF (URL)',
  imagen_url: 'Imagen (URL)',
  enlace_externo: 'Enlace externo',
  evaluacion: 'Evaluación',
  declaracion: 'Declaración',
  firma: 'Firma',
}

export const BLOQUE_TIPOS: CapacitacionBloqueTipo[] = [
  'texto',
  'video_url',
  'pdf_url',
  'imagen_url',
  'enlace_externo',
  'evaluacion',
  'declaracion',
  'firma',
]

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function defaultEvaluacionPregunta(): CapacitacionBloqueEvaluacionPregunta {
  return {
    id: newId('preg'),
    enunciado: '',
    opciones: ['Opción A', 'Opción B'],
    respuesta_correcta_index: 0,
  }
}

export function createBloque(tipo: CapacitacionBloqueTipo, orden: number): CapacitacionBloque {
  const base: CapacitacionBloque = {
    id: newId('blk'),
    tipo,
    titulo: '',
    orden,
    obligatorio: tipo === 'video_url',
  }

  switch (tipo) {
    case 'texto':
      return { ...base, contenido: '' }
    case 'video_url':
    case 'pdf_url':
    case 'imagen_url':
    case 'enlace_externo':
      return { ...base, url: '' }
    case 'evaluacion':
      return {
        ...base,
        evaluacion_preguntas: [defaultEvaluacionPregunta()],
        puntaje_minimo: 80,
      }
    case 'declaracion':
      return {
        ...base,
        contenido:
          'Declaro haber leído y comprendido el contenido de esta capacitación.',
      }
    case 'firma':
      return base
    default:
      return base
  }
}

export function normalizeBloquesOrden(bloques: CapacitacionBloque[]): CapacitacionBloque[] {
  return [...bloques]
    .sort((a, b) => a.orden - b.orden)
    .map((b, i) => ({ ...b, orden: i }))
}

export function bloquesFromLegacyContenido(contenido: string): CapacitacionBloque[] {
  if (!contenido.trim()) return []
  return [
    {
      id: newId('blk'),
      tipo: 'texto',
      titulo: 'Contenido',
      contenido: contenido.trim(),
      orden: 0,
    },
  ]
}

export function calcularPuntajeEvaluacion(
  bloque: CapacitacionBloque,
  respuestas: Record<string, number> | undefined
): number {
  const preguntas = bloque.evaluacion_preguntas ?? []
  if (preguntas.length === 0) return 0
  let correctas = 0
  for (const p of preguntas) {
    if (respuestas?.[p.id] === p.respuesta_correcta_index) correctas++
  }
  return Math.round((correctas / preguntas.length) * 100)
}

export function evaluacionAprobada(
  bloque: CapacitacionBloque,
  respuestas: Record<string, number> | undefined
): boolean {
  const min = bloque.puntaje_minimo ?? 80
  return calcularPuntajeEvaluacion(bloque, respuestas) >= min
}

export type ValidacionCursoResult = {
  ok: boolean
  errores: string[]
}

export function validarCursoCompleto(
  bloques: CapacitacionBloque[],
  progreso: Record<string, BloqueProgreso>
): ValidacionCursoResult {
  const errores: string[] = []
  const ordenados = normalizeBloquesOrden(bloques)

  for (const bloque of ordenados) {
    const p = progreso[bloque.id] ?? {}

    switch (bloque.tipo) {
      case 'declaracion':
        if (!p.declaracion_aceptada) {
          errores.push(
            bloque.titulo?.trim()
              ? `Debés aceptar: ${bloque.titulo}`
              : 'Debés aceptar la declaración del curso.'
          )
        }
        break
      case 'firma':
        if (!p.firma_data_url?.trim()) {
          errores.push(
            bloque.titulo?.trim()
              ? `Falta la firma: ${bloque.titulo}`
              : 'La firma es obligatoria.'
          )
        }
        break
      case 'evaluacion': {
        const preguntas = bloque.evaluacion_preguntas ?? []
        const faltan = preguntas.some(
          (q) => p.evaluacion_respuestas?.[q.id] === undefined
        )
        if (faltan) {
          errores.push('Completá todas las preguntas de la evaluación.')
        } else if (!evaluacionAprobada(bloque, p.evaluacion_respuestas)) {
          errores.push(
            `No alcanzaste el puntaje mínimo (${bloque.puntaje_minimo ?? 80}%) en la evaluación.`
          )
        }
        break
      }
      case 'video_url':
        if (bloque.obligatorio && !p.video_visto) {
          errores.push(
            bloque.titulo?.trim()
              ? `Debés marcar como visto el video: ${bloque.titulo}`
              : 'Debés marcar el video como visto.'
          )
        }
        break
      default:
        break
    }
  }

  return { ok: errores.length === 0, errores }
}

export function extractLegacyFinalizarFields(
  bloques: CapacitacionBloque[],
  progreso: Record<string, BloqueProgreso>
): { declaro_leido: boolean; firma_data_url: string | null } {
  let declaro_leido = false
  let firma_data_url: string | null = null

  for (const bloque of bloques) {
    const p = progreso[bloque.id]
    if (bloque.tipo === 'declaracion' && p?.declaracion_aceptada) {
      declaro_leido = true
    }
    if (bloque.tipo === 'firma' && p?.firma_data_url) {
      firma_data_url = p.firma_data_url
    }
  }

  return { declaro_leido, firma_data_url }
}
