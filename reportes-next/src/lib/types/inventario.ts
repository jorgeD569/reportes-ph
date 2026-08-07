export type Activo = {
  id: string
  descripcion: string | null
  categoria: string | null
  /** ID real del catálogo activos_categorias. */
  categoria_id?: string | null
  categoria_nombre?: string | null
  numero_serie: string | null
  marca: string | null
  ubicacion: string | null
  asignado_a: string | null
  vencimiento: string | null
  estado: string | null
  certificado_url?: string | null
  observaciones?: string | null
  activo?: boolean | null
  estado_revision?: 'pendiente' | 'aprobado' | 'rechazado' | string | null
  client_uuid?: string | null
  creado_por_user_id?: string | null
  codigo_interno?: string | null
  dias_aviso?: number | null
  /** Manifold / conjunto. GET /activos siempre lo envía como boolean. */
  es_conjunto: boolean
  /** true si tiene relación activa (fecha_hasta null). */
  es_componente: boolean
  /** Pertenencia activa al listar; null si no pertenece a un manifold. */
  pertenencia_actual: PertenenciaActual | null
  /** Ubicación efectiva (propia o del manifold si es componente). */
  ubicacion_efectiva?: string | null
}

export type ActivoCategoria = {
  id: string
  nombre: string
  activo: boolean
  aplicable_a_activos: boolean
  aplicable_a_conjuntos: boolean
  codigo_legacy?: string | null
  created_at?: string
  updated_at?: string
  en_uso?: boolean
  usos_activos?: number
  usos_conjuntos?: number
}

/** Resumen embebido en composición / pertenencia. */
export type ActivoResumen = {
  id: string | number
  numero_serie?: string | null
  descripcion?: string | null
  categoria?: string | null
  estado?: string | null
  ubicacion?: string | null
  activo?: boolean | null
  estado_revision?: string | null
  es_conjunto?: boolean | null
}

export type ComponenteRelacion = {
  id: string | number
  conjunto_id: string | number
  componente_id: string | number
  posicion?: string | null
  observaciones?: string | null
  fecha_desde?: string | null
  fecha_hasta?: string | null
  client_uuid?: string | null
  componente?: ActivoResumen | null
  ubicacion_efectiva?: string | null
}

export type GetActivoComposicionResponse = {
  ok: boolean
  activo: Activo
  componentes_actuales: ComponenteRelacion[]
  componentes_historial: ComponenteRelacion[]
  /** Conjunto operativo con componentes fuera de servicio. */
  inconsistencias_estado?: Array<{
    componente_id: string | number
    numero_serie?: string | null
    descripcion?: string | null
    estado?: string | null
    mensaje: string
  }>
  adjuntos: ActivoAdjunto[]
  error?: string
}

/** Contrato de pertenencia en GET /activos (y compatible con /pertenencia). */
export type PertenenciaActual = {
  relacion_id: number
  conjunto_id: number
  posicion: string | null
  fecha_desde: string
  manifold: {
    id: number
    numero_serie: string
    descripcion: string
    ubicacion: string | null
  }
}

export type PertenenciaHistorialItem = {
  relacion_id: string | number
  conjunto_id: string | number
  posicion?: string | null
  observaciones?: string | null
  fecha_desde?: string | null
  fecha_hasta?: string | null
  manifold?: ActivoResumen | null
}

export type GetActivoPertenenciaResponse = {
  ok: boolean
  activo: Activo
  pertenencia_actual: PertenenciaActual | null
  historial: PertenenciaHistorialItem[]
  error?: string
}

export type PostComponenteResponse = {
  ok: boolean
  idempotent?: boolean
  relacion?: ComponenteRelacion
  error?: string
  code?: string
  conjunto_id_actual?: string | number
  relacion_id?: string | number
  conjunto_origen_label?: string
  puede_traspaso?: boolean
  conjunto_origen?: ActivoResumen | null
}

export type PostTraspasoResponse = {
  ok: boolean
  idempotent?: boolean
  atomico?: boolean
  relacion?: ComponenteRelacion
  relacion_cerrada?: ComponenteRelacion
  componente?: ActivoResumen
  conjunto_origen?: ActivoResumen
  conjunto_destino?: ActivoResumen
  origen_estado_anterior?: string | null
  origen_estado_nuevo?: string | null
  error?: string
  code?: string
  conjunto_id_actual?: string | number
}

export type PostRetirarComponenteResponse = {
  ok: boolean
  idempotent?: boolean
  relacion?: ComponenteRelacion
  componente?: Activo
  mensaje?: string
  error?: string
}

export type ActivoAdjunto = {
  id: string | number
  activo_id: string | number
  tipo: 'foto_general' | 'foto_placa' | 'certificado' | 'otro' | string
  /** Referencia persistente en bucket privado. */
  storage_path: string
  /** Deprecated: siempre null con bucket privado. */
  url_publica?: string | null
  /** URL firmada temporal generada por Express (no persistir). */
  url_firmada?: string | null
  mime_type?: string | null
  tamano_bytes?: number | null
  orden?: number | null
  client_uuid?: string | null
  created_at?: string | null
}

export type GetActivosPendientesResponse = {
  ok: boolean
  activos: Activo[]
}

export type GetActivoAdjuntosResponse = {
  ok: boolean
  adjuntos: ActivoAdjunto[]
}

export type GetActivoPorSerieResponse = {
  ok: boolean
  activo: Activo
  /** Presente en GET /activos/serie/:serie cuando el activo pertenece a un conjunto. */
  pertenencia?: {
    fecha_desde?: string | null
    posicion?: string | null
    observaciones?: string | null
    manifold?: ActivoResumen | null
  } | null
  composicion?: unknown
}

export type MovimientoInventario = {
  id?: string
  activo_id: string
  tipo_movimiento: string | null
  descripcion: string | null
  usuario: string | null
  fecha: string
  estado_anterior?: string | null
  estado_nuevo?: string | null
  ubicacion_anterior?: string | null
  ubicacion_nueva?: string | null
  asignado_anterior?: string | null
  asignado_nuevo?: string | null
  observaciones?: string | null
}

export type GetMovimientosActivoResponse = {
  ok: boolean
  movimientos: MovimientoInventario[]
}

export type Consumible = {
  id: string
  descripcion: string | null
  categoria: string | null
  cantidad: number | null
  stock_minimo: number | null
  ubicacion: string | null
  observaciones: string | null
  activo?: boolean | null
}

