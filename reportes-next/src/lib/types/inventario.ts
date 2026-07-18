export type Activo = {
  id: string
  descripcion: string | null
  categoria: string | null
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

