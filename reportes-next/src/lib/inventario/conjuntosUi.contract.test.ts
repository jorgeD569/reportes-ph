import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pendientes = path.resolve(
  here,
  '../../app/(shell)/coordinador/inventario/relevamientos-pendientes/RelevamientosPendientesClient.tsx',
)
const confirmDialog = path.resolve(here, '../../components/ui/ConfirmDialog.tsx')
const manifolds = path.resolve(
  here,
  '../../app/(shell)/coordinador/inventario/manifolds/ManifoldsClient.tsx',
)

test('ConfirmDialog existe y no invoca diálogos nativos', () => {
  const src = fs.readFileSync(confirmDialog, 'utf8')
  assert.match(src, /export function ConfirmDialog/)
  assert.doesNotMatch(src, /window\.confirm\s*\(/)
  assert.doesNotMatch(src, /window\.alert\s*\(/)
  assert.doesNotMatch(src, /window\.prompt\s*\(/)
})

test('aprobación de pendientes usa ConfirmDialog (sin confirm/prompt nativos)', () => {
  const src = fs.readFileSync(pendientes, 'utf8')
  assert.match(src, /ConfirmDialog/)
  assert.match(src, /ejecutarAprobar/)
  assert.doesNotMatch(src, /window\.confirm\s*\(/)
  assert.doesNotMatch(src, /window\.prompt\s*\(/)
  assert.doesNotMatch(src, /window\.alert\s*\(/)
  assert.match(src, /Aprobar conjunto/)
  assert.doesNotMatch(src, /Manifold \/ conjunto/)
})

test('ManifoldsClient muestra código interno, observaciones y una sola ubicación', () => {
  const src = fs.readFileSync(manifolds, 'utf8')
  assert.match(src, /displayCodigoInterno/)
  assert.match(src, /displayObservaciones/)
  assert.match(src, /ActivoAdjuntosGallery/)
  assert.match(src, /matchConjuntoQuery/)
  assert.doesNotMatch(src, /Ubicación efectiva/)
  assert.doesNotMatch(src, /Manifold \/ conjunto/)
  assert.doesNotMatch(src, /Conjunto \(manifold\)/)
})
