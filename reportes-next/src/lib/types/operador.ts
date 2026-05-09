import type { Activo } from '@/lib/types/inventario'

export type GetActivosOperadorResponse = {
  ok: boolean
  unidades: Activo[]
  wikas: Activo[]
}

