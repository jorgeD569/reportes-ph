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

