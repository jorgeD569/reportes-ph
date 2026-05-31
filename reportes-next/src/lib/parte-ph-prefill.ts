import type { ReadonlyURLSearchParams } from 'next/navigation'
import { routes } from '@/lib/constants/routes'
import { toInputDate } from '@/lib/date'

/** Query params al abrir PH desde un parte operativo. */
export type PartePhPrefill = {
  parte_operativo_id: string
  reporte_numero: string
  fecha: string
  pozo: string
  yacimiento: string
  cliente: string
  contratista: string
  supervisor_operativo: string
  operador_1: string
  operador_2: string
  operador_3: string
}

export const PARTE_PH_PREFILL_PARAM_KEYS = [
  'parte_operativo_id',
  'reporte_numero',
  'fecha',
  'pozo',
  'yacimiento',
  'cliente',
  'contratista',
  'supervisor_operativo',
  'operador_1',
  'operador_2',
  'operador_3',
] as const satisfies ReadonlyArray<keyof PartePhPrefill>

export function emptyPartePhPrefill(): PartePhPrefill {
  return {
    parte_operativo_id: '',
    reporte_numero: '',
    fecha: '',
    pozo: '',
    yacimiento: '',
    cliente: '',
    contratista: '',
    supervisor_operativo: '',
    operador_1: '',
    operador_2: '',
    operador_3: '',
  }
}

export function hasParteOperativoPrefill(prefill: PartePhPrefill): boolean {
  return Boolean(prefill.parte_operativo_id.trim())
}

export function parsePartePhPrefillFromSearchParams(
  searchParams: ReadonlyURLSearchParams | URLSearchParams
): PartePhPrefill {
  return {
    parte_operativo_id: searchParams.get('parte_operativo_id') ?? '',
    reporte_numero: searchParams.get('reporte_numero') ?? '',
    fecha: searchParams.get('fecha') ?? '',
    pozo: searchParams.get('pozo') ?? '',
    yacimiento: searchParams.get('yacimiento') ?? '',
    cliente: searchParams.get('cliente') ?? '',
    contratista: searchParams.get('contratista') ?? '',
    supervisor_operativo: searchParams.get('supervisor_operativo') ?? '',
    operador_1: searchParams.get('operador_1') ?? '',
    operador_2: searchParams.get('operador_2') ?? '',
    operador_3: searchParams.get('operador_3') ?? '',
  }
}

export function buildPartePhPrefillUrl(prefill: PartePhPrefill): string {
  const params = new URLSearchParams()
  for (const key of PARTE_PH_PREFILL_PARAM_KEYS) {
    const value = prefill[key]?.trim() ?? ''
    if (value) params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `${routes.operador.partePh}?${qs}` : routes.operador.partePh
}

/** Campos del formulario PH que pueden precargarse desde un parte operativo. */
export type PartePhFormPrefillFields = {
  reporte_numero: string
  fecha: string
  pozo: string
  yacimiento: string
  cliente: string
  supervisor_operativo: string
  operador_lider: string
  operador: string
  ayudante: string
}

export function partePhFormFieldsFromPrefill(
  prefill: PartePhPrefill
): PartePhFormPrefillFields {
  return {
    reporte_numero: prefill.reporte_numero.trim(),
    fecha: prefill.fecha.trim() ? toInputDate(prefill.fecha) : '',
    pozo: prefill.pozo.trim(),
    yacimiento: prefill.yacimiento.trim(),
    cliente: prefill.cliente.trim(),
    supervisor_operativo: prefill.supervisor_operativo.trim(),
    operador_lider: prefill.operador_1.trim(),
    operador: prefill.operador_2.trim(),
    ayudante: prefill.operador_3.trim(),
  }
}

export function openPartePhWithPrefill(prefill: PartePhPrefill): void {
  window.open(buildPartePhPrefillUrl(prefill), '_blank', 'noopener,noreferrer')
}
