export type Operadora = {
  id: string
  nombre: string
  nombre_normalizado: string
  activa: boolean
  created_at: string
  updated_at: string
}

export type Contrato = {
  id: string
  operadora_id: string
  codigo: string | null
  nombre: string
  fecha_inicio: string | null
  fecha_fin: string | null
  activo: boolean
  es_default: boolean
  metadata: Record<string, unknown> | null
  items_count?: number
  created_at: string
  updated_at: string
}

export type ContratoItem = {
  id: string
  contrato_id: string
  codigo: string
  posicion: string
  linea: string | null
  descripcion: string
  tipo_item: string
  unidad_medida: string | null
  orden: number | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type GetOperadorasResponse = {
  ok: boolean
  operadoras: Operadora[]
}

export type OperadoraMutationResponse = {
  ok: boolean
  operadora: Operadora
}

export type GetContratosResponse = {
  ok: boolean
  contratos: Contrato[]
}

export type ContratoMutationResponse = {
  ok: boolean
  contrato: Contrato
}

export type GetContratoItemsResponse = {
  ok: boolean
  items: ContratoItem[]
}

export type ContratoItemMutationResponse = {
  ok: boolean
  item: ContratoItem
}

export type CreateOperadoraBody = {
  nombre: string
  activa?: boolean
}

export type UpdateOperadoraBody = {
  nombre?: string
  activa?: boolean
}

export type CreateContratoBody = {
  operadora_id: string
  codigo?: string | null
  nombre: string
  fecha_inicio?: string | null
  fecha_fin?: string | null
  activo?: boolean
  es_default?: boolean
}

export type UpdateContratoBody = {
  codigo?: string | null
  nombre?: string
  fecha_inicio?: string | null
  fecha_fin?: string | null
  activo?: boolean
  es_default?: boolean
}

export type CreateContratoItemBody = {
  contrato_id: string
  codigo: string
  posicion: string
  linea?: string | null
  descripcion: string
  tipo_item?: string
  unidad_medida?: string | null
  orden?: number | null
  activo?: boolean
}

export type UpdateContratoItemBody = {
  codigo?: string
  posicion?: string
  linea?: string | null
  descripcion?: string
  tipo_item?: string
  unidad_medida?: string | null
  orden?: number | null
  activo?: boolean
}

export type PatchOperadoraEstadoBody = {
  activa: boolean
}

export type PatchContratoEstadoBody = {
  activo: boolean
}

export type PatchContratoItemEstadoBody = {
  activo: boolean
}

export type ImportContratoItemPayload = {
  codigo: string
  descripcion: string
  posicion: string
  linea?: string | null
  tipo_item?: string
  unidad_medida?: string | null
  orden: number
}

export type ImportContratoItemsBody = {
  items: ImportContratoItemPayload[]
}

export type ImportContratoItemsResponse = {
  ok: boolean
  insertados: number
  actualizados: number
  total: number
}
