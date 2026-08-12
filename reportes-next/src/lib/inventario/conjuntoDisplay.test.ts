import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  displayCodigoInterno,
  displayObservaciones,
  displayUbicacionConjunto,
  esAdjuntoImagen,
  esAdjuntoPdf,
  matchConjuntoQuery,
  ubicacionVisibleConjunto,
} from './conjuntoDisplay'

test('código interno vacío → Sin código interno', () => {
  assert.equal(displayCodigoInterno(null), 'Sin código interno')
  assert.equal(displayCodigoInterno('  '), 'Sin código interno')
  assert.equal(displayCodigoInterno('CI-01'), 'CI-01')
})

test('observaciones vacías → Sin observaciones', () => {
  assert.equal(displayObservaciones(''), 'Sin observaciones')
  assert.equal(displayObservaciones('Nota\nlínea 2'), 'Nota\nlínea 2')
})

test('ubicación visible usa efectiva si existe', () => {
  assert.equal(
    ubicacionVisibleConjunto({
      ubicacion: 'propia',
      ubicacion_efectiva: 'efectiva',
    }),
    'efectiva',
  )
  assert.equal(
    displayUbicacionConjunto(ubicacionVisibleConjunto({ ubicacion: null })),
    'Sin ubicación informada',
  )
})

test('búsqueda incluye codigo_interno', () => {
  const a = {
    descripcion: 'Manifold 2',
    numero_serie: '198787A2027',
    codigo_interno: 'CI-MAN-2',
    ubicacion: 'Yacimiento',
    marca: null,
  }
  assert.equal(matchConjuntoQuery(a, 'ci-man'), true)
  assert.equal(matchConjuntoQuery(a, '198787'), true)
  assert.equal(matchConjuntoQuery(a, 'inexistente'), false)
})

test('clasifica fotos vs pdf', () => {
  assert.equal(
    esAdjuntoImagen({ mime_type: 'image/jpeg', tipo: 'foto_general' }),
    true,
  )
  assert.equal(
    esAdjuntoPdf({ mime_type: 'application/pdf', tipo: 'certificado' }),
    true,
  )
  assert.equal(
    esAdjuntoImagen({ mime_type: 'application/pdf', tipo: 'certificado' }),
    false,
  )
})
