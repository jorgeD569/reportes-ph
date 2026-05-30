export type CapacitacionEstadoAsignacion = 'pendiente' | 'realizada' | 'vencida'

export type CapacitacionBloqueTipo =
  | 'texto'
  | 'video_url'
  | 'pdf_url'
  | 'imagen_url'
  | 'enlace_externo'
  | 'evaluacion'
  | 'declaracion'
  | 'firma'

export type CapacitacionBloqueEvaluacionPregunta = {
  id: string
  enunciado: string
  opciones: string[]
  respuesta_correcta_index: number
}

/** Bloque ordenable del constructor de curso. */
export type CapacitacionBloque = {
  id: string
  tipo: CapacitacionBloqueTipo
  titulo?: string | null
  /** Texto libre (tipo `texto`). */
  contenido?: string | null
  /** URL (video, PDF, imagen, enlace externo). */
  url?: string | null
  orden: number
  /** Aplica a video: debe marcarse como visto si es true. */
  obligatorio?: boolean
  evaluacion_preguntas?: CapacitacionBloqueEvaluacionPregunta[]
  /** Puntaje mínimo % para aprobar este bloque de evaluación. */
  puntaje_minimo?: number | null
}

export type BloqueProgreso = {
  declaracion_aceptada?: boolean
  firma_data_url?: string | null
  video_visto?: boolean
  /** pregunta_id → índice de opción elegida */
  evaluacion_respuestas?: Record<string, number>
  evaluacion_aprobada?: boolean
}

export type Capacitacion = {
  id: string
  titulo: string
  descripcion: string
  /** Legacy / resumen; el contenido principal vive en `bloques`. */
  contenido: string
  bloques: CapacitacionBloque[]
  version: string
  requiere_evaluacion: boolean
  puntaje_minimo: number | null
  dias_vigencia: number
  activa: boolean
  created_at: string
}

export type CapacitacionAsignacion = {
  id: string
  capacitacion_id: string
  operador_id: string
  operador_nombre: string
  estado: CapacitacionEstadoAsignacion
  fecha_asignacion: string
  fecha_vencimiento: string | null
  fecha_realizacion: string | null
  firma_data_url: string | null
  declaro_leido: boolean
  progreso_bloques: Record<string, BloqueProgreso>
}

export type CreateCapacitacionInput = {
  titulo: string
  descripcion: string
  contenido: string
  bloques: CapacitacionBloque[]
  version: string
  requiere_evaluacion: boolean
  puntaje_minimo: number | null
  dias_vigencia: number
  activa: boolean
}

export type FinalizarCapacitacionInput = {
  progreso_bloques: Record<string, BloqueProgreso>
  declaro_leido: boolean
  firma_data_url: string | null
}

export type OperadorMock = {
  id: string
  nombre: string
}

export type GetCapacitacionesResponse = {
  ok?: boolean
  capacitaciones?: Capacitacion[]
  error?: string
}

export type GetCapacitacionResponse = {
  ok?: boolean
  capacitacion?: Capacitacion
  error?: string
}

export type GetAsignacionesResponse = {
  ok?: boolean
  asignaciones?: CapacitacionAsignacion[]
  error?: string
}
