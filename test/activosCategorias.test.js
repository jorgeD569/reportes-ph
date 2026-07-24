/**
 * Tests unitarios del catálogo de categorías (sin DB).
 */
const assert = require('assert')
const {
  normalizeNombreKey,
  isUuid,
  mapCategoriaRow,
  categoriaTextSnapshot,
} = require('../activosCategorias')

function testNormalizeNombre() {
  assert.strictEqual(normalizeNombreKey('  Cabezal  '), 'cabezal')
  assert.strictEqual(normalizeNombreKey('CABEZAL'), 'cabezal')
  assert.strictEqual(
    normalizeNombreKey('Línea   /  manguera'),
    'línea / manguera',
  )
}

function testIsUuid() {
  assert.strictEqual(isUuid('bfc78d97-6cb1-4f13-91fe-a39fdf559177'), true)
  assert.strictEqual(isUuid('no-uuid'), false)
  assert.strictEqual(isUuid(null), false)
}

function testMapAndSnapshot() {
  const row = {
    id: 'bfc78d97-6cb1-4f13-91fe-a39fdf559177',
    nombre: 'Unidad',
    activo: true,
    aplicable_a_activos: true,
    aplicable_a_conjuntos: false,
    codigo_legacy: 'unidad',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }
  const mapped = mapCategoriaRow(row, { total: 2, activos: 2, conjuntos: 0 })
  assert.strictEqual(mapped.en_uso, true)
  assert.strictEqual(mapped.usos_activos, 2)
  assert.strictEqual(categoriaTextSnapshot(row), 'unidad')
  assert.strictEqual(
    categoriaTextSnapshot({ nombre: 'Cabezal', codigo_legacy: null }),
    'Cabezal',
  )
}

testNormalizeNombre()
testIsUuid()
testMapAndSnapshot()
console.log('All activosCategorias unit tests passed')
