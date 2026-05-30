/**
 * Capa de acceso a datos — Capacitaciones HSE.
 *
 * MVP: usa mock-store (localStorage).
 *
 * TODO(API): reemplazar cada función por:
 *   GET    /capacitaciones
 *   POST   /capacitaciones
 *   GET    /capacitaciones/:id
 *   POST   /capacitaciones/:id/asignar
 *   GET    /capacitaciones/asignadas?operador_id=
 *   POST   /capacitaciones/asignaciones/:id/finalizar
 *
 * TODO(SUPABASE): tablas sugeridas `capacitaciones`, `capacitaciones_asignaciones`.
 */

import {
  mockAssignCapacitacion,
  mockCreateCapacitacion,
  mockFinalizarCapacitacion,
  mockGetAsignacionOperador,
  mockGetCapacitacion,
  mockListAsignacionesByCapacitacion,
  mockListAsignacionesOperador,
  mockListCapacitaciones,
} from '@/lib/capacitaciones/mock-store'
import type {
  Capacitacion,
  CapacitacionAsignacion,
  CreateCapacitacionInput,
  FinalizarCapacitacionInput,
} from '@/lib/types/capacitaciones'

const USE_MOCK = true

function delay(ms = 120) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function fetchCapacitaciones(): Promise<Capacitacion[]> {
  if (USE_MOCK) {
    await delay()
    return mockListCapacitaciones()
  }
  // TODO(API): return (await get<GetCapacitacionesResponse>('/capacitaciones')).capacitaciones ?? []
  return []
}

export async function fetchCapacitacion(id: string): Promise<Capacitacion | null> {
  if (USE_MOCK) {
    await delay()
    return mockGetCapacitacion(id)
  }
  // TODO(API): ...
  return null
}

export async function createCapacitacion(
  input: CreateCapacitacionInput
): Promise<Capacitacion> {
  if (USE_MOCK) {
    await delay()
    return mockCreateCapacitacion(input)
  }
  // TODO(API): return (await post('/capacitaciones', input)).capacitacion
  throw new Error('Backend no implementado')
}

export async function fetchAsignacionesCapacitacion(
  capacitacionId: string
): Promise<CapacitacionAsignacion[]> {
  if (USE_MOCK) {
    await delay()
    return mockListAsignacionesByCapacitacion(capacitacionId)
  }
  // TODO(API): ...
  return []
}

export async function assignCapacitacionToOperadores(
  capacitacionId: string,
  operadorIds: string[]
): Promise<CapacitacionAsignacion[]> {
  if (USE_MOCK) {
    await delay()
    return mockAssignCapacitacion(capacitacionId, operadorIds)
  }
  // TODO(API): POST /capacitaciones/:id/asignar { operador_ids }
  throw new Error('Backend no implementado')
}

export async function fetchAsignacionesOperador(
  operadorId: string
): Promise<CapacitacionAsignacion[]> {
  if (USE_MOCK) {
    await delay()
    return mockListAsignacionesOperador(operadorId)
  }
  // TODO(API): GET /capacitaciones/asignadas?operador_id=
  return []
}

export async function fetchAsignacionOperador(
  operadorId: string,
  capacitacionId: string
): Promise<CapacitacionAsignacion | null> {
  if (USE_MOCK) {
    await delay()
    return mockGetAsignacionOperador(operadorId, capacitacionId)
  }
  // TODO(API): ...
  return null
}

export async function finalizarCapacitacionAsignacion(
  asignacionId: string,
  input: FinalizarCapacitacionInput
): Promise<CapacitacionAsignacion> {
  if (USE_MOCK) {
    await delay(200)
    return mockFinalizarCapacitacion(asignacionId, input)
  }
  // TODO(API): POST /capacitaciones/asignaciones/:id/finalizar
  throw new Error('Backend no implementado')
}
