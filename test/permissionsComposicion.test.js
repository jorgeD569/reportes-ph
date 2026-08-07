/**
 * Prueba de permisos de path/escritura (mirror de permissions.ts).
 * node --test test/permissionsComposicion.test.js
 */
const assert = require('assert')
const { test } = require('node:test')

const WRITE = new Set(['supervisor', 'coordinador', 'admin'])

function canWriteComposicionConjuntos(rol) {
  return WRITE.has(String(rol || '').trim().toLowerCase())
}

function canAccessGestion(rol) {
  const r = String(rol || '').trim().toLowerCase()
  return r === 'admin' || r === 'coordinador'
}

function canAccessManifolds(rol) {
  const r = String(rol || '').trim().toLowerCase()
  return ['operador', 'supervisor', 'coordinador', 'admin'].includes(r)
}

test('operador: consulta manifolds sí, escritura no, gestión no', () => {
  assert.equal(canAccessManifolds('operador'), true)
  assert.equal(canWriteComposicionConjuntos('operador'), false)
  assert.equal(canAccessGestion('operador'), false)
})

test('supervisor: escritura sí, gestión no', () => {
  assert.equal(canAccessManifolds('supervisor'), true)
  assert.equal(canWriteComposicionConjuntos('supervisor'), true)
  assert.equal(canAccessGestion('supervisor'), false)
})

test('coordinador/admin: escritura y gestión', () => {
  assert.equal(canWriteComposicionConjuntos('coordinador'), true)
  assert.equal(canWriteComposicionConjuntos('admin'), true)
  assert.equal(canAccessGestion('coordinador'), true)
  assert.equal(canAccessGestion('admin'), true)
})
